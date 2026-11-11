# HyperFrames composition pipeline

## Current implementation

`src/creator-composer.mjs` converts the MediaForge planning manifest into an editable 9:16 HyperFrames package:

- one root `index.html` with five scene hosts, one captions track, two optional audio tracks and four timed transition hosts;
- five independent scene sub-compositions with distinct flat-color editorial layouts;
- a dedicated captions composition with timed caption groups positioned inside the portrait title-safe area;
- four distinct deterministic transitions: editorial flash, scribble wipe, iris reveal and whip sweep;
- stable IDs, paused GSAP timelines, timed clips, per-scene editable headline/color variables and `.motion.json` seek assertions for scene titles, labels, captions and transition arrivals;
- escaped user text and a `creator-storyboard.json` source record;
- default delivery profile: 2160 × 3840, 60 FPS, High.

VoiceStudio is kept as an independent application/repository (AGPL-3.0). For now, users can export a narration file from VoiceStudio and attach it in Creator Studio; no VoiceStudio source code is copied into MediaForge and no local VoiceStudio API connection is assumed.

## Deliberate delivery gate

The composer returns `readiness.renderReady=false` and **does not create a job**. The current package is a kinetic-typography prototype, not a finished explainer. It still needs:
- a generated/attached narration audio file (the Studio can package user-supplied WAV/MP3 and related formats);
- music and specific sound effects (the Studio can attach a music bed; scene SFX are still pending);
- subject-specific image/video assets; the current visual treatment is a typographic/color-block prototype;
- current-revision HyperFrames CLI check, snapshot generation and visual review on the target Worker.

The caption band is placed at `bottom: 1200px` in a 2160 × 3840 composition, keeping its two-line box inside the 9:16 platform-safe region. Scene labels use 56 px source typography (28 px at 1080 × 1920) to meet the minimum phone-readable text floor. Scene labels are editable through the `sceneLabel` composition variable. The four transitions are deterministic and run across the scene boundaries; they do not authorize queue submission.

Do not bypass these blockers by posting the package directly to `/v1/jobs`. The next integration step must attach verified media, inspect the preview, then require explicit approval before queue submission.
