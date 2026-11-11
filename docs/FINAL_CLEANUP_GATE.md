# Final migration and cleanup gate

This checklist controls the eventual retirement of the old Creator Video/Secrets integration. A green status must not be shown until every required gate below is evidenced.

## Product and repository boundaries

| Resource | Verified role | Migration action |
| --- | --- | --- |
| GitHub `media-forge` | Independent MediaForge/Creator Studio codebase | Keep as the source of truth for video creation |
| GitHub `paginadevendas`, branch `deploy/video-salevo-hub` | Legacy `video.salevo.site` hub, PHP API and old Studio | Preserve until compatibility and rollback gates pass |
| GitHub `Secretssysten` | Separate Secrets System monorepo | Keep independent; do not remove for the video migration |
| Hostinger `mediaforge.salevo.site` | MediaForge Node.js 22 app | Keep |
| Hostinger `video.salevo.site` | Legacy Creator Video/Salevo Video hub | Candidate for retirement only after all gates pass |
| Hostinger `mcpbrowser.salevo.site` | Browser MCP Relay v0.5.0, deployed from its own archive | Keep independent; do not merge into MediaForge |
| Hostinger `secretssystem.online` | Secrets System Next.js portal, currently deployed from `Secretssysten` | Keep; unrelated modules still live there |
| Hostinger `salevo.site` | Parent website with other subdomains | Keep; not part of this migration |
| Other Salevo/Vempra domains | Other active websites and services | Out of scope; never bulk-delete |

Hostinger inventory on 2026-11-11 listed 28 websites. This table deliberately includes only the resources relevant to the Creator Video migration.

## Required technical gates

- [ ] Creator Studio is deployed from the reviewed `media-forge` repository and works behind MediaForge admin authentication.
- [ ] Existing exported v1 Studio JSON files import without losing brief, hooks, scene text, action or sound notes.
- [ ] The generated HyperFrames project passes the pinned CLI `check --json`.
- [ ] Every scene is reviewed in a real preview/snapshot; text safe areas, timing, first frame and transitions pass.
- [ ] Voice/narration is generated or attached, synchronized and audible in the rendered output.
- [ ] Music and sound effects are attached and normalized; final audio is measured for loudness and true peak.
- [ ] Subject-specific visual assets are present; the output is not only placeholder shapes or kinetic text.
- [ ] A real 4K portrait / 60 FPS render completes on the existing Windows Worker and is checked with ffprobe.
- [ ] The MP4 is confirmed on the Windows computer; its duration, resolution, FPS, audio streams and checksum are recorded.
- [ ] Worker restart, heartbeat, claim/lease, retry and recovery tests pass without duplicate processing.
- [ ] MediaForge MCP tools and OAuth are tested from the actual ChatGPT connection.
- [ ] Browser MCP still connects and works independently at `mcpbrowser.salevo.site`.
- [ ] Legacy API clients, old OAuth clients and Windows pairings have been inventoried; each has a tested replacement or an explicit retirement decision.
- [ ] Old jobs, project files and user-exported drafts are backed up or explicitly declared disposable.
- [ ] Rollback to `video.salevo.site` has been tested before its final retirement.
- [ ] Production deploy source, secrets and runtime storage are confirmed separate from the old Secrets application.

## What may be retired only after approval

Potential retirement candidates:
1. Legacy `video.salevo.site` domain/site and its PHP API once no client or OAuth connection depends on it.
2. Legacy Creator Video endpoints and compatibility code in MediaForge only after no caller uses the old protocol.
3. Old setup/pairing artifacts that are proven unused after the replacement Worker has passed reconnect and recovery tests.

Not included in this cleanup:
- `mediaforge.salevo.site`;
- `mcpbrowser.salevo.site` or its relay archive/configuration;
- `secretssystem.online` or the `Secretssysten` repository;
- `salevo.site` parent domain or its other subdomains;
- the MediaForge Windows Worker, its scheduled task, local projects, output folders, OAuth state or current credentials.

## Final green status format

Show a large green completion status only when every required technical gate has evidence. The final report must list:
- exact domains/services that are safe to retire;
- exact domains/services that must remain;
- any credentials that must be rotated (never print their values);
- backups and rollback location;
- outstanding risks (there must be no unresolved blocker for anything marked safe to delete).

A green status is a readiness report, not an automatic deletion command. Wait for the owner's final confirmation before destructive Hostinger, GitHub or Windows cleanup actions.
