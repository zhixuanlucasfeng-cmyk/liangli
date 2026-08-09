from pathlib import Path
import unittest


HTML = (Path(__file__).parents[1] / "index.html").read_text()


class FlashcardStoreContractTests(unittest.TestCase):
    def test_database_and_object_stores_are_versioned(self):
        self.assertIn("liangli-flashcards-v1", HTML)
        for store in ("decks", "cards", "reviews", "syncOps"):
            self.assertIn(f"createObjectStore('{store}'", HTML)

    def test_required_indexes_exist(self):
        for index in ("deckId", "dueAt", "updatedAt"):
            self.assertIn(f"createIndex('{index}'", HTML)

    def test_public_store_contract_is_present(self):
        for method in ("open", "listDecks", "putDeck", "putCard", "listDue", "putReview", "enqueueSync"):
            self.assertRegex(HTML, rf"\b{method}\(")

    def test_review_and_card_share_one_transaction(self):
        self.assertIn("transaction(['cards','reviews','syncOps'],'readwrite')", HTML)

    def test_new_card_limit_is_per_deck_per_local_day(self):
        compact = HTML.replace(" ", "")
        self.assertIn("countNewReviews(deckId,startAt,endAt)", compact)
        self.assertIn("Math.max(0,20-reviewedNew)", compact)

    def test_storage_is_partitioned_by_signed_in_account(self):
        compact = HTML.replace(" ", "")
        self.assertIn("ActiveFlashcardStore=FlashcardStore.forScope(nextScope)", compact)
        self.assertIn("conststore=ActiveFlashcardStore", compact)
        self.assertIn("if(store!==ActiveFlashcardStore)return", compact)
        self.assertIn("liangli-flashcards-v1-${this.scope}", compact)
        self.assertIn('id="copyLocalFlashcards"', HTML)
        self.assertIn("waitForFlashcardStoreIdle", HTML)

    def test_review_queues_schedule_and_history_atomically(self):
        compact = HTML.replace(" ", "")
        self.assertIn("type:'card',entityId:review.card.id", compact)
        self.assertIn("type:'review',entityId:review.id", compact)

    def test_session_refresh_is_generation_and_account_scoped(self):
        compact = HTML.replace(" ", "")
        self.assertIn("refreshPromises:newMap()", compact)
        self.assertIn("this.generation!==expectedGeneration", compact)
        self.assertIn("CommunityClient.generation===ownerGeneration", compact)
        self.assertIn("this.generation!==restoreGeneration", compact)

    def test_pending_import_is_owned_by_one_scope(self):
        compact = HTML.replace(" ", "")
        self.assertIn("pendingFlashcardImportScope=store.scope", compact)
        self.assertIn("pendingFlashcardImportScope!==store.scope", compact)
        self.assertIn("cancelFlashcardImport();finishReview()", compact)


if __name__ == "__main__":
    unittest.main()
