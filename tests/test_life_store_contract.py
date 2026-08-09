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

const stored = {
  lifeState: {
    version: 1,
    calorieTarget: 0,
    foodEntries: [{id: 'food-1', name: 'Egg', portion: '', calories: 70, eatenAt: 0, mode: 'manual'}],
    favoriteFoods: ['Egg'],
    walletState: {
      version: 1,
      budgetCycles: [{id: 'cycle-1', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 1000, savingsBps: 2000, openingCarryCents: 0, periodUnit: 'day', periodCount: 1}],
      expenses: [{id: 'expense-1', cycleId: 'cycle-1', name: 'Lunch', category: '', amountCents: 200, spentAt: '2026-08-10T12:00:00Z', deletedAt: null}],
      activeBudgetCycleId: 'cycle-1',
    },
  },
  lastDay: '2026-08-10',
};
const writes = [];
let failLifeWrite = false;
const context = {
  Date,
  DB: {
    get(key, fallback) { return Object.hasOwn(stored, key) ? stored[key] : fallback; },
    set(key, value) {
      writes.push([key, value]);
      if(failLifeWrite && key === 'lifeState')return false;
      stored[key] = value;
      return true;
    },
  },
};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.life={S,saveLifeState,migrateDailyState};`, context);
const {S, saveLifeState, migrateDailyState} = context.life;

assert.equal(S.calorieTarget, 0, 'a saved zero target must remain zero');
assert.deepEqual(JSON.parse(JSON.stringify(S.favoriteFoods)), ['Egg']);
assert.equal(S.activeBudgetCycleId, 'cycle-1');
assert.equal(S.budgetCycles.length, 1, 'canonical life state supplies budget cycles');
assert.equal(S.expenses.length, 1, 'canonical life state supplies expenses');

assert.equal(saveLifeState(), true);
assert.deepEqual(writes.map(([key]) => key), ['lifeState']);
assert.deepEqual(JSON.parse(JSON.stringify(writes[0][1])), JSON.parse(JSON.stringify({
  version: 1,
  calorieTarget: 0,
  foodEntries: S.foodEntries,
  favoriteFoods: S.favoriteFoods,
  walletState: {
    version: 1,
    budgetCycles: S.budgetCycles,
    expenses: S.expenses,
    activeBudgetCycleId: 'cycle-1',
  },
})));
writes.length = 0;
const persistedBeforeFailure = JSON.stringify(stored.lifeState);
failLifeWrite = true;
assert.equal(saveLifeState(), false, 'the full-page save path reports an atomic Life failure');
assert.deepEqual(writes.map(([key]) => key), ['lifeState']);
assert.equal(JSON.stringify(stored.lifeState), persistedBeforeFailure, 'a failed single-key write leaves persisted Life state unchanged');

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
  calorieTarget: 0,
  foodEntries: [{id: 'food-1', name: 'Egg', portion: '', calories: 70, eatenAt: 0, mode: 'manual'}],
  favoriteFoods: ['Egg'],
  budgetCycles: [{id: 'cycle-1', startDay: '2026-08-10', endExclusive: '2026-08-11', totalCents: 1000, savingsBps: 2000, openingCarryCents: 0, periodUnit: 'day', periodCount: 1}],
  expenses: [{id: 'expense-1', cycleId: 'cycle-1', name: 'Lunch', category: '', amountCents: 200, spentAt: '2026-08-10T12:00:00Z', deletedAt: null}],
  activeBudgetCycleId: 'cycle-1',
});
"""


class LifeStoreContractTests(unittest.TestCase):
    def test_life_state_is_namespaced_and_local_only(self):
        self.assertIn("DB.get('lifeState'", HTML)
        self.assertIn("DB.set('lifeState'", HTML)
        self.assertIn("function saveLifeState()", HTML)
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
