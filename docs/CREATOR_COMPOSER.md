# HyperFrames composition pipeline

## Current implementation

`src/creator-composer.mjs` converts the MediaForge planning manifest into an editable 9:16 HyperFrames package:

- one root `index.html` with five scene hosts;
- five independent scene sub-compositions;
- stable IDs, paused GSAP timelines, and timed clips;
- per-scene editable headline/accent variables;
- escaped user text and a `creator-storyboard.json` source record;
- default delivery profile: 2160 × 3840, 60 FPS, High.

## Deliberate delivery gate

The composer returns `readiness.renderReady=false` and **does not create a job**. The current package is a kinetic-typography prototype, not a finished explainer. It still needs:
- a generated/attached narration audio file;
- music and specific sound effects;
- subject-specific image/video assets;
- HyperFrames CLI check and snapshot review on the target Worker.

Do not bypass these blockers by posting the package directly to `/v1/jobs`. The next integration step must attach verified media, inspect the preview, then require explicit approval before queue submission.
