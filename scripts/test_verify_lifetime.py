"""Offline regression checks for generated Next.js declaration evidence."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify_lifetime', Path(__file__).with_name('verify-lifetime.py'))
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceEvidenceTests(unittest.TestCase):
    def test_exact_source_match(self):
        self.assertEqual(module.compare_source('src/app.ts', b'original', b'original')['status'], 'exact')

    def test_only_known_next_dev_paths_may_change(self):
        original = b'import "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n'
        generated = original.replace(b'./.next/types/', b'./.next/dev/types/')
        result = module.compare_source('next-env.d.ts', original, generated)
        self.assertEqual(result['status'], 'next-dev-generated')
        self.assertNotEqual(result['source_sha256'], result['stage_sha256'])

    def test_arbitrary_generated_file_edit_rejected(self):
        with self.assertRaises(AssertionError):
            module.compare_source('next-env.d.ts', b'original', b'changed')

    def test_authored_source_change_rejected(self):
        with self.assertRaises(AssertionError):
            module.compare_source('src/app.ts', b'original', b'changed')

    def test_declaration_normalization_not_used_for_other_files(self):
        with self.assertRaises(AssertionError):
            module.compare_source('src/app.ts', b'./.next/types/routes.d.ts', b'./.next/dev/types/routes.d.ts')


if __name__ == '__main__':
    unittest.main()
