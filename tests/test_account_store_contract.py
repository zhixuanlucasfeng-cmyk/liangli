from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")


class AccountStoreContractTests(unittest.TestCase):
    def test_core_module_is_loaded_before_inline_app_code(self):
        self.assertLess(HTML.index('src="account-sync.js"'), HTML.index('<script>'))

    def test_canonical_core_store_has_scope_and_recovery_boundaries(self):
        for name in ('readCoreScope', 'writeCoreScope', 'activateCoreScope', 'coreStateToViewState'):
            self.assertIn(f'function {name}', HTML)
        self.assertIn("coreStorageKey(scope)", HTML)
        self.assertIn("DB.read(key)", HTML)
        self.assertIn("migrateLegacyCoreState", HTML)
        self.assertIn("readCoreScope('local')", HTML)

    def test_life_storage_remains_outside_the_core_module(self):
        module = (ROOT / "account-sync.js").read_text(encoding="utf-8")
        self.assertNotIn('lifeState', module)
        self.assertNotIn('calorieTarget', module)
        self.assertNotIn('foodEntries', module)
        self.assertNotIn('budgetCycles', module)

    def test_schema_and_migration_suite(self):
        result = subprocess.run(['node', 'tests/test_account_sync.js'], cwd=ROOT, text=True,
                                capture_output=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
