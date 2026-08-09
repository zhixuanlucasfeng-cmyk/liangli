const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function localDayKey(');
const end = script.indexOf('/* 跨天重置', start);
assert.notEqual(start, -1, 'Life helpers must exist');
assert.notEqual(end, -1, 'Life backup helpers must precede daily rollover');

const stored = Object.create(null);
const context = {
  Date,
  JSON,
  Number,
  Array,
  Object,
  Math,
  DB: {
    get(key, fallback) { return Object.hasOwn(stored, key) ? stored[key] : fallback; },
    set(key, value) { stored[key] = value; return true; },
  },
};
vm.createContext(context);
vm.runInContext(
  `${script.slice(start, end)}\n;globalThis.lifeBackup={S,serializeLifeData,parseLifeData};`,
  context,
);
const {S, serializeLifeData, parseLifeData} = context.lifeBackup;

const state = {
  calorieTarget: 2100,
  foodEntries: [{
    id: 'food-1', name: 'Egg', portion: '1', calories: 70,
    eatenAt: '2026-08-09T08:00:00.000Z', mode: 'manual',
  }],
  favoriteFoods: ['Egg'],
  budgetCycles: [{
    id: 'cycle-1', startDay: '2026-08-09', endExclusive: '2026-08-16',
    totalCents: 87500, savingsBps: 2000, openingCarryCents: 0,
    periodUnit: 'week', periodCount: 1,
  }],
  expenses: [{
    id: 'expense-1', cycleId: 'cycle-1', name: 'Lunch', amountCents: 1200,
    category: 'Food', spentAt: '2026-08-10T12:00:00.000Z', deletedAt: null,
  }],
  activeBudgetCycleId: 'cycle-1',
  tasks: [{id: 'must-not-export'}],
  flashcards: [{id: 'must-not-export'}],
  session: {access_token: 'must-not-export'},
};

const exported = JSON.parse(serializeLifeData(state));
assert.equal(exported.format, 'liangli-life');
assert.equal(exported.version, 1);
assert.deepEqual(Object.keys(exported.life).sort(), [
  'calorieTarget', 'favoriteFoods', 'foodEntries', 'walletState',
]);
assert.equal(JSON.stringify(exported).includes('must-not-export'), false, 'backup never exports session, task, or flashcard data');
const roundTripped = parseLifeData(JSON.stringify(exported));
assert.deepEqual(JSON.parse(JSON.stringify(roundTripped)), JSON.parse(JSON.stringify({
  calorieTarget: 2100,
  foodEntries: state.foodEntries,
  favoriteFoods: state.favoriteFoods,
  walletState: {
    version: 1,
    budgetCycles: state.budgetCycles,
    expenses: state.expenses,
    activeBudgetCycleId: 'cycle-1',
  },
})));

assert.throws(() => parseLifeData('{'), /JSON|backup/i, 'malformed JSON is rejected');
assert.throws(() => parseLifeData(JSON.stringify({...exported, version: 2})), /version|format/i, 'unsupported versions are rejected');

function invalid(mutator, pattern, message) {
  const bundle = JSON.parse(JSON.stringify(exported));
  mutator(bundle);
  assert.throws(() => parseLifeData(JSON.stringify(bundle)), pattern, message);
}

invalid(bundle => { bundle.life.foodEntries.push({...bundle.life.foodEntries[0]}); }, /duplicate/i, 'duplicate food IDs are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles.push({...bundle.life.walletState.budgetCycles[0]}); }, /duplicate/i, 'duplicate cycle IDs are rejected');
invalid(bundle => { bundle.life.walletState.expenses[0].cycleId = 'missing'; }, /reference|cycle/i, 'invalid expense cycle references are rejected');
invalid(bundle => { bundle.life.foodEntries[0].calories = -1; }, /calorie/i, 'negative calories are rejected');
invalid(bundle => { bundle.life.walletState.expenses[0].amountCents = -1; }, /cents|expense/i, 'negative cents are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].savingsBps = 10001; }, /savings/i, 'invalid savings basis points are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].endExclusive = '2026-08-09'; }, /date|cycle|period/i, 'invalid cycle dates are rejected');

const before = JSON.stringify(S);
invalid(bundle => { bundle.life.foodEntries[0].calories = -1; }, /calorie/i, 'one bad record rejects the entire bundle');
assert.equal(JSON.stringify(S), before, 'parsing an invalid bundle leaves current state untouched');

console.log('life import/export behavior: ok');
