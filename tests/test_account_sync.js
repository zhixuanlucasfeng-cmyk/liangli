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
  const mutableAllowlist=['liangli_tasks'];
  const snapshottedClient=api.createOwnerRestClient(session,AccountClient.generation,mutableAllowlist);
  mutableAllowlist[0]='liangli_expenses';mutableAllowlist.push('liangli_mood_entries');
  assert.doesNotThrow(()=>snapshottedClient.table('liangli_tasks'), 'the table allowlist is copied when the owner client is created');
  assert.throws(()=>snapshottedClient.table('liangli_expenses'),/not allowed/i, 'later allowlist mutations cannot expand or reduce the client snapshot');
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
  rejectOldRefresh(new Error('old refresh rejected'));
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
function remoteRow(entity){
  return {id:entity.id,user_id:'user-a',payload:clone(entity),client_updated_at:entity.updatedAt,deleted_at:entity.deletedAt};
}
function createCoreHarness(){
  let generation=1,online=true,hold=null,currentSession;
  const sessions={a:{access_token:'a',user:{id:'user-a'}},b:{access_token:'b',user:{id:'user-b'}}};
  const scopes=new Map([['user-a',coreState()],['user-b',coreState({tasks:[],growthItems:[],goals:[],focusSessions:[],moodEntries:[]})]]);
  const remote={
    liangli_sync_profiles:[{user_id:'user-a',core_version:1,initialized_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:00.000Z'}],
    liangli_tasks:[],liangli_growth_items:[],liangli_goals:[],liangli_focus_sessions:[],liangli_mood_entries:[],
  };
  const statuses=[],writes=[],recovery=[];
  const tableFor={task:'liangli_tasks',growth:'liangli_growth_items',goal:'liangli_goals',focus:'liangli_focus_sessions',mood:'liangli_mood_entries'};
  currentSession=sessions.a;
  const harness={activeScope:'user-a',sessions,remote,statuses,writes,recovery,failTables:new Set(),tableFor,
    state(){return scopes.get(this.activeScope);},
    switchTo(session){generation++;currentSession=session;this.activeScope=session.user.id;},
    resolveOld(rows){hold.resolve(rows);hold=null;},
    deferTable(table){let resolve;const promise=new Promise(done=>{resolve=done;});hold={table,promise,resolve:rows=>resolve({data:rows,error:null})};},
  };
  harness.deps={
    readScope:scope=>clone(scopes.get(scope)||null),
    writeScope:(scope,next)=>{writes.push({scope,state:clone(next)});if(scope!==harness.activeScope)return false;scopes.set(scope,clone(next));return true;},
    createRecovery:async next=>{recovery.push(clone(next));return true;},
    restClient:()=>({table(name){return {
      select:async()=>{if(hold&&hold.table===name)return await hold.promise;return {data:clone(remote[name]||[]),error:null};},
      upsert:async rows=>{
        if(harness.failTables.has(name))return {data:null,error:true,status:503};
        const existing=remote[name]||[];
        const echoes=rows.map(row=>{
          const index=existing.findIndex(item=>(item.id||item.user_id)===(row.id||row.user_id));
          if(index>=0&&Number(existing[index].client_updated_at||0)>Number(row.client_updated_at||0))return clone(existing[index]);
          if(index>=0)existing[index]=clone(row);else existing.push(clone(row));
          return clone(row);
        });
        return {data:echoes,error:null};
      },
    };}}),
    getGeneration:()=>generation,getSession:()=>currentSession,now:()=>now,onStatus:status=>statuses.push(status),onActivate:(scope,next)=>{harness.activeScope=scope;scopes.set(scope,clone(next));},
    isOnline:()=>online,setTimeout:()=>0,clearTimeout:()=>{},
  };
  harness.setOnline=value=>{online=value;};
  return harness;
}

async function testCoreSyncEngine(){
  assert.equal(typeof api.createCoreSyncController,'function', 'core controller is available to coordinate manifest, queue, and account boundaries');
  assert.equal(typeof api.mergeCoreEntity,'function');
  assert.equal(typeof api.coalesceCoreOps,'function');

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
  manifestHarness.remote.liangli_sync_profiles=[{user_id:'user-a',core_version:1,initialized_at:'x',updated_at:'x'}];
  manifestHarness.remote.liangli_tasks=[{id:'not-a-uuid'}];
  await assert.rejects(()=>manifestController.activateCloud(manifestHarness.sessions.a),/invalid cloud/i, 'one malformed core row rejects the whole activation');

  const queueHarness=createCoreHarness();
  const queued=coreState({syncOps:[
    {...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now},
    {id:uuid8,type:'growth',entityId:uuid2,op:'upsert',createdAt:now+1},
  ]});
  queueHarness.deps.writeScope('user-a',queued);queueHarness.failTables.add('liangli_growth_items');
  const queueController=api.createCoreSyncController(queueHarness.deps);
  await queueController.sync(queueHarness.sessions.a);
  assert.deepEqual(queueHarness.state().syncOps.map(item=>item.id),[uuid8], 'only failed batches remain queued for retry');

  const echoHarness=createCoreHarness();
  const clientTask={...state.tasks[0],name:'client',updatedAt:now+5};
  const serverTask={...state.tasks[0],name:'server',updatedAt:now+10};
  echoHarness.remote.liangli_tasks=[remoteRow(serverTask)];
  echoHarness.deps.writeScope('user-a',coreState({tasks:[clientTask],syncOps:[{...state.syncOps[0],id:uuid7,type:'task',entityId:uuid,op:'upsert',createdAt:now+5}]}));
  await api.createCoreSyncController(echoHarness.deps).sync(echoHarness.sessions.a);
  assert.equal(echoHarness.state().tasks[0].name,'server', 'a stale upsert echo forces a pull instead of accepting the local value');

  const offlineHarness=createCoreHarness();
  offlineHarness.setOnline(false);
  const offlineController=api.createCoreSyncController(offlineHarness.deps);
  await offlineController.schedule('online-test');
  assert(offlineHarness.statuses.includes('waiting'), 'offline scheduling retains local work without fetches');

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

async function run(){
  await testAccountClient();
  await testCoreSyncEngine();
  console.log('account sync schema, migration, account client, and core sync engine: ok');
}

run().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});
