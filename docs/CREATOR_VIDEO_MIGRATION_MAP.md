# Creator Video / Vídeos Secrets → MediaForge

Date: 2026-11-11
Target repository: \`thiagopantoja0911-netizen/media-forge\`
Migration branch: \`migration/creator-video-to-mediaforge\`
Source repository: private \`thiagopantoja0911-netizen/Secretssysten\`

## Source inventory (verified)

The video system is spread across several branches; the Secrets repository \`main\` is not a complete source for this product.

| Source branch | Head (short SHA) | Relevant source | Migration decision |
|---|---|---|---|
| \`feat/video-studio\` | \`d94327ab68\` | \`apps/video-studio/{src/server.mjs,public/index.html,public/agent/worker.mjs,package.json,README.md}\` | Reuse job/dashboard/worker behavior as reference; do not deploy its separate MySQL/OIDC service. |
| \`feat/videos-secrets-desktop\` | \`c1e18f8002\` | \`apps/videos-secrets-desktop/{AgentHost.cs,BackgroundAgent.cs,BackgroundTaskManager.cs,AutoUpdater.cs,MainForm.cs,Program.cs,agent/worker-desktop.mjs,installer.iss,installer.nsi}\` | Port 4K60 High profile, background supervision, progress, logs, retries, secure token handling and verified updates into MediaForge-native worker components. |
| \`deploy/videos-secrets-php-live\` | \`9652ef8691\` | \`api/{bootstrap.php,index.php,mcp.php,oauth.php,oauth_support.php,health.php},dashboard.php,assets/gsap.min.js,tests/*,desktop/latest.json\` | Use as the production PHP behavior reference. Port features; do not copy PHP runtime or old-domain URLs. |
| \`fix/videos-mcp-2026-stateless-20261109\` | \`ea103361e7\` | \`api/mcp.php\`, OAuth/MCP tests | Port MCP 2026-07-28 stateless discovery and request-header validation. |
| \`feat/videos-secrets-auto-downloads\` | \`fbbf894895\` | Earlier Node Video Studio + desktop worker | Historical predecessor; use only where it contains a behavior absent from the newer desktop source. |

## Relevant capabilities to preserve

- Complete HyperFrames project transfer: \`index.html\`, \`compositions/*.html\`, media and font assets.
- Local/offline GSAP: detect GSAP projects, normalize CDN references and attach the bundled \`assets/gsap.min.js\`.
- Render profile by aspect ratio: 16:9 → 3840×2160; 9:16 → 2160×3840; 1:1 → 2160×2160.
- Default delivery profile: 60 FPS, HyperFrames \`high\` quality. Explicit user settings remain respected; no silent quality downgrade.
- Full HyperFrames quality check, including the craft pass, before final delivery.
- Progress reporting that does not interrupt rendering if telemetry fails.
- Heartbeat and renewable worker lease while a long render is active.
- Local MP4 delivery in the user's Downloads folder, plus a report that records the actual artifact path and checksum.
- Local FFmpeg/FFprobe binaries are installed only in the Windows worker package, not in the Hostinger web runtime.
- Final MP4 verification (dimensions, frame rate, duration, video codec and audio-stream presence where expected).
- Background Windows operation, startup on logon, single-worker protection, restart after failure, persistent logs and safe updater.
- Per-user DPAPI protection for the Windows worker token (ported from the legacy AgentHost; plaintext legacy token is migrated on next worker start).
- OAuth 2.1/PKCE and the four MCP tools: \`create_video\`, \`renderer_status\`, \`list_videos\`, \`get_video\`.

## Mapping into MediaForge

| Legacy source | MediaForge destination |
|---|---|
| \`api/bootstrap.php::vs_attach_local_gsap\` and \`assets/gsap.min.js\` | \`src/project-normalizer.mjs\` and \`assets/gsap.min.js\` |
| \`api/mcp.php\` (2026 stateless protocol) | \`src/videos-secrets-mcp.mjs\` |
| \`api/oauth.php\`, \`api/oauth_support.php\` | Existing \`src/oauth.mjs\` (audit and test; use MediaForge issuer) |
| \`api/index.php\` queue/worker endpoints | Existing \`src/server.mjs\` + \`src/remote-worker-server.mjs\` |
| \`apps/video-studio/public/index.html\`, \`dashboard.php\` | Existing \`src/panel.mjs\` (port useful job/status UI, not old PHP) |
| \`apps/videos-secrets-desktop/agent/worker-desktop.mjs\` | Existing \`src/remote-worker-client.mjs\` + renderer/artifact audit |
| \`BackgroundAgent.cs\`, \`BackgroundTaskManager.cs\` | Existing hidden Windows Scheduled Task scripts; add safe update lifecycle |
| \`AgentHost.cs\` DPAPI token storage | Replace plaintext worker token file with per-user DPAPI protection (implemented in the migration branch) |
| \`AutoUpdater.cs\`, \`desktop/latest.json\` | MediaForge updater/manifest; verify HTTPS and SHA-256, update only when idle |
| \`tests/oauth-e2e.ps1\`, MCP smoke tests | Node integration tests for OAuth, MCP 2026, worker lease and render contract |

## Exclusions (do not copy)

- \`private/config.php\`, \`.videos-secrets-runtime/state.json\`, tokens, OAuth access/refresh tokens, pairing codes, database credentials or any Hostinger runtime state.
- The old \`Videos-Secrets-Setup-*.exe\` binaries: they point to the legacy service and must not be reused.
- PHP server files as a second live backend. MediaForge remains the only implementation after cutover.
- Unrelated Secretssysten portal, SecretTrack, Kryvia, offers, Meta Ads and billing files.
- \`feat/hyperframes-motion-library\` portal CSS/React animations; it is not the video renderer or the HyperFrames motion library.

## Migration gates

1. Keep the old Secrets service and Salevo worker untouched as rollback.
2. Complete MediaForge MCP/GSAP/worker parity in this branch.
3. Run automated tests for MCP 2026 stateless calls, GSAP injection, worker progress/lease, render profile and artifact verification.
4. Run one real Windows render at 4K60 High; inspect the MP4 with FFprobe and review representative frames and audio.
5. Only then merge the migration PR and redeploy the MediaForge staging service.
6. Retire the old service only after ChatGPT OAuth, Windows auto-start, repeat render and rollback tests pass.

The installer report confirmed the worker online at setup time. A later live staging health probe reported the worker offline, so persistent heartbeat still needs re-verification after the 45-second freshness fix is deployed. The worker connection is not a substitute for a completed real render test.

Hostinger publishes versioned release directories and switches the active version. Production must use a durable home-directory path (for example `~/.mediaforge-runtime`) for state/jobs/projects; do not deploy with a version-relative `.mediaforge` path. The code now expands `~` using the runtime account home. Before switching the Hostinger environment variable, preserve/migrate the current staging state or deliberately re-pair the worker and OAuth client.
