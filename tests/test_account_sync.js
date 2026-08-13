const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../account-sync.js');

const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
const uuid3 = '33333333-3333-4333-8333-333333333333';
const uuid4 = '44444444-4444-4444-8444-444444444444';
const uuid5 = '55555555-5555-4555-8555-555555555555';
const uuid6 = '66666666-6666-4666-8666-666666666666';
const uuid7 = '77777777-7777-4777-8777-777777777777';
const uuid8 = '88888888-8888-4888-8888-888888888888';
const now = 1700000005000;
const validLeapDay = '2024-02-29';
const invalidCalendarDays = Object.freeze(['2026-02-29','2026-04-31','0000-01-01','+010000-01-01']);
const maxTimestamp = 253402300799999;
const maxTimestampIso = '9999-12-31T23:59:59.999Z';
const extendedYearTimestampIso = '+010000-01-01T00:00:00.000Z';

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

const leapDayState={
  ...state,
  tasks:[{...state.tasks[0],dayKey:validLeapDay}],
  focusSessions:[{...state.focusSessions[0],dayKey:validLeapDay}],
  moodEntries:[{...state.moodEntries[0],date:validLeapDay}],
};
assert.deepEqual(api.normalizeCoreState(leapDayState),leapDayState, 'all calendar entities accept a real leap day');
for(const boundaryDay of ['0001-01-01','9999-12-31']){
  assert.notEqual(api.normalizeCoreState({...state,tasks:[{...state.tasks[0],dayKey:boundaryDay}]}),null, `calendar days include the four-digit boundary ${boundaryDay}`);
}
for(const invalidDay of invalidCalendarDays){
  for(const [collection,field] of [['tasks','dayKey'],['focusSessions','dayKey'],['moodEntries','date']]){
    const invalidState={...state,[collection]:[{...state[collection][0],[field]:invalidDay}]};
    assert.equal(api.normalizeCoreState(invalidState),null, `${collection} reject non-canonical calendar day ${invalidDay}`);
  }
}

const maximumTimestampState={
  ...state,
  tasks:[{...state.tasks[0],createdAt:maxTimestamp,updatedAt:maxTimestamp,deletedAt:maxTimestamp}],
  growthItems:[{...state.growthItems[0],createdAt:maxTimestamp,updatedAt:maxTimestamp,deletedAt:maxTimestamp}],
  goals:[{...state.goals[0],createdAt:maxTimestamp,updatedAt:maxTimestamp,deletedAt:maxTimestamp}],
  focusSessions:[{...state.focusSessions[0],createdAt:maxTimestamp,updatedAt:maxTimestamp,deletedAt:maxTimestamp}],
  moodEntries:[{...state.moodEntries[0],createdAt:maxTimestamp,updatedAt:maxTimestamp,deletedAt:maxTimestamp}],
  syncOps:[{...state.syncOps[0],createdAt:maxTimestamp,op:'delete'}],
};
assert.deepEqual(api.normalizeCoreState(maximumTimestampState),maximumTimestampState, 'the final four-digit UTC millisecond is valid for every entity boundary');
assert.notEqual(api.normalizeCoreState({
  ...state,
  tasks:[{...state.tasks[0],createdAt:0,updatedAt:0}],
  syncOps:[{...state.syncOps[0],createdAt:0}],
}),null,'the timestamp contract includes epoch millisecond zero');
for(const collection of ['tasks','growthItems','goals','focusSessions','moodEntries']){
  const invalidState={...maximumTimestampState,[collection]:[{...maximumTimestampState[collection][0],createdAt:maxTimestamp+1,updatedAt:maxTimestamp+1,deletedAt:maxTimestamp+1}]};
  assert.equal(api.normalizeCoreState(invalidState),null, `${collection} reject an extended-year timestamp`);
}
assert.equal(api.normalizeCoreState({...maximumTimestampState,syncOps:[{...maximumTimestampState.syncOps[0],createdAt:maxTimestamp+1}]}),null,
  'sync operations reject an extended-year timestamp');

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
const calendarMigrated=api.migrateLegacyCoreState({
  tasks:[{name:'Leap',dayKey:validLeapDay},{name:'Overflow',dayKey:'2026-04-31'}],
  logs:[{date:validLeapDay,mood:'Good',text:'valid'},{date:'2026-02-29',mood:'Okay',text:'fallback'}],
},now,'2026-08-10');
assert.deepEqual(calendarMigrated.tasks.map(item=>item.dayKey),[validLeapDay,'2026-08-10'], 'legacy migration retains real dates and safely falls back for overflow dates');
assert.deepEqual(calendarMigrated.moodEntries.map(item=>item.date),[validLeapDay,'2026-08-10'], 'legacy mood dates use the same strict calendar contract');

const recovery=api.serializeCoreRecovery({...state,syncOps:[...state.syncOps]});
assert(!recovery.includes('syncOps'), 'recovery serialization excludes the mutable operation queue');
assert.deepEqual(api.parseCoreRecovery(recovery), {...state,syncOps:[]}, 'recovery parsing starts with an empty operation queue');
assert.throws(()=>api.parseCoreRecovery('{"bad":true}'), /invalid/i, 'recovery parser fails closed');
assert.deepEqual(api.parseCoreRecovery(api.serializeCoreRecovery(maximumTimestampState)),{...maximumTimestampState,syncOps:[]}, 'recovery accepts the maximum canonical entity timestamp');
assert.throws(()=>api.parseCoreRecovery(JSON.stringify((({syncOps,...core})=>({...core,tasks:[{...core.tasks[0],dayKey:'2026-02-29'}]}))(state))),/invalid/i,
  'recovery rejects overflow calendar dates before changing visible state');
assert.equal(typeof api.nextEntityTimestamp,'function','core edits expose one canonical per-entity timestamp helper');
assert.equal(api.nextEntityTimestamp(now,now),now+1,'same-millisecond edits advance beyond the prior entity version');
assert.equal(api.nextEntityTimestamp(now,now-1000),now+1,'backward device clocks cannot lower an existing entity version');
assert.equal(api.nextEntityTimestamp(null,maxTimestamp+1000),maxTimestamp,'new entity clocks are bounded to the canonical maximum');
assert.equal(api.nextEntityTimestamp(maxTimestamp,now),null,'an entity at the canonical maximum fails closed instead of overflowing');


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
  AccountClient.session=null;AccountClient.generation=0;AccountClient.authAttempt=0;AccountClient.authInvalid=false;AccountClient.authorizationBlocked=false;

  const session={access_token:'token-one',refresh_token:'refresh-one',expires_at:4102444800,user:{id:'u1'}};
  nextResponses=[{ok:true,status:200,json:async()=>({access_token:'token-one',refresh_token:'refresh-one',expires_in:3600,user:{id:'u1'}})}];
  await AccountClient.signIn('owner@example.com','password-value');
  assert.equal(requests[0].url,'https://project.supabase.co/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(requests[0].options.body),{email:'owner@example.com',password:'password-value'});
  assert.equal(requests[0].options.headers.apikey,'a'.repeat(41));

  nextResponses=[{ok:true,status:200,json:async()=>({user:{id:'u2'}})}];
  await AccountClient.signUp('new@example.com','another-password');
  assert.equal(requests[1].url,'https://project.supabase.co/auth/v1/signup');

  nextResponses=[{ok:false,status:422,json:async()=>({error_code:'user_already_exists',msg:'User already registered'})}];
  await assert.rejects(
    AccountClient.signUp('existing@example.com','password-value'),
    error=>error.code==='user_already_exists'&&error.status===422,
    'signup preserves the safe Supabase error code so the UI can explain a rejected registration',
  );
  await assert.rejects(
    AccountClient.signUp('not-an-email','password-value'),
    error=>error.code==='invalid_email',
    'local email validation exposes a safe code instead of an unexplained generic failure',
  );
  await assert.rejects(
    AccountClient.signUp('new@example.com','short'),
    error=>error.code==='weak_password',
    'local password validation exposes a safe code instead of an unexplained generic failure',
  );

  nextResponses=[{ok:true,status:200,json:async()=>({})}];
  await AccountClient.recover('  owner@example.com  ','https://attacker.example/reset');
  assert.equal(requests[3].url,'https://project.supabase.co/auth/v1/recover');
  assert.deepEqual(JSON.parse(requests[3].options.body),{email:'owner@example.com',redirect_to:'https://app.example/planner'});

  await AccountClient.activate(session);
  const client=api.createOwnerRestClient(session,AccountClient.generation,['liangli_tasks']);
  assert.throws(()=>client.table('liangli_expenses'),/not allowed/i, 'the client rejects tables outside its exact allowlist');
  assert.throws(()=>client.rpc('initialize_liangli_core_sync',{}),/not allowed/i, 'the client rejects RPC names outside its exact allowlist');
  const initializerClient=api.createOwnerRestClient(session,AccountClient.generation,['liangli_tasks'],['initialize_liangli_core_sync']);
  const mutableAllowlist=['liangli_tasks'];
  const snapshottedClient=api.createOwnerRestClient(session,AccountClient.generation,mutableAllowlist);
  mutableAllowlist[0]='liangli_expenses';mutableAllowlist.push('liangli_mood_entries');
  assert.doesNotThrow(()=>snapshottedClient.table('liangli_tasks'), 'the table allowlist is copied when the owner client is created');
  assert.throws(()=>snapshottedClient.table('liangli_expenses'),/not allowed/i, 'later allowlist mutations cannot expand or reduce the client snapshot');
  nextResponses=[{ok:true,status:200,json:async()=>[{id:'task-1'}]}];
  const listed=await client.table('liangli_tasks').select('*');
  assert.deepEqual(listed,{data:[{id:'task-1'}],error:null});
  assert.equal(requests[4].url,'https://project.supabase.co/rest/v1/liangli_tasks?select=*');
  assert.equal(requests[4].options.headers.Authorization,'Bearer token-one');
  assert.equal(requests[4].options.headers['Content-Type'],'application/json');
  assert.equal(requests[4].options.headers.apikey,'a'.repeat(41));

  nextResponses=[{ok:true,status:200,json:async()=>[]}];
  await client.table('liangli_tasks').select('*',{clientUpdatedAtOrAfter:now});
  assert.equal(requests[5].url,`https://project.supabase.co/rest/v1/liangli_tasks?select=*&client_updated_at=gte.${now}`, 'the explicit inclusive core cursor option produces a gte REST filter');

  nextResponses=[{ok:true,status:200,json:async()=>({initialized:true})}];
  const initialized=await initializerClient.rpc('initialize_liangli_core_sync',{p_tasks:[],p_growth_items:[],p_goals:[],p_focus_sessions:[],p_mood_entries:[]});
  assert.deepEqual(initialized,{data:{initialized:true},error:null}, 'the exact initializer RPC returns its server commit result');
  assert.equal(requests[6].url,'https://project.supabase.co/rest/v1/rpc/initialize_liangli_core_sync');
  assert.deepEqual(JSON.parse(requests[6].options.body),{p_tasks:[],p_growth_items:[],p_goals:[],p_focus_sessions:[],p_mood_entries:[]});

  const representedRow={id:uuid,user_id:'u1',payload:state.tasks[0],client_updated_at:state.tasks[0].updatedAt,deleted_at:null};
  nextResponses=[{ok:true,status:201,json:async()=>[representedRow]}];
  const represented=await client.table('liangli_tasks').upsert([representedRow],{onConflict:'id',returning:true});
  assert.deepEqual(represented,{data:[representedRow],error:null},'a returning upsert parses the real PostgREST representation');
  assert.equal(requests.at(-1).options.headers.Prefer,'resolution=merge-duplicates,return=representation',
    'a returning upsert requests the stored row selected by the server stale-write guard');

  let minimalJsonReads=0;
  nextResponses=[{ok:true,status:201,json:async()=>{minimalJsonReads++;return [representedRow];}}];
  assert.deepEqual(await client.table('liangli_tasks').upsert([representedRow],{onConflict:'id'}),{data:null,error:null});
  assert.equal(requests.at(-1).options.headers.Prefer,'resolution=merge-duplicates,return=minimal','non-returning callers retain minimal responses');
  assert.equal(minimalJsonReads,0,'minimal POST responses are not parsed as representations');

  let refreshRequests=0;
  let refreshSessionChanges=0;
  validConfig.onSessionChange=()=>{refreshSessionChanges++;};
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
  assert.equal(refreshSessionChanges,0, 'same-user token refresh updates credentials without firing an identity-transition callback');

  const restoredTransitions=[];
  const expiredStored={access_token:'restore-expired',refresh_token:'restore-refresh',expires_at:1,user:{id:'u1'}};
  stored.session=expiredStored;AccountClient.session=null;AccountClient.generation=25;AccountClient.refreshPromise=null;
  validConfig.onSessionChange=session=>restoredTransitions.push(session);
  validConfig.fetch=async()=>({ok:true,status:200,json:async()=>({access_token:'restore-fresh',refresh_token:'restore-next',expires_in:3600,user:{id:'u1'}})});
  AccountClient.configure(validConfig);
  const restoredSession=await AccountClient.restoreSession();
  assert.equal(restoredSession.access_token,'restore-fresh');
  assert.equal(restoredTransitions.length,1,'an expired returning-session restore emits one identity activation after credentials refresh');
  const restoredGeneration=AccountClient.generation;
  await AccountClient.restoreSession();
  assert.equal(restoredTransitions.length,1,'re-reading the already-active same-user session does not emit another identity transition');
  assert.equal(AccountClient.generation,restoredGeneration,'re-reading the already-active same-user session preserves its generation');

  const offlineTransitions=[];
  const offlineExpired={access_token:'offline-expired',refresh_token:'offline-refresh',expires_at:1,user:{id:'offline-user'}};
  stored.session=offlineExpired;AccountClient.session=null;AccountClient.generation=30;AccountClient.refreshPromise=null;
  validConfig.onSessionChange=session=>offlineTransitions.push(session);
  validConfig.fetch=async()=>{throw new TypeError('Failed to fetch');};
  AccountClient.configure(validConfig);
  const offlineRestored=await AccountClient.restoreSession();
  assert.equal(offlineRestored.user.id,'offline-user','an expired stored identity resumes locally when refresh transport is offline');
  assert.equal(AccountClient.session.user.id,'offline-user','offline refresh failure keeps the active account identity');
  assert.equal(stored.session.user.id,'offline-user','offline refresh failure preserves the durable stored session');
  assert.deepEqual(offlineTransitions.map(session=>session?.user?.id),['offline-user'],
    'offline startup activates the stored account scope exactly once before refresh');

  const unavailableTransitions=[];
  const unavailableExpired={access_token:'unavailable-expired',refresh_token:'unavailable-refresh',expires_at:1,user:{id:'unavailable-user'}};
  stored.session=unavailableExpired;AccountClient.session=null;AccountClient.generation=32;AccountClient.refreshPromise=null;
  validConfig.onSessionChange=session=>unavailableTransitions.push(session);
  validConfig.fetch=async()=>({ok:false,status:503,json:async()=>({error:'temporarily_unavailable'})});
  AccountClient.configure(validConfig);
  const unavailableRestored=await AccountClient.restoreSession();
  assert.equal(unavailableRestored.user.id,'unavailable-user','a transient auth-service failure retains the returning account');
  assert.equal(stored.session.user.id,'unavailable-user','a transient auth-service failure preserves the durable session');
  assert.deepEqual(unavailableTransitions.map(session=>session?.user?.id),['unavailable-user'],
    'a transient auth-service failure never emits sign-out');

  const rejectedTransitions=[];
  const rejectedExpired={access_token:'rejected-expired',refresh_token:'rejected-refresh',expires_at:1,user:{id:'rejected-user'}};
  stored.session=rejectedExpired;AccountClient.session=null;AccountClient.generation=35;AccountClient.refreshPromise=null;
  validConfig.onSessionChange=session=>rejectedTransitions.push(session);
  validConfig.fetch=async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant'})});
  AccountClient.configure(validConfig);
  await assert.rejects(AccountClient.restoreSession(),/Authentication failed/);
  assert.equal(AccountClient.session,null,'a definitive refresh-token rejection clears the active session');
  assert.equal(stored.session,null,'a definitive refresh-token rejection clears the durable session');
  assert.deepEqual(rejectedTransitions.map(session=>session?.user?.id||null),['rejected-user',null],
    'a definitive rejection first resumes locally and then emits one explicit sign-out transition');

  const requestRejectedTransitions=[];
  const requestRejectedSession={access_token:'request-rejected-token',refresh_token:'request-rejected-refresh',expires_at:4102444800,user:{id:'request-rejected-user'}};
  stored.session=requestRejectedSession;AccountClient.session=requestRejectedSession;AccountClient.generation=40;AccountClient.refreshPromise=null;AccountClient.authInvalid=false;
  validConfig.onSessionChange=session=>requestRejectedTransitions.push(session);
  let requestRejectedStep=0;
  validConfig.fetch=async url=>{
    if(url.includes('/rest/v1/')){requestRejectedStep++;return {ok:false,status:401,json:async()=>({})};}
    assert(url.includes('/auth/v1/token?grant_type=refresh_token'));
    return {ok:false,status:400,json:async()=>({error:'invalid_grant'})};
  };
  AccountClient.configure(validConfig);
  const requestRejectedClient=api.createOwnerRestClient(requestRejectedSession,40,['liangli_tasks']);
  await requestRejectedClient.table('liangli_tasks').select('*');
  assert.equal(requestRejectedStep,1,'a definitive refresh rejection does not retry REST with rejected credentials');
  assert.equal(AccountClient.session,null,'REST 401 followed by definitive refresh rejection clears the active session');
  assert.equal(stored.session,null,'REST 401 followed by definitive refresh rejection clears the durable session');
  assert.deepEqual(requestRejectedTransitions.map(session=>session?.user?.id||null),[null],
    'REST 401 followed by definitive refresh rejection emits one sign-out transition');

  const requestUnavailableTransitions=[];
  const requestUnavailableSession={access_token:'request-unavailable-token',refresh_token:'request-unavailable-refresh',expires_at:4102444800,user:{id:'request-unavailable-user'}};
  stored.session=requestUnavailableSession;AccountClient.session=requestUnavailableSession;AccountClient.generation=42;AccountClient.refreshPromise=null;AccountClient.authInvalid=false;
  validConfig.onSessionChange=session=>requestUnavailableTransitions.push(session);
  validConfig.fetch=async url=>url.includes('/rest/v1/')
    ?{ok:false,status:401,json:async()=>({})}
    :{ok:false,status:503,json:async()=>({error:'temporarily_unavailable'})};
  AccountClient.configure(validConfig);
  const requestUnavailableClient=api.createOwnerRestClient(requestUnavailableSession,42,['liangli_tasks']);
  const requestUnavailable=await requestUnavailableClient.table('liangli_tasks').select('*');
  assert.equal(requestUnavailable.error,true,'REST 401 followed by transient refresh failure remains retryable');
  assert.equal(requestUnavailable.transient,true,'the caller can distinguish a transient refresh failure');
  assert.equal(AccountClient.session.user.id,'request-unavailable-user','transient refresh failure retains the active account');
  assert.equal(stored.session.user.id,'request-unavailable-user','transient refresh failure retains the durable account');
  assert.equal(AccountClient.authInvalid,false,'transient refresh failure never marks credentials invalid');
  assert.deepEqual(requestUnavailableTransitions,[],'transient refresh failure emits no sign-out transition');
  validConfig.onSessionChange=null;

  let rejectOldRefresh;
  let oldRefreshStartedResolve;
  const oldRefreshStarted=new Promise(resolve=>{oldRefreshStartedResolve=resolve;});
  const oldSession={access_token:'old-generation-token',refresh_token:'old-generation-refresh',expires_at:4102444800,user:{id:'u1'}};
  AccountClient.session=oldSession;stored.session=oldSession;AccountClient.generation=50;AccountClient.refreshPromise=null;AccountClient.authInvalid=false;
  validConfig.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.includes('/auth/v1/token?grant_type=refresh_token')){
      const refreshToken=JSON.parse(options.body).refresh_token;
      if(refreshToken==='old-generation-refresh'){
        oldRefreshStartedResolve();
        return await new Promise((_,reject)=>{rejectOldRefresh=reject;});
      }
      assert.equal(refreshToken,'new-generation-refresh');
      return {ok:true,status:200,json:async()=>({access_token:'new-generation-fresh',refresh_token:'new-generation-refresh',expires_in:3600,user:{id:'u1'}})};
    }
    if(options.headers.Authorization==='Bearer new-generation-fresh')return {ok:true,status:200,json:async()=>[{id:'new-generation-row'}]};
    return {ok:false,status:401,json:async()=>({})};
  };
  AccountClient.configure(validConfig);
  const oldRequest=api.createOwnerRestClient(oldSession,50,['liangli_tasks']).table('liangli_tasks').select('*');
  await oldRefreshStarted;
  const newSession={access_token:'new-generation-token',refresh_token:'new-generation-refresh',expires_at:4102444800,user:{id:'u1'}};
  await AccountClient.activate(newSession);
  const newRequest=api.createOwnerRestClient(newSession,AccountClient.generation,['liangli_tasks']).table('liangli_tasks').select('*');
  const staleRejection=new Error('old refresh rejected');staleRejection.authRejected=true;staleRejection.status=400;
  rejectOldRefresh(staleRejection);
  assert.deepEqual(await newRequest,{data:[{id:'new-generation-row'}],error:null}, 'a new generation runs its own refresh after an old refresh rejects');
  assert.equal(AccountClient.authInvalid,false, 'an old refresh rejection cannot invalidate the current generation');
  assert.equal((await oldRequest).discarded,true, 'the old owner request remains discarded after its refresh rejects');

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

  AccountClient.session={access_token:'old-forbidden',user:{id:'u1'}};AccountClient.generation=35;AccountClient.authorizationBlocked=false;
  const staleForbiddenClient=api.createOwnerRestClient(AccountClient.session,35,['liangli_tasks']);
  let releaseForbidden;
  nextResponses=[new Promise(resolve=>{releaseForbidden=resolve;})];
  validConfig.fetch=async(url,options)=>{requests.push({url,options});return await nextResponses.shift();};
  AccountClient.configure(validConfig);
  const staleForbiddenRequest=staleForbiddenClient.table('liangli_tasks').select('*');
  await AccountClient.activate({access_token:'active-after-forbidden',user:{id:'u2'}});
  releaseForbidden({ok:false,status:403,json:async()=>({})});
  assert.equal((await staleForbiddenRequest).discarded,true);
  assert.equal(AccountClient.authorizationBlocked,false, 'a stale 403 cannot block the active account');

  AccountClient.session={access_token:'bad',user:{id:'u2'}};AccountClient.generation=40;AccountClient.authInvalid=false;
  const unauthorized=api.createOwnerRestClient(AccountClient.session,40,['liangli_tasks']);
  nextResponses=[{ok:false,status:401,json:async()=>({})}];
  const unauthorizedResult=await unauthorized.table('liangli_tasks').select('*');
  assert.equal(unauthorizedResult.status,401);
  assert.equal(AccountClient.authInvalid,true, 'an active 401 without a refresh token invalidates only its owner');

  const executableSource=fs.readFileSync(require.resolve('../account-sync.js'),'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'');
  assert.doesNotMatch(executableSource,/\bconsole\s*\./, 'account code contains no runtime logging calls');
  const logged=[];
  const originalConsole=Object.fromEntries(['debug','error','info','log','warn'].map(method=>[method,console[method]]));
  for(const method of Object.keys(originalConsole))console[method]=(...values)=>{logged.push(values);};
  try{
    validConfig.fetch=async()=>({ok:true,status:200,json:async()=>({access_token:'log-safe-token',refresh_token:'log-safe-refresh',expires_in:3600,user:{id:'u3'}})});
    AccountClient.configure(validConfig);
    await AccountClient.signIn('log-safe@example.com','log-safe-password');
  }finally{Object.assign(console,originalConsole);}
  assert.equal(logged.length,0, 'auth operations do not log token, email, password, or response bodies');

  let releaseFirstLogin,releaseSecondLogin;
  validConfig.fetch=async(url,options)=>{
    requests.push({url,options});
    const email=JSON.parse(options.body).email;
    return await new Promise(resolve=>{
      if(email==='first@example.com')releaseFirstLogin=resolve;
      else if(email==='second@example.com')releaseSecondLogin=resolve;
    });
  };
  AccountClient.configure(validConfig);
  const firstLogin=AccountClient.signIn('first@example.com','first-password');
  const secondLogin=AccountClient.signIn('second@example.com','second-password');
  releaseSecondLogin({ok:true,status:200,json:async()=>({access_token:'second-token',refresh_token:'second-refresh',expires_in:3600,user:{id:'second-user',email:'second@example.com'}})});
  assert.equal((await secondLogin).user.id,'second-user');
  releaseFirstLogin({ok:true,status:200,json:async()=>({access_token:'first-token',refresh_token:'first-refresh',expires_in:3600,user:{id:'first-user',email:'first@example.com'}})});
  assert.equal(await firstLogin,null,'an older login response is discarded when a newer login finishes first');
  assert.equal(AccountClient.session.user.id,'second-user','the most recently started login remains active');

  const replaced=[];
  validConfig.location={origin:'https://app.example',pathname:'/planner',search:'?lang=zh',hash:'#access_token=recovery-token&refresh_token=recovery-refresh&type=recovery&expires_in=3600'};
  validConfig.history={replaceState:(state,title,url)=>replaced.push(url)};
  validConfig.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.includes('grant_type=refresh_token'))return {ok:true,status:200,json:async()=>({access_token:'recovered-token',refresh_token:'recovered-refresh',expires_in:3600,user:{id:'recovery-user',email:'owner@example.com'}})};
    if(url.endsWith('/auth/v1/user'))return {ok:true,status:200,json:async()=>({id:'recovery-user',email:'owner@example.com'})};
    return {ok:true,status:200,json:async()=>({})};
  };
  AccountClient.configure(validConfig);
  const recoveryRedirect=await AccountClient.consumeAuthRedirect();
  assert.equal(recoveryRedirect.session.user.id,'recovery-user','a recovery email redirect activates its password-reset session');
  assert.equal(recoveryRedirect.type,'recovery');
  assert.deepEqual(replaced,['/planner?lang=zh'],'password recovery tokens are removed from the browser URL immediately');
  await AccountClient.updatePassword('replacement-password');
  assert.equal(requests.at(-1).url,'https://project.supabase.co/auth/v1/user');
  assert.equal(requests.at(-1).options.method,'PUT');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body),{password:'replacement-password'});
  assert.equal(requests.at(-1).options.headers.Authorization,'Bearer recovered-token');

  const failedReplacements=[];
  validConfig.location={origin:'https://app.example',pathname:'/planner',search:'',hash:'#refresh_token=retryable-refresh&type=recovery'};
  validConfig.history={replaceState:(state,title,url)=>failedReplacements.push(url)};
  validConfig.fetch=async()=>{throw new TypeError('Failed to fetch');};
  AccountClient.configure(validConfig);
  await assert.rejects(AccountClient.consumeAuthRedirect(),/Failed to fetch/);
  assert.deepEqual(failedReplacements,[],'a failed recovery exchange keeps the email-link fragment available for retry');

  const signupReplacements=[];
  validConfig.location={origin:'https://app.example',pathname:'/planner',search:'',hash:'#refresh_token=signup-refresh&type=signup'};
  validConfig.history={replaceState:(state,title,url)=>signupReplacements.push(url)};
  validConfig.fetch=async()=>({ok:true,status:200,json:async()=>({access_token:'signup-token',refresh_token:'signup-next',expires_in:3600,user:{id:'signup-user',email:'new@example.com'}})});
  AccountClient.configure(validConfig);
  const signupRedirect=await AccountClient.consumeAuthRedirect();
  assert.equal(signupRedirect.type,'signup','an email-confirmation redirect is distinguished from password recovery');
  assert.equal(signupRedirect.session.user.id,'signup-user','email confirmation activates the new account');
  assert.deepEqual(signupReplacements,['/planner'],'email-confirmation credentials are removed from browser history');

  validConfig.fetch=async(url,options)=>{
    requests.push({url,options});
    return nextResponses.shift()||{ok:true,status:200,json:async()=>({})};
  };
  AccountClient.configure(validConfig);
  nextResponses=[{ok:true,status:204,json:async()=>({})}];
  await AccountClient.signOut();
  assert.equal(requests.at(-1).url,'https://project.supabase.co/auth/v1/logout');
  assert.equal(AccountClient.session,null);
}

function clone(value){return JSON.parse(JSON.stringify(value));}
function coreState(overrides={}){
  return {
    version:1,
    tasks:[{...state.tasks[0]}], growthItems:[{...state.growthItems[0]}], goals:[{...state.goals[0]}],
    focusSessions:[{...state.focusSessions[0]}], moodEntries:[{...state.moodEntries[0]}], syncOps:[], ...overrides,
  };
}
const anonymousDevice=coreState({tasks:[{...state.tasks[0],name:'anonymous device only'}]});
const requestedScopes=[];
assert.deepEqual(api.readAnonymousCoreState(scope=>{requestedScopes.push(scope);return scope==='local'?{status:'valid',state:anonymousDevice}:null;}),anonymousDevice,
  'first-login upload resolves its payload from the anonymous local scope');
assert.deepEqual(requestedScopes,['local'], 'first-login upload never reads the visible account scope');
assert.equal(api.readAnonymousCoreState(()=>({status:'invalid',state:anonymousDevice})),null, 'invalid local scope cannot be uploaded');

async function testReconciliationGate(){
  assert.equal(typeof api.createAccountReconciliationGate,'function', 'account onboarding exposes a single-flight reconciliation gate');
  const gate=api.createAccountReconciliationGate();
  let release,deferred=new Promise(resolve=>{release=resolve;}),pipelines=0;
  const initialize=async()=>{const token=gate.acquire('user-b',2);if(!token)return false;pipelines++;try{await deferred;return gate.owns(token);}finally{gate.release(token);}};
  const first=initialize(),second=initialize();
  assert.equal(await second,false, 'a double click is rejected while the first onboarding pipeline is in flight');
  assert.equal(pipelines,1, 'concurrent same-owner attempts start exactly one controller pipeline');
  release();assert.equal(await first,true);assert.equal(gate.active(),null, 'completion releases the reconciliation lock');
  const stale=gate.acquire('user-a',3);gate.cancel();
  assert.equal(gate.owns(stale),false, 'account change cancellation invalidates stale onboarding completion');
}
function remoteRow(entity){
  return {id:entity.id,user_id:'user-a',payload:clone(entity),client_updated_at:entity.updatedAt,deleted_at:entity.deletedAt};
}
function createCoreHarness({initialCoreReady=true}={}){
  let generation=1,online=true,hold=null,upsertHold=null,currentSession,clockNow=now;
  const sessions={a:{access_token:'a',user:{id:'user-a'}},b:{access_token:'b',user:{id:'user-b'}}};
  const scopes=new Map([['user-a',coreState()],['user-b',coreState({tasks:[],growthItems:[],goals:[],focusSessions:[],moodEntries:[]})]]);
  const remote={
    liangli_sync_profiles:[{user_id:'user-a',core_version:1,initialized_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:00.000Z'}],
    liangli_tasks:[],liangli_growth_items:[],liangli_goals:[],liangli_focus_sessions:[],liangli_mood_entries:[],
  };
  const statuses=[],writes=[],recovery=[],selects=[],upserts=[],rpcCalls=[],events=[],timers=[];
  const tableFor={task:'liangli_tasks',growth:'liangli_growth_items',goal:'liangli_goals',focus:'liangli_focus_sessions',mood:'liangli_mood_entries'};
  currentSession=sessions.a;
  const harness={activeScope:'user-a',sessions,remote,statuses,writes,recovery,selects,upserts,rpcCalls,events,timers,failTables:new Set(),failEntityRefetchTables:new Set(),minimalUpsertTables:new Set(),malformedUpsertTables:new Set(),failRpc:false,failWrites:false,tableFor,
    state(){return scopes.get(this.activeScope);},
    switchTo(session){generation++;currentSession=session;this.activeScope=session.user.id;},
    resolveOld(rows){hold.resolve(rows);hold=null;},
    deferTable(table){let resolve;const promise=new Promise(done=>{resolve=done;});hold={table,promise,resolve:rows=>resolve({data:rows,error:null})};},
    deferUpsert(table){let resolve;const promise=new Promise(done=>{resolve=done;});upsertHold={table,promise,resolve};},
    resolveUpsert(){upsertHold.resolve();upsertHold=null;},
    async runTimers(){const pending=timers.filter(timer=>!timer.cancelled);timers.length=0;await Promise.all(pending.map(timer=>timer.fn()));},
    setNow:value=>{clockNow=value;},
  };
  harness.deps={
    readScope:scope=>clone(scopes.get(scope)||null),
    writeScope:(scope,next)=>{events.push(`write:${scope}`);writes.push({scope,state:clone(next)});if(harness.failWrites){if(typeof harness.failWrites==='number')harness.failWrites--;return false;}if(scope!==harness.activeScope)return false;scopes.set(scope,clone(next));return true;},
    createRecovery:async next=>{recovery.push(clone(next));return true;},
    restClient:session=>({table(name){return {
      select:async(_columns,options={})=>{selects.push({name,options:clone(options)});if(hold&&hold.table===name)return await hold.promise;if(options.id&&harness.failEntityRefetchTables.has(name))return {data:null,error:true,status:503};const after=options.clientUpdatedAfter,inclusive=options.clientUpdatedAtOrAfter;let rows=inclusive!==undefined?(remote[name]||[]).filter(row=>Number(row.client_updated_at??row.updatedAt)>=inclusive):after===undefined?remote[name]||[]:(remote[name]||[]).filter(row=>Number(row.client_updated_at??row.updatedAt)>after);if(options.id)rows=rows.filter(row=>row.id===options.id);return {data:clone(rows),error:null};},
      upsert:async(rows,options={})=>{
        events.push(`upsert:${name}`);
        upserts.push({name,rows:clone(rows),options:clone(options)});
        if(upsertHold&&upsertHold.table===name)await upsertHold.promise;
        if(harness.failTables.has(name))return {data:null,error:true,status:503};
        const existing=remote[name]||[];
        const echoes=rows.map(row=>{
          const index=existing.findIndex(item=>(item.id||item.user_id)===(row.id||row.user_id));
          if(index>=0&&Number(existing[index].client_updated_at||0)>=Number(row.client_updated_at||0))return clone(existing[index]);
          if(index>=0)existing[index]=clone(row);else existing.push(clone(row));
          return clone(row);
        });
        if(harness.minimalUpsertTables.has(name))return {data:null,error:null};
        if(harness.malformedUpsertTables.has(name))return {data:[{...echoes[0],user_id:'wrong-owner'}],error:null};
        return {data:echoes,error:null};
      },
      delete:()=>({eq:async(column,value)=>{events.push(`delete:${name}`);if(harness.failTables.has(`${name}:delete`))return {data:null,error:true,status:503};remote[name]=(remote[name]||[]).filter(row=>row[column]!==value);return {data:null,error:null};}}),
    };},rpc:async(name,args)=>{
      events.push(`rpc:${name}`);rpcCalls.push({name,args:clone(args)});
      if(name!=='initialize_liangli_core_sync'||harness.failRpc)return {data:null,error:true,status:503};
      if((remote.liangli_sync_profiles||[]).some(row=>row.user_id===session.user.id))return {data:null,error:true,status:409,message:'liangli_core_already_initialized'};
      const payloadTables={p_tasks:'liangli_tasks',p_growth_items:'liangli_growth_items',p_goals:'liangli_goals',p_focus_sessions:'liangli_focus_sessions',p_mood_entries:'liangli_mood_entries'};
      for(const [argument,table] of Object.entries(payloadTables))remote[table]=(args[argument]||[]).map(row=>({...clone(row),user_id:session.user.id}));
      remote.liangli_sync_profiles.push({user_id:session.user.id,core_version:1,initialized_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:00.000Z'});
      return {data:{initialized:true},error:null};
    }}),
    getGeneration:()=>generation,getSession:()=>currentSession,initialCoreReady,now:()=>clockNow,onStatus:status=>statuses.push(status),onActivate:(scope,next)=>{harness.activeScope=scope;scopes.set(scope,clone(next));},
    isOnline:()=>online,setTimeout:(fn,delay)=>{const timer={fn,delay,cancelled:false};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;},
  };
  harness.setOnline=value=>{online=value;};
  return harness;
}

async function testCoreSyncEngine(){
  assert.equal(typeof api.createCoreSyncController,'function', 'core controller is available to coordinate manifest, queue, and account boundaries');
  assert.equal(typeof api.mergeCoreEntity,'function');
  assert.equal(typeof api.coalesceCoreOps,'function');

  const restoredHarness=createCoreHarness({initialCoreReady:false});
  const restoredOp={id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now};
  const restoredState=coreState({syncOps:[restoredOp]});
  restoredHarness.deps.writeScope('user-a',restoredState);restoredHarness.writes.length=0;restoredHarness.setOnline(false);
  const restoredController=api.createCoreSyncController(restoredHarness.deps);
  assert.equal(typeof restoredController.resume,'function','the core controller exposes a local returning-session resume path');
  assert.deepEqual(await restoredController.resume(restoredHarness.sessions.a,restoredState),{restored:true,state:restoredState},
    'a returning session resumes its strict account scope without cloud reconciliation');
  assert.equal(restoredHarness.writes.length,0, 'session restore performs no canonical rewrite or recovery transition');
  await restoredController.schedule('restore');
  assert.deepEqual(restoredHarness.state().syncOps,[restoredOp], 'offline restore keeps the durable account queue intact');
  assert.equal(restoredHarness.selects.length,0, 'offline restore makes no cloud read before rendering the account scope');
  restoredHarness.setOnline(true);await restoredController.schedule('online');
  assert.deepEqual(restoredHarness.state().syncOps,[], 'the reconnect trigger drains the restored durable queue');

  const older={...state.tasks[0],updatedAt:now-1};
  const deleted={...state.tasks[0],updatedAt:now+1,deletedAt:now+2};
  assert.deepEqual(api.mergeCoreEntity(older,deleted),deleted, 'newer tombstones win LWW conflicts');
  assert.deepEqual(api.mergeCoreEntity(deleted,{...older,updatedAt:now+3,deletedAt:null}),deleted, 'a later non-delete cannot resurrect a tombstoned ID');
  assert.deepEqual(api.mergeCoreEntity({...older,updatedAt:now+2},{...older,updatedAt:now+2,deletedAt:now+2}),{...older,updatedAt:now+2,deletedAt:now+2}, 'equal timestamps deterministically prefer tombstones');
  const opLater={id:uuid6,type:'task',entityId:uuid,op:'delete',createdAt:now+2};
  assert.deepEqual(api.coalesceCoreOps([{...state.syncOps[0],createdAt:now},opLater]),[opLater], 'the newest operation for one entity is sent once');
  const focusOp={id:uuid5,type:'focus',entityId:uuid4,op:'upsert',createdAt:now};
  assert.equal(api.coalesceCoreOps([opLater,focusOp]).length,2, 'UUID-distinct focus records remain a union');

  const freshFocus={...state.focusSessions[0],id:uuid6,updatedAt:now+3,createdAt:now+3};
  const freshMood={...state.moodEntries[0],id:uuid7,updatedAt:now+3,createdAt:now+3};
  const unionHarness=createCoreHarness();
  unionHarness.remote.liangli_focus_sessions=[remoteRow(freshFocus)];
  unionHarness.remote.liangli_mood_entries=[remoteRow(freshMood)];
  const unionController=api.createCoreSyncController(unionHarness.deps);
  await unionController.sync(unionHarness.sessions.a);
  assert(unionHarness.state().focusSessions.some(item=>item.id===uuid4)&&unionHarness.state().focusSessions.some(item=>item.id===uuid6), 'focus records merge by UUID union');
  assert(unionHarness.state().moodEntries.some(item=>item.id===uuid5)&&unionHarness.state().moodEntries.some(item=>item.id===uuid7), 'mood records merge by UUID union');

  const manifestHarness=createCoreHarness();
  manifestHarness.remote.liangli_sync_profiles=[];
  const manifestController=api.createCoreSyncController(manifestHarness.deps);
  assert.deepEqual(await manifestController.inspectCloud(manifestHarness.sessions.a),{initialized:false}, 'Flashcard-era accounts without a core manifest are uninitialized');
  manifestHarness.remote.liangli_sync_profiles=[{user_id:'user-a',core_version:1,initialized_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:00.000Z'}];
  manifestHarness.remote.liangli_tasks=[{...remoteRow(state.tasks[0]),deleted_at:'not-a-timestamp'}];
  await assert.rejects(()=>manifestController.activateCloud(manifestHarness.sessions.a),/invalid cloud/i, 'one malformed core row rejects the whole activation');

  const postgrestDeletionHarness=createCoreHarness();
  const deletedCloudTask={...state.tasks[0],updatedAt:now+123,deletedAt:now+123};
  postgrestDeletionHarness.remote.liangli_tasks=[{...remoteRow(deletedCloudTask),deleted_at:'2023-11-14T22:13:25.123000+00:00'}];
  await api.createCoreSyncController(postgrestDeletionHarness.deps).activateCloud(postgrestDeletionHarness.sessions.a);
  assert.equal(postgrestDeletionHarness.state().tasks[0].deletedAt,now+123,
    'PostgREST zero-offset tombstones with microsecond precision normalize to their exact epoch millisecond');

  for(const invalidDeletedAt of [
    '2023-11-14T23:13:25.123+01:00',
    '2023-11-14T22:13:25.123456+00:00',
    '+010000-01-01T00:00:00.000000+00:00',
    '9999-12-31T23:59:59.999999+00:00',
  ]){
    const invalidDeletionHarness=createCoreHarness();
    invalidDeletionHarness.remote.liangli_tasks=[{...remoteRow(deletedCloudTask),deleted_at:invalidDeletedAt}];
    await assert.rejects(()=>api.createCoreSyncController(invalidDeletionHarness.deps).activateCloud(invalidDeletionHarness.sessions.a),/invalid cloud/i,
      `cloud tombstones reject invalid PostgREST wire value ${invalidDeletedAt}`);
  }

  const initHarness=createCoreHarness();
  initHarness.remote.liangli_sync_profiles=[];
  const initController=api.createCoreSyncController(initHarness.deps);
  await initController.initializeEmpty(initHarness.sessions.a);
  assert.equal(initHarness.rpcCalls.length,1, 'empty initialization commits through one server-side RPC');
  assert.equal(initHarness.rpcCalls[0].name,'initialize_liangli_core_sync');
  assert.deepEqual(initHarness.rpcCalls[0].args,{p_tasks:[],p_growth_items:[],p_goals:[],p_focus_sessions:[],p_mood_entries:[]}, 'empty initialization supplies only fixed empty arrays');
  assert.equal(initHarness.events.some(event=>event.startsWith('delete:')||event.startsWith('upsert:')),false, 'initialization never exposes client-side destructive table REST calls');
  await initController.initializeFromDevice(initHarness.sessions.a,coreState());
  const deviceRpc=initHarness.rpcCalls.at(-1);
  assert.equal(deviceRpc.name,'initialize_liangli_core_sync');
  assert.equal(deviceRpc.args.p_tasks[0].user_id,undefined, 'device initialization never sends user_id in RPC payload rows');
  assert.deepEqual(Object.keys(deviceRpc.args).sort(),['p_focus_sessions','p_goals','p_growth_items','p_mood_entries','p_tasks'], 'device initialization has no dynamic table argument');

  const queueHarness=createCoreHarness();
  const queued=coreState({syncOps:[
    {...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now},
    {id:uuid8,type:'growth',entityId:uuid2,op:'upsert',createdAt:now+1},
  ]});
  queueHarness.deps.writeScope('user-a',queued);queueHarness.failTables.add('liangli_growth_items');
  const queueController=api.createCoreSyncController(queueHarness.deps);
  await queueController.sync(queueHarness.sessions.a);
  assert.deepEqual(queueHarness.state().syncOps.map(item=>item.id),[uuid8], 'only failed batches remain queued for retry');

  const cleanupHarness=createCoreHarness();
  const deletedTask={...state.tasks[0],updatedAt:now+2,deletedAt:now+2};
  cleanupHarness.deps.writeScope('user-a',coreState({tasks:[deletedTask],syncOps:[
    {...state.syncOps[0],id:uuid6,type:'task',entityId:uuid,op:'upsert',createdAt:now},
    {...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'delete',createdAt:now+1},
  ]}));
  await api.createCoreSyncController(cleanupHarness.deps).sync(cleanupHarness.sessions.a);
  assert.equal(cleanupHarness.state().syncOps.length,0, 'a successful winning delete clears every superseded operation for that entity');
  const cleanupFailureHarness=createCoreHarness();
  cleanupFailureHarness.failTables.add('liangli_tasks');
  cleanupFailureHarness.deps.writeScope('user-a',coreState({tasks:[deletedTask],syncOps:[
    {...state.syncOps[0],id:uuid6,type:'task',entityId:uuid,op:'upsert',createdAt:now},
    {...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'delete',createdAt:now+1},
  ]}));
  await api.createCoreSyncController(cleanupFailureHarness.deps).sync(cleanupFailureHarness.sessions.a);
  assert.deepEqual(cleanupFailureHarness.state().syncOps.map(item=>item.id),[uuid7], 'a failed winner retains only the current operation, never an obsolete predecessor');

  const echoHarness=createCoreHarness();
  const clientTask={...state.tasks[0],name:'client',updatedAt:now+5};
  const serverTask={...state.tasks[0],name:'server',updatedAt:now+10};
  echoHarness.remote.liangli_tasks=[remoteRow(serverTask)];
  echoHarness.deps.writeScope('user-a',coreState({tasks:[clientTask],syncOps:[{...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now+5}]}));
  await api.createCoreSyncController(echoHarness.deps).sync(echoHarness.sessions.a);
  assert.equal(echoHarness.state().tasks[0].name,'server', 'a stale upsert echo forces a pull instead of accepting the local value');

  const missingEchoHarness=createCoreHarness();
  const missingEchoTask={...state.tasks[0],name:'minimal response',updatedAt:now+5};
  missingEchoHarness.deps.writeScope('user-a',coreState({tasks:[missingEchoTask],syncOps:[{...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now+5}]}));
  missingEchoHarness.minimalUpsertTables.add('liangli_tasks');missingEchoHarness.failEntityRefetchTables.add('liangli_tasks');
  await api.createCoreSyncController(missingEchoHarness.deps).sync(missingEchoHarness.sessions.a);
  assert.deepEqual(missingEchoHarness.state().syncOps.map(op=>op.id),[uuid7],
    'a missing PostgREST representation plus failed fixed-entity refetch retains the operation');
  assert(missingEchoHarness.selects.some(call=>call.name==='liangli_tasks'&&call.options.id===uuid),
    'a missing representation triggers an explicit fixed-table fixed-entity refetch');

  const malformedEchoHarness=createCoreHarness();
  malformedEchoHarness.deps.writeScope('user-a',coreState({syncOps:[{...state.syncOps[0],id:uuid7}]}));
  malformedEchoHarness.malformedUpsertTables.add('liangli_tasks');malformedEchoHarness.failEntityRefetchTables.add('liangli_tasks');
  await api.createCoreSyncController(malformedEchoHarness.deps).sync(malformedEchoHarness.sessions.a);
  assert.deepEqual(malformedEchoHarness.state().syncOps.map(op=>op.id),[uuid7],
    'a malformed owner/id/version/payload representation with failed refetch retains the operation');

  const refetchedEchoHarness=createCoreHarness();
  refetchedEchoHarness.deps.writeScope('user-a',coreState({syncOps:[{...state.syncOps[0],id:uuid7}]}));
  refetchedEchoHarness.minimalUpsertTables.add('liangli_tasks');
  await api.createCoreSyncController(refetchedEchoHarness.deps).sync(refetchedEchoHarness.sessions.a);
  assert.deepEqual(refetchedEchoHarness.state().syncOps,[],
    'a missing representation resolves only after a validated fixed-entity refetch');

  const echoBehindCursorHarness=createCoreHarness();
  const cursorMarker={...state.tasks[0],id:uuid8,name:'cursor marker',createdAt:now+100,updatedAt:now+100};
  echoBehindCursorHarness.remote.liangli_tasks=[remoteRow(cursorMarker)];
  const echoBehindCursorController=api.createCoreSyncController(echoBehindCursorHarness.deps);
  await echoBehindCursorController.sync(echoBehindCursorHarness.sessions.a);
  const behindServer={...state.tasks[0],name:'server newer behind cursor',updatedAt:now+10};
  const behindClient={...state.tasks[0],name:'client stale',updatedAt:now+5};
  echoBehindCursorHarness.remote.liangli_tasks=[remoteRow(behindServer)];
  echoBehindCursorHarness.deps.writeScope('user-a',coreState({tasks:[behindClient,cursorMarker],syncOps:[{...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now+5}]}));
  await echoBehindCursorController.sync(echoBehindCursorHarness.sessions.a);
  assert.equal(echoBehindCursorHarness.state().tasks.find(item=>item.id===uuid).name,'server newer behind cursor',
    'a validated server-newer representation is merged even when it sits behind the global cursor');
  assert.deepEqual(echoBehindCursorHarness.state().syncOps,[],'a validated server-newer winner resolves the stale local operation');

  const equalEchoHarness=createCoreHarness();
  equalEchoHarness.remote.liangli_tasks=[remoteRow(cursorMarker)];
  const equalEchoController=api.createCoreSyncController(equalEchoHarness.deps);
  await equalEchoController.sync(equalEchoHarness.sessions.a);
  const equalServer={...state.tasks[0],name:'server equal winner',updatedAt:now+15};
  const equalClient={...state.tasks[0],name:'client equal loser',updatedAt:now+15};
  equalEchoHarness.remote.liangli_tasks=[remoteRow(equalServer)];
  equalEchoHarness.deps.writeScope('user-a',coreState({tasks:[equalClient,cursorMarker],syncOps:[{...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now+15}]}));
  await equalEchoController.sync(equalEchoHarness.sessions.a);
  assert.equal(equalEchoHarness.state().tasks.find(item=>item.id===uuid).name,'server equal winner',
    'an equal-version different server representation is the stored winner selected by the stale guard');
  assert.deepEqual(equalEchoHarness.state().syncOps,[],'the validated equal-version server winner resolves the local operation');

  const offlineHarness=createCoreHarness();
  offlineHarness.setOnline(false);
  const offlineController=api.createCoreSyncController(offlineHarness.deps);
  await offlineController.schedule('online-test');
  assert(offlineHarness.statuses.includes('waiting'), 'offline scheduling retains local work without fetches');
  assert.equal(offlineHarness.timers.length,1, 'offline work receives a bounded retry without another browser hook');
  assert.equal(offlineHarness.timers[0].delay,1000);
  offlineHarness.switchTo(offlineHarness.sessions.b);await offlineHarness.runTimers();
  assert.equal(offlineHarness.selects.length,0, 'an account switch invalidates an offline retry timer');
  const retryHarness=createCoreHarness();
  retryHarness.setOnline(false);
  const retryController=api.createCoreSyncController(retryHarness.deps);
  await retryController.schedule('offline-retry');
  retryHarness.setOnline(true);await retryHarness.runTimers();
  assert.equal(retryHarness.selects.filter(call=>call.name==='liangli_sync_profiles').length,1, 'the bounded offline retry re-enters the shared sync lifecycle once online');

  const clockHarness=createCoreHarness();
  clockHarness.setNow(now+100000);
  const clockController=api.createCoreSyncController(clockHarness.deps);
  await clockController.sync(clockHarness.sessions.a);
  clockHarness.remote.liangli_tasks=[remoteRow({...state.tasks[0],name:'clock-safe',updatedAt:now+1})];
  clockHarness.selects.length=0;
  await clockController.sync(clockHarness.sessions.a);
  const clockPull=clockHarness.selects.find(call=>call.name==='liangli_tasks');
  assert.equal(clockPull.options.clientUpdatedAtOrAfter,0, 'an empty pull does not advance the cursor to the local clock');
  assert.equal(clockHarness.state().tasks[0].name,'clock-safe', 'a server row behind a clock-ahead device is not skipped');

  const boundaryHarness=createCoreHarness();
  const boundaryTime=now+20;
  const firstBoundaryTask={...state.tasks[0],id:uuid6,name:'first boundary',updatedAt:boundaryTime};
  boundaryHarness.remote.liangli_tasks=[remoteRow(firstBoundaryTask)];
  const boundaryController=api.createCoreSyncController(boundaryHarness.deps);
  await boundaryController.sync(boundaryHarness.sessions.a);
  const secondBoundaryTask={...state.tasks[0],id:uuid7,name:'second boundary',updatedAt:boundaryTime};
  boundaryHarness.remote.liangli_tasks.push(remoteRow(secondBoundaryTask));
  boundaryHarness.selects.length=0;
  await boundaryController.sync(boundaryHarness.sessions.a);
  const boundaryPull=boundaryHarness.selects.find(call=>call.name==='liangli_tasks');
  assert.equal(boundaryPull.options.clientUpdatedAtOrAfter,boundaryTime, 'core pulls include their timestamp boundary to avoid equal-millisecond gaps');
  assert.equal(boundaryHarness.state().tasks.filter(item=>item.id===uuid6).length,1, 'inclusive boundary rereads merge idempotently without duplicates');
  assert(boundaryHarness.state().tasks.some(item=>item.id===uuid7), 'a later equal-timestamp row is merged instead of skipped');

  const concurrencyHarness=createCoreHarness();
  concurrencyHarness.deferTable('liangli_sync_profiles');
  const concurrencyController=api.createCoreSyncController(concurrencyHarness.deps);
  const first=concurrencyController.sync(concurrencyHarness.sessions.a);
  const second=concurrencyController.schedule('focus');
  const third=concurrencyController.schedule('online');
  concurrencyHarness.resolveOld(concurrencyHarness.remote.liangli_sync_profiles);
  await Promise.all([first,second,third]);
  assert.equal(concurrencyHarness.selects.filter(call=>call.name==='liangli_sync_profiles').length,1, 'three concurrent triggers share one request pipeline instead of trailing syncs');

  const mutationDuringPullHarness=createCoreHarness();
  mutationDuringPullHarness.deferTable('liangli_tasks');
  const mutationDuringPullController=api.createCoreSyncController(mutationDuringPullHarness.deps);
  const pulling=mutationDuringPullController.sync(mutationDuringPullHarness.sessions.a);
  await new Promise(resolve=>setImmediate(resolve));
  const laterTask={...state.tasks[0],id:uuid6,name:'created while pulling',createdAt:now+30,updatedAt:now+30};
  const laterOp={id:uuid7,type:'task',entityId:laterTask.id,op:'upsert',createdAt:now+30};
  mutationDuringPullHarness.deps.writeScope('user-a',coreState({tasks:[...mutationDuringPullHarness.state().tasks,laterTask],syncOps:[laterOp]}));
  const trailing=mutationDuringPullController.schedule(`mutation:task:${laterTask.id}`);
  mutationDuringPullHarness.resolveOld([]);
  await Promise.all([pulling,trailing]);
  assert.equal(mutationDuringPullHarness.state().tasks.filter(item=>item.id===laterTask.id).length,1,
    'a mutation committed while pull is awaiting survives the remote merge without duplication');
  assert.deepEqual(mutationDuringPullHarness.state().syncOps.map(item=>item.id),[],
    'the trailing pipeline acknowledges the later mutation without a stale pull erasing its queue first');
  assert.equal(mutationDuringPullHarness.selects.filter(call=>call.name==='liangli_sync_profiles').length,2,
    'a mutation:* trigger during an in-flight pull requests exactly one trailing sync pipeline');

  const mutationDuringPushHarness=createCoreHarness();
  const firstPushTask={...state.tasks[0],name:'first push',updatedAt:now+40};
  const firstPushOp={id:uuid6,type:'task',entityId:firstPushTask.id,op:'upsert',createdAt:now+40};
  mutationDuringPushHarness.deps.writeScope('user-a',coreState({tasks:[firstPushTask],syncOps:[firstPushOp]}));
  mutationDuringPushHarness.deferUpsert('liangli_tasks');
  const mutationDuringPushController=api.createCoreSyncController(mutationDuringPushHarness.deps);
  const pushing=mutationDuringPushController.sync(mutationDuringPushHarness.sessions.a);
  await new Promise(resolve=>setImmediate(resolve));
  const laterPushTask={...firstPushTask,name:'edited while pushing',updatedAt:now+41};
  const laterPushOp={id:uuid7,type:'task',entityId:laterPushTask.id,op:'upsert',createdAt:now+41};
  mutationDuringPushHarness.deps.writeScope('user-a',coreState({tasks:[laterPushTask],syncOps:[firstPushOp,laterPushOp]}));
  const pushTrailing=mutationDuringPushController.schedule(`mutation:task:${laterPushTask.id}`);
  mutationDuringPushHarness.resolveUpsert();
  await Promise.all([pushing,pushTrailing]);
  assert.equal(mutationDuringPushHarness.state().tasks.filter(item=>item.id===laterPushTask.id).length,1,
    'a same-entity edit committed during push remains a single LWW entity');
  assert.equal(mutationDuringPushHarness.state().tasks[0].name,'edited while pushing',
    'the push echo and pull cannot replace a later same-entity edit');
  assert.deepEqual(mutationDuringPushHarness.state().syncOps,[],
    'the later same-entity operation is preserved for and acknowledged by the trailing pipeline');
  assert.equal(mutationDuringPushHarness.upserts.filter(call=>call.name==='liangli_tasks').length,2,
    'the initial and later entity versions are each pushed once');
  assert.equal(mutationDuringPushHarness.selects.filter(call=>call.name==='liangli_sync_profiles').length,2,
    'multiple mutation:* triggers coalesce into one trailing pipeline');

  const staleHarness=createCoreHarness();
  staleHarness.deferTable('liangli_tasks');
  const staleController=api.createCoreSyncController(staleHarness.deps);
  const oldRequest=staleController.sync(staleHarness.sessions.a);
  staleHarness.switchTo(staleHarness.sessions.b);
  staleHarness.resolveOld([remoteRow({...state.tasks[0],name:'A'})]);
  await oldRequest;
  assert.equal(staleHarness.activeScope,'user-b');
  assert(!staleHarness.state().tasks.some(item=>item.name==='A'), 'an old account response cannot write the active account scope');
}

async function testFirstLoginAndRecoveryBoundaries(){
  assert.equal(typeof api.prepareDeviceUploadState,'function', 'device upload creates account-owned sync operations before its manifest');
  const capturedDevice=coreState({tasks:[{...state.tasks[0],name:'visible device data'}]});
  const uploadIds=[uuid6,uuid7,uuid8,'99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'];
  const prepared=api.prepareDeviceUploadState(capturedDevice,now+50,()=>uploadIds.shift());
  assert.equal(prepared.syncOps.length,5, 'an upload queues every active or tombstoned core entity before its manifest');
  assert(prepared.syncOps.every(op=>{
    const entity=prepared[({task:'tasks',growth:'growthItems',goal:'goals',focus:'focusSessions',mood:'moodEntries'})[op.type]].find(item=>item.id===op.entityId);
    return op.createdAt===entity.updatedAt;
  }), 'device-upload operation versions derive from each entity updatedAt');
  assert.deepEqual(prepared.tasks,capturedDevice.tasks, 'preparing an account upload does not mutate visible device data');

  const initializedHarness=createCoreHarness();
  const cloudTask={...state.tasks[0],name:'validated cloud data',updatedAt:now+10};
  initializedHarness.remote.liangli_tasks=[remoteRow(cloudTask)];
  const accountPrior=coreState({tasks:[{...state.tasks[0],name:'prior account bytes'}]});
  initializedHarness.deps.writeScope('user-a',accountPrior);
  const initializedController=api.createCoreSyncController(initializedHarness.deps);
  await initializedController.activateCloud(initializedHarness.sessions.a,{recoveryState:capturedDevice});
  assert.deepEqual(initializedHarness.recovery,[capturedDevice], 'validated cloud replacement snapshots the visible device state, not stale account bytes');
  assert.equal(initializedHarness.state().tasks[0].name,'validated cloud data', 'only validated cloud data replaces the account scope');

  const backupFailureHarness=createCoreHarness();
  backupFailureHarness.remote.liangli_tasks=[remoteRow(cloudTask)];
  backupFailureHarness.deps.writeScope('user-a',accountPrior);
  backupFailureHarness.deps.createRecovery=async()=>false;
  const backupFailureController=api.createCoreSyncController(backupFailureHarness.deps);
  await assert.rejects(()=>backupFailureController.activateCloud(backupFailureHarness.sessions.a,{recoveryState:capturedDevice}),/recovery/i);
  assert.equal(backupFailureHarness.state().tasks[0].name,'prior account bytes', 'backup failure leaves the visible state unchanged');

  const invalidCloudHarness=createCoreHarness();
  invalidCloudHarness.remote.liangli_tasks=[{...remoteRow(cloudTask),payload:{...cloudTask,id:'not-a-uuid'}}];
  invalidCloudHarness.deps.writeScope('user-a',accountPrior);
  await assert.rejects(()=>api.createCoreSyncController(invalidCloudHarness.deps).activateCloud(invalidCloudHarness.sessions.a,{recoveryState:capturedDevice}),/invalid cloud/i);
  assert.equal(invalidCloudHarness.recovery.length,0, 'invalid cloud data never creates a misleading recovery transition');
  assert.equal(invalidCloudHarness.state().tasks[0].name,'prior account bytes', 'invalid cloud data cannot overwrite current visible state');

  const uninitializedHarness=createCoreHarness();
  uninitializedHarness.remote.liangli_sync_profiles=[];
  uninitializedHarness.deps.writeScope('user-a',accountPrior);
  const uninitializedController=api.createCoreSyncController(uninitializedHarness.deps);
  assert.deepEqual(await uninitializedController.inspectCloud(uninitializedHarness.sessions.a),{initialized:false}, 'a manifest-free account explicitly presents first-login choices');
  assert.equal(uninitializedHarness.upserts.length,0, 'cancelling the first-login choice performs no cloud write');
  assert.equal(uninitializedHarness.state().tasks[0].name,'prior account bytes', 'cancelling the first-login choice leaves visible data unchanged');
  await uninitializedController.initializeEmpty(uninitializedHarness.sessions.a);
  assert.equal(uninitializedHarness.state().tasks.length,0, 'the confirmed empty choice activates an empty account scope only after initialization');
  assert(uninitializedHarness.remote.liangli_sync_profiles.length===1, 'the confirmed empty choice creates its manifest');

  const recovery=api.serializeCoreRecovery(capturedDevice);
  const parsed=api.parseCoreRecovery(recovery);
  assert.deepEqual(parsed,{...capturedDevice,syncOps:[]}, 'strict recovery restores only validated core modules and clears transport operations');
  assert.throws(()=>api.parseCoreRecovery(JSON.stringify({format:'liangli-core-recovery',version:1,state:{...capturedDevice,syncOps:[],lifeState:{secret:'no'}}})),/invalid/i, 'recovery rejects Life/session-shaped payloads atomically');

  assert.equal(typeof api.createCoreRecoveryStore,'function', 'recovery history is a strict local-only store');
  const records=new Map(),keys=()=>[...records.keys()];
  const storage={get length(){return records.size;},key:index=>keys()[index]??null,getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const recoveryStore=api.createCoreRecoveryStore(storage);
  recoveryStore.save(capturedDevice,'2026-08-10T00:00:00.000Z');
  recoveryStore.save(coreState({tasks:[]}),'2026-08-11T00:00:00.000Z');
  recoveryStore.save(coreState({goals:[]}),'2026-08-12T00:00:00.000Z');
  recoveryStore.save(coreState({moodEntries:[]}),'2026-08-13T00:00:00.000Z');
  const history=recoveryStore.list();
  assert.equal(history.length,3, 'recovery keeps only the newest three local snapshots');
  assert.equal(history[0].createdAt,'2026-08-13T00:00:00.000Z');
  assert.deepEqual(history[0].counts,{tasks:1,growth:1,goals:1,focus:1,mood:0}, 'recovery history exposes entity counts without exposing payload secrets');
  assert.deepEqual(recoveryStore.restore(history[0].key),{...coreState({moodEntries:[]}),syncOps:[]}, 'recovery restore returns strict core state only');
  const beforeInvalid=clone(recoveryStore.restore(history[0].key));
  records.set(history[0].key,'{"version":1,"createdAt":"2026-08-13T00:00:00.000Z","core":"{\\"lifeState\\":{}}"}');
  assert.throws(()=>recoveryStore.restore(history[0].key),/invalid/i, 'invalid recovery is rejected before a caller can mutate local state');
  assert.deepEqual(beforeInvalid,{...coreState({moodEntries:[]}),syncOps:[]});

  const strictStore=api.createCoreRecoveryStore(storage);
  assert.throws(()=>strictStore.save(capturedDevice,'2026-08-13'),/timestamp/i, 'recovery timestamps are canonical UTC ISO strings, not Date.parse-compatible shortcuts');
  records.set('coreRecovery_2026-08-14T00:00:00.000Z',JSON.stringify({version:1,createdAt:'2026-08-13T00:00:00.000Z',core:recovery}));
  assert.equal(strictStore.list().some(entry=>entry.key==='coreRecovery_2026-08-14T00:00:00.000Z'),false, 'a key/payload timestamp mismatch is never listed as restorable');

  const maximumRecoveryRecords=new Map(),maximumRecoveryStorage={get length(){return maximumRecoveryRecords.size;},key:index=>[...maximumRecoveryRecords.keys()][index]??null,getItem:key=>maximumRecoveryRecords.get(key)??null,setItem:(key,value)=>maximumRecoveryRecords.set(key,value),removeItem:key=>maximumRecoveryRecords.delete(key)};
  const maximumRecoveryStore=api.createCoreRecoveryStore(maximumRecoveryStorage);
  assert.equal(maximumRecoveryStore.save(maximumTimestampState,maxTimestampIso),`coreRecovery_${maxTimestampIso}`, 'recovery keys accept the last canonical four-digit UTC timestamp');
  const maximumRecoveryBeforeCollision=new Map(maximumRecoveryRecords);
  assert.throws(()=>maximumRecoveryStore.save(capturedDevice,maxTimestampIso),/collision/i,
    'an exact maximum recovery-key collision fails instead of incrementing into an extended year');
  assert.deepEqual(maximumRecoveryRecords,maximumRecoveryBeforeCollision,
    'a maximum recovery-key collision performs no storage write');
  assert.throws(()=>maximumRecoveryStore.save(capturedDevice,extendedYearTimestampIso),/timestamp/i, 'recovery keys reject an extended-year timestamp');
  assert.throws(()=>maximumRecoveryStore.save(capturedDevice,'0001-01-01T00:00:00.000Z'),/timestamp/i, 'recovery keys reject timestamps before epoch millisecond zero');

  const collisionRecords=new Map(),collisionStorage={get length(){return collisionRecords.size;},key:index=>[...collisionRecords.keys()][index]??null,getItem:key=>collisionRecords.get(key)??null,setItem:(key,value)=>collisionRecords.set(key,value),removeItem:key=>collisionRecords.delete(key)};
  const collisionStore=api.createCoreRecoveryStore(collisionStorage),collisionTime='2026-08-15T00:00:00.000Z';
  const firstKey=collisionStore.save(capturedDevice,collisionTime),secondKey=collisionStore.save(coreState({tasks:[]}),collisionTime);
  assert.notEqual(firstKey,secondKey, 'same-millisecond recovery saves advance to a fresh canonical UTC key instead of overwriting');
  const retentionRecords=new Map(),retentionStorage={get length(){return retentionRecords.size;},key:index=>[...retentionRecords.keys()][index]??null,getItem:key=>retentionRecords.get(key)??null,setItem:(key,value)=>retentionRecords.set(key,value),removeItem(){throw new Error('blocked');}};
  const retentionStore=api.createCoreRecoveryStore(retentionStorage);
  retentionStore.save(capturedDevice,'2026-08-16T00:00:00.000Z');retentionStore.save(capturedDevice,'2026-08-16T00:00:00.001Z');retentionStore.save(capturedDevice,'2026-08-16T00:00:00.002Z');
  assert.equal(retentionStore.list().length,3, 'the controlled storage reaches the retention boundary before removal is tested');
  assert.throws(()=>retentionStore.save(capturedDevice,'2026-08-16T00:00:00.003Z'),/retention/i, 'a failed retention removal reports failure before destructive onboarding can continue');

  const initOrderHarness=createCoreHarness();
  initOrderHarness.remote.liangli_sync_profiles=[];
  initOrderHarness.remote.liangli_tasks=[remoteRow({...state.tasks[0],name:'orphan'})];
  await api.createCoreSyncController(initOrderHarness.deps).initializeEmpty(initOrderHarness.sessions.a);
  assert.equal(initOrderHarness.remote.liangli_tasks.length,0, 'empty initialization clears orphan rows before committing its manifest');
  assert(initOrderHarness.events.indexOf('rpc:initialize_liangli_core_sync')<initOrderHarness.events.indexOf('write:user-a'), 'the RPC cloud commit succeeds before any account-local write');

  const maximumTimestampHarness=createCoreHarness();
  maximumTimestampHarness.remote.liangli_sync_profiles=[];
  await api.createCoreSyncController(maximumTimestampHarness.deps).initializeFromDevice(maximumTimestampHarness.sessions.a,maximumTimestampState);
  assert.equal(maximumTimestampHarness.rpcCalls[0].args.p_tasks[0].deleted_at,maxTimestampIso, 'initializer RPC emits a canonical four-digit UTC deleted_at at the maximum timestamp');

  const failedInitHarness=createCoreHarness();
  failedInitHarness.remote.liangli_sync_profiles=[];
  failedInitHarness.deps.writeScope('user-a',accountPrior);
  failedInitHarness.failRpc=true;
  await assert.rejects(()=>api.createCoreSyncController(failedInitHarness.deps).initializeFromDevice(failedInitHarness.sessions.a,capturedDevice),/initialization/i);
  assert.equal(failedInitHarness.remote.liangli_sync_profiles.length,0, 'an RPC failure leaves a missing-manifest account uninitialized');
  assert.equal(failedInitHarness.state().tasks[0].name,'prior account bytes', 'an RPC failure leaves current visible account bytes unchanged');

  const localWriteFailureHarness=createCoreHarness();
  localWriteFailureHarness.remote.liangli_sync_profiles=[];
  localWriteFailureHarness.deps.writeScope('user-a',accountPrior);
  localWriteFailureHarness.failWrites=1;
  const recoveredWinner=await api.createCoreSyncController(localWriteFailureHarness.deps).initializeFromDevice(localWriteFailureHarness.sessions.a,capturedDevice);
  assert.equal(recoveredWinner.initialized,true, 'a transient local write failure after RPC immediately retries through strict winner activation');
  assert.equal(localWriteFailureHarness.remote.liangli_sync_profiles.length,1, 'a local write failure after RPC leaves a valid initialized cloud winner');
  assert.equal(localWriteFailureHarness.state().tasks[0].name,'visible device data', 'strict winner activation replaces stale account bytes only after validating the committed cloud state');

  const staleInitializerHarness=createCoreHarness();
  const winnerTask={...state.tasks[0],name:'winner data'};
  staleInitializerHarness.remote.liangli_tasks=[remoteRow(winnerTask)];
  const staleResult=await api.createCoreSyncController(staleInitializerHarness.deps).initializeEmpty(staleInitializerHarness.sessions.a);
  assert.equal(staleResult.initialized,true, 'an already-initialized RPC result immediately activates the strict winner');
  assert.equal(staleInitializerHarness.state().tasks[0].name,'winner data', 'a losing initializer activates, rather than deleting, winner data');

  const invalidWinnerHarness=createCoreHarness();
  invalidWinnerHarness.remote.liangli_tasks=[{...remoteRow(winnerTask),payload:{...winnerTask,id:'not-a-uuid'}}];
  invalidWinnerHarness.deps.writeScope('user-a',accountPrior);
  const invalidWinnerController=api.createCoreSyncController(invalidWinnerHarness.deps);
  await assert.rejects(()=>invalidWinnerController.initializeEmpty(invalidWinnerHarness.sessions.a),/invalid cloud/i);
  assert.equal(invalidWinnerHarness.state().tasks[0].name,'prior account bytes', 'an invalid winner keeps current visible bytes unchanged');
  await invalidWinnerController.schedule('mutation');
  assert.equal(invalidWinnerHarness.upserts.length,0, 'an invalid winner remains quarantined and cannot push stale account bytes');

  const obsoleteClearHarness=createCoreHarness();
  obsoleteClearHarness.remote.liangli_sync_profiles=[];obsoleteClearHarness.failRpc=true;
  await assert.rejects(()=>api.createCoreSyncController(obsoleteClearHarness.deps).initializeEmpty(obsoleteClearHarness.sessions.a),/initialization/i);
  assert.equal(obsoleteClearHarness.events.some(event=>event.startsWith('delete:')),false, 'an RPC error never starts a client-side clear');

  const retainedManifestFailureHarness=createCoreHarness();
  retainedManifestFailureHarness.remote.liangli_sync_profiles=[];retainedManifestFailureHarness.failRpc=true;
  await assert.rejects(()=>api.createCoreSyncController(retainedManifestFailureHarness.deps).initializeEmpty(retainedManifestFailureHarness.sessions.a),/initialization/i);
  assert.equal(retainedManifestFailureHarness.remote.liangli_sync_profiles.length,0, 'an RPC transaction failure writes no manifest');

}

async function run(){
  await testReconciliationGate();
  await testAccountClient();
  await testCoreSyncEngine();
  await testFirstLoginAndRecoveryBoundaries();
  console.log('account sync schema, migration, account client, and core sync engine: ok');
}

run().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
