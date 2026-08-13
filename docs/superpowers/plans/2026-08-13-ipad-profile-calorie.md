# Powy iPad Profile and Calorie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a visible remaining-calorie dashboard, local avatar/wallpaper customization, Power app icons, and full-width iPad layouts.

**Architecture:** Keep canonical nutrition math and life storage unchanged; replace only the summary rendering. Store compressed appearance images in a separate IndexedDB and expose a small UI controller. Add CSS breakpoints without changing mobile behavior, and version the Service Worker so installed devices receive the release.

**Tech Stack:** Static HTML/CSS/JavaScript PWA, Canvas/WebP, IndexedDB, Python and Node contract tests.

## Global Constraints

- Mobile remains single-column below 768px.
- App width fills the viewport at 768px and above.
- Appearance images are device-local IndexedDB data and never enter core or Life cloud sync.
- Existing `liangli_*` persistence protocols remain compatible.
- Remaining calories preserve negative values.

---

### Task 1: Remaining calorie dashboard

**Files:** Modify `index.html`; test `tests/test_nutrition_tracker.js`, `tests/test_manga_ui_contract.py`.

- [ ] Add a failing UI contract for remaining/consumed/target nodes and negative styling.
- [ ] Render `summary.remaining`, `summary.consumed`, and target into separate semantic nodes.
- [ ] Run focused nutrition tests.

### Task 2: Local appearance customization

**Files:** Modify `index.html`; create `tests/test_profile_appearance.js`; modify `tests/test_manga_ui_contract.py`.

- [ ] Add failing tests for IndexedDB storage, file validation, replacement and reset.
- [ ] Add profile controls, image compression, durable storage and object URL lifecycle.
- [ ] Apply avatar and wallpaper and provide localized status/errors.
- [ ] Run focused appearance tests.

### Task 3: Full-width responsive iPad layout

**Files:** Modify `index.html`; modify `tests/test_manga_ui_contract.py`.

- [ ] Add failing CSS contracts for 768px full width and 1024px landscape two-column Life panels.
- [ ] Remove the tablet max-width and add bounded inner grids/readable card sizing.
- [ ] Verify mobile styles remain the default.

### Task 4: Power icon set and release

**Files:** Modify `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `sw.js`, tests and docs.

- [ ] Produce square Power source art from the supplied image and derive exact icon sizes.
- [ ] Upgrade shell cache and update version assertions.
- [ ] Run all tests, visual/media checks, commit, push `main`, and verify public Pages assets.
