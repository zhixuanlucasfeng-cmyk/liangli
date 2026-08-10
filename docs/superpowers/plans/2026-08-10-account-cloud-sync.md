# Account Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Supabase email/password account that synchronizes Liangli's tasks, growth pool, goals, focus history, mood history, and existing Flashcards across devices while keeping Nutrition and Wallet local by default.

**Architecture:** Keep the app offline-first. Move the syncable non-Flashcard modules into a versioned, account-partitioned canonical `localStorage` document and implement pure normalization/merge helpers in a new `account-sync.js`; the existing inline application code supplies storage, rendering, and Supabase adapters. Supabase stores each entity type in an owner-scoped table protected by RLS, while a per-user manifest distinguishes an initialized empty cloud from a never-initialized account.

**Tech Stack:** HTML/CSS/vanilla JavaScript, `localStorage`, IndexedDB, native `fetch`, Supabase Auth/PostgREST, PostgreSQL/RLS, Service Worker, Node `assert`, Python `unittest`.

## Global Constraints

- Anonymous users retain the complete offline application; account onboarding is skippable.
- Default cloud scope is tasks, growth pool, goals, focus sessions, mood entries, and Flashcards.
- Nutrition, Wallet, expenses, Life backup data, passwords, access tokens, and Supabase keys must never enter core sync serialization, queues, REST payloads, or recovery backups.
- Supabase clients contain only the project URL and anon public key; service-role/admin keys are forbidden in client files.
- Every cloud table enables RLS and binds reads/writes to `auth.uid() = user_id`; cross-account foreign references must also be owner checked.
- Local mutation succeeds before cloud enqueue. Offline or partial cloud failure retains the pending operation.
- Account scope is generation-bound: requests created for an old session may not mutate a new account or anonymous state.
- On an initialized account, validated cloud core data replaces the device view after a local recovery snapshot is created.
- On an uninitialized account, the user explicitly chooses “upload this device” or “start empty”; starting empty requires confirmation.
- Nutrition and Wallet remain in the existing `ll_lifeState` and are never changed by account activation, sign-out, backup restore, or sync.
- Production remains a static GitHub Pages PWA; Supabase Auth/REST responses are never cached by the Service Worker.

---

## File Structure

- Create `account-sync.js` — pure core-state schema, legacy migration, recovery-bundle parser, merge rules, sync queue operations, and account-sync controller.
- Modify `index.html` — load the new module; add account/onboarding UI; adapt core mutations, focus statistics, Auth, rendering, and startup to scoped canonical state.
- Create `supabase/migrations/003_core_sync.sql` — manifest and five normalized owner-scoped core tables, indexes, timestamp guards, grants, and RLS.
- Create `supabase/tests/core_sync_rls.sql` — two-user isolation and stale-update SQL acceptance tests.
- Create `tests/test_account_sync.js` — pure behavior tests for schema, migration, merge, queue, first-login decisions, recovery, generation races, and privacy allowlist.
- Create `tests/test_account_store_contract.py` — HTML/storage integration and mutation-path contract tests.
- Create `tests/test_supabase_core_migration_contract.py` — SQL/RLS structural contract.
- Modify `tests/test_flashcard_rest_client.js` — generalized Auth/REST behavior and table allowlist coverage.
- Modify `tests/test_manga_ui_contract.py` — account onboarding, modal, status, accessibility, bilingual keys, and input bounds.
- Modify `tests/test_service_worker.js` and `tests/test_service_worker_contract.py` — `account-sync.js` shell caching, cache v9, and Supabase network-only behavior.
- Modify `sw.js` — cache v9 and include `account-sync.js` in the shell.
- Modify `README.md` and `CLAUDE.md` — setup, privacy, recovery, RLS, iPhone installation, and release gate.

---

### Task 1: Versioned Account-Scoped Core Store

**Files:**
- Create: `account-sync.js`
- Create: `tests/test_account_sync.js`
- Create: `tests/test_account_store_contract.py`
- Modify: `index.html:945-1030`
- Modify: `index.html:1860-1940`

**Interfaces:**
- Produces: `window.LiangliAccountSync`.
- Produces: `CORE_STATE_VERSION = 1` and `CORE_SYNC_TYPES = ['task','growth','goal','focus','mood']`.
- Produces: `coreStorageKey(scope: string): string` returning `coreState_local` or `coreState_<normalized-user-id>`.
- Produces: `normalizeCoreState(raw: unknown, options?: { legacy?: boolean, now?: number, dayKey?: string }): CoreState | null`.
- Produces: `migrateLegacyCoreState(legacy: LegacyCoreInput, now: number, dayKey: string): CoreState`.
- Produces: `serializeCoreRecovery(state: CoreState): string` and `parseCoreRecovery(text: string): CoreState`; serialization excludes `syncOps`, and parsing always returns an empty queue.
- Consumes later: `CoreState = { version, tasks, growthItems, goals, focusSessions, moodEntries, syncOps }`.

- [ ] **Step 1: Write failing schema and migration tests**

Add tests that require UUID string IDs, bounded text/numbers, `createdAt`, `updatedAt`, nullable `deletedAt`, exact keys, global ID uniqueness, and a queue that cannot contain Life entity types. Include a legacy fixture matching current `tasks`, `ideas`, `goals`, `logs`, `focusMin`, `pomo`, and seven-element `week` keys.

```js
const migrated = api.migrateLegacyCoreState({
  tasks:[{id:1700000000000,name:'Read',energy:25,done:false,dayKey:'2026-08-10'}],
  ideas:[{id:1700000000001,name:'Essay idea'}],
  goals:[{id:1700000000002,name:'Book',target:10,cur:2,unit:'chapters'}],
  logs:[{id:1700000000003,date:'2026-08-10',mood:'😐',text:'Okay'}],
  focusMin:50,pomo:2,week:[0,0,0,0,0,0,50]
}, 1700000005000, '2026-08-10');
assert.equal(migrated.version, 1);
assert.equal(migrated.focusSessions[0].kind, 'legacy-summary');
assert.deepEqual(migrated.focusSessions[0].weekMinutes,[0,0,0,0,0,0,50]);
assert(!JSON.stringify(migrated).includes('calorieTarget'));
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/test_account_sync.js`

Expected: FAIL because `account-sync.js` or `LiangliAccountSync` is missing.

- [ ] **Step 3: Implement the pure core schema**

Use a browser/Node-compatible IIFE without network or DOM access:

```js
(function(root){
  'use strict';
  const CORE_STATE_VERSION=1;
  const CORE_SYNC_TYPES=Object.freeze(['task','growth','goal','focus','mood']);
  function coreStorageKey(scope){
    return `coreState_${scope==='local'?'local':String(scope).toLowerCase()}`;
  }
  // strict builders, migration, recovery parser, and exports
  root.LiangliAccountSync=Object.freeze({CORE_STATE_VERSION,CORE_SYNC_TYPES,coreStorageKey,normalizeCoreState,migrateLegacyCoreState,serializeCoreRecovery,parseCoreRecovery});
})(typeof window==='undefined'?globalThis:window);
```

Represent old aggregate focus data as one `kind:'legacy-summary'` focus record containing `minutes`, `pomodoroCount`, and `weekMinutes`; new Pomodoros use `kind:'pomodoro'`, `minutes:25`, `pomodoroCount:1`, and stable `dayKey`. This preserves totals without inventing historical session timestamps.

- [ ] **Step 4: Add scoped canonical storage to the app**

Load `account-sync.js` before the inline script. Add `readCoreScope(scope)`, `writeCoreScope(scope,state)`, `activateCoreScope(scope,state)`, and `coreStateToViewState(state,S)` adapters. On first anonymous startup only, migrate the legacy keys into `ll_coreState_local`; do not delete legacy keys until the canonical write succeeds.

```js
function readCoreScope(scope){
  const key=LiangliAccountSync.coreStorageKey(scope);
  const record=DB.read(key);
  if(record.status==='missing')return {status:'missing',state:null,raw:null};
  if(record.status!=='present')return {status:record.status,state:null,raw:record.raw};
  const state=LiangliAccountSync.normalizeCoreState(record.value);
  return state?{status:'valid',state,raw:record.raw}:{status:'invalid',state:null,raw:record.raw};
}
```

- [ ] **Step 5: Verify GREEN and backward compatibility**

Run:

```bash
node tests/test_account_sync.js
python3 -m unittest tests.test_account_store_contract -v
python3 -m unittest tests.test_manga_ui_contract -v
```

Expected: all pass; invalid canonical bytes remain unchanged; `ll_lifeState` is never read or written by the new module.

- [ ] **Step 6: Commit**

```bash
git add account-sync.js index.html tests/test_account_sync.js tests/test_account_store_contract.py
git commit -m "feat: add account-scoped core storage"
```

---

### Task 2: Supabase Core Schema and RLS

**Files:**
- Create: `supabase/migrations/003_core_sync.sql`
- Create: `supabase/tests/core_sync_rls.sql`
- Create: `tests/test_supabase_core_migration_contract.py`

**Interfaces:**
- Produces tables: `liangli_sync_profiles`, `liangli_tasks`, `liangli_growth_items`, `liangli_goals`, `liangli_focus_sessions`, `liangli_mood_entries`.
- Every entity row: `id uuid`, `user_id uuid`, `payload jsonb`, `client_updated_at bigint`, `deleted_at timestamptz`, `created_at`, `updated_at`.
- Manifest row: one `user_id` primary key, `core_version`, `initialized_at`, `updated_at`.

- [ ] **Step 1: Write the failing SQL contract**

Require all six tables, RLS, owner policies, authenticated-only grants, payload size/type checks, unique owner indexes, and a stale-update guard.

```python
for table in CORE_TABLES:
    self.assertIn(f"alter table public.{table} enable row level security", SQL)
    self.assertRegex(SQL, rf"{table}.*auth\.uid\(\) = user_id")
self.assertNotIn("grant", lines_for_role("anon"))
```

- [ ] **Step 2: Run and verify RED**

Run: `python3 -m unittest tests.test_supabase_core_migration_contract -v`

Expected: FAIL because migration 003 is missing.

- [ ] **Step 3: Implement migration 003**

Use one repeated entity table shape with strict JSON object and byte-size checks. Add a trigger equivalent to the Flashcard stale guard: a lower/equal `client_updated_at` update returns the stored row unchanged. Index `(user_id, client_updated_at)` and `(user_id, deleted_at)`.

```sql
create table public.liangli_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
  client_updated_at bigint not null check (client_updated_at between 0 and 9007199254740991),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Use separate named policies for select/insert/update/delete and `with check` clauses. No policy may use an email claim.

- [ ] **Step 4: Add executable two-user SQL acceptance cases**

`core_sync_rls.sql` creates two test users, impersonates each authenticated user, proves isolation for every table, verifies cross-owner updates/deletes fail, and verifies stale updates retain the newer row. Wrap in a transaction and roll back.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
python3 -m unittest tests.test_supabase_core_migration_contract tests.test_supabase_migration_contract -v
```

Expected: all structural tests pass. Run `supabase/tests/core_sync_rls.sql` later against a disposable Supabase project before production configuration.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/003_core_sync.sql supabase/tests/core_sync_rls.sql tests/test_supabase_core_migration_contract.py
git commit -m "feat: secure core sync tables"
```

---

### Task 3: Shared Auth and Core REST Client

**Files:**
- Modify: `account-sync.js`
- Modify: `index.html:761-925`
- Modify: `tests/test_account_sync.js`
- Modify: `tests/test_flashcard_rest_client.js`
- Modify: `tests/test_manga_ui_contract.py`

**Interfaces:**
- Renames UI-neutral client to `AccountClient` while preserving `window.CommunityClient = AccountClient` temporarily for old Flashcard call sites.
- Produces `createOwnerRestClient(session,generation,allowedTables)`.
- Produces `AccountClient.recover(email,redirectTo)`.
- Produces `CORE_REMOTE_TABLES` immutable mapping from entity type to table; it contains no Life table.

- [ ] **Step 1: Write failing Auth/REST tests**

Test URL validation, anon key validation, signup/signin/recover/logout endpoints, single-flight refresh, generation isolation, 401 behavior, and exact allowlists.

```js
assert.deepEqual(Object.values(api.CORE_REMOTE_TABLES).sort(),[
  'liangli_focus_sessions','liangli_goals','liangli_growth_items','liangli_mood_entries','liangli_tasks'
]);
assert.throws(()=>client.table('liangli_expenses'),/not allowed/i);
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node tests/test_account_sync.js
node tests/test_flashcard_rest_client.js
```

Expected: FAIL on missing generic client and recovery endpoint.

- [ ] **Step 3: Generalize the existing native-fetch client**

Keep one session owner and refresh lock. The core client must attach `apikey`, the active generation's bearer token, and JSON content headers. It may only access the passed immutable allowlist. A response that arrives after account generation changes is discarded before any state mutation.

- [ ] **Step 4: Add password recovery**

Implement Supabase `/auth/v1/recover` with `{email,redirect_to}` where `redirect_to` is constrained to `location.origin + location.pathname`. Never log email, password, tokens, or response bodies.

- [ ] **Step 5: Verify GREEN and secret safety**

Run:

```bash
node tests/test_account_sync.js
node tests/test_flashcard_rest_client.js
python3 -m unittest tests.test_manga_ui_contract -v
```

Expected: all pass; `SUPABASE_URL` and `SUPABASE_ANON_KEY` remain blank in source; no service-role string appears outside tests that forbid it.

- [ ] **Step 6: Commit**

```bash
git add account-sync.js index.html tests/test_account_sync.js tests/test_flashcard_rest_client.js tests/test_manga_ui_contract.py
git commit -m "feat: share secure account client"
```

---

### Task 4: Core Sync Engine and Cloud Manifest

**Files:**
- Modify: `account-sync.js`
- Modify: `index.html`
- Modify: `tests/test_account_sync.js`
- Modify: `tests/test_account_store_contract.py`

**Interfaces:**
- Produces `createCoreSyncController(deps)`.
- Controller methods: `inspectCloud(session)`, `initializeFromDevice(session,state)`, `initializeEmpty(session)`, `activateCloud(session)`, `sync(session)`, `schedule(reason)`, `cancel()`.
- Produces merge helpers `mergeCoreEntity(local,remote)` and `coalesceCoreOps(ops)`.
- Consumes `deps = { readScope, writeScope, createRecovery, restClient, getGeneration, now, onStatus, onActivate }`.

- [ ] **Step 1: Write failing merge, queue, and generation tests**

Cover LWW by `updatedAt`, tombstones, focus/mood UUID union, no deletion resurrection, operation coalescing, partial failure retention, offline scheduling, and stale-account response suppression.

```js
const controller=api.createCoreSyncController(harness.deps);
const oldRequest=controller.sync(sessionA);
harness.switchTo(sessionB);
harness.resolveOld({tasks:[taskFromA]});
await oldRequest;
assert.equal(harness.activeScope,'user-b');
assert(!harness.state.tasks.some(x=>x.name==='A'));
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/test_account_sync.js`

Expected: FAIL because controller methods are absent.

- [ ] **Step 3: Implement manifest inspection and first activation primitives**

`inspectCloud` reads the single `liangli_sync_profiles` row. Missing means uninitialized even if an older Flashcard-only account has cards. An existing manifest causes strict retrieval of all five core tables; one malformed row rejects the whole activation.

- [ ] **Step 4: Implement deterministic push/pull**

Push coalesced pending ops first, retaining failed IDs. Pull all rows changed since the last successful cursor, strictly rebuild entities, merge, atomically save the account scope, then advance the cursor. Treat a stale server echo as a pull requirement, not success of the local value.

- [ ] **Step 5: Enforce privacy and generation boundaries**

Before every fetch and before every write, check the captured user ID and generation. Serialize only `CORE_SYNC_TYPES`; do not accept a dynamic table name from entity payloads.

Wire scheduling to successful account-scoped mutations, `online`, visible-page/focus resume, login completion, and the explicit “sync now” action. Coalesce concurrent triggers into one in-flight sync and use bounded exponential retry only while the same account generation remains active.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node tests/test_account_sync.js
python3 -m unittest tests.test_account_store_contract -v
```

Expected: all pass, including failed batch retention and old-session races.

- [ ] **Step 7: Commit**

```bash
git add account-sync.js index.html tests/test_account_sync.js tests/test_account_store_contract.py
git commit -m "feat: synchronize core account data"
```

---

### Task 5: Route Core Mutations Through the Canonical Store

**Files:**
- Modify: `index.html:945-1030`
- Modify: `index.html:2020-2180`
- Modify: `index.html:2720-2850`
- Modify: `index.html:3320-3385`
- Modify: `tests/test_account_store_contract.py`
- Modify: `tests/test_account_sync.js`

**Interfaces:**
- Produces `commitCoreMutation(type, entityId, mutate): boolean`.
- Produces `activeCoreItems(type): Entity[]` filtering tombstones.
- Produces `computeFocusStats(focusSessions,currentDayKey)`.
- Consumes Task 1 canonical state and Task 4 sync controller.

- [ ] **Step 1: Write failing mutation invariants**

Every task/growth/goal/focus/mood create, edit, complete, promote, increment, and delete path must use `commitCoreMutation`. Tests assert local atomic save precedes queue scheduling; failed storage rolls back `S`; deletes create tombstones; Life mutation paths do not call it.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
python3 -m unittest tests.test_account_store_contract -v
node tests/test_account_sync.js
```

Expected: FAIL because current functions write separate legacy keys directly.

- [ ] **Step 3: Implement the mutation gateway**

```js
function commitCoreMutation(type,entityId,mutate){
  const previous=activeCoreState;
  const candidate=mutate(structuredClone(previous));
  const normalized=LiangliAccountSync.normalizeCoreState(candidate);
  if(!normalized||!writeCoreScope(activeCoreScope,normalized))return false;
  activeCoreState=normalized;
  applyCoreStateToView();
  if(activeCoreScope!=='local')coreSyncController.schedule(`mutation:${type}:${entityId}`);
  return true;
}
```

Use a compatibility clone helper when `structuredClone` is unavailable. Generate UUIDs with `crypto.randomUUID()` and a tested RFC4122 fallback.

- [ ] **Step 4: Convert all module mutations**

- Tasks and growth pool receive timestamps and tombstones; rollover/promote commit all touched entities in one canonical write.
- Goals update `updatedAt` on progress change and tombstone on delete.
- A completed Pomodoro appends a `kind:'pomodoro'` session; stats are derived from focus sessions plus one optional `legacy-summary`.
- Mood entries use stable `dayKey`, timestamps, and tombstones.
- Rendering filters `deletedAt`; old numeric IDs are already migrated to UUIDs.

- [ ] **Step 5: Verify GREEN and daily rollover**

Run:

```bash
node tests/test_account_sync.js
node tests/test_daily_rollover.js
node tests/test_task_helpers.js
python3 -m unittest tests.test_account_store_contract tests.test_manga_ui_contract -v
```

Expected: all pass; a failed canonical write leaves the old view and queue unchanged.

- [ ] **Step 6: Commit**

```bash
git add index.html account-sync.js tests/test_account_sync.js tests/test_account_store_contract.py
git commit -m "refactor: persist core mutations atomically"
```

---

### Task 6: Account Onboarding, Recovery, and First-Login Choice

**Files:**
- Modify: `index.html`
- Modify: `account-sync.js`
- Modify: `tests/test_manga_ui_contract.py`
- Modify: `tests/test_account_sync.js`
- Modify: `tests/test_account_store_contract.py`

**Interfaces:**
- Produces global UI actions `openAccountPanel`, `closeAccountPanel`, `signInAccount`, `signUpAccount`, `recoverAccount`, `signOutAccount`, `chooseUploadDevice`, `chooseStartEmpty`, `restoreCoreRecovery`.
- Produces recovery keys `coreRecovery_<UTC timestamp>`; retain the newest three per device.
- Consumes controller methods from Task 4.

- [ ] **Step 1: Write failing accessible UI contracts**

Require a 44px avatar button, skippable welcome dialog, labeled email/password fields, sign-in/signup/recover/sign-out controls, live sync status, focus restoration, Escape close, inert background, and bilingual copy. The start-empty confirmation must not be a blocking browser `confirm()`.

- [ ] **Step 2: Run and verify RED**

Run: `python3 -m unittest tests.test_manga_ui_contract -v`

Expected: FAIL on missing account elements and i18n keys.

- [ ] **Step 3: Implement onboarding and account modal**

Show onboarding only when `ll_accountWelcomeSeen` is absent. “Continue on this device” sets that flag and closes without changing data. The avatar remains available in the banner. Reuse the existing Auth client; remove the Flashcard-only account panel after equivalent controls exist globally.

- [ ] **Step 4: Implement safe first-login reconciliation**

On initialized cloud:

1. Strictly fetch and validate cloud data.
2. Store a versioned recovery snapshot of the currently visible syncable modules.
3. Atomically write the account-scoped cloud state.
4. Activate the account scope and render.

On uninitialized cloud, show the two explicit choices. “Upload device” copies the anonymous canonical state with new account ownership and queues all active/tombstoned entities before creating the manifest. “Start empty” creates a recovery snapshot, then creates the manifest and empty account state only after the second confirmation.

- [ ] **Step 5: Implement recovery management**

List the three newest snapshots with date, entity counts, and “restore to this device” action. Recovery parsing is strict and cannot alter Life or session keys. Failed recovery leaves current state unchanged.

- [ ] **Step 6: Verify UI and first-login GREEN**

Run:

```bash
node tests/test_account_sync.js
python3 -m unittest tests.test_account_store_contract tests.test_manga_ui_contract -v
```

Expected: all pass for initialized override, uninitialized upload, confirmed empty, cancel, backup failure, invalid cloud, and focus/keyboard behavior.

- [ ] **Step 7: Commit**

```bash
git add index.html account-sync.js tests/test_account_sync.js tests/test_account_store_contract.py tests/test_manga_ui_contract.py
git commit -m "feat: add optional account onboarding"
```

---

### Task 7: PWA Release, Configuration, and iPhone Documentation

**Files:**
- Modify: `sw.js`
- Modify: `tests/test_service_worker.js`
- Modify: `tests/test_service_worker_contract.py`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces shell cache `liangli-v9` including `/account-sync.js`.
- Documents required public configuration: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Produces a release checklist that blocks production enablement until migrations 002/003 and both RLS SQL tests pass.

- [ ] **Step 1: Update Service Worker tests to RED**

Require v9, `account-sync.js` in the same-origin shell cache, and unchanged network-only handling for `https://*.supabase.co`.

Run:

```bash
node tests/test_service_worker.js
python3 -m unittest tests.test_service_worker_contract -v
```

Expected: FAIL on v8/missing account-sync shell asset.

- [ ] **Step 2: Bump cache and preserve network boundaries**

Change cache to `liangli-v9` and add `account-sync.js` to install assets. Do not add Auth/REST URLs, tokens, API responses, or cross-origin fallbacks.

- [ ] **Step 3: Document backend activation**

Document this exact order:

1. Create a Supabase project.
2. Run migrations `002_flashcards.sql` and `003_core_sync.sql`.
3. Run `flashcards_rls.sql` and `core_sync_rls.sql` in a disposable/test project.
4. Configure only project URL and anon public key.
5. Configure Auth site URL and allowed redirect URL to the GitHub Pages HTTPS origin/path.
6. Test registration, verification, recovery, two accounts, offline writes, and sign-out.
7. Push only after the release suite passes.

Add iPhone instructions: open the HTTPS GitHub Pages URL in Safari, Share, Add to Home Screen. State that `127.0.0.1` is Mac-only and LAN HTTP is not the production PWA path.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node tests/test_service_worker.js
python3 -m unittest tests.test_service_worker_contract -v
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add sw.js tests/test_service_worker.js tests/test_service_worker_contract.py README.md CLAUDE.md
git commit -m "docs: prepare account sync release"
```

---

### Task 8: Release Verification and Manual Acceptance

**Files:**
- Modify only if a release-test gap is found: the corresponding existing test file

**Interfaces:**
- Consumes all prior tasks.
- Produces a reviewed, locally testable account-sync release; production accounts remain disabled until real Supabase URL/anon key and migrations are supplied.

- [ ] **Step 1: Run every automated test fresh**

```bash
python3 -m unittest discover -s tests -v
for test_file in tests/test_*.js; do node "$test_file" || exit 1; done
python3 scripts/verify_companion_media.py
node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('index.html','utf8');const inline=h.match(/<script>([\\s\\S]*?)<\\/script>/)[1];new vm.Script(inline);new vm.Script(fs.readFileSync('account-sync.js','utf8'));console.log('JS syntax: ok')"
git diff --check
```

Expected: all commands exit 0, bilingual key parity passes, 8 MP4 + 8 WebP pass, and no generated files are staged.

- [ ] **Step 2: Run disposable Supabase acceptance**

After the user supplies a disposable project URL/key and confirms migrations were run, test two real accounts: user A cannot see user B; stale writes do not win; email verification/recovery redirect correctly; no Life payload appears in requests. If credentials are not yet available, mark this gate explicitly blocked and do not claim production sync is enabled.

- [ ] **Step 3: Run local browser acceptance**

Serve the repository and verify mobile/desktop layouts, skipped onboarding, registration validation, initialized-cloud override with recovery, uninitialized upload/start-empty, offline queue, reconnect sync, account switching, sign-out returning to anonymous scope, Flashcards, keyboard flow, reduced motion, and all five main views.

- [ ] **Step 4: Verify Git and secret hygiene**

```bash
git status --short
git grep -n -E "service[_-]?role|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{80,}" -- ':!docs/**' ':!tests/**'
git log --oneline --decorate -12
```

Expected: clean worktree; no service-role/admin token; intentional task commits only.

- [ ] **Step 5: Record the release-gate result**

If Task 8 exposes a gap, stop this task and return the finding to the task that owns the affected file; fix, test, review, and commit it there before rerunning Task 8. Do not create a catch-all release commit.

Do not push, deploy, or add a remote until the user explicitly approves and the disposable Supabase acceptance gate passes.
