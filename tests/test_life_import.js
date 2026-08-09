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
let failLifeWrite = false;
const context = {
  Date,
  JSON,
  Number,
  Array,
  Object,
  Math,
  DB: {
    get(key, fallback) { return Object.hasOwn(stored, key) ? stored[key] : fallback; },
    set(key, value) {
      if(failLifeWrite && key === 'lifeState')return false;
      stored[key] = value;
      return true;
    },
  },
};
vm.createContext(context);
vm.runInContext(
  `${script.slice(start, end)}\n;globalThis.lifeBackup={getState:()=>S,serializeLifeData,parseLifeData,previewLifeImport,commitLifeImport,cancelLifeImport};`,
  context,
);
const {getState, serializeLifeData, parseLifeData, previewLifeImport, commitLifeImport, cancelLifeImport} = context.lifeBackup;

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
invalid(bundle => { bundle.life.walletState.expenses[0].id = 'food-1'; }, /duplicate/i, 'IDs collide across Life entity types');
invalid(bundle => { delete bundle.life.walletState.expenses[0].cycleId; }, /reference|cycle|expense/i, 'expenses require a cycle reference');
invalid(bundle => { bundle.life.walletState.expenses[0].cycleId = 'missing'; }, /reference|cycle/i, 'invalid expense cycle references are rejected');
invalid(bundle => { bundle.life.walletState.expenses[0].spentAt = '2026-08-16T00:00:00.000Z'; }, /cycle|date/i, 'expenses outside their cycle are rejected');
invalid(bundle => { bundle.life.foodEntries[0].calories = -1; }, /calorie/i, 'negative calories are rejected');
invalid(bundle => { bundle.life.calorieTarget = 1000001; }, /calorie/i, 'unreasonably large calorie targets are rejected');
invalid(bundle => { bundle.life.foodEntries[0].calories = 1000001; }, /calorie/i, 'unreasonably large food calories are rejected');
invalid(bundle => { bundle.life.walletState.expenses[0].amountCents = -1; }, /cents|expense/i, 'negative cents are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].totalCents = Number.MAX_SAFE_INTEGER; bundle.life.walletState.budgetCycles[0].openingCarryCents = 1; }, /cents|money|safe|cycle/i, 'unsafe money arithmetic is rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].savingsBps = 10001; }, /savings/i, 'invalid savings basis points are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].endExclusive = '2026-08-09'; }, /date|cycle|period/i, 'invalid cycle dates are rejected');
invalid(bundle => { bundle.life.walletState.budgetCycles[0].startDay = '2026-02-30'; }, /date|cycle/i, 'normalized-invalid calendar dates are rejected');
invalid(bundle => { bundle.life.foodEntries[0].eatenAt = '2026-02-30T12:00:00.000Z'; }, /food|date/i, 'normalized-invalid datetimes are rejected');
invalid(bundle => { bundle.life.foodEntries[0].name = ' '; }, /food|name/i, 'food names cannot be blank');
invalid(bundle => { bundle.life.walletState.expenses[0].name = ''; }, /expense|name/i, 'expense names cannot be blank');
invalid(bundle => { bundle.life.favoriteFoods[0] = ' '; }, /favorite/i, 'favorite foods cannot be blank');
invalid(bundle => { bundle.life.favoriteFoods.push('Egg'); }, /favorite|duplicate/i, 'favorite foods are unique');
invalid(bundle => { bundle.life.walletState.expenses[0].category = 3; }, /expense|category/i, 'categories must be strings');
invalid(bundle => { bundle.life.foodEntries[0].unexpected = true; }, /shape|field|food/i, 'unknown entity fields are rejected');

const before = JSON.stringify(getState());
invalid(bundle => { bundle.life.foodEntries[0].calories = -1; }, /calorie/i, 'one bad record rejects the entire bundle');
assert.equal(JSON.stringify(getState()), before, 'parsing an invalid bundle leaves current state untouched');

function element() { return {hidden: true, textContent: '', value: '', clickCount: 0, click() { this.clickCount += 1; }}; }
const elements = new Map([
  ['lifeImportPreview', element()], ['lifeImportSummary', element()], ['lifeImportStatus', element()], ['lifeImportFile', element()],
]);
const readers = [];
context.document = {getElementById(id) { return elements.get(id); }};
context.T = key => ({lifeImportSummary:'{foods}/{favorites}/{cycles}/{expenses}',lifeImportReady:'ready',lifeImportInvalid:'invalid',lifeImportDone:'done',lifeImportStoreError:'store failed'}[key] || key);
let nutritionRenders = 0, walletRenders = 0;
context.renderNutrition = () => { nutritionRenders += 1; };
context.renderWallet = () => { walletRenders += 1; };
context.FileReader = class {
  constructor() { readers.push(this); this.result = ''; }
  readAsText(file) { this.file = file; }
};
const validText = serializeLifeData(state);
assert.equal(previewLifeImport({name: 'first.json'}), true);
const staleReader = readers.at(-1);
assert.equal(cancelLifeImport(), true);
staleReader.result = validText;
staleReader.onload();
assert.equal(elements.get('lifeImportPreview').hidden, true, 'a cancelled file read cannot revive the preview');
assert.equal(commitLifeImport(), false, 'a cancelled import cannot be committed');

previewLifeImport({name: 'a.json'});
const readerA = readers.at(-1);
previewLifeImport({name: 'b.json'});
const readerB = readers.at(-1);
readerB.result = validText;
readerB.onload();
readerA.result = '{';
readerA.onload();
assert.equal(elements.get('lifeImportStatus').textContent, 'ready', 'an older FileReader cannot overwrite a newer preview');
assert.equal(elements.get('lifeImportPreview').hidden, false);
const currentBeforeFailedCommit = JSON.stringify(getState());
const storageBeforeFailedCommit = JSON.stringify(stored.lifeState || null);
failLifeWrite = true;
assert.equal(commitLifeImport(), false, 'a failed canonical write rejects the import');
failLifeWrite = false;
assert.equal(JSON.stringify(getState()), currentBeforeFailedCommit, 'failed imports roll back in-memory state');
assert.equal(JSON.stringify(stored.lifeState || null), storageBeforeFailedCommit, 'failed imports leave canonical storage unchanged');
assert.equal(elements.get('lifeImportStatus').textContent, 'store failed');
assert.equal(commitLifeImport(), true, 'a preview requires and then accepts explicit confirmation');
assert.equal(nutritionRenders, 1);
assert.equal(walletRenders, 1);
assert.equal(elements.get('lifeImportStatus').textContent, 'done');

console.log('life import/export behavior: ok');
