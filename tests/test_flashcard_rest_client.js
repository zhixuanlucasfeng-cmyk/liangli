const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function createFlashcardRestClient(');
const end = script.indexOf('const CommunityClient=', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);

const requests = [];
const context = {
  encodeURIComponent,
  CommunityClient: {session: {access_token: 'user-token', user: {id: 'u1'}}},
  fetch: async (url, options) => {
    requests.push({url, options});
    return {ok: true, status: options.method === 'GET' ? 200 : 201, json: async () => []};
  },
};
vm.createContext(context);
vm.runInContext(`const SUPABASE_URL='https://project.supabase.co';const SUPABASE_ANON_KEY='public-anon-key';${script.slice(start, end)};globalThis.make=createFlashcardRestClient;`, context);

(async () => {
  const client = context.make({access_token: 'user-token', user: {id: 'u1'}});
  await client.from('flashcard_decks').select('*');
  assert.equal(requests[0].url, 'https://project.supabase.co/rest/v1/flashcard_decks?select=*');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer user-token');

  await client.from('flashcard_reviews').upsert([{id: 'r'}], {onConflict: 'id', ignoreDuplicates: true});
  assert.match(requests[1].options.headers.Prefer, /ignore-duplicates/);

  await client.from('flashcards').update({deleted_at: 'now'}).eq('id', 'c').lte('client_updated_at', 9);
  assert.match(requests[2].url, /id=eq\.c/);
  assert.match(requests[2].url, /client_updated_at=lte\.9/);

  await assert.rejects(() => client.from('tasks').select('*'), /Blocked cloud table/);

  const pageRequests = [];
  const pageContext = {encodeURIComponent, CommunityClient: {session: {access_token: 'token', user: {id: 'u1'}}}, fetch: async (_url, options) => {
    pageRequests.push(options.headers.Range);
    const first = options.headers.Range === '0-999';
    return {ok: true, status: 200, json: async () => first ? Array.from({length: 1000}, (_, id) => ({id})) : [{id: 1000}]};
  }};
  vm.createContext(pageContext);
  vm.runInContext(`const SUPABASE_URL='https://project.supabase.co';const SUPABASE_ANON_KEY='public-anon-key';${script.slice(start, end)};globalThis.make=createFlashcardRestClient;`, pageContext);
  const paged = await pageContext.make({access_token: 'token', user: {id: 'u1'}}).from('flashcards').select('*');
  assert.equal(paged.data.length, 1001);
  assert.deepEqual(pageRequests, ['0-999', '1000-1999']);

  const unauthorizedClientState = {generation: 7, session: {access_token: 'bad', refresh_token: 'refresh', user: {id: 'u1'}}, authInvalid: false, authorizationBlocked: false, refreshSession: async () => null};
  const unauthorizedContext = {encodeURIComponent, CommunityClient: unauthorizedClientState, fetch: async () => ({ok: false, status: 401})};
  vm.createContext(unauthorizedContext);
  vm.runInContext(`const SUPABASE_URL='https://project.supabase.co';const SUPABASE_ANON_KEY='public-anon-key';${script.slice(start, end)};globalThis.make=createFlashcardRestClient;`, unauthorizedContext);
  const unauthorized = await unauthorizedContext.make(unauthorizedClientState.session,7).from('flashcards').select('*');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorizedClientState.authInvalid, true);

  const forbiddenClientState = {generation: 4, session: {access_token: 'token', user: {id: 'u1'}}, authInvalid: false, authorizationBlocked: false};
  const forbiddenContext = {encodeURIComponent, CommunityClient: forbiddenClientState, fetch: async () => ({ok: false, status: 403})};
  vm.createContext(forbiddenContext);
  vm.runInContext(`const SUPABASE_URL='https://project.supabase.co';const SUPABASE_ANON_KEY='public-anon-key';${script.slice(start, end)};globalThis.make=createFlashcardRestClient;`, forbiddenContext);
  const forbidden = await forbiddenContext.make(forbiddenClientState.session,4).from('flashcards').select('*');
  assert.equal(forbidden.status, 403);
  assert.equal(forbiddenClientState.authorizationBlocked, true);
  forbiddenClientState.generation=5;forbiddenClientState.authorizationBlocked=false;
  await forbiddenContext.make(forbiddenClientState.session,4).from('flashcards').select('*');
  assert.equal(forbiddenClientState.authorizationBlocked, false);
  console.log('flashcard REST client: ok');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
