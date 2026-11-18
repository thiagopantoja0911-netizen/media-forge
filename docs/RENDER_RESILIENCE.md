# MediaForge — render resilience

## Runtime behavior

The Windows HyperFrames worker uses a conservative capture profile by default:

- 180 seconds without captured-frame progress before the capture watchdog trips.
- 300 seconds for a Puppeteer CDP call, 180 seconds for page navigation and 120 seconds for player readiness.
- MP4 renders of at least 10 seconds use segmented capture with 300 frames per segment.
- Chrome is recycled at every segment boundary.
- The CLI receives `--resume`, so a subsequent attempt can validate and reuse completed segments.
- Up to three total attempts are made for transient capture, browser, protocol and memory failures. Backoff is 10 seconds, then 30 seconds.
- Attempts after the first shorten the segment size to 150 frames (or a smaller operator override), reducing peak browser/frame memory. Resolution, FPS, quality and authored scene timing are not silently downgraded.

Preflight, composition, GSAP, audio-QA and technical-QA errors are not retried as transient failures.

## Diagnostics

On a failed attempt the worker records:

- CPU logical-core count and load average where the OS exposes it.
- System memory and Node process memory.
- Free/total disk space for the render output directory.
- GPU utilization as unavailable unless a vendor-specific telemetry provider is installed.

The worker reports this snapshot with the failed job. A missing GPU metric is never replaced by an invented estimate.

## Optional overrides

Use these environment variables in the local worker configuration when an operator intentionally needs a different profile:

| Variable | Default |
|---|---:|
| `MEDIAFORGE_CAPTURE_STALL_MS` | 180000 |
| `MEDIAFORGE_PROTOCOL_TIMEOUT_MS` | 300000 |
| `MEDIAFORGE_PAGE_NAVIGATION_TIMEOUT_MS` | 180000 |
| `MEDIAFORGE_PLAYER_READY_TIMEOUT_MS` | 120000 |
| `MEDIAFORGE_SEGMENTED_CAPTURE` | true |
| `MEDIAFORGE_SEGMENT_MIN_SECONDS` | 10 |
| `MEDIAFORGE_SEGMENT_FRAMES` | 300 |
| `MEDIAFORGE_SEGMENT_BROWSER_RECYCLE` | 1 |
| `MEDIAFORGE_RETRY_SEGMENT_FRAMES` | 150 |
| `MEDIAFORGE_RENDER_MAX_ATTEMPTS` | 3 (hard cap) |

## Rollout

1. Run Node unit tests and the cinematic WebGL smoke workflow.
2. Merge the tested PR into `feature/unific-media-20261116`; Hostinger staging is connected to this branch.
3. After Hostinger publishes the merged branch, the staging TLS/OAuth/authentication probe runs on the push to `feature/unific-media-20261116`. Then run `desktop/update-worker.cmd` (a self-contained launcher). It downloads the prepared PowerShell scripts from the public repository, detects the active Windows installation, updates it safely, waits for a fresh heartbeat, then requeues only the three confirmed transient capture failures. It uses the existing DPAPI worker token in memory and never prints it.
4. Confirm worker heartbeat and an isolated short render before retrying previous failed jobs.
