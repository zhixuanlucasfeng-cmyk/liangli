# Powy Live2D Model Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved human and cat concept images into two validated Cubism 5 models with four looping energy motions, one tap reaction, physics, and posters.

**Architecture:** Rebuild each flat concept as layered source art, rig it in Live2D Cubism Editor, and export a fixed model package consumed by the web runtime. A small Python contract test validates filenames, JSON references, motion groups, and file-size ceilings before website integration begins.

**Tech Stack:** Live2D Cubism Editor 5.x, Cubism Viewer, layered PSD, PNG/WebP, Python `unittest`

**Spec:** `docs/superpowers/specs/2026-08-14-live2d-companion-design.md`

## Global Constraints

- Human and cat must remain original designs based on the approved concept files.
- Motions are silent and use the existing names `idle`, `content`, `tired`, `exhausted`, and `tap`.
- Keep continuous body physics restrained; quality comes from facial acting, breathing, hair, ears, tail, hands, and weight shifts.
- Each model must render at 30 FPS or better in Cubism Viewer before web integration.
- The public site keeps the MP4 companion until both models pass this plan.

---

### Task 1: Build the layered human source

**Files:**
- Read: `docs/superpowers/assets/live2d-companion/human-concept.png`
- Create: `assets/live2d-source/human/human.psd`
- Create: `assets/live2d-source/human/layer-map.md`

**Interfaces:**
- Consumes: the approved human concept image.
- Produces: a 4096×4096 layered PSD whose group names are stable inputs to Cubism Editor.

- [ ] **Step 1: Create the exact layer tree in `human.psd`**

```text
Human
├── Accessory_Back
├── Hair_Back
├── Body
│   ├── Arm_L / Hand_L
│   ├── Arm_R / Hand_R
│   ├── Torso
│   └── Bikini_Bottom
├── Neck
├── Face
│   ├── Face_Base
│   ├── Brow_L / Brow_R
│   ├── EyeWhite_L / EyeWhite_R
│   ├── Iris_L / Iris_R
│   ├── Highlight_L / Highlight_R
│   ├── Lid_L / Lid_R
│   └── Mouth_Closed / Mouth_Open / Mouth_Smile
├── Hair_Side_L / Hair_Side_R
├── Hair_Front
├── Horn_L / Horn_R
└── Accessory_Front
```

- [ ] **Step 2: Reconstruct hidden surfaces**

Paint complete face, forehead, scalp edge, neck, shoulders, torso, arms, and bikini edges behind overlapping hair and jewelry. Moving any single layer by 40 px in Photoshop must reveal no holes or copied background.

- [ ] **Step 3: Record the layer contract**

Write `layer-map.md` with one row per layer: `PSD group | Cubism ArtMesh ID | parent deformer | motion purpose`. Use IDs such as `ArtMeshEyeL`, `ArtMeshHairFront`, and `ArtMeshArmR`; do not use auto-generated numeric names.

- [ ] **Step 4: Run the separation check**

Hide each top-level group once, confirm no warm-gray background remains inside the character, then export a flattened proof PNG and compare it side-by-side with the approved concept.

- [ ] **Step 5: Commit**

```bash
git add assets/live2d-source/human
git commit -m "art: prepare layered human companion"
```

### Task 2: Build the layered cat source

**Files:**
- Read: `docs/superpowers/assets/live2d-companion/cat-concept.png`
- Create: `assets/live2d-source/cat/cat.psd`
- Create: `assets/live2d-source/cat/layer-map.md`

**Interfaces:**
- Consumes: the approved cat concept image.
- Produces: a 4096×4096 layered PSD with complete hidden fur and independently movable ears, face, paws, and tail.

- [ ] **Step 1: Create the exact layer tree in `cat.psd`**

```text
Cat
├── Tail_Back_03 / Tail_Back_02 / Tail_Back_01
├── Body_Back
├── HindLeg_L / HindLeg_R
├── Chest
├── FrontLeg_L / Paw_L
├── FrontLeg_R / Paw_R
├── Head
│   ├── Head_Base / Muzzle
│   ├── Brow_L / Brow_R
│   ├── EyeWhite_L / EyeWhite_R
│   ├── Iris_L / Iris_R
│   ├── Highlight_L / Highlight_R
│   ├── Lid_L / Lid_R
│   └── Mouth_Closed / Mouth_Open / Mouth_Smirk
├── Ear_L / EarTuft_L
├── Ear_R / EarTuft_R
├── FaceTuft_L / FaceTuft_R
├── Horn_L / Horn_R
└── Collar / Charm
```

- [ ] **Step 2: Reconstruct hidden fur**

Complete the body beneath chest fur, paws beneath leg fur, head beneath face tufts, and every tail segment beneath the segment above it. No layer may contain the warm-gray concept background.

- [ ] **Step 3: Record and verify the layer contract**

Write the same four-column map used by the human. Move both ears, both lids, both pupils, both front legs, and all three tail segments independently to verify clean overlaps.

- [ ] **Step 4: Commit**

```bash
git add assets/live2d-source/cat
git commit -m "art: prepare layered cat companion"
```

### Task 3: Rig and animate both models

**Files:**
- Create: `assets/live2d-source/human/human.cmo3`
- Create: `assets/live2d-source/cat/cat.cmo3`
- Create: `assets/live2d/human/**`
- Create: `assets/live2d/cat/**`

**Interfaces:**
- Consumes: the two approved PSD layer contracts.
- Produces: two Cubism models with identical motion group names and motion-end events.

- [ ] **Step 1: Bind standard parameters**

Both models expose `ParamAngleX`, `ParamAngleY`, `ParamAngleZ`, `ParamBodyAngleX`, `ParamBreath`, `ParamEyeLOpen`, `ParamEyeROpen`, `ParamEyeBallX`, `ParamEyeBallY`, `ParamMouthOpenY`, and `ParamMouthForm`. Human also exposes `ParamArmLA`, `ParamArmRA`, `ParamHairSwing`; cat exposes `ParamEarL`, `ParamEarR`, `ParamTailX`, and `ParamTailY`.

- [ ] **Step 2: Add restrained physics**

Human physics affects back/side hair, horn jewelry, and the crescent accessories. Cat physics affects ear tufts, cheek tufts, collar charm, and tail segments. Breathing must not visibly distort garment coverage.

- [ ] **Step 3: Author five motions per model**

```text
idle       4.0 s loop: slow breath, one blink, tiny weight shift
content    3.2 s loop: alert eyes, brighter posture, faster tail/hair settle
tired      4.5 s loop: slower blink, lowered head/ears, small yawn cue
exhausted  5.0 s loop: satisfied rest pose, eyes mostly closed, calm breath
tap        1.4 s once: human glances aside and brushes away; cat pins ears and flicks tail
```

Make each base motion's first and last keyframes identical. Add a `tap_finished` user-data event at the last frame of `tap`.

- [ ] **Step 4: Export the fixed package**

Export exactly `model.model3.json`, `model.moc3`, `model.physics3.json`, `textures/texture_00.png`, the five named `.motion3.json` files, and `poster.webp` under each model directory. Keep each texture edge at or below 2048 px.

- [ ] **Step 5: Verify in Cubism Viewer and commit**

Play every loop for three cycles, play `tap` five times from different loop frames, and confirm no mesh gaps, clipping, coverage failure, or end-frame jump. Then commit:

```bash
git add assets/live2d assets/live2d-source
git commit -m "feat: add rigged Live2D companions"
```

### Task 4: Add an automated asset contract

**Files:**
- Create: `tests/test_live2d_assets.py`

**Interfaces:**
- Consumes: `assets/live2d/{human,cat}/model.model3.json` and referenced files.
- Produces: a release gate that fails on missing motions, broken relative paths, or oversized textures.

- [ ] **Step 1: Write the failing contract test**

```python
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class Live2DAssetTests(unittest.TestCase):
    def test_models_are_complete_and_bounded(self):
        for character in ("human", "cat"):
            base = ROOT / "assets" / "live2d" / character
            model = json.loads((base / "model.model3.json").read_text())
            refs = model["FileReferences"]
            self.assertTrue((base / refs["Moc"]).is_file())
            self.assertTrue((base / refs["Physics"]).is_file())
            self.assertLessEqual(len(refs["Textures"]), 2)
            for texture in refs["Textures"]:
                path = base / texture
                self.assertTrue(path.is_file())
                self.assertLessEqual(path.stat().st_size, 4_000_000)
            motions = refs["Motions"]
            for name in ("idle", "content", "tired", "exhausted", "tap"):
                self.assertEqual(len(motions[name]), 1)
                self.assertTrue((base / motions[name][0]["File"]).is_file())
            self.assertTrue((base / "poster.webp").is_file())
```

- [ ] **Step 2: Run it before export to verify it fails**

Run: `python3 -m unittest tests.test_live2d_assets`

Expected: FAIL because `assets/live2d/human/model.model3.json` is absent.

- [ ] **Step 3: Export/fix assets until the contract passes**

Run: `python3 -m unittest tests.test_live2d_assets`

Expected: PASS for both models.

- [ ] **Step 4: Commit**

```bash
git add tests/test_live2d_assets.py assets/live2d
git commit -m "test: validate Live2D companion assets"
```
