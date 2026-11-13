# MediaForge — Frame Lab (isolated analysis environment)

A separate Node 22 app with a Python 3 / OpenCV analysis engine. This project does not call MediaForge's render worker or mutate the production jobs queue.

## What is truly inspected

- Every decoded reference frame is retained as a WebP; frame-to-frame analysis never skips a source frame.
- Uses all native-resolution pixels for Farneback dense optical flow; foreground proposals are relative to estimated background flow.
- Subpixel feature tracks for labeled objects: pyramidal LK + robust affine transform estimate (X/Y translation, rotation, scale X/Y, shear proxy, deformation residual); phase correlation fallback.
- At every frame boundary, compute each object's position, velocity, acceleration and jerk, to identify easing and changes in rhythm.
- Store an amplified optical flow heatmap on every reference frame, useful for motions below one pixel per frame.
- A separate reconstruction can be paired by nearest presentation timestamp; renders and reference frames remain separate; pixel differences are saved and never replaced with source footage.
- Full per-frame JSON report and WebP frame sequence for manual inspection. Web UI offers exactly ±1 frame navigation and ROI annotation.
- Analysis does NOT imply reconstructing temporal information missing between captured frames; alpha and 3D geometry cannot be recovered exactly from flattened pixels.

## Deployment

Node >=22; Python >=3.10 with pip/venv and OpenCV; ffprobe recommended for VFR timestamps. npm run build installs requirements into a private .venv (Python OpenCV + numpy).

Configure a strong 24+ character FRAME_LAB_KEY only in server environment, never Git; NODE_ENV=production. If the Hostinger build environment does not have Python/venv support, build should fail closed rather than publish a misleading analysis UI. Set FRAME_LAB_DATA_DIR to a writable private persistent directory outside public HTML. Do not reuse the MediaForge queue, storage or worker tokens.

Run in Docker with a private key via your container secrets manager if Python is not available on managed Node hosting.

## API

The UI at /frame-lab uses x-frame-lab-key per API request; the key stays in page memory and is not sent via URL/local storage.

- GET /health: Node process health (no private data).
- POST /api/auth: verify key.
- GET /api/capabilities: check OpenCV/ffprobe availability (authenticated).
- POST /api/projects: create isolated random project id.
- POST /api/projects/:id/upload/reference: raw video bytes; optional /render; max 120 MB by default.
- POST /api/projects/:id/objects: up to 40 labeled bounding boxes and start frames.
- POST /api/projects/:id/analyze: launch bounded one-at-a-time full-frame analysis.
- GET /api/projects/:id/status: progress.
- GET /api/projects/:id/report: exhaustive data.
- GET /api/projects/:id/frames/:kind/:index: each WebP (reference, render, diff, flow).

All private endpoints require the configured key. Scripts accept only a fixed input media path and do not execute user commands.

## Local

    cd frame-lab
    npm run build
    FRAME_LAB_KEY=a-new-random-24-plus-char-key npm start

The video itself must be supplied via the UI. The previous ChatGPT conversation's binary upload is not automatically available to the isolated service.

## QA

Run GitHub Actions workflow Frame Lab QA, which verifies Python/Node syntax and a synthetic moving-object clip with every captured frame; check the status before merging. First deployment should remain isolated from mediaforge.salevo.site.
