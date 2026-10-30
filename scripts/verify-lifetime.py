#!/usr/bin/env python3
"""Recheck an env-free local-check stage, then film the actual mock app.
Usage: python scripts/verify-lifetime.py /absolute/local-check-stage
Reuses installed dependencies. No dotenv reads, credentials or live providers.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'demo/request-lifetime'
spec = importlib.util.spec_from_file_location('local_check', ROOT / 'scripts/local-check.py')
assert spec is not None and spec.loader is not None
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def compare_source(name, source, staged):
    """Keep exact authored parity; disclose Next's two dev declaration edits."""
    status = 'exact'
    if source != staged:
        expected = source
        if name == 'next-env.d.ts':
            for declaration in ('routes', 'root-params'):
                expected = expected.replace(
                    f'"./.next/types/{declaration}.d.ts"'.encode(),
                    f'"./.next/dev/types/{declaration}.d.ts"'.encode())
        assert expected == staged, f'Source mismatch: {name}'
        status = 'next-dev-generated'
    return {'path': name, 'status': status,
            'source_sha256': hashlib.sha256(source).hexdigest(),
            'stage_sha256': hashlib.sha256(staged).hexdigest()}


def main():
    stage = Path(sys.argv[1]).resolve()
    if stage.parent != helper.SCRATCH.resolve() or not stage.name.startswith('taste-twin-check-'):
        raise SystemExit('Use an existing local-check scratch stage.')
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'final-verification.json').write_text(json.dumps({'status': 'in-progress', 'stage': str(stage)}) + '\n')
    for name in helper.FILES:
        shutil.copyfile(ROOT / name, stage / name)
    for folder in ('src', 'tests'):
        shutil.rmtree(stage / folder)
        shutil.copytree(ROOT / folder, stage / folder)
    env = helper.safe_env()
    results = []
    for name, command in [
        ('tests', ['npm', 'test', '--', '--sequence.shuffle', '--sequence.seed=42']),
        ('lint', ['npm', 'run', 'lint']),
        ('build', ['npm', 'run', 'build']),
        ('typecheck', ['npm', 'run', 'typecheck']),
    ]:
        run = subprocess.run(command, cwd=stage, env=env, capture_output=True, text=True)
        (OUT / f'final-{name}.log').write_text(run.stdout + run.stderr)
        results.append({'command': command, 'exit_code': run.returncode})
        print(name, run.returncode, flush=True)
        if run.returncode:
            raise SystemExit(run.returncode)
    for mode, port in [('dev', 3117), ('start', 3118)]:
        with (OUT / f'{mode}-server.log').open('w') as log:
            command = ['npm', 'run', mode, '--',
                       '--hostname', '127.0.0.1', '--port', str(port)]
            server = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=log,
                                      start_new_session=True)
            try:
                url = f'http://127.0.0.1:{port}'
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError('Local server exited')
                    try:
                        with urllib.request.urlopen(url, timeout=2) as response:
                            assert response.status == 200
                            break
                    except (OSError, TimeoutError):
                        time.sleep(.2)
                else:
                    raise RuntimeError('Local server did not start')
                if mode == 'start':
                    recorded = subprocess.run([sys.executable, str(ROOT / 'scripts/mock-flow.py'),
                                               '--port', str(port), '--output', str(OUT)],
                                              capture_output=True, text=True,
                                              env={**env,
                                                   'PYTHONPATH': str(Path(playwright.__file__).resolve().parents[1]),
                                                   'PLAYWRIGHT_BROWSERS_PATH': str(Path.home() / '.cache/ms-playwright')})
                    (OUT / 'browser.log').write_text(recorded.stdout + recorded.stderr)
                    recorded.check_returncode()
                results.append({'command': command, 'exit_code': 0})
            finally:
                os.killpg(server.pid, signal.SIGTERM)
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(OUT / 'taste-twin-mock.webm'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    str(OUT / 'taste-twin-mock.mp4')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(OUT / 'taste-twin-mock.mp4'),
                    '-f', 'null', '-'], check=True)
    probe = subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                                     '-of', 'json', str(OUT / 'taste-twin-mock.mp4')], text=True)
    media = json.loads(probe)
    assert 0 < float(media['format']['duration']) < 180
    (OUT / 'media-probe.json').write_text(probe)
    matches = []
    for name in helper.FILES:
        matches.append(compare_source(name, (ROOT / name).read_bytes(), (stage / name).read_bytes()))
    for folder in ('src', 'tests'):
        for source in sorted((ROOT / folder).rglob('*')):
            if source.is_file():
                rel = source.relative_to(ROOT)
                matches.append(compare_source(str(rel), source.read_bytes(), (stage / rel).read_bytes()))
    browser = json.loads((OUT / 'mock-flow-results.json').read_text())
    assert len(browser['checks']) == 10 and len(set(browser['checks'])) == 10
    assert not browser['browser_errors'] and not browser['external_requests']
    script_hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                     for name in ('scripts/local-check.py', 'scripts/verify-lifetime.py',
                                  'scripts/mock-flow.py', 'scripts/test_verify_lifetime.py')}
    verification = {'status': 'passed', 'stage': str(stage), 'dependency_install': 'reused, not fresh npm ci',
                    'verification_script_sha256': script_hashes,
                    'results': results, 'source_matches': matches,
                    'browser_groups': len(browser['checks']), 'duration_seconds': media['format']['duration'],
                    'full_decode': True, 'scope': 'local synthetic app, no live providers'}
    (OUT / 'final-verification.json').write_text(json.dumps(verification, indent=2) + '\n')
    print(json.dumps({'source_matches': len(matches), 'browser_groups': len(browser['checks']),
                      'duration_seconds': media['format']['duration'], 'full_decode': True}))


if __name__ == '__main__':
    main()
