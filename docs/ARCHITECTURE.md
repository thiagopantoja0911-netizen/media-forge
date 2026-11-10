# MediaForge architecture

## Product boundary

MediaForge is the orchestration layer. It does not need to own every editor or model. It converts a natural-language prompt into a reproducible media job and delegates each stage to a local adapter.

## Target pipeline

1. Prompt intake
2. Structured job creation
3. Job validation
4. Asset planning or generation
5. Voice and audio preparation
6. HyperFrames composition
7. Quality gate
8. FilmCraft post-production
9. Local export
10. Status and artifact reporting

## Adapters

### HyperFrames

Responsible for deterministic motion graphics, product UI, typography, transitions and timeline composition.

### VoiceStudio

Responsible for voice generation, cloning, narration, dubbing and transcription. Its output becomes an audio asset with duration and loudness metadata.

### FilmCraft

Responsible for final edit, audio mix, color, captions and export. It should receive a render plan and intermediate assets, not an unvalidated prompt.

### Open-Higgsfield-AI

Optional asset-generation adapter for scenes that need generated images, video clips or lip sync. Generated assets must be cached and recorded in the job manifest.

## Quality gates

Every job should be checked before expensive rendering:

- duration and aspect ratio;
- safe margins for text;
- first-frame visibility;
- timeline starts at t=0;
- asset paths are local and allowed;
- audio duration matches or intentionally exceeds the composition;
- voice and music loudness are normalized;
- required codecs are available;
- final resolution and bitrate match the selected preset.

## Quality presets

Suggested presets:

- social-fast: 1080x1920, 30 fps, quick preview;
- social-premium: 1080x1920, 30 fps, high bitrate, normalized audio;
- landscape-premium: 1920x1080, 30 fps;
- square-premium: 1080x1080, 30 fps;
- master: configurable high-quality intermediate.

## Local execution

The local worker is the only component allowed to touch the user's media folders. The orchestrator stores manifests and status; it should not require cloud storage for the final MP4.

## Integration order

1. Keep dry-run and validation green.
2. Add a HyperFrames adapter for a known-good template.
3. Add VoiceStudio output ingestion.
4. Add FilmCraft export.
5. Add Open-Higgsfield asset generation behind an explicit opt-in.
6. Add the ChatGPT/MCP interface.
