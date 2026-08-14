# Powy Live2D Web Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Powy's MP4 companion controller with a tap-responsive Live2D runtime while preserving the existing four energy states, saved character choice, accessibility, offline behavior, and static fallback.

**Architecture:** Build a browser-ready adapter from the official Cubism 5 SDK for Web and keep it behind a small `PowyLive2D` interface. A pure controller owns base/reaction priority and is unit tested without WebGL; `index.html` only maps existing UI and load state into that controller.

**Tech Stack:** HTML/CSS/JavaScript, official Live2D Cubism SDK for Web 5 R5, WebGL, Service Worker Cache API, Node `assert`, Python `unittest`

**Spec:** `docs/superpowers/specs/2026-08-14-live2d-companion-design.md`

## Global Constraints

- Do not change the existing load thresholds, saved `cat`/`human` values, daily rollover, or task behavior.
- Use only self-hosted runtime files; the current CSP does not permit a CDN.
- Show the poster until the selected model is ready and whenever animation cannot run.
- Ignore repeated taps while a reaction is playing.
- Pause rendering outside Today and honor `prefers-reduced-motion: reduce`.
- Do not remove MP4 rollback assets until one production release passes iPad verification.
- Run the asset-production plan first; do not switch production without both valid model packages.

---

### Task 1: Vendor and build the official runtime

**Files:**
- Create: `tools/live2d-runtime/README.md`
- Create: `tools/live2d-runtime/src/powy-live2d.ts`
- Create: `tools/live2d-runtime/package.json`
- Create: `vendor/live2d/live2dcubismcore.min.js`
- Create: `vendor/live2d/powy-live2d.min.js`
- Create: `vendor/live2d/LICENSE.md`
- Create: `vendor/live2d/NOTICE.md`
- Test: `tests/test_live2d_runtime_contract.py`

**Interfaces:**
- Consumes: the license-accepted Cubism SDK for Web 5 R5 Core plus the official `CubismWebFramework` 5-r.5 source.
- Produces: `window.PowyLive2D.create(canvas)` returning `load`, `play`, `pause`, `resume`, and `destroy` methods.

- [ ] **Step 1: Write the failing browser-bundle contract**

```python
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class Live2DRuntimeContractTests(unittest.TestCase):
    def test_self_hosted_runtime_exports_the_adapter(self):
        core = ROOT / "vendor/live2d/live2dcubismcore.min.js"
        adapter = ROOT / "vendor/live2d/powy-live2d.min.js"
        self.assertTrue(core.is_file())
        self.assertTrue(adapter.is_file())
        self.assertIn("PowyLive2D", adapter.read_text(errors="ignore"))
        self.assertTrue((ROOT / "vendor/live2d/LICENSE.md").is_file())
        self.assertTrue((ROOT / "vendor/live2d/NOTICE.md").is_file())
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m unittest tests.test_live2d_runtime_contract`

Expected: FAIL because the vendor bundle is absent.

- [ ] **Step 3: Prepare the pinned build input**

Document these exact inputs in `tools/live2d-runtime/README.md`:

```text
CubismWebFramework tag: 5-r.5
Cubism Core: Live2D Cubism SDK for Web 5 R5 download
Build target: browser ES2020, production/minified
Public API: window.PowyLive2D
```

Copy `live2dcubismcore.min.js`, the applicable license, and notices from the license-accepted official SDK download. Build the official Framework source locally; do not fetch Core from a CDN.

- [ ] **Step 4: Implement the fixed adapter interface**

```ts
export type Character = 'human' | 'cat';
export type Motion = 'idle' | 'content' | 'tired' | 'exhausted' | 'tap';

export interface PowyModel {
  load(character: Character): Promise<void>;
  play(motion: Motion, options: {loop: boolean; onFinish?: () => void}): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

declare global {
  interface Window {
    PowyLive2D: {create(canvas: HTMLCanvasElement): PowyModel};
  }
}
```

Use the official Framework motion manager for motion playback and its finished-motion callback for `onFinish`. `load(character)` resolves only after the MOC, textures, and physics are ready and the first frame has rendered.

- [ ] **Step 5: Build and verify the bundle**

Run: `npm ci && npm run build` from `tools/live2d-runtime`.

Expected: `vendor/live2d/powy-live2d.min.js` is emitted and contains `PowyLive2D`.

Run: `python3 -m unittest tests.test_live2d_runtime_contract`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/live2d-runtime vendor/live2d tests/test_live2d_runtime_contract.py
git commit -m "feat: vendor Powy Live2D runtime"
```

### Task 2: Implement the base/reaction state controller

**Files:**
- Create: `companion-controller.js`
- Replace: `tests/test_companion_playback.js`

**Interfaces:**
- Consumes: a backend matching `PowyModel` and callbacks `showPoster(character, state)` and `hidePoster()`.
- Produces: `window.PowyCompanionController.create(options)` with `setCharacter`, `setBaseState`, `tap`, `setActive`, and `destroy`.

- [ ] **Step 1: Write the failing controller test**

```javascript
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const source = fs.readFileSync('companion-controller.js', 'utf8');
const calls = [];
let finishTap;
const backend = {
  async load(character) { calls.push(['load', character]); },
  play(name, options) {
    calls.push(['play', name, options.loop]);
    if (name === 'tap') finishTap = options.onFinish;
  },
  pause() { calls.push(['pause']); },
  resume() { calls.push(['resume']); },
  destroy() { calls.push(['destroy']); },
};
const context = {window: {}};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const controller = context.window.PowyCompanionController.create({
    backend,
    showPoster() {},
    hidePoster() {},
  });
  await controller.setCharacter('human');
  controller.setBaseState('content');
  assert.equal(controller.tap(), true);
  assert.equal(controller.tap(), false);
  controller.setBaseState('tired');
  finishTap();
  assert.deepEqual(calls.at(-1), ['play', 'tired', true]);
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/test_companion_playback.js`

Expected: FAIL because `companion-controller.js` is absent.

- [ ] **Step 3: Implement the minimal controller**

```javascript
(function(global){
  const STATES=new Set(['idle','content','tired','exhausted']);
  function create({backend,showPoster,hidePoster}){
    let character='cat',base='idle',reacting=false,active=true,ready=false,generation=0;
    const playBase=()=>{if(active&&ready&&!reacting){backend.play(base,{loop:true});hidePoster();}};
    return {
      async setCharacter(next){
        character=next==='human'?'human':'cat';reacting=false;ready=false;
        const own=++generation;showPoster(character,base);
        try{
          await backend.load(character);if(own!==generation)return false;
          ready=true;playBase();return true;
        }catch(error){
          if(own===generation){ready=false;showPoster(character,base);}
          return false;
        }
      },
      setBaseState(next){if(STATES.has(next)){base=next;playBase();}},
      tap(){
        if(!active||!ready||reacting)return false;reacting=true;
        backend.play('tap',{loop:false,onFinish(){reacting=false;playBase();}});
        return true;
      },
      setActive(next){
        active=Boolean(next);
        if(active){reacting=false;backend.resume();playBase();}
        else backend.pause();
      },
      destroy(){generation++;reacting=false;ready=false;backend.destroy();},
      state(){return {character,base,reacting,active,ready};}
    };
  }
  global.PowyCompanionController={create};
})(typeof window==='undefined'?globalThis:window);
```

- [ ] **Step 4: Extend the test for stale loads, hidden Today, failure fallback, and reduced motion**

Add these concrete cases to the same test file:

```javascript
controller.setActive(false);
assert.deepEqual(calls.at(-1), ['pause']);
assert.equal(controller.tap(), false);

backend.load = async () => { throw new Error('decode failed'); };
assert.equal(await controller.setCharacter('cat'), false);
assert.equal(controller.state().ready, false);

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
const loads=[];
backend.load=()=>{const load=deferred();loads.push(load);return load.promise;};
controller.setActive(true);
const first=controller.setCharacter('cat');
const second=controller.setCharacter('human');
loads[1].resolve();
assert.equal(await second,true);
loads[0].resolve();
assert.equal(await first,false);
assert.equal(controller.state().character, 'human');
```

- [ ] **Step 5: Run it and commit**

Run: `node tests/test_companion_playback.js`

Expected: `companion playback behavior: ok`.

```bash
git add companion-controller.js tests/test_companion_playback.js
git commit -m "feat: add interactive companion state controller"
```

### Task 3: Replace the Today video stage with Live2D

**Files:**
- Modify: `index.html:49-55,201-204,375-380,2731-2861`
- Modify: `tests/test_manga_ui_contract.py:764-816`

**Interfaces:**
- Consumes: `window.PowyLive2D.create(canvas)` and `window.PowyCompanionController.create(options)`.
- Produces: the existing `renderCompanion(state)`, `setCompanion(name)`, and `setTodayMediaActive(active)` behavior backed by Live2D.

- [ ] **Step 1: Change the contract test first**

Require one canvas with `id="companionCanvas"`, `role="button"`, `tabindex="0"`, the existing poster/status elements, and self-hosted scripts in this order:

```html
<script src="vendor/live2d/live2dcubismcore.min.js"></script>
<script src="vendor/live2d/powy-live2d.min.js"></script>
<script src="companion-controller.js"></script>
```

Remove assertions requiring two `.companion-video` elements.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `python3 -m unittest tests.test_manga_ui_contract.MangaUIContractTests.test_accessible_companion_stage_contract tests.test_manga_ui_contract.MangaUIContractTests.test_companion_status_localizes_character_and_state`

Expected: FAIL because the stage still contains videos.

- [ ] **Step 3: Replace the stage markup and CSS**

```html
<div class="companion-stage manga-stage">
  <img id="companionPoster" class="companion-poster is-visible" alt="">
  <canvas id="companionCanvas" class="companion-canvas" role="button" tabindex="0"></canvas>
  <div class="manga-decor" aria-hidden="true"></div>
</div>
```

Give `.companion-canvas` the current media sizing, a transparent background, `touch-action:manipulation`, and opacity transition. Keep the poster above it until the first frame is ready.

- [ ] **Step 4: Wire the adapter to existing functions**

Create one backend and controller at startup. `renderCompanion(state)` updates status text and calls `controller.setBaseState(state)`. `setCompanion` persists the same `cat`/`human` value and calls `controller.setCharacter`. `setTodayMediaActive` forwards to `controller.setActive`.

```javascript
const companionCanvas=document.getElementById('companionCanvas');
const companionPoster=document.getElementById('companionPoster');
const showPoster=character=>{
  companionPoster.src=`assets/live2d/${character}/poster.webp`;
  companionPoster.classList.add('is-visible');
};
const hidePoster=()=>companionPoster.classList.remove('is-visible');

function renderCompanion(state){
  const character=S.companion==='human'?'human':'cat';
  companionPoster.src=`assets/live2d/${character}/poster.webp`;
  document.getElementById('companionStatus').textContent=
    `${T(character==='human'?'companionHuman':'companionCat')} · ${T(companionStateKeys[state])}`;
  companionController?.setBaseState(state);
}
```

Add `pointerup`, Enter, and Space listeners to the canvas. Ignore pointer movement greater than 12 CSS pixels so scrolling the Today page does not trigger a reaction.

```javascript
let companionPointerStart=null;
companionCanvas.addEventListener('pointerdown',event=>{
  companionPointerStart={x:event.clientX,y:event.clientY};
});
companionCanvas.addEventListener('pointerup',event=>{
  if(!companionPointerStart)return;
  const moved=Math.hypot(event.clientX-companionPointerStart.x,event.clientY-companionPointerStart.y);
  companionPointerStart=null;if(moved<=12)companionController?.tap();
});
companionCanvas.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();companionController?.tap();}
});
```

- [ ] **Step 5: Preserve fallbacks**

If `PowyLive2D` is absent, WebGL creation fails, or model loading rejects, keep `poster.webp` visible and leave task/navigation behavior untouched. If reduced motion matches, never create the backend and keep the poster visible.

Wrap backend construction once:

```javascript
let companionController=null;
try{
  if(!reducedMotion.matches&&window.PowyLive2D){
    const backend=window.PowyLive2D.create(companionCanvas);
    companionController=window.PowyCompanionController.create({backend,showPoster,hidePoster});
  }
}catch(error){
  companionController=null;
  companionPoster.classList.add('is-visible');
}
```

- [ ] **Step 6: Run focused and full tests**

Run: `node tests/test_companion_playback.js`

Run: `python3 -m unittest tests.test_manga_ui_contract`

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html companion-controller.js tests/test_companion_playback.js tests/test_manga_ui_contract.py
git commit -m "feat: add tap-responsive Live2D companions"
```

### Task 4: Add PWA caching and rollback safety

**Files:**
- Modify: `sw.js:3-5,91-119`
- Modify: `tests/test_service_worker.js`
- Modify: `tests/test_service_worker_contract.py`

**Interfaces:**
- Consumes: self-hosted runtime files, poster files, and selected model requests under `assets/live2d/`.
- Produces: shell-cached controller/runtime and runtime-cached selected model assets.

- [ ] **Step 1: Write failing Service Worker expectations**

Assert that the shell list contains the controller, Core, adapter, and two posters; model files match `assets/live2d/(human|cat)/` and enter a dedicated `liangli-live2d-v1` runtime cache.

- [ ] **Step 2: Run to verify failure**

Run: `node tests/test_service_worker.js && python3 -m unittest tests.test_service_worker_contract`

Expected: FAIL because v17 knows only the MP4 video cache.

- [ ] **Step 3: Implement the cache policy**

Set the shell to `liangli-v18`, add self-hosted runtime/controller/posters to `ASSETS`, add `const LIVE2D_CACHE='liangli-live2d-v1'`, and use stale-while-revalidate for same-origin `assets/live2d/` GET requests. Cache only successful status-200 responses.

- [ ] **Step 4: Run Service Worker tests**

Run: `node tests/test_service_worker.js && python3 -m unittest tests.test_service_worker_contract`

Expected: PASS with `liangli-v18` and `liangli-live2d-v1`.

- [ ] **Step 5: Commit**

```bash
git add sw.js tests/test_service_worker.js tests/test_service_worker_contract.py
git commit -m "feat: cache Live2D companions offline"
```

### Task 5: Release verification

**Files:**
- Modify only if verification finds a defect.

**Interfaces:**
- Consumes: completed models, controller, runtime, DOM integration, and Service Worker.
- Produces: evidence required to replace the production MP4 companion.

- [ ] **Step 1: Run the complete automated suite**

```bash
git diff --check
python3 -m unittest discover -s tests -p 'test_*.py'
for test_file in tests/*.js; do node "$test_file" || exit 1; done
```

Expected: zero failures.

- [ ] **Step 2: Verify desktop behavior**

In Chrome, test both characters and all four energy states, five taps per character, a state change during tap, Today navigation pause/resume, offline reload, keyboard activation, and reduced motion.

- [ ] **Step 3: Verify iPad Safari portrait and landscape**

Confirm first frame appears behind the poster without a flash, tap response is under 100 ms after preload, animation stays at or above 30 FPS, page scrolling does not trigger tap, background is seamless, orientation changes preserve framing, and offline reopen restores the selected character.

- [ ] **Step 4: Publish with rollback assets retained**

Commit any verified fixes, push the tested commit to `main`, wait for GitHub Pages to serve `liangli-v18`, and open `?v=18`. Do not delete `assets/power-cat/*.mp4` or `assets/power-human/*.mp4` in this release.
