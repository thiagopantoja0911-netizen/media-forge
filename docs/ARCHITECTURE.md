# MediaForge architecture

## Product boundary

MediaForge is the orchestration layer. It converts a natural-language prompt and project files into a reproducible media job and delegates each stage to a local adapter.

## Target pipeline

1. Prompt intake
2. Structured job creation
3. Project file materialization
4. Job validation
5. Asset planning or generation
6. Voice and audio preparation
7. HyperFrames composition
8. Quality gate
9. FilmCraft post-production
10. Local export
11. Status and artifact reporting

## ChatGPT job contract

The orchestrator sends one JSON payload containing:

- prompt;
- project metadata;
- projectFiles, including index.html and compositions;
- optional voice instructions;
- optional assets and metadata.

The server materializes the project under a per-job directory and never accepts absolute paths or parent-directory traversal.

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

## Local execution

The local worker is the only component allowed to touch the user's media folders. The orchestrator stores manifests and status; it should not require cloud storage for the final MP4.
