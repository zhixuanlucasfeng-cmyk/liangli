# Powy Live2D Companion Design

Date: 2026-08-14

## Goal

Replace the current low-quality MP4 companion loops with two original, real-time 2D companions: a human character and a cat. Both companions keep the existing four energy states and react immediately when tapped, while remaining smooth on iPad Safari and usable offline as a PWA.

Approved concepts:

- [Human companion](../assets/live2d-companion/human-concept.png)
- [Cat companion](../assets/live2d-companion/cat-concept.png)

The human is an adult original character. The final approved outfit is an opaque charcoal-and-dusty-rose bikini with gold crescent details. The cat uses the same charcoal, dusty-rose, burgundy, amber, and gold visual language.

## Chosen approach

Use the official Live2D Cubism SDK for Web, stored locally with its required notices so the existing content-security policy and offline mode still work.

The alternatives are rejected:

- More MP4 clips would be quicker, but would retain visible switching, background matching, file-size, and interaction limitations.
- A custom CSS/canvas bone system would duplicate animation-engine work and still look worse.
- A third-party Live2D wrapper would add another dependency without removing the need for a correctly rigged model.

## Scope

The first release includes:

- Human and cat selection, preserving the current saved preference.
- `idle`, `content`, `tired`, and `exhausted` looping motions for each model.
- One non-looping tap reaction per model.
- Immediate return to the latest energy-state motion when the reaction ends.
- Static poster fallback for loading failure, reduced-motion preference, and unsupported rendering.
- Lazy loading and offline caching of the selected model.

Random reactions, dialogue, sound, lip sync, costume switching, affection levels, and a model marketplace are intentionally excluded.

## Model-production pipeline

The approved flat concept images are references, not rig-ready models. Each must be rebuilt as layered artwork with hidden surfaces completed before Cubism rigging.

Human layers include back hair, side hair, front hair, face, brows, eyelids, eyes, pupils, mouth shapes, neck, torso, both arms, both hands, bikini pieces, horns, and jewelry. Motion should keep body physics restrained and calm; the quality should come from facial acting, breathing, hair, hands, and weight shifts rather than exaggerated body movement.

Cat layers include back fur, head, muzzle, eyelids, eyes, pupils, ears, ear tufts, chest, front legs, paws, hind body, tail segments, horns, collar, and charm.

Each exported model directory contains:

```text
assets/live2d/<human|cat>/
├── model.model3.json
├── model.moc3
├── textures/
├── model.physics3.json
├── idle.motion3.json
├── content.motion3.json
├── tired.motion3.json
├── exhausted.motion3.json
├── tap.motion3.json
└── poster.webp
```

## Runtime behavior

The current energy calculation remains the single source of truth. It continues to produce one of the four existing state names.

The companion controller has two priorities:

1. `reaction`: a tap motion currently playing.
2. `base`: the latest energy-state loop.

On tap, the controller records the current base state and plays `tap` once. Energy can change while the reaction is playing; the controller only updates the pending base state. When the motion-end callback fires, it starts the latest pending base motion. Repeated taps during the reaction are ignored.

Changing companion cancels the current reaction, shows the destination poster, loads only the selected model, then swaps to its base motion when ready. The inactive model is released to keep iPad memory use bounded.

When the Today view is hidden or the document becomes hidden, rendering pauses. Returning to Today resumes the latest base state. No motion has audio.

## UI and accessibility

- Replace the video elements inside the existing companion stage with a canvas plus the existing poster layer.
- Keep the current character picker and accessible status text.
- Make the entire visible character a tap target without adding a separate button over the face.
- Give the canvas an accessible button role and label describing the selected character and current state.
- Keyboard Enter and Space trigger the same reaction.
- With `prefers-reduced-motion: reduce`, keep the static poster and use no continuous animation.
- The canvas stays transparent so the stage background always matches the active UI theme.

## Performance and offline behavior

- Load the poster first and start the SDK/model only when Today is visible.
- Preload the selected model's tap motion after its base motion is ready.
- Target tap response under 100 ms after preload and at least 30 FPS on supported iPad Safari devices.
- Cache the runtime and selected model assets after first successful fetch rather than adding both full models to the initial install shell.
- A failed model or motion load must leave the poster visible and must not block tasks or navigation.

## Integration boundaries

The existing load thresholds, stored companion preference, character picker, state labels, and daily rollover remain unchanged. The current MP4 controller is replaced behind the same `renderCompanion(state)`, `setCompanion(name)`, and Today-view visibility flow so unrelated task logic does not change.

The Service Worker cache version is incremented when the runtime is released. The old MP4 files stay available for one release only as a rollback path, then can be deleted after production verification.

## Testing

Add one focused controller test covering:

- Energy state selects the matching base motion.
- Tap interrupts base motion once.
- A state change during tap becomes the pending base.
- Motion end resumes the latest pending base.
- Repeated taps are ignored.
- Hidden Today and reduced motion pause or bypass rendering.
- Load failure preserves the poster fallback.

Existing companion-selection, daily-load, PWA, and accessibility contract tests must continue to pass. Browser verification covers desktop Chrome and iPad Safari portrait and landscape.

## Release gate

Do not replace the production MP4 companion until both rigged models exist and the human, cat, all four base motions, tap reactions, poster fallback, offline load, and iPad Safari checks pass. Until then, the current companion remains the production fallback.
