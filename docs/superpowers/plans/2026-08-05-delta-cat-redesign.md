# Delta 猫伙伴 + 视觉改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `量力 Liangli` a warm coral/cream color identity and a Q 版 SVG 猫伙伴 Delta whose expression reflects the existing energy-load thresholds on the 今日 (Today) page.

**Architecture:** Everything lives in the single `index.html` file (plus a one-line version bump in `sw.js`). No new files, no build tooling, no new `localStorage` fields. Delta's visual state is a pure function of `S.tasks`/`S.loadMax`, computed inside the existing `renderLoad()` function and expressed as a CSS class on Delta's container; CSS handles all cross-fades and animation.

**Tech Stack:** Vanilla HTML/CSS/SVG/JS (no dependencies).

## Global Constraints

- Single-file architecture: all markup/style/script changes go into `index.html`. Do not introduce a build step, framework, or npm package.
- No new `localStorage`/`DB` fields. Delta's state must be derived, never stored.
- Semantic status colors `--ok`/`--warn`/`--danger` (green/yellow/red) stay exactly as-is — they are not part of this redesign.
- Reuse the exact thresholds already computed in `renderLoad()` (`used>max`, `used>max*0.8`) — do not duplicate or re-derive load logic elsewhere.
- No automated test infrastructure exists for this project. Every task's "test" step is a concrete, written-out manual check in the browser — never a vague "test it works".
- After all `index.html` changes are done (end of Task 4), bump `VERSION` in `sw.js` from `'liangli-v1'` to `'liangli-v2'`.
- No i18n changes needed — Delta has no text content, and no user-facing copy changes in this plan.
- Local preview: `cd ~/Documents/liangli && python3 -m http.server 8000`, then open `http://localhost:8000` (Service Worker doesn't register under `file://`, but plain page testing works fine either way for these tasks).

---

### Task 1: Warm palette swap

**Files:**
- Modify: `index.html:16` (`:root` CSS variables)
- Modify: `index.html:17` (`--r` border-radius variable)
- Modify: `index.html:59` (`.pick div.sel`)
- Modify: `index.html:89` (`.moodpick div.sel`)
- Modify: `index.html:97` (`.hint`)
- Modify: `index.html:182` (pomodoro ring gradient stops)

**Interfaces:**
- Consumes: nothing (pure CSS values)
- Produces: `--accent`/`--accent2` CSS variables now resolve to warm coral/peach instead of blue/purple. Task 2 will add three new cat-specific variables (`--catbody`, `--catpatch`, `--catline`) alongside these — not part of this task.

This task replaces every hardcoded occurrence of the old blue/purple accent (`#4f8cff`, `#7c5cff`, `#bcd3ff`, `rgba(79,140,255,...)`) with the new coral/peach palette. Grep confirms these are the only 5 occurrences outside the `:root` declaration itself.

- [ ] **Step 1: Update the `:root` accent and radius variables**

In `index.html`, find:
```css
  --txt:#e8ebf0;--sub:#9aa3b2;--accent:#4f8cff;--accent2:#7c5cff;
  --ok:#37c07a;--warn:#ffb020;--danger:#ff5c5c;--r:14px;
```
Replace with:
```css
  --txt:#e8ebf0;--sub:#9aa3b2;--accent:#ff8a5c;--accent2:#ffb26b;
  --ok:#37c07a;--warn:#ffb020;--danger:#ff5c5c;--r:18px;
```

- [ ] **Step 2: Update `.pick div.sel`**

Find:
```css
.pick div.sel{border-color:var(--accent);background:rgba(79,140,255,.15);color:#bcd3ff}
```
Replace with:
```css
.pick div.sel{border-color:var(--accent);background:rgba(255,138,92,.15);color:#ffdcc2}
```

- [ ] **Step 3: Update `.moodpick div.sel`**

Find:
```css
.moodpick div.sel{border-color:var(--accent);background:rgba(79,140,255,.15)}
```
Replace with:
```css
.moodpick div.sel{border-color:var(--accent);background:rgba(255,138,92,.15)}
```

- [ ] **Step 4: Update `.hint`**

Find:
```css
.hint{background:rgba(79,140,255,.08);border:1px solid rgba(79,140,255,.25);color:#bcd3ff;padding:10px 12px;border-radius:11px;font-size:12px;line-height:1.55;margin-bottom:12px}
```
Replace with:
```css
.hint{background:rgba(255,138,92,.08);border:1px solid rgba(255,138,92,.25);color:#ffdcc2;padding:10px 12px;border-radius:11px;font-size:12px;line-height:1.55;margin-bottom:12px}
```

- [ ] **Step 5: Update the pomodoro ring gradient**

Find:
```html
              <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#4f8cff"/><stop offset="1" stop-color="#7c5cff"/>
              </linearGradient></defs>
```
Replace with:
```html
              <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#ff8a5c"/><stop offset="1" stop-color="#ffb26b"/>
              </linearGradient></defs>
```

- [ ] **Step 6: Verify in browser**

Run `cd ~/Documents/liangli && python3 -m http.server 8000`, open `http://localhost:8000`.
Check:
- 今日 tab: "加入今日" button and selected energy pill (轻/中/重) are coral/peach, not blue.
- 记录 (Journal) tab: the privacy hint box at the top is peach-tinted, not blue.
- 专注 (Focus) tab: the pomodoro ring's colored arc is coral→peach gradient, not blue→purple.
- Selected mood emoji in 记录 tab has a peach highlight ring.
- No blue or purple pixels remain anywhere in the five tabs (visually scan each tab once).
- Card corners look slightly rounder than before (radius bump).

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/liangli
git add index.html
git commit -m "Swap accent palette from cool blue/purple to warm coral/peach"
```

---

### Task 2: Draw Delta (static, all four states, not yet wired to data)

**Files:**
- Modify: `index.html:14-19` (add 3 new CSS variables to `:root`)
- Modify: `index.html` inside `<style>` block (add `.delta` and state CSS, insert after the existing `.warnbox` rule around line 40)
- Modify: `index.html` inside `#v-today` section, first `<div class="card">` (insert Delta's SVG markup before the existing `<div class="gh">`, around line 111-112)

**Interfaces:**
- Consumes: nothing yet (static markup, defaults to `state-idle`)
- Produces: a `<div id="delta" class="delta state-idle">` element containing an SVG with four selectable expression states (`state-idle`, `state-content`, `state-tired`, `state-exhausted` as classes on `#delta`). Task 3 depends on this exact id (`delta`) and these exact four class names.

- [ ] **Step 1: Add three new CSS variables for the cat's colors**

Find (from Task 1's result):
```css
  --txt:#e8ebf0;--sub:#9aa3b2;--accent:#ff8a5c;--accent2:#ffb26b;
  --ok:#37c07a;--warn:#ffb020;--danger:#ff5c5c;--r:18px;
  --safe-b:env(safe-area-inset-bottom,0px);
```
Replace with:
```css
  --txt:#e8ebf0;--sub:#9aa3b2;--accent:#ff8a5c;--accent2:#ffb26b;
  --ok:#37c07a;--warn:#ffb020;--danger:#ff5c5c;--r:18px;
  --catbody:#fff3e6;--catpatch:#ffb37a;--catline:#3a2c22;
  --safe-b:env(safe-area-inset-bottom,0px);
```

- [ ] **Step 2: Add the `.delta` CSS block**

Find the existing rule:
```css
.warnbox{margin-top:10px;background:rgba(255,92,92,.12);border:1px solid rgba(255,92,92,.35);color:#ffb3b3;padding:9px 12px;border-radius:11px;font-size:12.5px;line-height:1.5;display:none}
.warnbox.show{display:block}
```
Insert this new block directly after it:
```css
.delta{width:100%;display:flex;justify-content:center;margin-bottom:6px}
.delta svg{width:170px;height:145px;overflow:visible}
.delta .pose-sit,.delta .pose-lie{transition:opacity .4s}
.delta .pose-lie{opacity:0}
.delta.state-exhausted .pose-sit{opacity:0}
.delta.state-exhausted .pose-lie{opacity:1}
.delta .eyes-idle,.delta .eyes-content,.delta .eyes-tired,
.delta .mouth-idle,.delta .mouth-content,.delta .mouth-tired{opacity:0;transition:opacity .4s}
.delta.state-idle .eyes-idle,.delta.state-idle .mouth-idle{opacity:1}
.delta.state-content .eyes-content,.delta.state-content .mouth-content{opacity:1}
.delta.state-tired .eyes-tired,.delta.state-tired .mouth-tired{opacity:1}
.delta .ear-l,.delta .ear-r{transform-origin:center bottom;transition:transform .4s}
.delta.state-tired .ear-l{transform:rotate(-20deg)}
.delta.state-tired .ear-r{transform:rotate(20deg)}
.delta.state-idle .ear-l{transform:rotate(-8deg)}
.delta.state-idle .ear-r{transform:rotate(8deg)}
.delta.state-idle .pose-sit{animation:breathe 3.2s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
```

- [ ] **Step 3: Insert Delta's SVG markup into the 今日 page**

Find:
```html
    <section class="view active" id="v-today">
      <div class="card">
        <div class="gh">
```
Replace with:
```html
    <section class="view active" id="v-today">
      <div class="card">
        <div class="delta state-idle" id="delta" aria-hidden="true">
          <svg viewBox="0 0 200 170">
            <g class="pose-sit">
              <path d="M148 128 Q184 118 178 88 Q176 74 162 78" fill="none" stroke="var(--catpatch)" stroke-width="14" stroke-linecap="round"/>
              <ellipse cx="100" cy="122" rx="54" ry="40" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3"/>
              <ellipse cx="100" cy="134" rx="30" ry="22" fill="#fffaf3"/>
              <circle cx="100" cy="66" r="40" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3"/>
              <path d="M120 36 A40 40 0 0 1 138 66 A40 40 0 0 1 118 100 A44 46 0 0 0 120 36Z" fill="var(--catpatch)" opacity=".55"/>
              <g class="ear-l"><path d="M68 38 L52 4 L86 28 Z" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3" stroke-linejoin="round"/><path d="M69 31 L60 12 L79 26 Z" fill="var(--catpatch)"/></g>
              <g class="ear-r"><path d="M132 38 L148 4 L114 28 Z" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3" stroke-linejoin="round"/><path d="M131 31 L140 12 L121 26 Z" fill="var(--catpatch)"/></g>
              <g stroke="var(--catline)" stroke-width="2" stroke-linecap="round" opacity=".5">
                <path d="M62 70 L38 66"/><path d="M62 76 L38 78"/>
                <path d="M138 70 L162 66"/><path d="M138 76 L162 78"/>
              </g>
              <g class="eyes-idle">
                <path d="M78 64 Q85 59 92 64" fill="none" stroke="var(--catline)" stroke-width="3" stroke-linecap="round"/>
                <path d="M108 64 Q115 59 122 64" fill="none" stroke="var(--catline)" stroke-width="3" stroke-linecap="round"/>
              </g>
              <g class="eyes-content">
                <circle cx="85" cy="64" r="6" fill="var(--catline)"/><circle cx="87" cy="61" r="1.6" fill="#fff"/>
                <circle cx="115" cy="64" r="6" fill="var(--catline)"/><circle cx="117" cy="61" r="1.6" fill="#fff"/>
              </g>
              <g class="eyes-tired">
                <path d="M78 64 A7 7 0 0 0 92 64 Z" fill="var(--catline)"/>
                <path d="M108 64 A7 7 0 0 0 122 64 Z" fill="var(--catline)"/>
              </g>
              <path d="M97 74 L103 74 L100 78 Z" fill="var(--catpatch)"/>
              <path class="mouth-idle" d="M96 82 L104 82" fill="none" stroke="var(--catline)" stroke-width="2.4" stroke-linecap="round"/>
              <path class="mouth-content" d="M90 80 Q100 88 110 80" fill="none" stroke="var(--catline)" stroke-width="2.4" stroke-linecap="round"/>
              <ellipse class="mouth-tired" cx="100" cy="83" rx="4.5" ry="3.5" fill="var(--catline)"/>
            </g>
            <g class="pose-lie">
              <path d="M155 132 Q120 148 90 140" fill="none" stroke="var(--catpatch)" stroke-width="13" stroke-linecap="round"/>
              <ellipse cx="105" cy="128" rx="70" ry="26" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3"/>
              <ellipse cx="105" cy="136" rx="42" ry="14" fill="#fffaf3"/>
              <circle cx="55" cy="112" r="30" fill="var(--catbody)" stroke="var(--catline)" stroke-width="3"/>
              <path d="M70 92 A30 30 0 0 1 82 112 A30 30 0 0 1 68 136 A33 34 0 0 0 70 92Z" fill="var(--catpatch)" opacity=".55"/>
              <path d="M38 98 L28 78 L52 92 Z" fill="var(--catbody)" stroke="var(--catline)" stroke-width="2.5" stroke-linejoin="round"/>
              <path d="M70 98 L84 82 L60 92 Z" fill="var(--catbody)" stroke="var(--catline)" stroke-width="2.5" stroke-linejoin="round"/>
              <path d="M42 110 Q47 106 52 110" fill="none" stroke="var(--catline)" stroke-width="2.6" stroke-linecap="round"/>
              <path d="M58 110 Q63 106 68 110" fill="none" stroke="var(--catline)" stroke-width="2.6" stroke-linecap="round"/>
              <path d="M50 120 L60 120" fill="none" stroke="var(--catline)" stroke-width="2" stroke-linecap="round"/>
              <text x="95" y="80" font-size="16" fill="var(--catpatch)" opacity=".9">z</text>
              <text x="112" y="66" font-size="12" fill="var(--catpatch)" opacity=".7">z</text>
            </g>
          </svg>
        </div>
        <div class="gh">
```

- [ ] **Step 4: Verify in browser**

Reload `http://localhost:8000`. On the 今日 tab, confirm:
- A cream-colored Q 版 cat sitting above the load number/bar, with visible ears, a curled tail, whiskers, and closed "resting" eyes (this is the default `state-idle` markup).
- It gently bobs up and down (breathing animation).
- No layout breakage in the card below it (load number and gauge still render normally).

This is a static visual check only — the cat won't react to tasks yet, that's Task 3. If the proportions or colors look off once you see it rendered, this is the point to nudge the SVG coordinates/colors by eye before moving on.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/liangli
git add index.html
git commit -m "Add static Delta cat SVG with four expression states to Today page"
```

---

### Task 3: Wire Delta's state to the existing load calculation

**Files:**
- Modify: `index.html`, function `renderLoad()` (around line 351-360)

**Interfaces:**
- Consumes: `#delta` element and the four `state-*` class names produced by Task 2.
- Produces: `#delta`'s class now updates live every time `renderLoad()` runs (i.e. on every task add/toggle/delete, and on load).

- [ ] **Step 1: Add state calculation to `renderLoad()`**

Find:
```js
function renderLoad(){
  const used=S.tasks.filter(t=>!t.done).reduce((s,t)=>s+t.energy,0);
  const max=S.loadMax, pct=Math.min(100,used/max*100);
  document.getElementById('loadUsed').textContent=used;
  document.getElementById('loadMax').textContent=max;
  const bar=document.getElementById('loadBar');
  bar.style.width=pct+'%';
  bar.style.background = used>max?'var(--danger)':used>max*0.8?'var(--warn)':'var(--ok)';
  document.getElementById('loadWarn').classList.toggle('show',used>max);
}
```
Replace with:
```js
function renderLoad(){
  const used=S.tasks.filter(t=>!t.done).reduce((s,t)=>s+t.energy,0);
  const max=S.loadMax, pct=Math.min(100,used/max*100);
  document.getElementById('loadUsed').textContent=used;
  document.getElementById('loadMax').textContent=max;
  const bar=document.getElementById('loadBar');
  bar.style.width=pct+'%';
  bar.style.background = used>max?'var(--danger)':used>max*0.8?'var(--warn)':'var(--ok)';
  document.getElementById('loadWarn').classList.toggle('show',used>max);

  const state = used===0 ? 'idle' : used>max ? 'exhausted' : used>max*0.8 ? 'tired' : 'content';
  document.getElementById('delta').className = 'delta state-'+state;
}
```

- [ ] **Step 2: Verify in browser — walk the cat through all four states**

Reload `http://localhost:8000` on the 今日 tab with an empty task list.
1. Empty list → cat shows `state-idle` (resting eyes, breathing animation, ears slightly relaxed).
2. Add one "轻 10" task → total 10/100 (10%) → cat switches to `state-content` (round open eyes, small smile, ears upright, breathing animation stops).
3. Add tasks until total is between 80 and 100 (e.g. add a few more "重 45" tasks to land at, say, 90/100) → cat switches to `state-tired` (half-lidded eyes, open "panting" mouth, ears drooped).
4. Add one more task to push total over 100 (e.g. to 135/100) → cat switches to `state-exhausted`: the whole pose swaps to lying down, closed eyes, flat mouth, "z z" floating near it. Confirm the pose swap is a smooth cross-fade, not an instant jump.
5. Delete tasks to bring the total back down through each threshold → confirm the cat transitions back through tired → content → idle correctly in reverse, matching the same 80%/100% boundaries as the load bar's own color changes (compare cat state to bar color at each step — they should always agree: green=content or idle, yellow=tired, red=exhausted).
6. Toggle a task as done (checkbox) rather than deleting it → confirm done tasks stop counting toward load (existing behavior) and the cat updates accordingly.

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/liangli
git add index.html
git commit -m "Wire Delta's expression state to the existing energy-load thresholds"
```

---

### Task 4: Final cross-tab check and service worker version bump

**Files:**
- Modify: `sw.js:3`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Full manual pass across all five tabs**

With the local server still running, click through 今日 / 成长池 / 目标 / 专注 / 记录 and confirm:
- All five tabs use the coral/peach accent consistently (buttons, selected pills, focus ring color, links) — no leftover blue/purple.
- Delta is visible only on 今日, doesn't appear or leak into other tabs.
- Toggle language (top-right EN/中 button) and confirm nothing related to Delta or the palette breaks (Delta has no text, so this should be a no-op for it).
- Resize the browser window narrower (simulate a small phone, e.g. ~375px wide) and confirm Delta and the load card still fit without horizontal scrolling or overlap.

- [ ] **Step 2: Bump the service worker version**

Find in `sw.js`:
```js
const VERSION = 'liangli-v1';
```
Replace with:
```js
const VERSION = 'liangli-v2';
```

- [ ] **Step 3: Verify the version bump**

Run `cd ~/Documents/liangli && grep VERSION sw.js` and confirm it prints `liangli-v2`.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/liangli
git add sw.js
git commit -m "Bump service worker version for Delta cat + warm palette release"
```

---

## Plan self-review notes

- **Spec coverage:** Task 1 covers the design doc's "配色基调" section. Tasks 2–3 cover "Delta 状态机", "布局", and "实现方式" (no new storage, state derived in `renderLoad()`, no i18n touch). Task 4 covers the design doc's verification checklist items 1, 5, 6 (steps 2–4 of the doc's verification list are folded into Task 3's Step 2, since that's where the state transitions actually exist to test).
- **Type/name consistency:** `#delta` id and the four `state-idle`/`state-content`/`state-tired`/`state-exhausted` class names are defined in Task 2 and consumed as-is (no renaming) in Task 3. `renderLoad()`'s `used`/`max` variables are the same ones already in the function — no new globals introduced.
- **No placeholders:** every step above contains literal code to write, not a description of code to write.
