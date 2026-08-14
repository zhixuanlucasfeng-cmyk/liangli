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
    this.loop = true;
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

function createHarness({reducedMotion = false} = {}) {
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
    matchMedia: () => ({matches: reducedMotion}),
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
    triggerCompanionReaction,
    setTodayMediaActive,
    stopLayer,
    companionMediaSrc,
    state:()=>({activeCompanionLayer,pendingCompanionSrc,companionRequestId,companionMediaActive,currentCompanionState,currentCompanion,companionReactionPlaying})
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

async function startReaction(harness) {
  harness.triggerCompanionReaction();
  const reaction = harness.layers.find(layer => layer.getAttribute('src')?.endsWith('/tap.mp4'));
  assert.ok(reaction, 'tap must prepare the reaction source');
  assert.equal(reaction.playCount, 1,
    'tap must request playback inside the user activation handler');
  await reaction.emit('canplay');
  harness.runTimers();
  return reaction;
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

async function testTapStartsOneShotAndLatestStateResumes() {
  const harness = createHarness();
  establishActive(harness);

  const reaction = await startReaction(harness);
  assert.equal(reaction.loop, false, 'tap reaction must not loop');
  assert.equal(reaction.playCount, 1);

  harness.requestCompanion('human', 'tired');
  assert.equal(reaction.getAttribute('src').endsWith('/tap.mp4'), true,
    'state changes must not interrupt an active reaction');
  assert.equal(harness.state().currentCompanionState, 'tired');

  await reaction.emit('ended');
  const resumed = harness.layers.find(layer => layer.getAttribute('src') ===
    harness.companionMediaSrc('human', 'tired', 'mp4'));
  assert.ok(resumed, 'reaction end must resume the latest energy state');
  assert.equal(resumed.loop, true, 'base state must resume looping');
}

async function testRepeatedTapDoesNotReloadReaction() {
  const harness = createHarness();
  establishActive(harness);
  const reaction = await startReaction(harness);
  const loadCount = reaction.loadCount;
  const playCount = reaction.playCount;

  harness.triggerCompanionReaction();

  assert.equal(reaction.loadCount, loadCount);
  assert.equal(reaction.playCount, playCount);
  assert.equal(harness.layers.filter(layer => layer.dataset.companionSrc?.endsWith('/tap.mp4')).length, 1);
}

async function testReactionFailuresResumeBaseLoop() {
  for (const failure of ['error', 'play']) {
    const harness = createHarness();
    const baseSrc = establishActive(harness, 'content');
    if (failure === 'play') {
      harness.layers[1].playBehavior = () => Promise.reject(new Error('reaction unavailable'));
    }
    harness.triggerCompanionReaction();
    const reaction = harness.layers.find(layer => layer.getAttribute('src')?.endsWith('/tap.mp4'));
    assert.ok(reaction);
    if (failure === 'play') {
      await reaction.emit('canplay');
    } else {
      await reaction.emit('error');
    }
    harness.runTimers();

    assert.equal(harness.state().companionReactionPlaying, false);
    const base = harness.layers.find(layer => layer.getAttribute('src') === baseSrc);
    assert.ok(base, `${failure} failure must restore the base source`);
    assert.equal(base.loop, true);
  }
}

async function testReducedMotionSkipsReaction() {
  const harness = createHarness({reducedMotion: true});
  establishActive(harness);

  harness.triggerCompanionReaction();

  assert.equal(harness.state().companionReactionPlaying, false);
  assert.equal(harness.layers.some(layer => layer.getAttribute('src')?.endsWith('/tap.mp4')), false);
  assert.equal(harness.layers.reduce((sum, layer) => sum + layer.playCount, 0), 0);
}

async function testReactionWatchdogRecoversNoEventStall() {
  const harness = createHarness();
  const baseSrc = establishActive(harness, 'content');
  harness.requestCompanion('cat', 'content');

  harness.triggerCompanionReaction();
  assert.equal(harness.state().companionReactionPlaying, true);
  harness.runTimers();

  assert.equal(harness.state().companionReactionPlaying, false,
    'a stalled reaction load must release the reaction lock');
  assert.equal(harness.layers.some(layer =>
    layer.getAttribute('src')?.endsWith('/tap.mp4')), false);
  assert.ok(harness.layers.some(layer => layer.getAttribute('src') === baseSrc),
    'a stalled reaction load must preserve the base loop');
}

async function testLeavingTodayCancelsReactionAndCanResume() {
  const harness = createHarness();
  establishActive(harness, 'content');
  harness.requestCompanion('cat', 'content');
  await startReaction(harness);

  harness.setTodayMediaActive(false);
  assert.equal(harness.state().companionReactionPlaying, false);
  assert.equal(harness.layers.some(layer => layer.hasAttribute('src')), false);

  harness.setTodayMediaActive(true);
  assert.equal(harness.layers.some(layer =>
    layer.getAttribute('src')?.endsWith('/content.mp4')), true,
  'returning to Today must restore the base loop after a cancelled reaction');
}

(async () => {
  await testLatestActiveRequestWins();
  await testRejectedPlayShowsPosterAndClearsVideos();
  await testStableActiveSourceDoesNotReload();
  await testTodayVisibilityStopsAndRaceSafelyResumesDecode();
  await testTapStartsOneShotAndLatestStateResumes();
  await testRepeatedTapDoesNotReloadReaction();
  await testReactionFailuresResumeBaseLoop();
  await testReducedMotionSkipsReaction();
  await testReactionWatchdogRecoversNoEventStall();
  await testLeavingTodayCancelsReactionAndCanResume();
  console.log('companion playback behavior: ok');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
