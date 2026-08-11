const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../account-sync.js');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace('let coreSyncController=null;', 'let coreSyncController=globalThis.__coreSyncController||null;');
const coreStart = script.indexOf('const DB={');
const coreEnd = script.indexOf('function normalizeTask', coreStart);
assert.notEqual(coreStart, -1);
assert.notEqual(coreEnd, -1);

const bytes = new Map();
let rejectCoreWrites = false;
const localStorage = {
  getItem(key) { return bytes.has(key) ? bytes.get(key) : null; },
  setItem(key, value) {
    if(rejectCoreWrites && key.startsWith('ll_coreState_'))throw new Error('core write rejected');
    bytes.set(key, String(value));
  },
};
const coreSchedules = [], flashSchedules = [], renders = [];
const bridge = {...api, normalizeCoreState:raw=>{
  const normalized = api.normalizeCoreState(JSON.parse(JSON.stringify(raw)));
  return normalized && JSON.parse(JSON.stringify(normalized));
}};
const elements = new Map();
function element(id) {
  if(!elements.has(id))elements.set(id, {id, value:'', hidden:false, textContent:'', innerHTML:'', style:{}});
  return elements.get(id);
}
const context = {
  Date, console, localStorage, LiangliAccountSync:bridge, crypto:{}, currentDayKey:'2026-08-10',
  AccountClient:{generation:1,session:{user:{id:'create-user'}}},
  __coreSyncController:{schedule:reason=>coreSchedules.push(reason)},
  document:{getElementById:element}, confirm:()=>true, lang:'en',
  queueFlashcardSync:()=>flashSchedules.push('flash'), renderTasks:()=>renders.push('tasks'),
  renderDecks:async()=>{renders.push('decks');}, selectDeck:async()=>{renders.push('select');},
  toast:()=>{}, renderAll:()=>renders.push('all'), T:key=>key,
};
context.globalThis = context;
context.S = {tasks:[],ideas:[],goals:[],logs:[],focusSessions:[],focusMin:0,pomo:0,week:[0,0,0,0,0,0,0]};
bridge.createCoreSyncController = () => context.__coreSyncController;
vm.createContext(context);
vm.runInContext(`${script.slice(coreStart, coreEnd)}\n;globalThis.core={activateCoreScope,commitCoreMutation,activeCoreItems};`, context);

const createStart = script.indexOf('async function createDeck');
const createEnd = script.indexOf('async function selectDeck', createStart);
const deleteStart = script.indexOf('async function deleteFlashcardDeck');
const deleteEnd = script.indexOf('async function startReview', deleteStart);
const rolloverStart = script.indexOf('function rolloverIfNeeded');
const rolloverEnd = script.indexOf('let rolloverTimer', rolloverStart);
assert.notEqual(createStart, -1);assert.notEqual(createEnd, -1);
assert.notEqual(deleteStart, -1);assert.notEqual(deleteEnd, -1);
assert.notEqual(rolloverStart, -1);assert.notEqual(rolloverEnd, -1);
vm.runInContext(`${script.slice(createStart, createEnd)}\n${script.slice(deleteStart, deleteEnd)}\n${script.slice(rolloverStart, rolloverEnd)}\n;globalThis.actions={createDeck,deleteFlashcardDeck,rolloverIfNeeded};`, context);

function coreState(name, dayKey='2026-08-10') {
  const state = api.migrateLegacyCoreState({tasks:[{id:1,name,energy:25,done:false,dayKey,helper:'flashcards'}]}, 1700000005000, dayKey);
  state.tasks[0] = {...state.tasks[0],helper:'flashcards',helperRef:null,helperRefs:{}};
  return state;
}
function put(scope, state) { bytes.set(`ll_${api.coreStorageKey(scope)}`, JSON.stringify(state)); }
function taskFor(scope) { return context.core.activateCoreScope(scope).tasks[0]; }

function createStore(scope) {
  const decks = new Map(), stagedDeletes = new Map(), syncOps = [];
  return {
    scope, decks, stagedDeletes, syncOps, failPut:false, failDelete:false, failFinalize:false,
    finalizeStarted:null, releaseFinalize:null,
    deferFinalize(){
      let started,release;
      this.finalizeStarted=new Promise(resolve=>{started=resolve;});
      this.releaseFinalize=()=>release();
      this._finalizeGate=new Promise(resolve=>{release=resolve;});
      this._notifyFinalize=started;
    },
    async putDeck(deck, {sync=true}={}) {
      if(this.failPut)throw new Error('flash write rejected');
      decks.set(deck.id, {...deck});if(sync)syncOps.push(`put:${deck.id}`);
    },
    async deleteDeck(deckId, {sync=true}={}) {
      if(this.failDelete)throw new Error('flash delete rejected');
      const deck=decks.get(deckId);if(!deck)return;
      const updatedAt=deck.updatedAt+1,deleted={...deck,deletedAt:updatedAt,updatedAt};
      decks.delete(deckId);stagedDeletes.set(deckId,deleted);if(sync)syncOps.push(`delete:${deckId}`);
      return {deck:deleted,cards:[]};
    },
    async snapshotDeck(deckId) { return decks.has(deckId)?{deck:{...decks.get(deckId)}}:null; },
    async restoreDeckSnapshot(snapshot) { if(snapshot?.deck){stagedDeletes.delete(snapshot.deck.id);decks.set(snapshot.deck.id,{...snapshot.deck});} },
    async discardNewDeck(deckId) { decks.delete(deckId); },
    async discardNewDeckIfCurrent(deck) {
      if(JSON.stringify(decks.get(deck.id))!==JSON.stringify(deck))return false;
      decks.delete(deck.id);return true;
    },
    async restoreDeckSnapshotIfCurrent(snapshot,deleted) {
      if(JSON.stringify(stagedDeletes.get(snapshot.deck.id))!==JSON.stringify(deleted?.deck))return false;
      stagedDeletes.delete(snapshot.deck.id);decks.set(snapshot.deck.id,{...snapshot.deck});return true;
    },
    async finalizeDeckMutation(ops) {
      if(this._finalizeGate){this._notifyFinalize();await this._finalizeGate;this._finalizeGate=null;}
      if(this.failFinalize)throw new Error('flash queue rejected');
      ops.forEach(op=>syncOps.push(`${op.type}:${op.entityId}`));
    },
  };
}

async function run() {
  const createScope = 'create-user', createState = coreState('Create link');
  put(createScope, createState);
  const createdStore = createStore(createScope);
  context.ActiveFlashcardStore = createdStore;
  context.flashcardState = {activeDeckId:null};
  context.activeTaskId = taskFor(createScope).id;
  context.taskFlashcardRef = task=>task.helperRefs?.[createScope]||task.helperRef||null;
  context.flashId = ()=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  element('deckName').value = 'Linked deck';
  const createBefore = bytes.get(`ll_${api.coreStorageKey(createScope)}`), createView = JSON.stringify(context.S);
  rejectCoreWrites = true;
  await assert.doesNotReject(context.actions.createDeck(), 'a rejected canonical write is handled by the concrete create-deck flow');
  rejectCoreWrites = false;
  assert.equal(createdStore.decks.size, 0, 'create-deck rolls back its staged deck when canonical linking fails');
  assert.equal(createdStore.syncOps.length, 0, 'create-deck leaves the Flashcard queue untouched when canonical linking fails');
  assert.equal(flashSchedules.length, 0, 'create-deck does not schedule Flashcard sync before both commits succeed');
  assert.equal(coreSchedules.length, 0, 'failed canonical linking does not schedule core sync');
  assert.equal(bytes.get(`ll_${api.coreStorageKey(createScope)}`), createBefore, 'failed linking keeps canonical bytes unchanged');
  assert.equal(JSON.stringify(context.S), createView, 'failed linking keeps the task view unchanged');

  createdStore.failPut = true;
  await assert.doesNotReject(context.actions.createDeck(), 'a rejected Flashcard write is handled by the concrete create-deck flow');
  createdStore.failPut = false;
  assert.equal(createdStore.decks.size, 0, 'a rejected Flashcard write creates no deck');
  assert.equal(bytes.get(`ll_${api.coreStorageKey(createScope)}`), createBefore, 'a rejected Flashcard write never changes the task reference');
  assert.equal(flashSchedules.length, 0, 'a rejected Flashcard write never schedules sync');

  const finalizeScope = 'finalize-user', finalizeState = coreState('Finalize link');
  put(finalizeScope, finalizeState);
  const finalizingStore = createStore(finalizeScope);
  finalizingStore.failFinalize = true;
  context.ActiveFlashcardStore = finalizingStore;
  context.activeTaskId = taskFor(finalizeScope).id;
  context.taskFlashcardRef = task=>task.helperRefs?.[finalizeScope]||task.helperRef||null;
  const finalizeBefore = bytes.get(`ll_${api.coreStorageKey(finalizeScope)}`), finalizeView = JSON.stringify(context.S);
  await assert.doesNotReject(context.actions.createDeck(), 'a rejected Flashcard queue finalization is handled after the core stage');
  assert.equal(finalizingStore.decks.size, 0, 'a failed Flashcard finalization compensates the staged deck after core commit');
  assert.equal(finalizingStore.syncOps.length, 0, 'a failed Flashcard finalization leaves its durable queue unchanged');
  assert.equal(bytes.get(`ll_${api.coreStorageKey(finalizeScope)}`), finalizeBefore, 'a failed Flashcard finalization compensates the task link');
  assert.equal(JSON.stringify(context.S), finalizeView, 'a failed Flashcard finalization restores the task view');

  context.ActiveFlashcardStore = createdStore;
  context.activeTaskId = taskFor(createScope).id;
  context.taskFlashcardRef = task=>task.helperRefs?.[createScope]||task.helperRef||null;
  await context.actions.createDeck();
  const linkedTask = context.core.activeCoreItems('task')[0];
  assert.equal(createdStore.decks.size, 1, 'successful create-deck persists the deck');
  assert.equal(linkedTask.helperRefs[createScope], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'successful create-deck links the task');
  assert.equal(flashSchedules.length, 1, 'successful create-deck schedules Flashcard sync after the linked commit');
  assert.equal(coreSchedules.length, 1, 'successful create-deck schedules core sync once');

  const deleteScope = 'delete-user', deleteState = coreState('Delete link');
  const deckId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  deleteState.tasks[0] = {...deleteState.tasks[0],helperRefs:{[deleteScope]:deckId}};
  put(deleteScope, deleteState);
  const deleteStore = createStore(deleteScope);
  deleteStore.decks.set(deckId, {id:deckId,name:'Existing',createdAt:1,updatedAt:1});
  context.ActiveFlashcardStore = deleteStore;
  context.activeTaskId = taskFor(deleteScope).id;
  context.taskFlashcardRef = task=>task.helperRefs?.[deleteScope]||null;
  const deleteBefore = bytes.get(`ll_${api.coreStorageKey(deleteScope)}`), deleteView = JSON.stringify(context.S);
  rejectCoreWrites = true;
  await assert.doesNotReject(context.actions.deleteFlashcardDeck(deckId), 'a rejected canonical unlink is handled by the concrete delete-deck flow');
  rejectCoreWrites = false;
  assert.equal(deleteStore.decks.has(deckId), true, 'delete-deck restores its staged deletion when canonical unlinking fails');
  assert.equal(deleteStore.syncOps.length, 0, 'delete-deck leaves the Flashcard queue unchanged when unlinking fails');
  assert.equal(bytes.get(`ll_${api.coreStorageKey(deleteScope)}`), deleteBefore, 'failed unlinking keeps canonical bytes unchanged');
  assert.equal(JSON.stringify(context.S), deleteView, 'failed unlinking keeps the task reference visible and unchanged');

  const deleteFlashSchedules = flashSchedules.length, deleteCoreSchedules = coreSchedules.length;
  await context.actions.deleteFlashcardDeck(deckId);
  assert.equal(deleteStore.decks.has(deckId), false, 'successful delete-deck removes the linked deck after the core unlink');
  assert.equal(context.core.activeCoreItems('task')[0].helperRefs[deleteScope], undefined, 'successful delete-deck unlinks the task');
  assert.deepEqual(deleteStore.syncOps, [`delete-deck:${deckId}`], 'successful delete-deck commits its durable Flashcard queue only after unlinking');
  assert.equal(flashSchedules.length, deleteFlashSchedules+1, 'successful delete-deck schedules Flashcard sync after both commits');
  assert.equal(coreSchedules.length, deleteCoreSchedules+1, 'successful delete-deck schedules core sync after both commits');

  const rolloverScope = 'rollover-user', rolloverState = coreState('Retry rollover', '2026-08-09');
  rolloverState.tasks[0] = {...rolloverState.tasks[0],helper:'none'};
  put(rolloverScope, rolloverState);
  taskFor(rolloverScope);
  context.currentDayKey = '2026-08-10';
  context.localDayKey = ()=>'2026-08-11';
  const rolloverBefore = bytes.get(`ll_${api.coreStorageKey(rolloverScope)}`);
  rejectCoreWrites = true;
  assert.equal(context.actions.rolloverIfNeeded(false), false, 'failed rollover rejects the canonical batch');
  rejectCoreWrites = false;
  assert.equal(context.currentDayKey, '2026-08-10', 'failed rollover retains the previous day for retry');
  assert.equal(bytes.get(`ll_${api.coreStorageKey(rolloverScope)}`), rolloverBefore, 'failed rollover leaves canonical bytes unchanged');
  assert.equal(context.actions.rolloverIfNeeded(false), true, 'a retry persists the rollover batch');
  assert.equal(context.currentDayKey, '2026-08-11', 'successful rollover advances the day only after commit');
  assert.equal(context.core.activeCoreItems('growth').filter(item=>item.rolloverSourceId===rolloverState.tasks[0].id).length, 1,
    'a successful retry creates one growth item');
  assert.equal(context.actions.rolloverIfNeeded(false), false, 'the next call does not duplicate rollover growth');

  async function switchDuringCreate({failFinalize}) {
    const aScope=failFinalize?'race-failure-a':'race-success-a',bScope=failFinalize?'race-failure-b':'race-success-b';
    put(aScope,coreState('Account A'));
    put(bScope,coreState('Account B'));
    const aStore=createStore(aScope),bStore=createStore(bScope);
    context.AccountClient={generation:100,session:{user:{id:aScope}}};
    context.ActiveFlashcardStore=aStore;
    context.activeTaskId=taskFor(aScope).id;
    context.taskFlashcardRef=task=>task.helperRefs?.[aScope]||task.helperRef||null;
    element('deckName').value='Delayed linked deck';
    aStore.deferFinalize();
    const aBefore=bytes.get(`ll_${api.coreStorageKey(aScope)}`);
    const pending=context.actions.createDeck();
    await aStore.finalizeStarted;
    context.AccountClient={generation:101,session:{user:{id:bScope}}};
    context.ActiveFlashcardStore=bStore;
    context.activeTaskId=taskFor(bScope).id;
    context.taskFlashcardRef=task=>task.helperRefs?.[bScope]||task.helperRef||null;
    const bBefore=bytes.get(`ll_${api.coreStorageKey(bScope)}`),bView=JSON.stringify(context.S);
    const coreBefore=coreSchedules.length,flashBefore=flashSchedules.length,renderBefore=renders.length;
    aStore.failFinalize=failFinalize;
    aStore.releaseFinalize();
    await assert.doesNotReject(pending, 'a delayed finalization is contained after an account switch');
    assert.equal(bytes.get(`ll_${api.coreStorageKey(bScope)}`),bBefore,'an old transaction never writes account B canonical bytes');
    assert.equal(JSON.stringify(context.S),bView,'an old transaction never mutates account B view state');
    assert.equal(coreSchedules.length,coreBefore,'an old transaction never schedules account B core sync');
    assert.equal(flashSchedules.length,flashBefore,'an old transaction never schedules account B Flashcard sync');
    assert.equal(renders.length,renderBefore,'an old transaction never renders account B');
    if(failFinalize){
      assert.equal(bytes.get(`ll_${api.coreStorageKey(aScope)}`),aBefore,'a failed old transaction conditionally restores only account A');
      assert.equal(aStore.decks.size,0,'a failed old transaction removes its staged A deck without a dangling task reference');
      assert.equal(aStore.syncOps.length,0,'a failed old transaction leaves account A Flashcard queue unchanged');
    }else{
      const aState=JSON.parse(bytes.get(`ll_${api.coreStorageKey(aScope)}`));
      assert.equal(aStore.decks.size,1,'a successful old transaction remains durable in account A store');
      assert.equal(aState.tasks[0].helperRefs[aScope],'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a successful old transaction remains linked only in account A');
      assert.equal(aStore.syncOps.length,1,'a successful old transaction retains account A durable Flashcard queue');
    }
  }
  await switchDuringCreate({failFinalize:false});
  await switchDuringCreate({failFinalize:true});

  async function switchDuringDelete({failFinalize}) {
    const aScope=failFinalize?'race-delete-failure-a':'race-delete-success-a',bScope=failFinalize?'race-delete-failure-b':'race-delete-success-b';
    const deckId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',aState=coreState('Delete A'),bState=coreState('Delete B');
    aState.tasks[0]={...aState.tasks[0],helperRefs:{[aScope]:deckId}};
    put(aScope,aState);put(bScope,bState);
    const aStore=createStore(aScope),bStore=createStore(bScope);
    aStore.decks.set(deckId,{id:deckId,name:'A deck',createdAt:1,updatedAt:1});
    context.AccountClient={generation:200,session:{user:{id:aScope}}};
    context.ActiveFlashcardStore=aStore;
    context.activeTaskId=taskFor(aScope).id;
    context.taskFlashcardRef=task=>task.helperRefs?.[aScope]||null;
    aStore.deferFinalize();
    const aBefore=bytes.get(`ll_${api.coreStorageKey(aScope)}`),pending=context.actions.deleteFlashcardDeck(deckId);
    await aStore.finalizeStarted;
    context.AccountClient={generation:201,session:{user:{id:bScope}}};
    context.ActiveFlashcardStore=bStore;
    context.activeTaskId=taskFor(bScope).id;
    context.taskFlashcardRef=task=>task.helperRefs?.[bScope]||null;
    const bBefore=bytes.get(`ll_${api.coreStorageKey(bScope)}`),bView=JSON.stringify(context.S);
    const coreBefore=coreSchedules.length,flashBefore=flashSchedules.length,renderBefore=renders.length;
    aStore.failFinalize=failFinalize;aStore.releaseFinalize();
    await assert.doesNotReject(pending, 'a delayed delete finalization is contained after an account switch');
    assert.equal(bytes.get(`ll_${api.coreStorageKey(bScope)}`),bBefore,'an old delete transaction never writes account B canonical bytes');
    assert.equal(JSON.stringify(context.S),bView,'an old delete transaction never mutates account B view state');
    assert.equal(coreSchedules.length,coreBefore,'an old delete transaction never schedules account B core sync');
    assert.equal(flashSchedules.length,flashBefore,'an old delete transaction never schedules account B Flashcard sync');
    assert.equal(renders.length,renderBefore,'an old delete transaction never renders account B');
    if(failFinalize){
      assert.equal(bytes.get(`ll_${api.coreStorageKey(aScope)}`),aBefore,'a failed old delete transaction conditionally restores only account A');
      assert.equal(aStore.decks.has(deckId),true,'a failed old delete transaction restores the A deck and avoids a dangling task reference');
      assert.equal(aStore.syncOps.length,0,'a failed old delete transaction leaves account A Flashcard queue unchanged');
    }else{
      const aAfter=JSON.parse(bytes.get(`ll_${api.coreStorageKey(aScope)}`));
      assert.equal(aStore.decks.has(deckId),false,'a successful old delete transaction remains durable in account A store');
      assert.equal(aAfter.tasks[0].helperRefs[aScope],undefined,'a successful old delete transaction unlinks only account A');
      assert.equal(aStore.syncOps.length,1,'a successful old delete transaction retains account A durable Flashcard queue');
    }
  }
  await switchDuringDelete({failFinalize:false});
  await switchDuringDelete({failFinalize:true});

  const generationScope='race-generation-user';
  put(generationScope,coreState('Generation A'));
  const generationStoreA=createStore(generationScope),generationStoreB=createStore(generationScope);
  context.AccountClient={generation:300,session:{user:{id:generationScope}}};
  context.ActiveFlashcardStore=generationStoreA;
  context.activeTaskId=taskFor(generationScope).id;
  context.taskFlashcardRef=task=>task.helperRefs?.[generationScope]||task.helperRef||null;
  element('deckName').value='Generation linked deck';
  generationStoreA.deferFinalize();
  const generationPending=context.actions.createDeck();
  await generationStoreA.finalizeStarted;
  context.AccountClient={generation:301,session:{user:{id:generationScope}}};
  context.ActiveFlashcardStore=generationStoreB;
  context.activeTaskId=taskFor(generationScope).id;
  context.taskFlashcardRef=task=>task.helperRefs?.[generationScope]||task.helperRef||null;
  const generationView=JSON.stringify(context.S),generationCoreBefore=coreSchedules.length,generationFlashBefore=flashSchedules.length,generationRenderBefore=renders.length;
  generationStoreA.releaseFinalize();
  await generationPending;
  assert.equal(JSON.stringify(context.S),generationView,'a same-user new generation is not re-rendered by the old transaction');
  assert.equal(coreSchedules.length,generationCoreBefore,'a same-user new generation is not scheduled by the old transaction');
  assert.equal(flashSchedules.length,generationFlashBefore,'a same-user new generation does not receive old Flashcard scheduling');
  assert.equal(renders.length,generationRenderBefore,'a same-user new generation receives no old render');
  assert.equal(generationStoreA.syncOps.length,1,'the old generation retains its durable Flashcard queue');
  assert.equal(generationStoreB.syncOps.length,0,'the new generation store remains untouched by old work');
}

run().then(()=>console.log('core Flashcard transaction behavior: ok')).catch(error=>{console.error(error);process.exitCode=1;});
