from pathlib import Path
import re
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

    def test_core_sync_is_scoped_and_wired_to_safe_resume_hooks(self):
        module = (ROOT / "account-sync.js").read_text(encoding="utf-8")
        for name in ('createCoreSyncController', 'mergeCoreEntity', 'coalesceCoreOps',
                     'liangli_sync_profiles', 'CORE_REMOTE_TABLES'):
            self.assertIn(name, module)
        for fragment in ('scheduleCoreSync(\'login\')', "scheduleCoreSync('online')",
                         "scheduleCoreSync('visible')", "scheduleCoreSync('focus')",
                         "scheduleCoreSync('manual')"):
            self.assertIn(fragment, HTML)

    def test_first_login_recovery_is_core_only_and_account_scoped(self):
        for name in ('beginAccountFirstLogin', 'chooseUploadDevice', 'confirmStartEmpty',
                     'createCoreRecoverySnapshot', 'restoreCoreRecovery'):
            self.assertIn(f'function {name}', HTML)
        self.assertIn('createCoreRecoveryStore(coreRecoveryStorage)', HTML)
        self.assertIn('readAnonymousCoreState(scope=>readCoreScope(scope))', HTML)
        self.assertIn('createCoreRecoverySnapshot(local)', HTML)
        self.assertIn('prepareDeviceUploadState(local,Date.now())', HTML)
        self.assertIn("writeCoreScope('local',state)", HTML)
        self.assertNotIn('ll_lifeState', HTML[HTML.index('function createCoreRecoverySnapshot'):HTML.index('function coreId')])

    def test_schema_and_migration_suite(self):
        result = subprocess.run(['node', 'tests/test_account_sync.js'], cwd=ROOT, text=True,
                                capture_output=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_scope_focus_rollover_and_atomic_mutation_integration_suite(self):
        result = subprocess.run(['node', 'tests/test_account_store_integration.js'], cwd=ROOT, text=True,
                                capture_output=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_core_timestamp_bound_migration_is_safe_and_canonical(self):
        migration_path = ROOT / 'supabase/migrations/005_bound_core_client_timestamps.sql'
        self.assertTrue(migration_path.exists(), 'migration 005 must tighten deployed core timestamp constraints')
        migration = migration_path.read_text(encoding='utf-8')
        tables = ('liangli_tasks', 'liangli_growth_items', 'liangli_goals',
                  'liangli_focus_sessions', 'liangli_mood_entries')
        remediation = migration.lower().index('manual remediation')
        first_drop = migration.lower().index('drop constraint')
        safety_check = migration[:first_drop]
        self.assertLess(remediation, first_drop, 'out-of-range rows abort before any constraint is replaced')
        self.assertRegex(safety_check, r'(?is)client_updated_at\s*<\s*0\s+or\s+client_updated_at\s*>\s*253402300799999')
        for table in tables:
            constraint = f'{table}_client_updated_at_canonical_check'
            self.assertIn(f"'{table}'", safety_check)
            self.assertRegex(migration, rf'(?is)drop\s+constraint\s+if\s+exists\s+{re.escape(table)}_client_updated_at_check')
            self.assertRegex(migration, rf'(?is)add\s+constraint\s+{re.escape(constraint)}\s+check\s*\(\s*client_updated_at\s+between\s+0\s+and\s+253402300799999\s*\)')

    def test_existing_core_mutations_use_the_monotonic_entity_clock(self):
        mutation_region = HTML[HTML.index('function toggleTask'):HTML.index('/* ============ utils ============ */')]
        core_blocks = re.findall(r"commitCoreMutation\((?:.|\n)*?\}\)\)", mutation_region)
        self.assertGreaterEqual(len(core_blocks), 10)
        for block in core_blocks:
            if 'updatedAt' in block or 'deletedAt' in block:
                self.assertNotIn('Date.now()', block, 'existing core entities must never receive a raw wall-clock version')
        self.assertIn('nextEntityTimestamp', HTML)
        self.assertIn("changed.map(({updatedAt,...item})=>({...item,id:coreId(),createdAt:updatedAt}))", HTML)


if __name__ == '__main__':
    unittest.main()
