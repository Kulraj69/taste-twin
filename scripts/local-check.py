#!/usr/bin/env python3
"""Stage and check the app without reading env files or inherited credentials.

Copies only named source/config files; --fresh installs locked dependencies.
The production server binds to loopback. Nothing is deployed or uploaded.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = Path(tempfile.gettempdir())
FILES = ['package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts',
         'next.config.ts', 'vitest.config.ts', 'eslint.config.mjs']


def safe_env():
    # Deliberately do not copy os.environ or load any dotenv file.
    return {'PATH': os.defpath + ':/usr/local/bin', 'HOME': str(SCRATCH),
            'TMPDIR': str(SCRATCH), 'NEXT_TELEMETRY_DISABLED': '1', 'CI': '1'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--port', default='3101')
    parser.add_argument('--fresh', action='store_true', help='Install from package-lock.json, not existing node_modules')
    parser.add_argument('--output', type=Path, default=ROOT / 'demo')
    args = parser.parse_args()
    stage = Path(tempfile.mkdtemp(prefix='taste-twin-check-', dir=SCRATCH))
    for name in FILES:
        shutil.copyfile(ROOT / name, stage / name)
    for name in ['src', 'tests']:
        shutil.copytree(ROOT / name, stage / name,
                        ignore=shutil.ignore_patterns('.env*', '*secret*', '*credential*', 'AGENTS.md'))
    if not args.fresh:
        # Turbopack rejects dependencies symlinked outside its project root.
        shutil.copytree(ROOT / 'node_modules', stage / 'node_modules', copy_function=os.link)
    env = safe_env()
    results = []
    commands = ([['npm', 'ci', '--no-fund']] if args.fresh else [])
    commands += [['npm', 'test'], ['npm', 'run', 'lint'],
                 ['npm', 'run', 'build'], ['npm', 'run', 'typecheck']]
    for command in commands:
        print('+ ' + ' '.join(command), flush=True)
        result = subprocess.run(command, cwd=stage, env=env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(result.stdout, flush=True)
        results.append({'command': ' '.join(command), 'exit_code': result.returncode,
                        'output': result.stdout})
        if result.returncode:
            break
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    # Machine-generated local execution evidence, not a provider response.
    (out / 'checks.json').write_text(json.dumps({'stage': str(stage), 'results': results}, indent=2) + '\n')
    if any(result['exit_code'] for result in results):
        raise SystemExit(1)
    print('All local checks passed. Stage: ' + str(stage), flush=True)
    if args.serve:
        subprocess.run(['npm', 'start', '--', '--hostname', '127.0.0.1', '--port', args.port],
                       cwd=stage, env=env, check=True)


if __name__ == '__main__':
    main()
