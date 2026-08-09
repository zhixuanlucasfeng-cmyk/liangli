from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
SYNC_BLOCK = HTML[
    HTML.index("async function syncFlashcards"):
    HTML.index("const OFFLINE_FOODS=")
]
LIFE_STORE_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function localDayKey(');
const end = script.indexOf('/* 跨天重置', start);
assert.notEqual(start, -1, 'Life helpers must exist');
assert.notEqual(end, -1, 'Life state must precede daily rollover');

const invalidCanonical = {
    version: 1,
    calorieTarget: -1,
    foodEntries: [{id: 'food-1', name: 'Egg', portion: '', calories: 70, eatenAt: 0, mode: 'manual'}],
    favoriteFoods: ['Egg'],
    walletState: {
      version: 1,
      budgetCycles: [{id: 'canonical-cycle', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 1000, savingsBps: 2000, openingCarryCents: 0, periodUnit: 'day', periodCount: 1}],
      expenses: [{id: 'canonical-expense', cycleId: 'canonical-cycle', name: 'Lunch', category: '', amountCents: 200, spentAt: '2026-08-10T12:00:00Z', deletedAt: null}],
      activeBudgetCycleId: 'canonical-cycle',
    },
};
let canonicalBytes = `  ${JSON.stringify(invalidCanonical)}\n`;
const stored = {
  calorieTarget: 0,
  foodEntries: [{id: 'food-1', name: 'Egg', calories: 70, eatenAt: '2026-08-10T08:00:00.000Z'}],
  favoriteFoods: ['Egg'],
  walletState: {
    version: 1,
    budgetCycles: [{id: 'cycle-1', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 1000}],
    expenses: [{id: 'expense-1', cycleId: 'cycle-1', name: 'Lunch', category: '', amountCents: 200, spentAt: '2026-08-10T12:00:00Z', deletedAt: null}],
    activeBudgetCycleId: 'cycle-1',
  },
  lastDay: '2026-08-10',
};
const writes = [];
const statusElement = {textContent: ''};
const context = {
  Date,
  T(key) { return key; },
  document: {getElementById(id) { return id === 'lifeImportStatus' ? statusElement : null; }},
  DB: {
    read(key) {
      if(key !== 'lifeState' || canonicalBytes === null)return {status: 'missing', value: null, raw: null};
      return {status: 'present', value: JSON.parse(canonicalBytes), raw: canonicalBytes};
    },
    get(key, fallback) { return Object.hasOwn(stored, key) ? stored[key] : fallback; },
    set(key, value) {
      writes.push([key, value]);
      if(key === 'lifeState')canonicalBytes = JSON.stringify(value);
      stored[key] = value;
      return true;
    },
  },
};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.life={S,saveLifeState,migrateDailyState,migrateLegacyWalletState,serializeLifeData,parseLifeData,getStorageStatus:()=>lifeStateStorageStatus};`, context);
const {S, saveLifeState, migrateDailyState, migrateLegacyWalletState, serializeLifeData, parseLifeData, getStorageStatus} = context.life;

assert.equal(getStorageStatus(), 'invalid', 'a present but rejected canonical payload is distinguished from missing data');
assert.equal(S.calorieTarget, 2000, 'invalid canonical data uses a safe in-memory target');
assert.deepEqual(JSON.parse(JSON.stringify(S.favoriteFoods)), []);
assert.equal(S.activeBudgetCycleId, null);
assert.equal(S.budgetCycles.length, 0, 'invalid canonical data does not silently fall back to stale legacy wallet bytes');
assert.equal(S.expenses.length, 0);
assert.equal(writes.length, 0, 'initialization never overwrites rejected canonical bytes');
const rejectedCanonicalBytes = canonicalBytes;

const legacyMigration = migrateLegacyWalletState([
  {id: 'legacy-cycle', startDay: '2026-08-10', endExclusive: '2026-08-12', totalCents: 1000},
], [
  {id: 'mapped', name: 'Lunch', amountCents: 100, spentAt: '2026-08-10T12:00:00Z'},
  {id: 'orphan', name: 'Late', category: '', amountCents: 100, spentAt: '2026-08-12T12:00:00Z'},
]);
assert.deepEqual(JSON.parse(JSON.stringify(legacyMigration.expenses)), [{
  id: 'mapped', cycleId: 'legacy-cycle', name: 'Lunch', category: '', amountCents: 100,
  spentAt: '2026-08-10T12:00:00Z', spentDay: '2026-08-10', deletedAt: null,
}], 'legacy expenses receive a cycle ID only for one containing cycle');
const overlappingMigration = migrateLegacyWalletState([
  {id: 'overlap-a', startDay: '2026-08-10', endExclusive: '2026-08-12', totalCents: 1000},
  {id: 'overlap-b', startDay: '2026-08-10', endExclusive: '2026-08-12', totalCents: 1000},
], [{id: 'ambiguous', name: 'Lunch', category: '', amountCents: 100, spentAt: '2026-08-10T12:00:00Z'}]);
assert.deepEqual(JSON.parse(JSON.stringify(overlappingMigration.expenses)), [], 'ambiguous legacy expense mappings are rejected');
assert.doesNotThrow(() => parseLifeData(serializeLifeData(S)), 'migrated legacy state remains exportable through strict parsing');

assert.equal(saveLifeState(), false, 'normal writes are locked while invalid canonical bytes await recovery');
assert.equal(writes.length, 0);
assert.equal(canonicalBytes, rejectedCanonicalBytes, 'rejected canonical bytes remain byte-for-byte untouched');

for(const name of ['renderTasks','renderIdeas','renderGoals','renderLogs','renderStats','renderNutrition','renderWallet'])context[name]=()=>{};
const renderStart=script.indexOf('function renderAll()');
const renderEnd=script.indexOf("document.getElementById('taskName')",renderStart);
vm.runInContext(`${script.slice(renderStart,renderEnd)}\nrenderAll();`,context);
assert.equal(canonicalBytes,rejectedCanonicalBytes,'startup rendering never overwrites rejected canonical bytes');
assert.equal(writes.length,0,'renderAll is read-only for Life storage');
assert.equal(statusElement.textContent,'lifeStorageInvalid','invalid storage exposes actionable localized status');

const rolled = migrateDailyState({
  ...S,
  tasks: [], ideas: [], week: [0, 0, 0, 0, 0, 0, 0], focusMin: 0, pomo: 0, lastDay: '2026-08-10',
}, '2026-08-11');
assert.deepEqual(JSON.parse(JSON.stringify({
  calorieTarget: rolled.calorieTarget,
  foodEntries: rolled.foodEntries,
  favoriteFoods: rolled.favoriteFoods,
  budgetCycles: rolled.budgetCycles,
  expenses: rolled.expenses,
  activeBudgetCycleId: rolled.activeBudgetCycleId,
})), {
  calorieTarget: 2000,
  foodEntries: [],
  favoriteFoods: [],
  budgetCycles: [],
  expenses: [],
  activeBudgetCycleId: null,
});
"""


class LifeStoreContractTests(unittest.TestCase):
    def test_life_state_is_namespaced_and_local_only(self):
        self.assertIn("DB.get('lifeState'", HTML)
        self.assertIn("DB.set('lifeState'", HTML)
        self.assertIn("function saveLifeState(options={})", HTML)
        self.assertNotIn("DB.set('calorieTarget'", HTML)
        self.assertNotIn("DB.set('walletState'", HTML)
        self.assertNotIn("foodEntries", SYNC_BLOCK)
        self.assertNotIn("budgetCycles", SYNC_BLOCK)

    def test_life_state_round_trips_zero_and_survives_rollover(self):
        result = subprocess.run(
            ["node", "-e", LIFE_STORE_HARNESS],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
            cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
