# Local-Day Energy Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset daily energy at the user's local midnight and move unfinished prior-day tasks to the Growth Pool exactly once.

**Architecture:** Keep the single-file application and `DB` wrapper. Add pure local-date and migration helpers inside `index.html`, then invoke one idempotent rollover controller on startup, foreground resume, focus, and the next local midnight.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, localStorage, Python unittest, Node syntax checks.

## Global Constraints

- Existing local data must remain readable.
- Only today's unfinished tasks contribute to energy load.
- Unfinished prior-day tasks move to Growth Pool once; completed prior-day tasks remain in local history.
- Use device-local calendar dates, never UTC `toISOString()` for product-day boundaries.
- Keep `week` at seven entries and preserve multi-day shifting.
- Any `index.html` change increments the shell cache from `liangli-v5` to `liangli-v6`.

---

### Task 1: Lock the rollover contract

**Files:**
- Create: `tests/test_daily_rollover.js`
- Modify: `tests/test_manga_ui_contract.py`

**Interfaces:**
- Consumes: existing `DB`, `S.tasks`, `S.ideas`, `S.week`, `S.lastDay`
- Produces: executable expectations for `localDayKey`, `normalizeTaskDays`, `rolloverIfNeeded`, `scheduleNextRollover`

- [ ] **Step 1: Write the failing behavior test**

Create a Node harness that extracts the storage/rollover script and asserts:

```js
assert.equal(localDayKey(new Date(2026, 7, 7, 23, 59)), '2026-08-07');
assert.equal(localDayKey(new Date(2026, 7, 8, 0, 1)), '2026-08-08');
assert.equal(result.tasks.length, 0);
assert.equal(result.ideas.filter(x => x.rolloverSourceId === 1).length, 1);
assert.equal(second.ideas.filter(x => x.rolloverSourceId === 1).length, 1);
assert.deepEqual(result.week, [3, 4, 5, 6, 0, 0, 0]);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node tests/test_daily_rollover.js`  
Expected: FAIL because the local-day helpers do not exist.

- [ ] **Step 3: Add static contract assertions**

Assert that `toISOString().slice(0,10)` no longer defines today, task creation writes `dayKey:currentDayKey`, and listeners exist for `visibilitychange` and `focus`.

- [ ] **Step 4: Run the focused tests**

Run: `python3 -m unittest tests.test_manga_ui_contract -v`  
Expected: the new assertions fail before implementation.

- [ ] **Step 5: Commit the tests**

```bash
git add tests/test_daily_rollover.js tests/test_manga_ui_contract.py
git commit -m "test: define local-day energy rollover"
```

### Task 2: Implement local-day task ownership

**Files:**
- Modify: `index.html` storage block and task creation/rendering

**Interfaces:**
- Produces: `localDayKey(date): string`, `currentDayKey: string`, `normalizeTaskDays(tasks, fallbackDay): Task[]`

- [ ] **Step 1: Add the pure helpers**

```js
function localDayKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function normalizeTaskDays(tasks,fallbackDay){
  return tasks.map(task=>task.dayKey?task:{...task,dayKey:fallbackDay});
}
```

- [ ] **Step 2: Attach `dayKey` to new and moved tasks**

Both `addTask()` and `ideaToTask()` write `dayKey:currentDayKey`.

- [ ] **Step 3: Filter render and load calculations**

`renderTasks()` and `renderLoad()` operate only on `task.dayKey===currentDayKey`; task history remains stored locally.

- [ ] **Step 4: Run tests**

Run: `node tests/test_daily_rollover.js`  
Expected: helper assertions pass; rollover assertions remain failing.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: assign tasks to local calendar days"
```

### Task 3: Implement idempotent rollover scheduling

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `rolloverIfNeeded(now): boolean`, `scheduleNextRollover(): void`

- [ ] **Step 1: Replace the startup-only IIFE**

Compute the day gap from local noon values to avoid DST errors, migrate prior-day unfinished tasks into ideas with stable `rolloverSourceId`, reset focus counters, advance `week`, persist all changed collections, and update `currentDayKey`.

- [ ] **Step 2: Add lifecycle checks**

Call `rolloverIfNeeded()` on visible `visibilitychange`, `window.focus`, and the scheduled next local midnight. Recalculate the timer after every check.

- [ ] **Step 3: Add localized rollover copy**

Add matching `zh` and `en` I18N keys for the one-time toast.

- [ ] **Step 4: Run all relevant tests**

Run: `node tests/test_daily_rollover.js`  
Expected: PASS.

Run: `python3 -m unittest discover -s tests -v`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests
git commit -m "feat: reset energy at local midnight"
```

### Task 4: Release cache and browser verification

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

**Interfaces:**
- Produces: shell cache `liangli-v6`

- [ ] **Step 1: Bump shell cache and document behavior**

Change only the shell cache version; preserve `liangli-video-v1` and Range handling.

- [ ] **Step 2: Run release verification**

```bash
python3 -m unittest discover -s tests -v
node tests/test_service_worker.js
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");new Function(h.slice(h.indexOf("<script>")+8,h.lastIndexOf("</script>")));'
git diff --check
```

- [ ] **Step 3: Verify in a real browser**

Use a temporary localStorage fixture for yesterday, reload at a China-timezone local date, confirm zero load, one migrated idea, no duplicate after a second reload, and no console errors.

- [ ] **Step 4: Commit**

```bash
git add sw.js README.md
git commit -m "docs: explain daily energy rollover"
```

