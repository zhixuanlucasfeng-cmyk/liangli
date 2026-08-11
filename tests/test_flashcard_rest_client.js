const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../account-sync.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function createFlashcardRestClient(');
const end = script.indexOf('AccountClient.configure({', start);
assert.notEqual(start, -1, 'Flashcard compatibility client must exist');
assert.notEqual(end, -1, 'Flashcard client must delegate before UI configuration');

const AccountClient=api.AccountClient;
const requests=[];
let responder=async (_url,options)=>({ok:true,status:options.method==='GET'?200:201,json:async()=>[]});
AccountClient.configure({url:'https://project.supabase.co',anonKey:'public-anon-key'.padEnd(41,'x'),fetch:async(url,options)=>{
  requests.push({url,options});
  return await responder(url,options);
}});
const context={AccountClient,LiangliAccountSync:api};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)};globalThis.make=createFlashcardRestClient;`,context);

(async()=>{
  const session={access_token:'user-token',user:{id:'u1'}};
  AccountClient.session=session;AccountClient.generation=7;AccountClient.authInvalid=false;AccountClient.authorizationBlocked=false;
  const client=context.make(session);
  await client.from('flashcard_decks').select('*');
  assert.equal(requests[0].url,'https://project.supabase.co/rest/v1/flashcard_decks?select=*');
  assert.equal(requests[0].options.headers.Authorization,'Bearer user-token');

  await client.from('flashcard_reviews').upsert([{id:'r'}],{onConflict:'id',ignoreDuplicates:true});
  assert.match(requests[1].options.headers.Prefer,/ignore-duplicates/);

  await client.from('flashcards').update({deleted_at:'now'}).eq('id','c').lte('client_updated_at',9);
  assert.match(requests[2].url,/id=eq\.c/);
  assert.match(requests[2].url,/client_updated_at=lte\.9/);
  assert.throws(()=>client.from('tasks'),/not allowed/i);

  const pageRequests=[];
  responder=async(_url,options)=>{
    pageRequests.push(options.headers.Range);
    const first=options.headers.Range==='0-999';
    return {ok:true,status:200,json:async()=>first?Array.from({length:1000},(_,id)=>({id})):[{id:1000}]};
  };
  const paged=await context.make(session).from('flashcards').select('*');
  assert.equal(paged.data.length,1001);
  assert.deepEqual(pageRequests,['0-999','1000-1999']);

  AccountClient.session={access_token:'bad',user:{id:'u1'}};AccountClient.generation=9;AccountClient.authInvalid=false;
  responder=async()=>({ok:false,status:401,json:async()=>({})});
  const unauthorized=await context.make(AccountClient.session,9).from('flashcards').select('*');
  assert.equal(unauthorized.status,401);
  assert.equal(AccountClient.authInvalid,true);

  AccountClient.session={access_token:'token',user:{id:'u1'}};AccountClient.generation=10;AccountClient.authorizationBlocked=false;
  responder=async()=>({ok:false,status:403,json:async()=>({})});
  const forbidden=await context.make(AccountClient.session,10).from('flashcards').select('*');
  assert.equal(forbidden.status,403);
  assert.equal(AccountClient.authorizationBlocked,true);
  console.log('flashcard REST client compatibility: ok');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
