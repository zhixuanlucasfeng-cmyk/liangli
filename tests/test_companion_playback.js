const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(
  html.replaceAll(' ', ''),
  /\.companion-poster\.is-visible\{[^}]*z-index:2[^}]*\}/,
  'visible poster fallback must stack above video layers',
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('let companionRequestId=0;');
const end = script.indexOf('function renderCompanion', start);
assert.notEqual(start, -1, 'controller start marker is missing');
assert.notEqual(end, -1, 'controller end marker is missing');
const controller = script.slice(start, end);

class FakeClassList {
  constructor(...names) { this.names = new Set(names); }
  add(name) { this.names.add(name); }
  remove(name) { this.names.delete(name); }
  contains(name) { return this.names.has(name); }
}

class FakeMediaLayer {
  constructor(...classes) {
    this.attrs = new Map();
    this.classList = new FakeClassList(...classes);
    this.dataset = {};
    this.listeners = new Map();
    this.loadCount = 0;
    this.pauseCount = 0;
    this.playCount = 0;
    this.playBehavior = () => Promise.resolve();
  }
  get src() { return this.getAttribute('src'); }
  set src(value) { this.attrs.set('src', value); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  load() { this.loadCount += 1; }
  pause() { this.pauseCount += 1; }
  play() { this.playCount += 1; return this.playBehavior(); }
  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({listener, once: Boolean(options.once)});
    this.listeners.set(type, listeners);
  }
  async emit(type) {
    const listeners = [...(this.listeners.get(type) || [])];
    for (const entry of listeners) {
      if (entry.once) {
        const current = this.listeners.get(type) || [];
        this.listeners.set(type, current.filter(candidate => candidate !== entry));
      }
      await entry.listener();
    }
  }
}

class FakePoster {
  constructor() {
    this.attrs = new Map();
    this.classList = new FakeClassList();
  }
  get src() { return this.getAttribute('src'); }
  set src(value) { this.attrs.set('src', value); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function createHarness() {
  const layers = [new FakeMediaLayer('is-active'), new FakeMediaLayer()];
  const poster = new FakePoster();
  const status = {textContent: ''};
  const timers = new Map();
  let nextTimer = 1;
  const context = {
    console,
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, '.companion-video');
        return layers;
      },
      getElementById(id) {
        if (id === 'companionPoster') return poster;
        if (id === 'companionStatus') return status;
        throw new Error(`Unexpected id: ${id}`);
      },
    },
    matchMedia: () => ({matches: false}),
    T: key => key,
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.createContext(context);
  vm.runInContext(`${controller}\n;globalThis.playback={
    requestCompanion,
    setTodayMediaActive,
    stopLayer,
    companionMediaSrc,
    state:()=>({activeCompanionLayer,pendingCompanionSrc,companionRequestId,companionMediaActive,currentCompanionState,currentCompanion})
  };`, context);
  return {
    ...context.playback,
    layers,
    poster,
    timers,
    runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

function establishActive(harness, state = 'idle') {
  const src = harness.companionMediaSrc('cat', state, 'mp4');
  const active = harness.layers[0];
  active.src = src;
  active.dataset.companionSrc = src;
  active.classList.add('is-active');
  return src;
}

function assertActiveA(harness, srcA) {
  assert.equal(harness.layers[0].getAttribute('src'), srcA);
  assert.equal(harness.layers[0].classList.contains('is-active'), true);
  assert.equal(harness.layers[1].hasAttribute('src'), false);
  assert.equal(harness.layers[1].classList.contains('is-active'), false);
  assert.equal(harness.state().activeCompanionLayer, 0);
}

async function testLatestActiveRequestWins() {
  const harness = createHarness();
  const srcA = establishActive(harness);

  harness.requestCompanion('cat', 'content');
  harness.requestCompanion('cat', 'idle');
  await harness.layers[1].emit('canplay');
  harness.runTimers();
  assert.equal(harness.layers[1].playCount, 0, 'stale canplay must not start playback');
  assertActiveA(harness, srcA);

  const pendingPlay = deferred();
  harness.layers[1].playBehavior = () => pendingPlay.promise;
  harness.requestCompanion('cat', 'content');
  const stalePlay = harness.layers[1].emit('canplay');
  assert.equal(harness.layers[1].playCount, 1);
  harness.requestCompanion('cat', 'idle');
  pendingPlay.resolve();
  await stalePlay;
  harness.runTimers();
  assertActiveA(harness, srcA);

  harness.layers[1].playBehavior = () => Promise.resolve();
  harness.requestCompanion('cat', 'content');
  await harness.layers[1].emit('canplay');
  assert.equal(harness.timers.size, 1, 'successful preparation should schedule a swap');
  harness.requestCompanion('cat', 'idle');
  harness.runTimers();
  assertActiveA(harness, srcA);
}

async function testRejectedPlayShowsPosterAndClearsVideos() {
  const harness = createHarness();
  establishActive(harness);
  harness.layers[1].playBehavior = () => Promise.reject(new Error('autoplay blocked'));

  harness.requestCompanion('cat', 'content');
  await harness.layers[1].emit('canplay');

  assert.equal(
    harness.poster.getAttribute('src'),
    harness.companionMediaSrc('cat', 'content', 'webp'),
  );
  assert.equal(harness.poster.classList.contains('is-visible'), true);
  for (const layer of harness.layers) {
    assert.equal(layer.hasAttribute('src'), false);
    assert.equal(layer.classList.contains('is-active'), false);
  }
  assert.equal(harness.state().pendingCompanionSrc, '');
}

async function testStableActiveSourceDoesNotReload() {
  const harness = createHarness();
  const srcA = establishActive(harness);
  const activeLoads = harness.layers[0].loadCount;

  harness.requestCompanion('cat', 'idle');
  harness.requestCompanion('cat', 'idle');

  assert.equal(harness.layers[0].loadCount, activeLoads);
  assert.equal(harness.layers[0].getAttribute('src'), srcA);
  assert.equal(harness.layers[0].classList.contains('is-active'), true);
}

async function testTodayVisibilityStopsAndRaceSafelyResumesDecode() {
  const harness = createHarness();
  const src = establishActive(harness, 'content');
  harness.requestCompanion('cat', 'content');

  harness.setTodayMediaActive(false);
  assert.equal(harness.state().companionMediaActive, false);
  assert.equal(harness.state().currentCompanionState, 'content');
  assert.equal(harness.poster.classList.contains('is-visible'), true);
  for (const layer of harness.layers) {
    assert.equal(layer.hasAttribute('src'), false, 'hidden Today must release video source');
    assert.equal(layer.classList.contains('is-active'), false);
  }

  harness.setTodayMediaActive(true);
  assert.equal(harness.state().companionMediaActive, true);
  const pending = harness.layers.find(layer => layer.getAttribute('src') === src);
  assert.ok(pending, 'returning to Today must prepare the preserved state');
  await pending.emit('canplay');
  harness.runTimers();
  assert.equal(pending.classList.contains('is-active'), true);

  harness.requestCompanion('cat', 'tired');
  const stale = harness.layers.find(layer => layer.dataset.companionSrc?.endsWith('/tired.mp4'));
  harness.setTodayMediaActive(false);
  await stale.emit('canplay');
  harness.runTimers();
  assert.equal(stale.playCount, 0, 'late canplay after leaving Today must stay invalidated');
}

(async () => {
  await testLatestActiveRequestWins();
  await testRejectedPlayShowsPosterAndClearsVideos();
  await testStableActiveSourceDoesNotReload();
  await testTodayVisibilityStopsAndRaceSafelyResumesDecode();
  console.log('companion playback behavior: ok');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
