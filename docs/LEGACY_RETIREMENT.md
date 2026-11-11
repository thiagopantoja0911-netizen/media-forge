# Legacy Videos Secrets retirement plan

## Identified legacy components

The older Windows agent in the private `Secretssysten` repository uses:

- Scheduled task: `VideosSecretsBackgroundRenderer`.
- Startup shortcut: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Videos Secrets Agent.lnk`.
- Agent data directory: `%LOCALAPPDATA%\VideosSecretsAgent`.
- Worker processes: `worker.mjs`, `worker-desktop.mjs`, and `Iniciar-Agente.ps1` under that exact directory.
- Legacy MCP/backend URL: `https://videos.secretssystem.online/mcp`.

The Hostinger account also contains `video.salevo.site`, whose document root includes the older PHP `api/v1` and `studio` application. It is a separate web retirement task.

## Explicitly out of scope

- Do not delete `secretssystem.online`: its current deployment is SecretTrack, not Creator Video.
- Do not delete the root `salevo.site` website.
- Do not delete `%LOCALAPPDATA%\VideosSecretsAgent`, old tokens, logs, project files or MP4 exports.
- Do not remove the old web site until MediaForge has passed a real 4K60 High render and the new MCP client is authorized.

## Safe Windows retirement

`desktop/retire-legacy-videos-secrets.ps1` runs in dry-run mode by default. It only stops the exact old scheduled task, shortcut and worker processes when both `-Apply` and `-VerifiedRender` are supplied. It checks that the MediaForge HyperFrames worker is online first. It preserves all old files for rollback.

## Remaining cutover gates

1. Make the MediaForge worker heartbeat stable for at least five minutes.
2. Confirm Hostinger state/jobs/projects use storage outside the versioned release directory.
3. Deploy the unified MediaForge branch and update the Windows worker.
4. Complete a real 2160x3840, 60 FPS, High render; verify with FFprobe and review picture/audio.
5. Reauthorize ChatGPT against `https://mediaforge.salevo.site/mcp`.
6. Only then retire the legacy Windows worker and redirect/disable the old Creator Video web routes.
