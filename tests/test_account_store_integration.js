const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../account-sync.js');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('const DB={');
const end = script.indexOf('function normalizeTask', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

const bytes = new Map();
const localStorage = {
  getItem(key) { return bytes.has(key) ? bytes.get(key) : null; },
  setItem(key, value) { bytes.set(key, String(value)); },
};
const bridge = {
  ...api,
  normalizeCoreState(raw) {
    const normalized = api.normalizeCoreState(JSON.parse(JSON.stringify(raw)));
    return normalized && JSON.parse(JSON.stringify(normalized));
  },
};
const context = {Date, console, localStorage, LiangliAccountSync: bridge, currentDayKey: '2026-08-10'};
context.globalThis = context;
context.S = {tasks:[], ideas:[], goals:[], logs:[], focusSessions:[], focusMin:0, pomo:0, week:[0,0,0,0,0,0,0]};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.core={DB,readCoreScope,writeCoreScope,activateCoreScope,coreStateToViewState,persistCoreState,getScope:()=>activeCoreScope,getStatus:()=>coreStateStorageStatus};`, context);
const dailyStart = script.indexOf('function migrateDailyState');
const dailyEnd = script.indexOf('const today=', dailyStart);
vm.runInContext(`${script.slice(dailyStart, dailyEnd)}\n;globalThis.migrateDailyState=migrateDailyState;`, context);
const core = context.core;

function stateFor(name, dayKey='2026-08-10') {
  return api.migrateLegacyCoreState({tasks:[{id:name.length,name,energy:25,done:false,dayKey}]}, 1700000005000, dayKey);
}
function put(scope, state) { bytes.set(`ll_${api.coreStorageKey(scope)}`, JSON.stringify(state)); }

bytes.set('ll_tasks', JSON.stringify([{id:1,name:'legacy global'}]));
const local = stateFor('local');
const alpha = stateFor('alpha');
const beta = stateFor('beta');
put('local', local); put('alpha-user', alpha); put('beta-user', beta);

assert.equal(core.activateCoreScope('local').tasks[0].name, 'local');
core.DB.set('tasks', [{id:2,name:'must not mirror'}]);
assert.deepEqual(JSON.parse(bytes.get('ll_tasks')), [{id:1,name:'legacy global'}], 'canonical local state never mirrors mutations to legacy keys');

assert.equal(core.activateCoreScope('alpha-user').tasks[0].name, 'alpha');
assert.equal(core.getScope(), 'alpha-user');
assert.equal(core.activateCoreScope('beta-user').tasks[0].name, 'beta');
assert.equal(core.getScope(), 'beta-user');
assert.equal(core.activateCoreScope('alpha-user').tasks[0].name, 'alpha', 'two accounts retain separate canonical core views');
assert.deepEqual(JSON.parse(bytes.get('ll_tasks')), [{id:1,name:'legacy global'}], 'account activation never falls back to or writes global legacy data');

const invalidBytes = '{ not json';
bytes.set('ll_coreState_corrupt-user', invalidBytes);
context.S = {...context.S, tasks:[{id:'unsafe'}], ideas:[{name:'unsafe'}], goals:[], logs:[], focusSessions:[]};
assert.equal(core.activateCoreScope('corrupt-user'), null);
assert.equal(core.getStatus(), 'invalid');
assert.deepEqual(context.S.tasks, [], 'invalid canonical data gets a safe empty core view rather than global legacy data');
core.DB.set('tasks', [{id:3,name:'must not overwrite canonical'}]);
assert.equal(bytes.get('ll_coreState_corrupt-user'), invalidBytes, 'invalid canonical bytes remain untouched and write-locked');

const legacy = stateFor('legacy', '2026-08-08');
legacy.focusSessions = [{
  id: '77777777-7777-4777-8777-777777777777', kind:'legacy-summary', minutes:50, pomodoroCount:2,
  dayKey:'2026-08-08', weekMinutes:[1,2,3,4,5,6,7], createdAt:1700000005000, updatedAt:1700000005000, deletedAt:null,
}, {
  id: '88888888-8888-4888-8888-888888888888', kind:'pomodoro', minutes:25, pomodoroCount:1,
  dayKey:'2026-08-10', createdAt:1700000005000, updatedAt:1700000005000, deletedAt:null,
}, {
  id: '99999999-9999-4999-8999-999999999999', kind:'pomodoro', minutes:25, pomodoroCount:1,
  dayKey:'2026-08-08', createdAt:1700000005000, updatedAt:1700000005000, deletedAt:null,
}];
assert.notEqual(api.normalizeCoreState(legacy), null);
const focusView = core.coreStateToViewState(legacy, context.S);
assert.equal(focusView.focusMin, 25, 'only stable sessions on the current day count toward today');
assert.equal(focusView.pomo, 1, 'historical summary counts do not become current pomodoros');
assert.deepEqual(Array.from(focusView.week), [3,4,5,6,32,0,25], 'legacy weekly totals and dated sessions align to their actual days');

const rollover = stateFor('rollover');
rollover.growthItems = [{
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name:'Moved once', energy:25,
  rolloverSourceId:rollover.tasks[0].id, createdAt:1700000005000, updatedAt:1700000005000, deletedAt:null,
}];
assert.deepEqual(api.normalizeCoreState(rollover), rollover, 'rollover source identity is a strict persisted core transition');
const preRollover = core.coreStateToViewState({...rollover, tasks:rollover.tasks.map(task=>({...task,dayKey:'2026-08-09'}))}, context.S);
const firstRollover = context.migrateDailyState({...preRollover,lastDay:'2026-08-09'}, '2026-08-10');
const afterPersist = {...rollover, tasks:preRollover.tasks, growthItems:firstRollover.ideas};
assert.notEqual(api.normalizeCoreState(afterPersist), null, 'rollover transition remains canonical after persistence');
const reloaded = core.coreStateToViewState(afterPersist, context.S);
const secondRollover = context.migrateDailyState({...reloaded,lastDay:'2026-08-10'}, '2026-08-11');
assert.equal(secondRollover.ideas.filter(item=>item.rolloverSourceId===rollover.tasks[0].id).length, 1,
  'a canonical reload retains rollover completion and cannot create a duplicate growth item');

console.log('account store integration: ok');
