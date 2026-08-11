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

const earlierV1 = {...state, growthItems:[(({rolloverSourceId,...growth})=>growth)(state.growthItems[0])]};
assert.deepEqual(api.normalizeCoreState(earlierV1), state, 'earlier v1 growth entries upgrade only the missing rollover transition');
assert.equal(api.normalizeCoreState({...earlierV1, growthItems:[(({name,...growth})=>growth)(earlierV1.growthItems[0])]}), null,
  'compatibility does not permit unrelated missing growth keys');
assert.equal(api.normalizeCoreState({...earlierV1, growthItems:[{...earlierV1.growthItems[0],unexpected:true}]}), null,
  'compatibility does not permit extra growth keys');

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

async function testAccountClient(){
  assert.deepEqual(Object.values(api.CORE_REMOTE_TABLES).sort(),[
    'liangli_focus_sessions','liangli_goals','liangli_growth_items','liangli_mood_entries','liangli_tasks'
  ], 'only the five core entity tables are mapped for account sync');
  assert(Object.isFrozen(api.CORE_REMOTE_TABLES), 'the core table mapping cannot be extended at runtime');
  assert.equal(api.CORE_REMOTE_TABLES.life, undefined, 'Life data is never part of the account-sync mapping');

  const AccountClient=api.AccountClient;
  AccountClient.configure({url:'http://project.supabase.co',anonKey:'short'});
  assert.equal(AccountClient.isConfigured(),false, 'only a canonical HTTPS Supabase URL and anon key enable network auth');

  const stored={};
  const requests=[];
  let nextResponses=[];
  const validConfig={
    url:'https://project.supabase.co',
    anonKey:'a'.repeat(41),
    getStoredSession:()=>stored.session||null,
    setStoredSession:value=>{stored.session=value;},
    fetch:async(url,options)=>{
      requests.push({url,options});
      const next=nextResponses.shift();
      if(next instanceof Error)throw next;
      return next||{ok:true,status:200,json:async()=>({})};
    },
    location:{origin:'https://app.example',pathname:'/planner'},
  };
  AccountClient.configure(validConfig);
  AccountClient.session=null;AccountClient.generation=0;AccountClient.authInvalid=false;AccountClient.authorizationBlocked=false;

  const session={access_token:'token-one',refresh_token:'refresh-one',expires_at:4102444800,user:{id:'u1'}};
  nextResponses=[{ok:true,status:200,json:async()=>({access_token:'token-one',refresh_token:'refresh-one',expires_in:3600,user:{id:'u1'}})}];
  await AccountClient.signIn('owner@example.com','password-value');
  assert.equal(requests[0].url,'https://project.supabase.co/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(requests[0].options.body),{email:'owner@example.com',password:'password-value'});
  assert.equal(requests[0].options.headers.apikey,'a'.repeat(41));

  nextResponses=[{ok:true,status:200,json:async()=>({user:{id:'u2'}})}];
  await AccountClient.signUp('new@example.com','another-password');
  assert.equal(requests[1].url,'https://project.supabase.co/auth/v1/signup');

  nextResponses=[{ok:true,status:200,json:async()=>({})}];
  await AccountClient.recover('  owner@example.com  ','https://attacker.example/reset');
  assert.equal(requests[2].url,'https://project.supabase.co/auth/v1/recover');
  assert.deepEqual(JSON.parse(requests[2].options.body),{email:'owner@example.com',redirect_to:'https://app.example/planner'});

  await AccountClient.activate(session);
  const client=api.createOwnerRestClient(session,AccountClient.generation,['liangli_tasks']);
  assert.throws(()=>client.table('liangli_expenses'),/not allowed/i, 'the client rejects tables outside its exact allowlist');
  nextResponses=[{ok:true,status:200,json:async()=>[{id:'task-1'}]}];
  const listed=await client.table('liangli_tasks').select('*');
  assert.deepEqual(listed,{data:[{id:'task-1'}],error:null});
  assert.equal(requests[3].url,'https://project.supabase.co/rest/v1/liangli_tasks?select=*');
  assert.equal(requests[3].options.headers.Authorization,'Bearer token-one');
  assert.equal(requests[3].options.headers['Content-Type'],'application/json');
  assert.equal(requests[3].options.headers.apikey,'a'.repeat(41));

  let refreshRequests=0;
  AccountClient.session={access_token:'expired',refresh_token:'refresh-two',expires_at:4102444800,user:{id:'u1'}};
  stored.session=AccountClient.session;
  AccountClient.generation=20;AccountClient.authInvalid=false;
  const refreshSession=AccountClient.session;
  const refreshClient=api.createOwnerRestClient(refreshSession,20,['liangli_tasks']);
  let protectedRequests=0;
  validConfig.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.includes('/auth/v1/token?grant_type=refresh_token')){refreshRequests++;return {ok:true,status:200,json:async()=>({access_token:'fresh',refresh_token:'refresh-three',expires_in:3600,user:{id:'u1'}})};}
    protectedRequests++;
    return protectedRequests<=2?{ok:false,status:401,json:async()=>({})}:{ok:true,status:200,json:async()=>[{id:'after-refresh'}]};
  };
  AccountClient.configure(validConfig);
  const refreshed=await Promise.all([refreshClient.table('liangli_tasks').select('*'),refreshClient.table('liangli_tasks').select('*')]);
  assert.equal(refreshRequests,1, 'concurrent 401 responses share one refresh request');
  assert.deepEqual(refreshed[0],{data:[{id:'after-refresh'}],error:null});
  assert.deepEqual(refreshed[1],{data:[{id:'after-refresh'}],error:null});
  assert.equal(AccountClient.session.access_token,'fresh');

  AccountClient.session={access_token:'old',user:{id:'u1'}};AccountClient.generation=30;AccountClient.authInvalid=false;
  const staleClient=api.createOwnerRestClient(AccountClient.session,30,['liangli_tasks']);
  let release;
  nextResponses=[new Promise(resolve=>{release=resolve;})];
  validConfig.fetch=async(url,options)=>{requests.push({url,options});return await nextResponses.shift();};
  AccountClient.configure(validConfig);
  const staleRequest=staleClient.table('liangli_tasks').select('*');
  await AccountClient.activate({access_token:'new',user:{id:'u2'}});
  release({ok:false,status:401,json:async()=>({})});
  const stale=await staleRequest;
  assert.equal(stale.discarded,true, 'responses from an old account generation are discarded');
  assert.equal(AccountClient.authInvalid,false, 'stale responses cannot mutate active auth state');

  AccountClient.session={access_token:'bad',user:{id:'u2'}};AccountClient.generation=40;AccountClient.authInvalid=false;
  const unauthorized=api.createOwnerRestClient(AccountClient.session,40,['liangli_tasks']);
  nextResponses=[{ok:false,status:401,json:async()=>({})}];
  const unauthorizedResult=await unauthorized.table('liangli_tasks').select('*');
  assert.equal(unauthorizedResult.status,401);
  assert.equal(AccountClient.authInvalid,true, 'an active 401 without a refresh token invalidates only its owner');

  nextResponses=[{ok:true,status:204,json:async()=>({})}];
  await AccountClient.signOut();
  assert.equal(requests.at(-1).url,'https://project.supabase.co/auth/v1/logout');
  assert.equal(AccountClient.session,null);
}

testAccountClient().then(()=>console.log('account sync schema, migration, and account client: ok')).catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
