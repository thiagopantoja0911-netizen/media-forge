# Final migration and cleanup gate

A green completion status must not be shown until every required technical gate has evidence. A green status is a readiness report, not an automatic deletion command; wait for the owner's final confirmation before destructive Hostinger, GitHub or Windows actions.

## Verified product boundaries

| Resource | Verified role | Final action |
| --- | --- | --- |
| GitHub `media-forge` | Independent MediaForge / Creator Studio codebase | Keep as the source of truth for video creation |
| GitHub `paginadevendas`, branch `deploy/video-salevo-hub` | Legacy `video.salevo.site` hub, PHP API and old Studio | Preserve until all compatibility and rollback gates pass |
| GitHub `Secretssysten` | Separate Secrets System monorepo | Keep independent; not part of Creator Video retirement |
| GitHub `VoiceStudio` | Independent local speech app, AGPL-3.0 | Keep independent; Creator Studio accepts exported audio files |
| Hostinger `mediaforge.salevo.site` | MediaForge Node.js 22 app | Keep |
| Hostinger `video.salevo.site` | Legacy Creator Video/Salevo Video hub | Candidate for retirement only after all gates pass |
| Hostinger `mcpbrowser.salevo.site` | Browser MCP Relay v0.5.0, deployed from its own archive | Keep independent; never merge into MediaForge |
| Hostinger `secretssystem.online` | Secrets System Next.js portal, deployed from `Secretssysten` | Keep; unrelated tools remain there |
| Hostinger `salevo.site` | Parent website with other subdomains | Keep; do not bulk-delete |
| Other Salevo/Vempra websites | Separate active services | Out of scope |

Hostinger inventory contained 28 websites at the 2026-11-11 review. The table lists only the resources relevant to this migration.

## Required technical gates

- [ ] Creator Studio is deployed from the reviewed `media-forge` repository behind MediaForge admin authentication.
- [ ] Existing exported Studio v1 JSON files import without losing briefing, hooks, scene text, action or sound notes.
- [x] Generated five-scene HyperFrames package passes the pinned CLI `check --json` structural/motion/contrast checks. Current expected warning: the validation fixture has no audio.
- [ ] HyperFrames review snapshots are generated and visually inspected; text safe areas, timing, first frame and transitions pass.
- [ ] Voice/narration is attached, synchronized and audible in the rendered output.
- [ ] Music and sound effects are attached and normalized; true peak and integrated loudness are measured.
- [ ] Subject-specific image/video assets replace the current abstract kinetic-typography prototype.
- [ ] A real 4K portrait / 60 FPS render completes on the existing Windows Worker and is checked with ffprobe.
- [ ] MP4 is confirmed on the Windows computer; duration, resolution, FPS, audio streams and checksum are recorded.
- [ ] Worker restart, heartbeat, claim/lease, retry and recovery tests pass without duplicate processing.
- [ ] MediaForge MCP tools and OAuth are tested from the actual ChatGPT connection.
- [ ] Browser MCP continues to work independently at `mcpbrowser.salevo.site`.
- [ ] Legacy API clients, old OAuth clients and Windows pairings have a tested replacement or an explicit retirement decision.
- [ ] Old jobs, project files and user-exported drafts are backed up or explicitly declared disposable.
- [ ] Rollback to `video.salevo.site` is tested before final retirement.
- [ ] Production deploy source, secrets and runtime storage are confirmed separate from the Secrets System.

## Potential retirement candidates after approval

1. Legacy `video.salevo.site` domain/site and its PHP API, only after no client or OAuth connection depends on it.
2. Legacy Creator Video endpoints and compatibility bridge code in MediaForge, only after no caller uses the old protocol.
3. Old setup/pairing artifacts proven unused after the replacement Worker passes reconnect and recovery tests.

## Protected resources — not part of this cleanup

- `mediaforge.salevo.site`;
- `mcpbrowser.salevo.site` and its relay archive/configuration;
- `secretssystem.online` and the `Secretssysten` repository;
- the `VoiceStudio` repository/application and its user data;
- `salevo.site` parent domain and its other subdomains;
- the MediaForge Windows Worker, scheduled task, local projects, output folders, OAuth state and current credentials.

The final green report must name exact domains/services safe to retire, exact resources to keep, backup/rollback locations, and any credentials that need rotation (never print their values). No unresolved blocker may remain for an item marked safe to delete.
