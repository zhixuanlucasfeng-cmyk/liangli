# Flashcard Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync only Flashcard decks, cards, and review history across authenticated devices while preserving offline-first behavior.

**Architecture:** Add Supabase tables and strict RLS, then connect the local IndexedDB sync queue to the authenticated account. Community/account configuration stays disabled when public config is absent; no secret key enters the client.

**Tech Stack:** Supabase Auth/Postgres, SQL RLS, IndexedDB sync queue, vanilla JavaScript.

## Global Constraints

- Only Flashcard data syncs; tasks, energy, goals, focus, mood, quiz, and checklist data never upload.
- Client may contain only Supabase URL and anon key, never service-role credentials.
- Every cloud row is owned by `auth.uid()` and protected by RLS.
- Local edits commit before network requests and remain usable offline.
- Sync conflicts follow the approved updatedAt/lastReviewedAt/soft-delete rules.

---

### Task 1: Create the cloud schema and RLS tests

**Files:** Create `supabase/migrations/002_flashcards.sql`; create `supabase/tests/flashcards_rls.sql`.

**Interfaces:** Produces tables `flashcard_decks`, `flashcards`, and `flashcard_reviews` keyed by user-owned UUIDs.

- [ ] Define columns, foreign keys, length checks, soft-delete timestamps, server-written timestamps, and unique review UUIDs.
- [ ] Enable RLS and create select/insert/update/delete policies using `auth.uid() = user_id`; require a card's deck to share the same owner.
- [ ] Write SQL tests with two users proving each can CRUD only their own rows and cannot attach cards to another user's deck.
- [ ] Run against a disposable Supabase project; commit with `git commit -m "feat: secure flashcard sync schema"`.

### Task 2: Add configuration-safe authentication

**Files:** Modify `index.html`; modify `tests/test_manga_ui_contract.py`.

**Interfaces:** Produces `CommunityClient.isConfigured()`, `.restoreSession()`, `.signIn(email,password)`, `.signUp(email,password)`, `.signOut()`.

- [ ] Add failing tests for empty-by-default public config, disabled sync UI, and absence of `service_role` text.
- [ ] Add account controls and dynamically load the official Supabase browser client only when URL and anon key are present.
- [ ] Restore sessions and map raw errors to localized safe messages.
- [ ] Verify local Flashcards work when config is absent; commit with `git commit -m "feat: add optional flashcard account login"`.

### Task 3: Implement queued bidirectional sync

**Files:** Create `tests/test_flashcard_sync.js`; modify `index.html`.

**Interfaces:** Produces `syncFlashcards(session, now): Promise<SyncResult>`, `mergeFlashcard(local,remote): Flashcard`.

- [ ] Write failing pure merge tests for newer content, newer review state, soft deletion, immutable review union, and unsent local edits.
- [ ] Implement merge functions, queue batching, idempotent upserts, and deletion acknowledgements.
- [ ] Trigger sync after login, online events, local edits, review completion, and manual retry; use bounded exponential backoff.
- [ ] Show `仅此设备 / 等待同步 / 正在同步 / 已同步 / 同步失败` without blocking study.
- [ ] Verify two-device offline edits converge; commit with `git commit -m "feat: sync flashcards across accounts"`.

### Task 4: Production gate

**Files:** Modify `README.md`; modify `sw.js`.

- [ ] Apply migration to the intended Supabase project and run the two-user RLS test before adding public production config.
- [ ] Confirm browser network requests contain Flashcard tables only and Service Worker never caches Supabase responses.
- [ ] Run full local/offline/two-account/browser suites and bump the shell cache.
- [ ] Document key rotation, disabling sync, and account logout/device-copy choices; commit with `git commit -m "docs: operate flashcard account sync"`.

