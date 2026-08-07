# Campus Community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Supabase accounts, invite-only friend chat, and a moderated semi-anonymous campus wall without uploading private productivity data.

**Architecture:** Keep UI/application code in `index.html`, add SQL migrations and RLS tests under `supabase/`, and load Supabase only when public configuration is present. The community opens as a full-screen layer from the header; the existing five local views remain independent.

**Tech Stack:** Vanilla JS, Supabase Auth/Postgres/Realtime, SQL RLS, GitHub Pages PWA.

## Global Constraints

- Never upload tasks, goals, focus statistics, journal entries, or local mood data.
- Only accepted friends may open one-to-one chat.
- Campus wall supports text posts, comments, likes, reports, and blocks; no media or stranger DMs.
- Never expose a Supabase service-role key in client code.
- Community stays disabled when configuration or production RLS is missing.
- All new user-facing text has matching Chinese and English I18N keys.

---

### Task 1: Define schema and prove RLS

**Files:**
- Create: `supabase/migrations/001_community.sql`
- Create: `supabase/tests/community_rls.sql`

- [ ] Create profiles, friend requests, friendships, conversations, members, messages, posts, comments, likes, reports, and blocks with exact unique/foreign-key/check constraints from the design.
- [ ] Add triggers for profile creation, invite-code generation, accepted friendship pairs, and updated timestamps.
- [ ] Enable RLS on every community table and write policies for ownership, membership, friendship, reporting, and blocking.
- [ ] Test three users: friends can chat; a non-friend cannot select or insert messages; blocked users cannot interact; reporters cannot read other reports.
- [ ] Run the SQL test against a disposable Supabase database and commit with `git commit -m "feat: secure campus community data model"`.

### Task 2: Add configuration-safe account UI

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] Add header Campus button and a full-screen `.community-view` with Wall, Messages, and Me tabs.
- [ ] Add `COMMUNITY_CONFIG` from empty-by-default `<meta name="supabase-url">` and `<meta name="supabase-anon-key">` values, plus a visible unavailable state when either value is empty.
- [ ] Load the Supabase browser client only after valid public configuration exists.
- [ ] Implement sign-up, sign-in, password reset, sign-out, profile display, and session restoration with localized non-raw errors.
- [ ] Add DOM contract tests for the five original views, community layer, focus trapping/close behavior, and I18N parity.
- [ ] Bump the shell cache and commit with `git commit -m "feat: add optional campus account shell"`.

### Task 3: Implement invite friends and one-to-one chat

**Files:**
- Modify: `index.html`
- Modify: `tests/test_manga_ui_contract.py`

- [ ] Implement invite-code lookup, request send/accept/reject, friend list, block, and deterministic one-to-one conversation creation.
- [ ] Query messages only for the selected conversation and subscribe to Realtime inserts; unsubscribe on close/sign-out.
- [ ] Render message bodies only through `textContent`/`esc()`, enforce length limits, and show explicit sending/failed/retry states.
- [ ] Verify with two friend accounts and one non-friend account against production-equivalent RLS.
- [ ] Commit with `git commit -m "feat: add invite-only friend messaging"`.

### Task 4: Implement moderated campus wall

**Files:**
- Modify: `index.html`
- Modify: `tests/test_manga_ui_contract.py`

- [ ] Implement newest-first paginated posts, create/delete own post, comments, one-like-per-user toggle, report, and block.
- [ ] Enforce client and database text limits and retain draft text after failed submission.
- [ ] Add loading, empty, offline, reconnecting, deleted-content, blocked-content, and rate-limited states.
- [ ] Verify keyboard operation and non-color-only status at 375/390/440px in Chinese and English.
- [ ] Commit with `git commit -m "feat: add moderated campus wall"`.

### Task 5: Production gate and deployment verification

**Files:**
- Modify: `README.md`
- Modify: `sw.js`

- [ ] Configure only the public Supabase URL and anon key; apply the reviewed migration and run RLS tests before enabling the entry.
- [ ] Confirm API responses are not cached by the Service Worker and private local DB keys never appear in requests.
- [ ] Run the full test suite, browser console checks, offline local-core checks, and two-account end-to-end chat/wall flow.
- [ ] Deploy only after the production gate passes, then verify the GitHub Pages SHA and live Service Worker version.
- [ ] Commit with `git commit -m "docs: document campus community operations"`.
