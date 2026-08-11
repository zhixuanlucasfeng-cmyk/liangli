from pathlib import Path
import re
import unittest


ROOT = Path(__file__).parents[1]
MIGRATION_PATH = ROOT / "supabase/migrations/003_core_sync.sql"
SQL = MIGRATION_PATH.read_text() if MIGRATION_PATH.exists() else ""
RLS_TEST_PATH = ROOT / "supabase/tests/core_sync_rls.sql"
RLS_TEST = RLS_TEST_PATH.read_text() if RLS_TEST_PATH.exists() else ""

CORE_TABLES = (
    "liangli_sync_profiles",
    "liangli_tasks",
    "liangli_growth_items",
    "liangli_goals",
    "liangli_focus_sessions",
    "liangli_mood_entries",
)
ENTITY_TABLES = CORE_TABLES[1:]
JS_SAFE_INTEGER = "9007199254740991"


def table_definition(table):
    match = re.search(
        rf"create table if not exists public\.{table}\s*\((.*?)\n\);",
        SQL,
        flags=re.DOTALL,
    )
    return match.group(1) if match else ""


def policy_for(table, operation):
    match = re.search(
        rf'create policy "owners {operation} {table}" on public\.{table} '
        rf"for {operation} (.*?);",
        SQL,
        flags=re.DOTALL,
    )
    return match.group(1) if match else ""


class SupabaseCoreMigrationContractTests(unittest.TestCase):
    def test_creates_exactly_the_six_core_sync_tables(self):
        self.assertTrue(MIGRATION_PATH.exists(), "core sync migration must exist")
        self.assertEqual(SQL.count("create table if not exists public."), len(CORE_TABLES))
        for table in CORE_TABLES:
            self.assertIn(f"create table if not exists public.{table}", SQL)

    def test_entity_tables_have_owned_versioned_payload_shape(self):
        for table in ENTITY_TABLES:
            definition = table_definition(table)
            self.assertIn("id uuid primary key", definition)
            self.assertIn("user_id uuid not null references auth.users(id) on delete cascade default auth.uid()", definition)
            self.assertRegex(
                definition,
                r"payload jsonb not null check \(jsonb_typeof\(payload\) = 'object' and octet_length\(payload::text\) <= 65536\)",
            )
            self.assertIn(
                f"client_updated_at bigint not null check (client_updated_at between 0 and {JS_SAFE_INTEGER})",
                definition,
            )
            for column in ("deleted_at timestamptz", "created_at timestamptz not null default now()", "updated_at timestamptz not null default now()"):
                self.assertIn(column, definition)

    def test_sync_profile_is_one_owned_manifest_row(self):
        definition = table_definition("liangli_sync_profiles")
        self.assertIn("user_id uuid primary key references auth.users(id) on delete cascade default auth.uid()", definition)
        self.assertIn("core_version integer not null", definition)
        self.assertIn("initialized_at timestamptz not null default now()", definition)
        self.assertIn("updated_at timestamptz not null default now()", definition)

    def test_every_table_has_owner_indexes_and_row_level_security(self):
        for table in CORE_TABLES:
            self.assertIn(f"alter table public.{table} enable row level security", SQL)
        for table in ENTITY_TABLES:
            self.assertIn(f"create index if not exists {table}_owner_updated on public.{table}(user_id, client_updated_at)", SQL)
            self.assertIn(f"create index if not exists {table}_owner_deleted on public.{table}(user_id, deleted_at)", SQL)

    def test_authenticated_roles_have_separate_owner_policies(self):
        for table in CORE_TABLES:
            for operation in ("select", "insert", "update", "delete"):
                policy = policy_for(table, operation)
                self.assertIn("auth.uid() = user_id", policy, f"{table} {operation} policy must enforce ownership")
            self.assertIn("with check (auth.uid() = user_id)", policy_for(table, "insert"))
            self.assertIn("using (auth.uid() = user_id) with check (auth.uid() = user_id)", policy_for(table, "update"))

    def test_only_authenticated_role_is_granted_table_access(self):
        self.assertNotRegex(SQL, r"(?im)^\s*grant\b[^;]*\bto\s+anon\b")
        for table in CORE_TABLES:
            self.assertIn(f"revoke all on public.{table} from anon", SQL)
            self.assertIn(f"grant select, insert, update, delete on public.{table} to authenticated", SQL)

    def test_updates_retain_the_stored_row_for_stale_or_equal_versions(self):
        self.assertIn("new.client_updated_at <= old.client_updated_at", SQL)
        self.assertIn("return old", SQL)
        for table in ENTITY_TABLES:
            self.assertIn(f"create trigger {table}_updated_at before update on public.{table}", SQL)

    def test_migration_does_not_use_email_claims(self):
        self.assertNotIn("email", SQL.lower())

    def test_rls_acceptance_covers_lower_version_stale_writes(self):
        self.assertIn("select plan(28);", RLS_TEST)
        for table in ENTITY_TABLES:
            self.assertIn(
                f"update public.{table} set payload = '{{\"state\":\"lower-version\"}}', client_updated_at = 9;",
                RLS_TEST,
            )
            self.assertIn(
                f"'lower-version stale {table} update retains the newer payload'",
                RLS_TEST,
            )
            self.assertIn(
                f"'lower-version stale {table} update retains the newer version'",
                RLS_TEST,
            )


if __name__ == "__main__":
    unittest.main()
