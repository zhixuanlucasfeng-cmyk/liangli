const assert = require('node:assert/strict');
const api = require('../account-sync.js');

const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
const uuid3 = '33333333-3333-4333-8333-333333333333';
const uuid4 = '44444444-4444-4444-8444-444444444444';
const uuid5 = '55555555-5555-4555-8555-555555555555';
const uuid6 = '66666666-6666-4666-8666-666666666666';
const now = 1700000005000;

assert.equal(api.CORE_STATE_VERSION, 1);
assert.deepEqual(Array.from(api.CORE_SYNC_TYPES), ['task', 'growth', 'goal', 'focus', 'mood']);
assert.equal(api.coreStorageKey('local'), 'coreState_local');
assert.equal(api.coreStorageKey('User-ABC'), 'coreState_user-abc');

const state = {
  version: 1,
  tasks: [{id:uuid,name:'Read',energy:25,done:false,dayKey:'2026-08-10',startTime:null,endTime:null,helper:'none',helperRef:null,helperRefs:{},pomodoroCount:0,createdAt:now,updatedAt:now,deletedAt:null}],
  growthItems: [{id:uuid2,name:'Essay idea',energy:25,rolloverSourceId:null,createdAt:now,updatedAt:now,deletedAt:null}],
  goals: [{id:uuid3,name:'Book',target:10,cur:2,unit:'chapters',createdAt:now,updatedAt:now,deletedAt:null}],
  focusSessions: [{id:uuid4,kind:'pomodoro',minutes:25,pomodoroCount:1,dayKey:'2026-08-10',createdAt:now,updatedAt:now,deletedAt:null}],
  moodEntries: [{id:uuid5,date:'2026-08-10',mood:'😐',text:'Okay',createdAt:now,updatedAt:now,deletedAt:null}],
  syncOps: [{id:uuid6,type:'task',entityId:uuid,op:'upsert',createdAt:now}],
};

assert.deepEqual(api.normalizeCoreState(state), state, 'strict canonical state is retained without reshaping');
assert.equal(api.normalizeCoreState({...state, unexpected:true}), null, 'state rejects unknown keys');
assert.equal(api.normalizeCoreState({...state, tasks:[{...state.tasks[0],id:'not-a-uuid'}]}), null, 'entities require UUID IDs');
assert.equal(api.normalizeCoreState({...state, goals:[{...state.goals[0],target:1e12}]}), null, 'numeric values are bounded');
assert.equal(api.normalizeCoreState({...state, moodEntries:[{...state.moodEntries[0],text:'x'.repeat(2001)}]}), null, 'text values are bounded');
assert.equal(api.normalizeCoreState({...state, growthItems:[{...state.growthItems[0],id:uuid}]}), null, 'IDs are globally unique across entity collections');
assert.equal(api.normalizeCoreState({...state, syncOps:[{...state.syncOps[0],type:'food'}]}), null, 'recovery queue cannot contain Life entity types');

const migrated = api.migrateLegacyCoreState({
  tasks:[{id:1700000000000,name:'Read',energy:25,done:false,dayKey:'2026-08-10'}],
  ideas:[{id:1700000000001,name:'Essay idea'}],
  goals:[{id:1700000000002,name:'Book',target:10,cur:2,unit:'chapters'}],
  logs:[{id:1700000000003,date:'2026-08-10',mood:'😐',text:'Okay'}],
  focusMin:50,pomo:2,week:[0,0,0,0,0,0,50]
}, now, '2026-08-10');
assert.equal(migrated.version, 1);
assert.equal(migrated.focusSessions[0].kind, 'legacy-summary');
assert.deepEqual(migrated.focusSessions[0].weekMinutes,[0,0,0,0,0,0,50]);
assert(!JSON.stringify(migrated).includes('calorieTarget'));
assert.deepEqual(api.normalizeCoreState(migrated), migrated, 'legacy migration produces strict core state');

const recovery=api.serializeCoreRecovery({...state,syncOps:[...state.syncOps]});
assert(!recovery.includes('syncOps'), 'recovery serialization excludes the mutable operation queue');
assert.deepEqual(api.parseCoreRecovery(recovery), {...state,syncOps:[]}, 'recovery parsing starts with an empty operation queue');
assert.throws(()=>api.parseCoreRecovery('{"bad":true}'), /invalid/i, 'recovery parser fails closed');

console.log('account sync schema and migration: ok');
