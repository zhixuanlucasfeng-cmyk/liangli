# Nutrition Timeline and Allowance Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline-first food/calorie tracking and a carry-forward allowance budget under a new Life hub without changing existing journal data.

**Architecture:** Keep the existing single-file PWA structure: semantic HTML, CSS, state, rendering, and event logic stay in `index.html`; pure calculation functions are isolated so Node tests can extract them without a DOM. Store nutrition and budget records in namespaced `localStorage` keys, use integer cents for money, and keep all new data local-only. The existing Journal view becomes the third panel inside Life while retaining its original element IDs and storage key.

**Tech Stack:** HTML/CSS/vanilla JavaScript, `localStorage`, existing PWA Service Worker, Node `assert`, Python `unittest` contract tests.

## Global Constraints

- Daily calorie targets are user-entered; do not derive medical, nutrition, or weight-loss recommendations.
- Calorie estimates use an offline built-in food table, are visibly approximate, remain editable, and fall back to manual entry when unmatched.
- Savings default to 20% but are advisory and user-adjustable from 0% through 100%.
- Money is stored and calculated as integer cents.
- Budget periods support day, week, month, custom months, and custom years using local calendar dates.
- Positive and negative daily balances carry into the next day.
- A finished period never auto-renews; the user chooses same settings, recharge/new amount, or pause, and separately chooses whether to carry the final balance.
- Nutrition and finance data remain local-only in this release and must not enter Supabase sync.
- Existing task, Flashcard, journal, companion, and local-day rollover behavior must remain compatible.
- New UI is bilingual, keyboard accessible, touch friendly, manga-styled, and safe under `prefers-reduced-motion`.

---

### Task 1: Pure nutrition calculations

**Files:**
- Modify: `index.html` — add pure nutrition functions immediately before `function normalizeTaskDays`
- Create: `tests/test_nutrition_tracker.js`

**Interfaces:**
- Produces: `normalizeFoodEntry(raw, fallbackTimestamp) -> FoodEntry`
- Produces: `estimateFoodCalories(name, portion) -> {matched:boolean, calories:number|null, label:string|null}`
- Produces: `summarizeCalories(entries, dayKey, target) -> {consumed,target,remaining}`
- Produces: `foodEntriesForDay(entries, dayKey) -> FoodEntry[]`

- [ ] **Step 1: Write the failing nutrition behavior test**

Create `tests/test_nutrition_tracker.js` that extracts the block from `const OFFLINE_FOODS=` through `function normalizeTaskDays` and asserts:

```js
const egg = normalizeFoodEntry({id:'1',name:'鸡蛋',calories:140,eatenAt:'2026-08-09T08:10:00+08:00'}, 0);
assert.equal(egg.portion, '');
assert.equal(egg.mode, 'manual');
assert.equal(estimateFoodCalories('两个鸡蛋', '2 个').matched, true);
assert.equal(estimateFoodCalories('完全未知食物', '1 份').calories, null);
const summary = summarizeCalories([
  egg,
  normalizeFoodEntry({id:'2',name:'饭',calories:300,eatenAt:'2026-08-09T12:00:00+08:00'}, 0),
], '2026-08-09', 400);
assert.deepEqual(summary, {consumed:440,target:400,remaining:-40});
assert.deepEqual(foodEntriesForDay([summaryInputLate, summaryInputEarly], '2026-08-09').map(x=>x.id), ['early','late']);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/test_nutrition_tracker.js`

Expected: FAIL because `OFFLINE_FOODS` and the four functions do not exist.

- [ ] **Step 3: Implement the minimal pure functions**

Add a compact bilingual offline table with stable fields:

```js
const OFFLINE_FOODS=[
  {keys:['鸡蛋','egg'],labelZh:'鸡蛋',labelEn:'Egg',unit:'piece',calories:70},
  {keys:['米饭','rice'],labelZh:'米饭',labelEn:'Rice',unit:'100g',calories:130},
  {keys:['牛奶','milk'],labelZh:'牛奶',labelEn:'Milk',unit:'250ml',calories:150},
  {keys:['苹果','apple'],labelZh:'苹果',labelEn:'Apple',unit:'piece',calories:95},
  {keys:['香蕉','banana'],labelZh:'香蕉',labelEn:'Banana',unit:'piece',calories:105},
];
```

Implement strict finite/non-negative calorie normalization, local-day filtering via existing `localDayKey(timestamp)`, ascending timestamp sorting, and conservative quantity parsing. Estimation must return `matched:false` and `calories:null` when no keyword matches.

- [ ] **Step 4: Run nutrition tests and regression syntax check**

Run:

```bash
node tests/test_nutrition_tracker.js
node -e "const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('index.html','utf8').match(/<script>([\\s\\S]*?)<\\/script>/)[1];new vm.Script(s);console.log('syntax ok')"
```

Expected: both PASS.

- [ ] **Step 5: Commit the nutrition calculation slice**

```bash
git add index.html tests/test_nutrition_tracker.js
git commit -m "feat: add offline calorie calculations"
```

---

### Task 2: Pure budget period and carry calculations

**Files:**
- Modify: `index.html` — add pure budget functions next to nutrition functions
- Create: `tests/test_allowance_budget.js`

**Interfaces:**
- Produces: `moneyToCents(value) -> number|null`
- Produces: `budgetEndExclusive(startDay, unit, count) -> string`
- Produces: `budgetDayCount(startDay, endExclusive) -> number`
- Produces: `allocateDailyCents(spendableCents, days) -> number[]`
- Produces: `computeBudgetLedger(cycle, expenses, throughDay) -> BudgetDay[]`
- `BudgetDay`: `{dayKey,baseCents,spentCents,availableCents,carryCents}`

- [ ] **Step 1: Write failing budget tests**

Create `tests/test_allowance_budget.js` and cover exact calendar and carry behavior:

```js
assert.equal(moneyToCents('12.34'), 1234);
assert.equal(moneyToCents('-1'), null);
assert.equal(budgetEndExclusive('2028-02-01','month',1), '2028-03-01');
assert.equal(budgetEndExclusive('2028-02-29','year',1), '2029-03-01');
assert.deepEqual(allocateDailyCents(10,3), [4,3,3]);

const cycle={id:'c1',startDay:'2026-08-10',endExclusive:'2026-08-17',totalCents:87500,savingsBps:2000,openingCarryCents:0};
const ledger=computeBudgetLedger(cycle,[
  {id:'e1',amountCents:13000,spentAt:'2026-08-10T12:00:00+08:00'},
], '2026-08-11');
assert.equal(ledger[0].baseCents,10000);
assert.equal(ledger[0].carryCents,-3000);
assert.equal(ledger[1].availableCents,7000);
```

Also assert zero-day rejection, custom month/year counts, positive carry, expense deletion recalculation, and total allocated cents equaling spendable cents.

- [ ] **Step 2: Run the budget test and verify RED**

Run: `node tests/test_allowance_budget.js`

Expected: FAIL because the budget functions do not exist.

- [ ] **Step 3: Implement calendar-safe integer calculations**

Parse `YYYY-MM-DD` into local-noon `Date` values to avoid daylight-saving midnight gaps. Use `setDate`, `setMonth`, and `setFullYear` with an explicit policy: adding one year to Feb 29 produces March 1 of the following year. Store savings as basis points (`2000` = 20%) and calculate:

```js
const savedCents=Math.round(cycle.totalCents*cycle.savingsBps/10000);
const spendableCents=cycle.totalCents-savedCents+cycle.openingCarryCents;
```

Allocate division remainders one cent at a time to the first days, then fold expenses chronologically so each day's `carryCents` feeds the next day's `availableCents`.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node tests/test_allowance_budget.js
node tests/test_nutrition_tracker.js
```

Expected: PASS.

- [ ] **Step 5: Commit budget math**

```bash
git add index.html tests/test_allowance_budget.js
git commit -m "feat: add carry-forward allowance math"
```

---

### Task 3: Persist and migrate Life state

**Files:**
- Modify: `index.html:1181` — extend `S`
- Modify: `index.html:1981` — extend `renderAll()`
- Create: `tests/test_life_store_contract.py`

**Interfaces:**
- Consumes: Task 1 `normalizeFoodEntry`; Task 2 budget types
- Produces state fields: `calorieTarget`, `foodEntries`, `favoriteFoods`, `budgetCycles`, `expenses`, `activeBudgetCycleId`
- Produces: `saveLifeState() -> void`
- Produces: `normalizeBudgetCycle(raw) -> BudgetCycle|null`
- Produces: `normalizeExpense(raw) -> Expense|null`

- [ ] **Step 1: Write the failing persistence contract**

Create Python assertions for namespaced keys and local-only boundaries:

```python
self.assertIn("DB.get('calorieTarget'", HTML)
self.assertIn("DB.get('foodEntries'", HTML)
self.assertIn("DB.get('budgetCycles'", HTML)
self.assertIn("DB.get('expenses'", HTML)
self.assertIn("function saveLifeState()", HTML)
self.assertNotIn("foodEntries", SYNC_BLOCK)
self.assertNotIn("budgetCycles", SYNC_BLOCK)
```

The sync block is the source slice from `async function syncFlashcards` to `function normalizeTaskDays`.

- [ ] **Step 2: Run the contract and verify RED**

Run: `python3 -m unittest tests.test_life_store_contract -v`

Expected: FAIL on missing state keys.

- [ ] **Step 3: Add normalized Life state and save boundary**

Load defaults of `2000` calories, empty arrays, and no active budget. Reject malformed records during normalization rather than crashing. `saveLifeState()` writes only these keys:

```js
for(const key of ['calorieTarget','foodEntries','favoriteFoods','budgetCycles','expenses','activeBudgetCycleId'])DB.set(key,S[key]);
```

Do not modify `migrateDailyState`; nutrition history and budget cycles are date-addressed and must survive daily energy rollover.

- [ ] **Step 4: Run persistence and existing rollover tests**

Run:

```bash
python3 -m unittest tests.test_life_store_contract tests.test_manga_ui_contract -v
node tests/test_task_helpers.js
```

Expected: PASS.

- [ ] **Step 5: Commit state persistence**

```bash
git add index.html tests/test_life_store_contract.py
git commit -m "feat: persist local life tracking data"
```

---

### Task 4: Add the Life hub navigation and manga panels

**Files:**
- Modify: `index.html:1-290` — Life styles and responsive rules
- Modify: `index.html:430-470` — wrap existing Journal and add Nutrition/Wallet panels
- Modify: `index.html:550-600` — bilingual strings
- Modify: `index.html:1198` — Life tab controller
- Modify: `tests/test_manga_ui_contract.py`

**Interfaces:**
- Produces DOM IDs: `v-life`, `lifeNutrition`, `lifeWallet`, `lifeJournal`, `lifeTabNutrition`, `lifeTabWallet`, `lifeTabJournal`
- Produces: `setLifeTab(tab, focus=true) -> void`

- [ ] **Step 1: Extend the failing UI contract**

Assert one bottom-nav button with `data-v="life"`, three semantic tab buttons with `aria-selected`, the three panel IDs, translated `navLife`, `nutritionTitle`, and `walletTitle`, and no remaining `data-v="journal"` nav button.

- [ ] **Step 2: Run the contract and verify RED**

Run: `python3 -m unittest tests.test_manga_ui_contract.MangaUIContractTests.test_life_hub_has_three_accessible_panels -v`

Expected: FAIL because `v-life` is absent.

- [ ] **Step 3: Implement the Life shell**

Rename the existing section ID from `v-journal` to a panel nested under `v-life`; do not rename journal form/list IDs. Add tablist semantics and update `go()` so opening Life preserves the most recent Life tab. Use CSS grid for three tabs, 44px minimum touch targets, ink borders, coral active fill, and no animated `clip-path`.

- [ ] **Step 4: Run UI, syntax, and bilingual parity checks**

Run:

```bash
python3 -m unittest tests.test_manga_ui_contract -v
node -e "const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('index.html','utf8').match(/<script>([\\s\\S]*?)<\\/script>/)[1];new vm.Script(s);console.log('syntax ok')"
```

Expected: PASS, with equal Chinese/English I18N key sets.

- [ ] **Step 5: Commit the Life navigation shell**

```bash
git add index.html tests/test_manga_ui_contract.py
git commit -m "feat: add manga life hub navigation"
```

---

### Task 5: Build the Nutrition timeline UI

**Files:**
- Modify: `index.html` — Nutrition panel markup, renderers, CRUD, favorites, and estimation controls
- Modify: `tests/test_manga_ui_contract.py`
- Modify: `tests/test_nutrition_tracker.js`

**Interfaces:**
- Consumes: Task 1 nutrition functions; Task 3 Life state
- Produces: `renderNutrition()`, `addFoodEntry()`, `deleteFoodEntry(id)`, `setFoodEntryForEdit(id)`, `applyFoodEstimate()`, `saveFavoriteFood()`

- [ ] **Step 1: Add failing behavior and accessibility assertions**

Require inputs `calorieTarget`, `foodName`, `foodPortion`, `foodCalories`, `foodEatenAt`; a manual/estimate radiogroup; an estimate disclosure; `foodTimeline`; previous/next date controls; semantic edit/delete buttons; and an `aria-live` summary.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node tests/test_nutrition_tracker.js
python3 -m unittest tests.test_manga_ui_contract.MangaUIContractTests.test_nutrition_panel_contract -v
```

Expected: FAIL on missing UI and CRUD names.

- [ ] **Step 3: Implement target, timeline, CRUD, estimate, and favorites**

Use `datetime-local` with current local time as default. In estimate mode call `estimateFoodCalories`; write the approximate result into the editable calorie input and display `≈`. If unmatched, focus the calorie input and show the localized manual-entry message. Preserve form values on validation/storage errors. Render escaped user content with existing `esc()`.

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
node tests/test_nutrition_tracker.js
python3 -m unittest tests.test_manga_ui_contract -v
node tests/test_task_helpers.js
```

Expected: PASS.

- [ ] **Step 5: Commit Nutrition UI**

```bash
git add index.html tests/test_nutrition_tracker.js tests/test_manga_ui_contract.py
git commit -m "feat: add food calorie timeline"
```

---

### Task 6: Build the Wallet cycle and expense UI

**Files:**
- Modify: `index.html` — Wallet markup, renderers, cycle forms, expense CRUD, cycle-end card
- Modify: `tests/test_manga_ui_contract.py`
- Modify: `tests/test_allowance_budget.js`

**Interfaces:**
- Consumes: Task 2 budget functions; Task 3 Life state
- Produces: `createBudgetCycle()`, `renderWallet()`, `addExpense()`, `deleteExpense(id)`, `setExpenseForEdit(id)`, `renewBudgetCycle(mode, carry)`

- [ ] **Step 1: Add failing wallet contracts**

Require inputs for total amount, savings percent defaulting to 20, start date, period unit and positive count; summary IDs for total/saved/spendable/today/spent; expense name/amount/time/category; timeline; and non-modal cycle-end actions for same/recharge/pause plus carry checkbox.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/test_allowance_budget.js
python3 -m unittest tests.test_manga_ui_contract.MangaUIContractTests.test_wallet_panel_contract -v
```

Expected: FAIL on missing Wallet UI and handlers.

- [ ] **Step 3: Implement cycle creation, expense CRUD, and rendering**

Convert currency through `moneyToCents`; never store floats. Format display with `Intl.NumberFormat` using `CNY` by default and the active language. Recompute the whole ledger after every expense edit/delete. Today may render a negative number in coral with a calm localized explanation.

- [ ] **Step 4: Implement explicit cycle-end decisions**

When local day is on/after `endExclusive`, show the inline renewal card. `same` clones period settings; `recharge` reads a new total; `pause` clears `activeBudgetCycleId`. Only apply `openingCarryCents` when the checkbox is selected. Do not block navigation and do not call `confirm()` or `alert()`.

- [ ] **Step 5: Run focused and complete behavior tests**

Run:

```bash
node tests/test_allowance_budget.js
python3 -m unittest tests.test_manga_ui_contract -v
node tests/test_task_helpers.js
```

Expected: PASS.

- [ ] **Step 6: Commit Wallet UI**

```bash
git add index.html tests/test_allowance_budget.js tests/test_manga_ui_contract.py
git commit -m "feat: add carry-forward allowance wallet"
```

---

### Task 7: Add Life JSON backup and strict import

**Files:**
- Modify: `index.html` — backup controls and pure parser
- Create: `tests/test_life_import.js`

**Interfaces:**
- Produces: `serializeLifeData(state) -> string`
- Produces: `parseLifeData(text) -> LifeBundle` or throws
- Produces: `exportLifeData()`, `previewLifeImport(file)`, `commitLifeImport()`, `cancelLifeImport()`

- [ ] **Step 1: Write failing import/export tests**

Cover format name `liangli-life`, version `1`, JSON round-trip, malformed JSON, unsupported version, duplicate IDs, invalid references, negative calories, negative cents, invalid savings basis points, invalid cycle dates, and atomic rejection of a bundle containing one invalid record.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/test_life_import.js`

Expected: FAIL because serializer/parser do not exist.

- [ ] **Step 3: Implement strict pure parser and preview flow**

Export only Life keys, never Supabase session or tasks. Validate the complete bundle before assigning any `S` field. Show counts in a preview panel and require a second explicit click to import. On success call `saveLifeState()`, `renderNutrition()`, and `renderWallet()`.

- [ ] **Step 4: Run import and regression tests**

Run:

```bash
node tests/test_life_import.js
node tests/test_nutrition_tracker.js
node tests/test_allowance_budget.js
```

Expected: PASS.

- [ ] **Step 5: Commit Life backup**

```bash
git add index.html tests/test_life_import.js
git commit -m "feat: add local life data backup"
```

---

### Task 8: PWA cache, documentation, and release verification

**Files:**
- Modify: `sw.js` — increment shell cache from `liangli-v7` to `liangli-v8`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `tests/test_service_worker_contract.py`
- Modify: `tests/test_service_worker.js`

**Interfaces:**
- Consumes: all prior tasks
- Produces: an installable offline Life release with documented privacy and calculation rules

- [ ] **Step 1: Update Service Worker tests to expect `liangli-v8`**

Keep cross-origin requests uncached and companion MP4s out of install precache. Run both Service Worker test files and verify they fail only on the old cache version.

- [ ] **Step 2: Bump the shell cache and document the feature**

Document the Life tab, offline estimation limitations, advisory savings, carry formula, local-only privacy boundary, JSON backup, and the fact that nutrition/finance are not synced to Supabase.

- [ ] **Step 3: Run the full release suite**

Run:

```bash
python3 -m unittest discover -s tests -v
node tests/test_task_helpers.js
node tests/test_flashcard_scheduler.js
node tests/test_flashcard_import.js
node tests/test_flashcard_sync.js
node tests/test_flashcard_rest_client.js
node tests/test_nutrition_tracker.js
node tests/test_allowance_budget.js
node tests/test_life_import.js
node tests/test_service_worker.js
python3 scripts/verify_companion_media.py
node -e "const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('index.html','utf8').match(/<script>([\\s\\S]*?)<\\/script>/)[1];new vm.Script(s);console.log('inline JS syntax: ok')"
git diff --check
```

Expected: every command exits 0; all companion media remain within existing size/codec limits.

- [ ] **Step 4: Perform manual local acceptance**

At `http://localhost:8000/`, verify mobile and desktop layouts, Life tab switching, a manual and estimated food entry, an over-target calorie day, a weekly budget with a ¥30 overage reducing tomorrow, expense edit/delete recalculation, cycle-end actions, JSON export/import, offline reload, keyboard navigation, and reduced-motion mode.

- [ ] **Step 5: Commit the release slice**

```bash
git add sw.js README.md CLAUDE.md tests/test_service_worker_contract.py tests/test_service_worker.js
git commit -m "docs: prepare life tracking release"
```
