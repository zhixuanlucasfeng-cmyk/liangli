from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
MIGRATION = (ROOT / "supabase/migrations/002_flashcards.sql").read_text()
RLS_TEST = (ROOT / "supabase/tests/flashcards_rls.sql").read_text()


class SupabaseMigrationContractTests(unittest.TestCase):
    def test_only_flashcard_tables_are_created(self):
        self.assertEqual(MIGRATION.count("create table if not exists public."), 3)
        for table in ("flashcard_decks", "flashcards", "flashcard_reviews"):
            self.assertIn(f"public.{table}", MIGRATION)

    def test_all_tables_enable_rls_and_scope_to_auth_uid(self):
        self.assertEqual(MIGRATION.count("enable row level security"), 3)
        self.assertIn("auth.uid() = user_id", MIGRATION)
        self.assertIn("d.user_id = auth.uid()", MIGRATION)

    def test_review_history_is_insert_only(self):
        self.assertIn("grant select, insert on public.flashcard_reviews", MIGRATION)
        self.assertNotIn('policy "owners delete reviews"', MIGRATION)
        self.assertNotIn('policy "owners update reviews"', MIGRATION)

    def test_server_rejects_stale_client_updates(self):
        self.assertIn("new.client_updated_at <= old.client_updated_at", MIGRATION)
        self.assertIn("server rejects stale concurrent writes", RLS_TEST)

    def test_two_user_and_immutable_review_cases_are_declared(self):
        self.assertIn("other user cannot select deck", RLS_TEST)
        self.assertIn("cannot attach a card to another owner deck", RLS_TEST)
        self.assertIn("cannot update review history", RLS_TEST)
        self.assertIn("cannot delete review history", RLS_TEST)


if __name__ == "__main__":
    unittest.main()
