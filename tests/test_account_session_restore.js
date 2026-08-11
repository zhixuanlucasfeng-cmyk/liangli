const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start=script.indexOf('async function activateAccountSession(');
const end=script.indexOf('AccountClient.configure({',start);
assert.notEqual(start,-1,'account session activation coordinator must exist');
assert.notEqual(end,-1,'account session activation coordinator must precede AccountClient configuration');

function makeContext(record){
  const calls=[];
  const state={version:1,tasks:[],growthItems:[],goals:[],focusSessions:[],moodEntries:[],syncOps:[{id:'queued'}]};
  const context={
    console,calls,pendingAccountDeviceState:{old:true},pendingFirstLoginSession:{old:true},accountPanelMessageOverride:'old',
    readCoreScope:scope=>{calls.push(['read',scope]);return record||{status:'valid',state};},
    coreSyncController:{cancel:()=>calls.push(['cancel']),resume:async(session,next)=>{calls.push(['resume',session.user.id,next]);return {restored:true,state:next};}},
    abortAccountReconciliation:()=>calls.push(['abort']),cancelStartEmpty:()=>calls.push(['cancel-empty']),
    activateCoreScope:(scope,next)=>{calls.push(['activate',scope,next]);return record?.status==='invalid'?null:next||state;},
    beginAccountFirstLogin:async session=>calls.push(['first-login',session.user.id]),
    setAccountPanelError:message=>calls.push(['error',message]),setAccountSyncStatus:status=>calls.push(['status',status]),
    renderAccountPanel:()=>calls.push(['render-account']),renderAll:()=>calls.push(['render-all']),
    T:key=>key,ActiveFlashcardStore:{scope:'local'},FlashcardStore:{normalizeScope:value=>value,forScope:value=>({scope:value})},
    updateFlashcardAccountUI:session=>calls.push(['flash-ui',session?.user?.id||null]),resetFlashcardScopeUI:()=>calls.push(['flash-reset']),
  };
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(`${script.slice(start,end)};globalThis.activateAccountSession=activateAccountSession;globalThis.handleAccountSessionChange=handleAccountSessionChange;`,context);
  return {context,calls,state};
}

(async()=>{
  const session={access_token:'token',user:{id:'returning-user'}};
  const validState={version:1,tasks:[],growthItems:[],goals:[],focusSessions:[],moodEntries:[],syncOps:[{id:'durable-op'}]};
  const valid=makeContext({status:'valid',state:validState});
  await valid.context.handleAccountSessionChange(session);
  assert(valid.calls.some(call=>call[0]==='resume'&&call[2]===validState),'a strict returning account scope and its durable queue resume immediately');
  assert(!valid.calls.some(call=>call[0]==='first-login'),'a returning account never enters first-login cloud reconciliation');

  const missing=makeContext({status:'missing',state:null});
  await missing.context.handleAccountSessionChange(session);
  assert(missing.calls.some(call=>call[0]==='first-login'),'only a genuinely missing account scope enters first-login choices');
  assert(!missing.calls.some(call=>call[0]==='resume'),'a missing account scope is not fabricated as restored state');

  const invalid=makeContext({status:'invalid',state:null});
  await invalid.context.handleAccountSessionChange(session);
  assert(invalid.calls.some(call=>call[0]==='activate'&&call[1]==='returning-user'),'invalid canonical account bytes activate the fail-closed empty view');
  assert(!invalid.calls.some(call=>call[0]==='first-login'||call[0]==='resume'),'invalid canonical bytes remain quarantined instead of becoming first login');

  const signedOut=makeContext({status:'valid',state:validState});
  await signedOut.context.handleAccountSessionChange(null);
  assert(signedOut.calls.some(call=>call[0]==='activate'&&call[1]==='local'),'sign-out returns to the anonymous local scope');
  assert(!signedOut.calls.some(call=>call[0]==='first-login'||call[0]==='resume'),'sign-out never starts account reconciliation');
  console.log('account session restore behavior: ok');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
