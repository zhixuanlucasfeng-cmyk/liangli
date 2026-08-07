# Semantic Companion Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scale-like companion loops with eight fixed-camera, semantically animated character loops whose background exactly matches the UI.

**Architecture:** Keep stable asset paths and the current dual-video controller. Generate or animate new source clips, normalize them with ffmpeg, strengthen the verifier against global zoom, then remove UI filters that alter the encoded background.

**Tech Stack:** MP4/H.264, ffmpeg/ffprobe, Python/Pillow/NumPy, vanilla CSS/JS.

## Global Constraints

- Preserve two characters and `idle/content/tired/exhausted` path names.
- 512×512, 30fps, 2–4 seconds, H.264 yuv420p, no audio, fixed camera.
- Exact background `#0b0c0f`; no global camera zoom or pan.
- Each clip must show independent motion in at least two anatomical regions.
- Preserve dual-video crossfade, poster fallback, reduced-motion behavior, and runtime Range cache.

---

### Task 1: Strengthen motion acceptance tests

**Files:**
- Modify: `scripts/verify_companion_media.py`
- Modify: `tests/test_manga_ui_contract.py`

- [ ] Add a global-transform detector that estimates border/background stability and rejects clips whose foreground bounding box changes almost uniformly.
- [ ] Require a minimum difference between two anatomical ROI motion curves and report the metric per clip.
- [ ] Add an exact corner/background RGB tolerance for `#0b0c0f`.
- [ ] Run `python3 scripts/verify_companion_media.py`; expect current clips to FAIL the new semantic/global-zoom checks.
- [ ] Commit with `git commit -m "test: reject global zoom companion loops"`.

### Task 2: Produce and normalize eight semantic loops

**Files:**
- Replace: `assets/power-cat/*.mp4`, `assets/power-human/*.mp4`
- Replace: matching `*.webp`
- Modify: `scripts/generate_companion_media.py` or add an auditable source-normalization path there

- [ ] Generate fixed-camera source motion for each approved state performance.
- [ ] Reject any source with limb fusion, facial drift, camera motion, background shimmer, or non-looping endpoints.
- [ ] Normalize each accepted source with ffmpeg to 512×512, 30fps, H.264/yuv420p, no audio, faststart, and ≤700KB.
- [ ] Export the exact first representative frame as the corresponding WebP poster.
- [ ] Run the verifier until all eight clips PASS; do not weaken thresholds for one failing clip.
- [ ] Commit with `git commit -m "feat: replace companion loops with semantic motion"`.

### Task 3: Unify stage color and playback presentation

**Files:**
- Modify: `index.html`
- Modify: `sw.js`

- [ ] Add `--companion-bg:#0b0c0f` and apply it to the stage, video, poster, and loading fallback.
- [ ] Remove the whole-media contrast/saturation filter that changes the encoded background.
- [ ] Keep object sizing, request cancellation, crossfade, and reduced-motion contracts unchanged.
- [ ] Bump the shell and video cache versions so old media cannot survive deployment.
- [ ] Run all Python/Node tests and verify rapid state/character switching in real mobile viewports.
- [ ] Commit with `git commit -m "fix: blend companion media into the manga stage"`.

