const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../account-sync.js');

const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start=script.indexOf('let flashcardSyncAttempt=');
const end=script.indexOf("document.addEventListener('keydown'",start);
assert.notEqual(start,-1,'Flashcard retry state must exist');
assert.notEqual(end,-1,'Flashcard sync function must precede overlay keyboard handling');

function makeContext(){
  const calls=[];
  const context={
    AccountClient:api.AccountClient,navigator:{onLine:true},calls,
    scheduleCoreSync:reason=>calls.push(['core',reason]),
    setFlashcardSyncStatus:status=>calls.push(['status',status]),
    syncFlashcards:async()=>{throw new Error('syncFlashcards must not run when preflight refresh fails');},
    renderDecks:async()=>{},renderFlashcards:async()=>{},
    flashcardState:{activeDeckId:null},ActiveFlashcardStore:{},
    setTimeout:(callback,delay)=>{calls.push(['retry',delay]);return {callback};},
    clearTimeout:()=>{},queueMicrotask:callback=>calls.push(['microtask',callback]),
  };
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(`${script.slice(start,end)};globalThis.manualFlashcardSync=manualFlashcardSync;`,context);
  return context;
}

(async()=>{
  const AccountClient=api.AccountClient;
  const stored={};
  const transitions=[];
  const configure=fetch=>AccountClient.configure({
    url:'https://project.supabase.co',anonKey:'a'.repeat(41),fetch,
    getStoredSession:()=>stored.session||null,setStoredSession:value=>{stored.session=value;},
    onSessionChange:session=>transitions.push(session?.user?.id||null),
  });

  const transient={access_token:'transient-token',refresh_token:'transient-refresh',expires_at:1,user:{id:'transient-user'}};
  stored.session=transient;AccountClient.session=transient;AccountClient.generation=70;AccountClient.refreshPromise=null;
  configure(async()=>({ok:false,status:503,json:async()=>({error:'temporarily_unavailable'})}));
  const transientContext=makeContext();
  await transientContext.manualFlashcardSync();
  assert.equal(AccountClient.session.user.id,'transient-user','Flashcard preflight retains the active account on auth 5xx');
  assert.equal(stored.session.user.id,'transient-user','Flashcard preflight retains the durable account on auth 5xx');
  assert.deepEqual(transitions,[],'Flashcard preflight auth 5xx emits no sign-out');
  assert(transientContext.calls.some(call=>call[0]==='retry'),'Flashcard preflight schedules a retry after auth 5xx');

  transitions.length=0;
  const rejected={access_token:'rejected-token',refresh_token:'rejected-refresh',expires_at:1,user:{id:'rejected-user'}};
  stored.session=rejected;AccountClient.session=rejected;AccountClient.generation=75;AccountClient.refreshPromise=null;
  configure(async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant'})}));
  const rejectedContext=makeContext();
  await rejectedContext.manualFlashcardSync();
  assert.equal(AccountClient.session,null,'Flashcard preflight clears the active account after definitive refresh rejection');
  assert.equal(stored.session,null,'Flashcard preflight clears the durable account after definitive refresh rejection');
  assert.deepEqual(transitions,[null],'Flashcard preflight emits one sign-out after definitive refresh rejection');
  assert(!rejectedContext.calls.some(call=>call[0]==='retry'),'Flashcard preflight does not retry rejected credentials');

  console.log('flashcard refresh failure behavior: ok');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
