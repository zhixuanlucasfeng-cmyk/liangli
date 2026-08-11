# Account Cloud Sync Final Fix Wave Report

Date: 2026-08-11 (Asia/Shanghai)
Worktree: `/Users/lucasfeng/Documents/liangli 2/.worktrees/account-cloud-sync`
Starting HEAD: `f79a881` (`docs: clarify account sync module boundary`)
Requested commit: `fix: preserve account sync state across races`

## Verdict

All four review findings were reproduced with behavior-level RED tests and fixed in one consolidated wave. The complete local release gate passes: 95 Python tests, all 15 Node suite files, 8 MP4 and 8 WebP assets, inline/application syntax, account module syntax, Service Worker suites, and patch whitespace.

No push, deployment, remote mutation, or live Supabase acceptance was performed. Production enablement remains blocked on the existing disposable-Supabase acceptance gate; this wave makes no live Auth/RLS/database claim.

## Finding 1 — mutation during sync no longer loses local state

### Actual RED

`node tests/test_account_sync.js` failed while a task-table pull was deliberately held open. A new task and sync operation were committed during the wait. The assertion expected one surviving local task but observed zero:

```text
AssertionError: a mutation committed while pull is awaiting survives the remote merge without duplication
0 !== 1
```

### Root cause

`syncNow` read account state before its push/pull awaits, wrote an intermediate queue snapshot, then merged the pull into that stale in-memory state and wrote it again. A successful local mutation during the pull could therefore be overwritten. Concurrent scheduling only recognized the exact reason `mutation`, while real mutations use `mutation:<type>:<id>`.

### GREEN implementation

- Snapshot only the initial entities and coalesced operations being sent.
- Do not write any intermediate stale state after push.
- After every push/refetch and the complete pull, reread the captured account scope immediately.
- Merge remote rows and validated push winners into that fresh state with LWW/tombstone rules.
- Remove only operation IDs present in the initial snapshot: superseded initial IDs are collapsed, acknowledged initial winners are removed, failed initial winners remain, and all later IDs remain untouched.
- Perform one generation/user-guarded canonical write after the fresh read.
- Treat every `reason.startsWith('mutation:')` trigger during an in-flight pipeline as one coalesced trailing run.

Coverage holds pulls and pushes open deterministically. It proves later new entities, later same-entity edits, and their operation IDs survive; the final entity is not duplicated; initial and later versions are each pushed once; and exactly one trailing pipeline runs.

## Finding 2 — refresh, restore, and identity transitions are distinct

### Actual RED

`node tests/test_account_sync.js` refreshed credentials for the same user and observed one identity-transition callback instead of zero:

```text
AssertionError: same-user token refresh updates credentials without firing an identity-transition callback
1 !== 0
```

The new restore integration also initially failed because no returning-session coordinator or controller resume path existed.

### Root cause

Credential refresh called `activate(... preserveGeneration=true)` but `activate` still invoked `onSessionChange`. The UI callback canceled reconciliation and the core controller, then always ran first-login inspection. Startup first rendered anonymous state and used that same cloud-first path even when a strict account-scoped canonical state already existed.

### GREEN implementation

- Same-user token refresh persists new credentials without invoking the identity-transition callback or changing generation.
- Expired startup restore refreshes credentials and then emits exactly one restore activation.
- Added a controller `resume(session, state)` path that validates strict canonical state, marks that user/generation ready, activates it without a write or recovery backup, and performs no network request.
- Added one UI session coordinator:
  - `valid` account scope: resume immediately and render, including offline, preserving its durable queue;
  - `missing` account scope: and only missing, enter first-login inspection/choices;
  - `invalid`/read-error scope: activate the fail-closed view and remain quarantined;
  - sign-out: activate and render anonymous local scope;
  - cross-user/sign-in transitions: cancel the previous controller/reconciliation and switch Flashcard ownership.
- Existing `online` scheduling drains a restored queue after reconnect. Tests prove offline restore makes zero cloud reads and keeps the operation until reconnect.

The focused restore suite covers valid account state/queue, missing first login, invalid fail-closed behavior, and sign-out/local behavior.

## Finding 3 — PostgREST returning semantics and stale guard are honored

### Actual RED

`node tests/test_flashcard_rest_client.js` requested a returning upsert and observed the old header:

```text
actual:   resolution=merge-duplicates,return=minimal
expected: resolution=merge-duplicates,return=representation
```

A controller regression then returned `data:null` with a failed entity refetch and incorrectly removed the queued operation (`actual []`, expected the original operation ID).

### Root cause

The REST client always sent `return=minimal` for upserts and parsed response bodies only for GET/RPC. Controller tests used fake echoes, so the controller marked any error-free POST as success without proving which row the stale/equal SQL guard retained.

### GREEN implementation

- Returning POST uses `resolution=merge-duplicates,return=representation`; non-returning callers retain `return=minimal`.
- PATCH supports `return=representation` as well. POST/PATCH representations are parsed only when requested; minimal bodies are not parsed.
- Fixed-entity select adds an owner-client-controlled UUID `id=eq.<id>` filter; no entity data controls a table name.
- Controller validates a single returned row through the strict cloud-row decoder: array shape, owner, row/payload ID, entity type/schema, canonical client version, and tombstone wire value.
- Missing or malformed representation triggers a fixed-table/fixed-entity refetch. A missing, malformed, failed, or older refetch retains the operation.
- A validated server-newer or equal-version/different server representation is merged as the actual stored winner before resolving the operation.
- Validated push winners are merged separately from cursor pulls, so a row behind the global cursor cannot be missed.

Focused coverage includes real `data:null` behavior, malformed owner echo, failed and successful refetch, server-newer echo behind the cursor, equal-version/different echo behind the cursor, returning/minimal headers, and POST/PATCH body parsing.

## Finding 4 — existing entity versions are monotonic

### Actual RED

The pure helper test initially observed `nextEntityTimestamp` as undefined. The account-store mutation contract also found raw `Date.now()` in the task toggle path:

```text
existing core entities must never receive a raw wall-clock version
```

A device-upload test separately proved queue versions were using initialization wall time instead of each entity version.

### GREEN implementation

- Added the tested canonical helper:
  - new entity: bounded integer wall clock;
  - existing entity: `max(boundedNow, previous.updatedAt + 1)`;
  - invalid prior/clock: fail closed;
  - prior at `253402300799999`: return failure rather than overflow.
- Added an app wrapper that throws on exhaustion; `commitCoreMutation` catches it and leaves canonical bytes/view/queue unchanged.
- Routed task toggle/delete, Flashcard link/copy/unlink, growth delete/promote, goal increment/delete, Pomodoro task increment, and mood delete through the per-entity helper.
- New task/growth/goal/focus/mood/rollover entities use bounded timestamps.
- Existing edits preserve `createdAt`; tombstones use the same monotonic value for `updatedAt` and `deletedAt`.
- Normal mutation and first-login upload operation versions derive from the corresponding entity `updatedAt`.

Tests cover same-millisecond edits, backward clock, bounded new timestamps, maximum-version fail-closed behavior, preserved `createdAt`, queue-version derivation, and a source contract forbidding raw `Date.now()` assignments in existing core-entity mutation blocks.

## Verification evidence

| Gate | Result |
|---|---:|
| `python3 -m unittest discover -s tests -v` | PASS — 95 tests |
| every `tests/test_*.js` via Node | PASS — 15/15 suite files |
| `python3 scripts/verify_companion_media.py` | PASS — 8 MP4 + 8 WebP, 0.83 MiB |
| inline `index.html` script + `account-sync.js` via `vm.Script` | PASS |
| Service Worker Node + Python contracts | PASS within full suites |
| bilingual UI/catalog parity | PASS within 42 UI contract tests |
| `git diff --check` | PASS |
| JWT-like token search outside docs/tests | 0 matches |
| database URL/service-key assignment search outside docs/tests | 0 matches |
| Supabase client configuration | URL and anon key remain exact empty strings |

Node suite files (15):

1. `test_account_core_flashcard_transaction.js`
2. `test_account_session_restore.js`
3. `test_account_store_integration.js`
4. `test_account_sync.js`
5. `test_allowance_budget.js`
6. `test_companion_playback.js`
7. `test_daily_rollover.js`
8. `test_flashcard_import.js`
9. `test_flashcard_rest_client.js`
10. `test_flashcard_scheduler.js`
11. `test_flashcard_sync.js`
12. `test_life_import.js`
13. `test_nutrition_tracker.js`
14. `test_service_worker.js`
15. `test_task_helpers.js`

## Scope and remaining concern

- Core sync still contains only task, growth, goal, focus, and mood tables. No Life, nutrition, wallet, expense, password, token, or key was added to core serialization or REST payload construction.
- User/generation/epoch checks remain before remote calls and canonical writes.
- SQL stale/equal-write guards were not weakened.
- Blank Supabase configuration remains safe.
- The only remaining release concern is unchanged: live Auth/RLS/stale-write/two-account acceptance requires an explicitly disposable, migrated Supabase project. It was unavailable and was not attempted.
- No push or deployment was performed.
