# Forge Midjourney: controlled real-video rendering

## Purpose and limits

This flow is built into the **existing** MediaForge site \`/studio\`, not an independent deployment.
It reuses the persistent job queue, authenticated MediaForge session, Windows remote worker and HyperFrames CLI.
It is for **controlled first renders** and does not represent automatic artistic approval or a fully autonomous text-to-video generator.
No external image/video/voice generation is connected automatically; all external media must have licensing/permission.

## End-to-end path

1. Sign in at \`https://mediaforge.salevo.site/dashboard\`, then open \`/studio\`.
2. Provide concept, audience, duration and intended motion, choose one hook.
3. Generate the five timed scenes and edit spoken copy, screen text and causal visual action.
4. Attach a real image/video to **each** scene (JPEG/PNG/WEBP/MP4/WEBM, max 5 MiB per file).
5. Optionally attach an individual sound effect to each scene (up to 2 MiB each); attach voice narration and optional music.
6. Check that narration is within 1.5s of the video duration and every video clip is long enough for its scene. All binary media **together** must remain within 18 MiB.
7. Click **Gerar pacote HyperFrames** for an editable package only. This never creates a job.
8. Click **Renderizar teste no Windows**, explicitly confirm consumption of Windows processing; the authorized same-origin session calls \`POST /api/studio/render\`.
9. The server regenerates and validates the composition; **only if** \`readiness.testRenderReady=true\` will it persist a job, with \`metadata.mode=controlled-test\`, plus files.
10. The Windows worker claims the job through the existing lease-based queue, downloads project files, runs HyperFrames \`check --json --no-craft\` and renders an MP4.
11. The updated worker uses FFprobe when available for real-file resolution, FPS, duration and audio-stream verification. Failure -> failed job; absent FFprobe -> \`unverified\`, not a false pass.
12. The worker records local Windows MP4 path, file size, SHA-256 and QA results in the job, visible through authenticated \`GET /api/studio/jobs/:id\`; the browser polls and shows the path. The MP4 is **not** automatically uploaded to Hostinger/ChatGPT.
13. Review the actual MP4: script clarity, first frame, real subject, subtitle safe zones, transitions, audio mix and word-action sync. \`artisticQA\` stays pending until explicit review. Do **not** publish the result automatically.

## Separate gate meanings

- \`readiness.testRenderReady\`: valid media package for a controlled, billed-by-local-compute test.
- \`readiness.renderReady\`: deliberately stays false, because final delivery needs review and possible corrections.
- \`report.technicalQA.status\`: \`passed\`, \`failed\`, \`unverified\` based on FFprobe inspection of the **real MP4**.
- \`report.artisticQA\`: pending user review. Technical checks never imply professional creative quality.

A test may complete without passing artistic QA. Only final users can approve the edit.

## Windows worker update

GitHub/Hostinger deploy **does not update an already running Windows process**.
After publishing the tested branch, run on the machine where MediaForge is installed:

\`\`\`powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MediaForge-Staging\desktop\update-worker-safe.ps1"
\`\`\`

**Important:** if the updater script is not present on the old checkout yet, fetch its contents from the media-forge GitHub repository into the install's \`desktop\` directory or use the reviewed standalone script; do not execute an unreviewed remote \`Invoke-Expression\`.
The updater verifies origin, branch, clean tracked files and existence of \`.env.local\`, then fast-forwards only.
It preserves \`.env.local\`, worker tokens, \`.mediaforge\`, local projects and MP4s and restarts only the MediaForge Windows scheduled task if present.
It does **not** run \`desktop/install-worker.ps1\` (which would overwrite \`.env.local\`).

If FFprobe is unavailable in PATH, technical verification is marked unverified; install FFmpeg/FFprobe before accepting outputs as verified.

## Security and resource limits

- Admin session + same-origin policy required for compose/render; render requires \`confirmControlledRender=true\`.
- Only per-project relative paths, normalized fixed asset locations, limited file formats and Base64 validation.
- No remote asset URL fetch; SVG/HTML files rejected as source media.
- No user media/tokens in GitHub commits; local draft stores only text, never binary assets.
- Files can be up to 80 entries and 24 MiB decoded through the existing job pipeline.
- No asynchronous external uploads, no purchases and no Instagram publication.
- The browser will lose attached binary files on reload; keep your own originals.

## Current missing capabilities

Automated external **AI** scene generation (image/video), VoiceStudio TTS generation, music composition, advanced FilmCraft editing and automatic perceptual/aesthetic scoring are still integrations to implement when a provider, credentials, licensed assets and usage budget are explicitly configured.
The current flow **does** render genuine user-supplied media under an explicit local test gate; it must not be described as autonomous high-end text-to-video.
