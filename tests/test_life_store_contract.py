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
stored.walletState.budgetCycles=Array.from({length:10001},()=>null);
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
assert.equal(stored.walletState.budgetCycles.length,10001,'oversized stale legacy data is untouched when canonical bytes are invalid');
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

LEGACY_CATEGORY_CANONICAL_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function localDayKey(');
const end = script.indexOf('/* 跨天重置', start);
const canonical = {
  version: 1,
  calorieTarget: 2000,
  foodEntries: [],
  favoriteFoods: [],
  walletState: {
    version: 1,
    budgetCycles: [{
      id: 'cycle-1', startDay: '2026-08-10', endExclusive: '2026-08-11',
      totalCents: 1000, savingsBps: 2000, openingCarryCents: 0,
      periodUnit: 'day', periodCount: 1,
    }],
    expenses: [{
      id: 'expense-1', cycleId: 'cycle-1', name: 'Lunch', amountCents: 200,
      spentAt: '2026-08-10T12:00:00Z', deletedAt: null,
    }],
    activeBudgetCycleId: 'cycle-1',
  },
};
const writes = [];
const context = {
  Date,
  DB: {
    read(key) { return key === 'lifeState' ? {status:'present', value:canonical, raw:JSON.stringify(canonical)} : {status:'missing', value:null, raw:null}; },
    get(key, fallback) { return fallback; },
    set(key, value) { writes.push([key, value]); return true; },
  },
};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.life={S,serializeLifeData,getStorageStatus:()=>lifeStateStorageStatus};`, context);
const {S, serializeLifeData, getStorageStatus} = context.life;
assert.equal(getStorageStatus(), 'valid', 'successful v1 canonical migration is persisted as valid v2');
assert.equal(writes.length, 1, 'v1 canonical state is rewritten once after full validation');
assert.equal(writes[0][0], 'lifeState');
assert.equal(writes[0][1].version, 2);
assert.equal(S.expenses[0].category, '');
assert.equal(S.expenses[0].spentDay, '2026-08-10');
assert.equal(S.expenses[0].cycleId, 'cycle-1');
const exported=JSON.parse(serializeLifeData(S));
assert.equal(exported.version, 2);
assert.equal(exported.life.walletState.expenses[0].category, '');
assert.equal(exported.life.walletState.expenses[0].spentDay, '2026-08-10');
"""

AGGREGATE_CANONICAL_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function localDayKey(');
const end = script.indexOf('/* 跨天重置', start);
const canonical = {
  version:2,calorieTarget:2000,foodEntries:[],favoriteFoods:[],
  walletState:{
    version:2,
    budgetCycles:[{id:'cycle-1',startDay:'2026-08-10',endExclusive:'2026-08-11',totalCents:0,savingsBps:0,openingCarryCents:0,periodUnit:'day',periodCount:1}],
    expenses:[
      {id:'cap',cycleId:'cycle-1',name:'Cap',amountCents:1000000000000,category:'',spentAt:'2026-08-10T08:00:00Z',spentDay:'2026-08-10',deletedAt:null},
      {id:'over',cycleId:'cycle-1',name:'Over',amountCents:1,category:'',spentAt:'2026-08-10T09:00:00Z',spentDay:'2026-08-10',deletedAt:null},
    ],
    activeBudgetCycleId:'cycle-1',
  },
};
const raw=JSON.stringify(canonical),writes=[];
const context={Date,DB:{
  read(key){return key==='lifeState'?{status:'present',value:canonical,raw}:{status:'missing',value:null,raw:null};},
  get(key,fallback){return fallback;},
  set(key,value){writes.push([key,value]);return true;},
}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.life={S,getStorageStatus:()=>lifeStateStorageStatus};`,context);
assert.equal(context.life.getStorageStatus(),'invalid','aggregate-invalid canonical state is rejected');
assert.equal(context.life.S.expenses.length,0,'aggregate-invalid expenses never enter renderable state');
assert.equal(context.life.S.budgetCycles.length,0);
assert.equal(writes.length,0,'aggregate-invalid canonical bytes are never overwritten');
"""

LEGACY_WALLET_BOUNDS_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const localStart=script.indexOf('function localDayKey(');
const localEnd=script.indexOf('function dayOrdinal',localStart);
const coreStart=script.indexOf('const MAX_LIFE_CALORIES=');
const coreEnd=script.indexOf('function normalizeTaskDays',coreStart);
const migrationStart=script.indexOf('function migrateLegacyWalletState',coreEnd);
const migrationEnd=script.indexOf('function migrateLegacyNutritionState',migrationStart);
const context={Date};
vm.createContext(context);
vm.runInContext(`${script.slice(localStart,localEnd)}\n${script.slice(coreStart,coreEnd)}\n${script.slice(migrationStart,migrationEnd)}\n;globalThis.migrate=migrateLegacyWalletState;`,context);
const migrate=context.migrate;
const cycle=(id,startDay='2026-08-10',endExclusive='2026-08-11')=>({id,startDay,endExclusive,totalCents:0});
const expense=(id,spentAt='2026-08-10T12:00:00Z',extra={})=>({id,name:id,amountCents:1,spentAt,...extra});
assert.equal(migrate(Array.from({length:10001},()=>null),[]),null,'legacy cycle arrays above the cap fail closed before normalization');
assert.equal(migrate([cycle('cycle-1')],Array.from({length:10001},()=>null)),null,'legacy expense arrays above the cap fail closed before normalization');
assert.notEqual(migrate(Array.from({length:10000},()=>null),[]),null,'the exact legacy collection cap remains accepted');
assert.equal(migrate([cycle('cycle-1')],[
  {...expense('cap'),amountCents:1000000000000},
  {...expense('over'),amountCents:1},
]),null,'aggregate-invalid legacy money rejects the whole migration');

const overlapping=migrate([
  cycle('overlap-a','2026-08-10','2026-08-12'),cycle('overlap-b','2026-08-10','2026-08-12'),
],[
  expense('unreferenced'),
  expense('referenced',undefined,{cycleId:'overlap-a'}),
  expense('outside','2026-08-12T12:00:00Z',{cycleId:'overlap-a'}),
]);
assert.deepEqual(JSON.parse(JSON.stringify(overlapping.expenses.map(item=>[item.id,item.cycleId]))),[['referenced','overlap-a']],'referenced expenses use their one containing cycle while ambiguous and out-of-range expenses are discarded');

function utcDay(offset){const date=new Date('2026-01-01T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
const cycles=Array.from({length:80},(_,index)=>cycle(`linear-${index}`,utcDay(index),utcDay(index+1)));
const expenses=Array.from({length:80},(_,index)=>expense(`linear-expense-${index}`,`${utcDay(index)}T12:00:00Z`));
const originalBudgetDayOrdinal=context.budgetDayOrdinal;
let ordinalCalls=0;
context.budgetDayOrdinal=value=>{ordinalCalls++;return originalBudgetDayOrdinal(value);};
ordinalCalls=0;migrate(cycles,[]);const cycleOnlyCalls=ordinalCalls;
ordinalCalls=0;const linear=migrate(cycles,expenses);const withExpenseCalls=ordinalCalls;
assert.equal(linear.expenses.length,80);
assert.ok(withExpenseCalls-cycleOnlyCalls<=expenses.length*20,`legacy expense mapping must avoid a per-expense cycle scan; incremental ordinal calls=${withExpenseCalls-cycleOnlyCalls}`);
"""

OVERSIZED_LEGACY_STARTUP_HARNESS = r"""
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start=script.indexOf('function localDayKey(');
const end=script.indexOf('/* 跨天重置',start);
const legacyWallet={
  version:1,
  budgetCycles:Array.from({length:10001},()=>null),
  expenses:[],activeBudgetCycleId:null,
};
const writes=[];
const context={Date,DB:{
  read(){return {status:'missing',value:null,raw:null};},
  get(key,fallback){return key==='walletState'?legacyWallet:fallback;},
  set(key,value){writes.push([key,value]);return true;},
}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.life={S,getStorageStatus:()=>lifeStateStorageStatus};`,context);
assert.equal(context.life.getStorageStatus(),'legacy-invalid','oversized legacy state enters a distinct recovery status');
assert.equal(context.life.S.budgetCycles.length,0,'oversized legacy cycles never become renderable');
assert.equal(context.life.S.expenses.length,0);
assert.equal(writes.length,0,'startup never replaces oversized legacy bytes with an empty canonical wallet');
assert.equal(legacyWallet.budgetCycles.length,10001,'legacy source bytes remain available for recovery');
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

    def test_v1_canonical_expense_without_category_migrates_to_v2(self):
        result = subprocess.run(
            ["node", "-e", LEGACY_CATEGORY_CANONICAL_HARNESS],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
            cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_aggregate_invalid_canonical_state_is_preserved(self):
        result = subprocess.run(
            ["node", "-e", AGGREGATE_CANONICAL_HARNESS],
            capture_output=True, check=False, text=True, timeout=5, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_legacy_wallet_migration_is_bounded_and_linearized(self):
        result = subprocess.run(
            ["node", "-e", LEGACY_WALLET_BOUNDS_HARNESS],
            capture_output=True, check=False, text=True, timeout=8, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_oversized_legacy_wallet_is_not_rendered_or_overwritten(self):
        result = subprocess.run(
            ["node", "-e", OVERSIZED_LEGACY_STARTUP_HARNESS],
            capture_output=True, check=False, text=True, timeout=8, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
