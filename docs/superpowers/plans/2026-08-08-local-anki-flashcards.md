# Local Anki-Style Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline card decks, Anki-style four-button reviews, and JSON/CSV import/export.

**Architecture:** Keep UI and logic in `index.html`, with a small IndexedDB adapter inside the script. Keep scheduling as pure functions so Node can verify every interval without a browser database.

**Tech Stack:** Vanilla JavaScript, IndexedDB, Blob downloads, FileReader, Node/Python tests.

## Global Constraints

- UI uses `Again/Hard/Good/Easy` semantics but does not claim full FSRS compatibility.
- Reviews due now appear before new cards; default new-card limit is 20 per deck per local day.
- Keyboard: Space flips; 1–4 grades.
- JSON preserves schedule/history; CSV contains UTF-8 front/back only.
- No `.apkg`, AI generation, streaks, or cloud dependency in this phase.

---

### Task 1: Implement the pure scheduler

**Files:** Create `tests/test_flashcard_scheduler.js`; modify `index.html`.

**Interfaces:** Produces `previewIntervals(card, now): Record<Grade,string>` and `scheduleReview(card, grade, now): CardSchedule`.

- [ ] Write failing fixed-clock assertions: Again is due in 10 minutes; new Hard in 1 day; new Good in 1 day; new Easy in 4 days; mature intervals increase in `Hard < Good < Easy` order; maximum is 36500 days.
- [ ] Run the Node test and confirm missing functions.
- [ ] Implement deterministic interval math plus a stable card-id-derived offset; do not call `Date.now()` inside the pure functions.
- [ ] Re-run focused and full tests; commit with `git commit -m "feat: add anki-style review scheduler"`.

### Task 2: Add IndexedDB storage

**Files:** Create `tests/test_flashcard_store_contract.py`; modify `index.html`.

**Interfaces:** Produces `FlashcardStore.open()`, `.listDecks()`, `.putDeck(deck)`, `.putCard(card)`, `.listDue(deckId, now, limit)`, `.putReview(review)`, `.enqueueSync(op)`.

- [ ] Add failing source-contract tests for DB name `liangli-flashcards-v1`, stores `decks/cards/reviews/syncOps`, and indexes `deckId`, `dueAt`, `updatedAt`.
- [ ] Implement version-1 `onupgradeneeded` and Promise-based transaction helpers.
- [ ] Ensure every review writes the card state and immutable review log in one readwrite transaction.
- [ ] Verify refresh/offline persistence in a real browser and commit with `git commit -m "feat: persist flashcards offline"`.

### Task 3: Build deck editor and review UI

**Files:** Modify `index.html`; modify `tests/test_manga_ui_contract.py`.

**Interfaces:** Produces `openFlashcards(deckId?)`, `renderDecks()`, `startReview(deckId)`, `gradeCurrentCard(grade)`.

- [ ] Add failing DOM/I18N/accessibility assertions for deck list, card editor, front/back review panel, four grade buttons, sync badge, close button, and keyboard instructions.
- [ ] Build a full-screen manga overlay with stable card geometry and no random rotation.
- [ ] Implement deck/card CRUD, due-first queue, 20-new-card limit, Space flip, and 1–4 grading.
- [ ] Link flashcard tasks via `helperRef` and allow creation of an empty deck from task entry.
- [ ] Verify Chinese/English, keyboard flow, and 375/390/440px layout; commit with `git commit -m "feat: add offline flashcard study mode"`.

### Task 4: Add import and export

**Files:** Create `tests/test_flashcard_import.js`; modify `index.html`.

**Interfaces:** Produces `serializeDecks(decks,cards,reviews): string`, `parseLiangliDeckJson(text)`, `parseTwoColumnCsv(text)`.

- [ ] Write failing tests for JSON version validation, CSV quotes/newlines, invalid-row reporting, and no partial import.
- [ ] Implement pure serializers/parsers; use a versioned JSON envelope `{format:'liangli-flashcards',version:1,...}`.
- [ ] Add download buttons using Blob/ObjectURL and file inputs with an import preview before commit.
- [ ] Round-trip export/import in tests and browser; commit with `git commit -m "feat: import and export flashcard decks"`.

### Task 5: Release verification

**Files:** Modify `sw.js`; modify `README.md`; modify `CLAUDE.md`.

- [ ] Add a failing cache-version contract and bump the shell cache.
- [ ] Document IndexedDB stores, scheduler semantics, export formats, and required tests.
- [ ] Run the full release suite and offline PWA reload; commit with `git commit -m "docs: document offline flashcards"`.

