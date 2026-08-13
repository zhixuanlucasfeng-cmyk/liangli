const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

class FakeCache {
  constructor({addAllError} = {}) {
    this.entries = new Map();
    this.addAllError = addAllError;
    this.installAssets = undefined;
  }
  async match(request) {
    const response = this.entries.get(request.url || request);
    return response && response.clone();
  }
  async put(request, response) {
    this.entries.set(request.url || request, response.clone());
  }
  async addAll(assets) {
    if (this.addAllError) throw this.addAllError;
    this.installAssets = assets;
  }
}

function createHarness({videoBody, addAllError, cacheNames, fetchImpl} = {}) {
  const listeners = {};
  const shellCache = new FakeCache({addAllError});
  const videoCache = new FakeCache();
  const opened = [];
  const deleted = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  if (videoBody !== undefined) {
    videoCache.entries.set(
      'https://example.test/assets/power-cat/idle.mp4',
      new Response(videoBody, {status: 200, headers: {'Content-Type': 'video/mp4'}}),
    );
  }
  const self = {
    location: {origin: 'https://example.test'},
    addEventListener(type, listener) { listeners[type] = listener; },
    skipWaiting() { skipWaitingCalls += 1; return Promise.resolve(); },
    clients: {claim() { claimCalls += 1; return Promise.resolve(); }},
  };
  const caches = {
    open(name) {
      opened.push(name);
      return Promise.resolve(name === 'liangli-video-v1' ? videoCache : shellCache);
    },
    keys() { return Promise.resolve(cacheNames || []); },
    delete(name) { deleted.push(name); return Promise.resolve(true); },
    match() { return Promise.resolve(undefined); },
  };
  vm.runInNewContext(source, {
    self, caches, fetch: fetchImpl || (() => Promise.reject(new Error('unexpected fetch'))),
    Request, Response, Headers, URL, Promise, console,
  });
  return {
    listeners, shellCache, videoCache, deleted, opened,
    skipWaitingCalls: () => skipWaitingCalls,
    claimCalls: () => claimCalls,
  };
}

async function dispatch(harness, type, request) {
  let promise;
  const event = {
    request,
    waitUntil(value) { promise = value; },
    respondWith(value) { promise = value; },
  };
  harness.listeners[type](event);
  return promise;
}

async function testCachedRangeReturnsValidPartialResponse() {
  const harness = createHarness({videoBody: 'abcdefghij'});
  const request = new Request('https://example.test/assets/power-cat/idle.mp4', {
    headers: {Range: 'bytes=2-5'},
  });
  const response = await dispatch(harness, 'fetch', request);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await response.text(), 'cdef');
}

async function testRangeMissFetchesAndCachesFullResponse() {
  let fetchedRequest;
  const harness = createHarness({
    fetchImpl: async request => {
      fetchedRequest = request;
      return new Response('abcdefghij', {status: 200, headers: {'Content-Type': 'video/mp4'}});
    },
  });
  const request = new Request('https://example.test/assets/power-cat/idle.mp4', {
    headers: {Range: 'bytes=6-'},
  });
  const response = await dispatch(harness, 'fetch', request);
  assert.equal(fetchedRequest.headers.get('Range'), null);
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'ghij');
  const cached = await harness.videoCache.match(
    new Request('https://example.test/assets/power-cat/idle.mp4'),
  );
  assert.equal(cached.status, 200);
  assert.equal(await cached.text(), 'abcdefghij');
}

async function testInstallFailureKeepsPreviousWorkerActive() {
  const harness = createHarness({addAllError: new Error('poster missing')});
  await assert.rejects(dispatch(harness, 'install'), /poster missing/);
  assert.equal(harness.skipWaitingCalls(), 0);
}

async function testInstallUsesV12ShellCacheWithAccountSyncModule() {
  const harness = createHarness();
  await dispatch(harness, 'install');
  assert.deepEqual(harness.opened, ['liangli-v12']);
  assert.ok(
    harness.shellCache.installAssets.includes('./account-sync.js'),
    'the account sync module must be available to an offline shell',
  );
}

async function testCrossOriginSupabaseRequestIsLeftNetworkOnly() {
  let fetchCalls = 0;
  const harness = createHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('unexpected worker response');
    },
  });
  const request = new Request('https://example.supabase.co/rest/v1/flashcards');

  const response = await dispatch(harness, 'fetch', request);

  assert.equal(response, undefined);
  assert.equal(fetchCalls, 0);
  assert.equal(harness.shellCache.entries.size, 0);
}

async function testActivationDeletesOnlyOwnedStaleCaches() {
  const harness = createHarness({
    cacheNames: [
      'liangli-v4', 'liangli-v5', 'liangli-video-v0', 'liangli-video-v1',
      'liangli-vendor-cache', 'other-app-v9',
    ],
  });
  await dispatch(harness, 'activate');
  assert.deepEqual(harness.deleted.sort(), ['liangli-v4', 'liangli-v5', 'liangli-video-v0']);
  assert.equal(harness.claimCalls(), 1);
}

(async () => {
  await testCachedRangeReturnsValidPartialResponse();
  await testRangeMissFetchesAndCachesFullResponse();
  await testInstallFailureKeepsPreviousWorkerActive();
  await testInstallUsesV12ShellCacheWithAccountSyncModule();
  await testCrossOriginSupabaseRequestIsLeftNetworkOnly();
  await testActivationDeletesOnlyOwnedStaleCaches();
  console.log('service worker behavior: ok');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
