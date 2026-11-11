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
| Hostinger `secretssystem.online` | Secrets System Next.js portal; KRYVIA runs as a private loopback child at `/kryvia` | **Keep everything, including Nexora Workspace / Media Editor**; the owner explicitly excluded it from this migration |
| Hostinger `salevo.site` | Parent website with other subdomains | Keep; do not bulk-delete |
| Other Salevo/Vempra websites | Separate active services | Out of scope |

Hostinger inventory contained 28 websites at the 2026-11-11 review. The table lists only the resources relevant to this migration.

## Required technical gates

- [ ] Creator Studio is deployed from the reviewed `media-forge` repository behind MediaForge admin authentication.
- [ ] Existing exported Studio v1 JSON files import without losing briefing, hooks, scene text, action or sound notes.
- [x] Latest editorial layout, 56 px scene labels, safe-area captions, four transition styles (flash, scribble, iris, whip) and seekable root `index.motion.json` assertions pass the pinned HyperFrames CLI `check --json` and review snapshot generation in GitHub Actions run `43047916144` (2026-11-11). This confirms the CI fixture only, not an approved final video. The no-audio fixture may report the expected `film_silent` warning.
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

## Legacy code cleanup performed — 2026-11-11

The owner explicitly instructed **do not touch Nexora Workspace / Media Editor** in Secrets and authorized cleanup of legacy Salevo Video code in `paginadevendas`.

- Full original `deploy/video-salevo-hub` repository contents archived at `archive/video-salevo-hub-before-removal-20261111`, commit `b6a0e3a8c05ff4554f68f11e1efeed3b076caba6`.
- Hostinger Git auto-deploy disabled for `video.salevo.site`; the site content remained in place.
- In `paginadevendas` branch `deploy/video-salevo-hub`, all 23 video site/API/Studio/deployment files were removed. Only a retirement `README.md` remains; latest commit `ff642ef9d8a788aa353e104b8f1786f647c5d4f8`.
- `paginadevendas` main snapshot archived at `archive/paginadevendas-before-videosai-cleanup-20261111` (commit `ad54b3cfc057e7756e32527712402f7ec3224775`).
- Old `paginas/videosai/`, deployment workflow, dispatch option, and `deploy/pages.json` entry removed from `paginadevendas` main via PR #33, merged at `fdad8c8a65fd1bae61f0e0cfb526db9c19939f6e`. Existing sales/checkout mappings preserved.
- `video.salevo.site` hosting was **not** deleted. The old PHP API uses persistent `salevo-private` directory OUTSIDE `public_html` which is not backed up by Git. Website deletion in Hostinger is irreversible and removes website files, configuration and potentially jobs/tokens outside version control. Require informed confirmation and a full data disposition/backup before deleting the website.
- **Nexora / Media Editor, KRYVIA, Secrets System, Browser MCP, current MediaForge production branch and Windows Worker were not modified in this cleanup.**

## Potential retirement candidates after approval

1. Legacy `video.salevo.site` domain/site and its PHP API, only after no client or OAuth connection depends on it.
2. Legacy Creator Video endpoints and compatibility bridge code in MediaForge, only after no caller uses the old protocol.
3. Old setup/pairing artifacts proven unused after the replacement Worker passes reconnect and recovery tests.

## Protected resources — not part of this cleanup

- `mediaforge.salevo.site`;
- `mcpbrowser.salevo.site` and its relay archive/configuration;
- the `secretssystem.online` domain, the `Secretssysten` repository, SecretTrack, Offers, Ads Finder, KRYVIA, Creator Hub, Creator Brain, **Nexora Workspace and Media Editor**; these modules are all explicitly out of scope;
- the `VoiceStudio` repository/application and its user data;
- `salevo.site` parent domain and its other subdomains;
- the MediaForge Windows Worker, scheduled task, local projects, output folders, OAuth state and current credentials.

The final green report must name exact domains/services safe to retire, exact resources to keep, backup/rollback locations, and any credentials that need rotation (never print their values). No unresolved blocker may remain for an item marked safe to delete.

## Latest verification (2026-11-11)

- GitHub PR #6, head `b7072e398b5a57fa118b52b9eff8d923bc96c445`, passed CI run `43047916144`; Windows PowerShell syntax job also passed.
- Creator Studio composition endpoint now rejects cross-site browser requests and non-JSON payloads before parsing, with unit tests.
- Connected browser confirmed `https://mediaforge.salevo.site/health`: orchestrator healthy, Windows Worker online, HyperFrames renderer, zero queued/processing jobs.
- Connected browser confirmed `https://mediaforge.salevo.site/studio` returns `not_found`; Creator Studio is **not published yet**.
- Hostinger deployment source remains `media-forge` branch `feature/conexoes-mediaforge-primeiro`, commit `3ce1879fb94293629ebff14dd4eb71d3abc55d49`. The migration PR targets this branch but has not been merged or deployed.
- No domain, secret, Windows task, service or legacy code has been deleted.

## Scope correction from owner — 2026-11-11

The owner explicitly instructed: **KEEP Nexora Workspace / Media Editor in Secrets**. Do not migrate, edit, retire or delete this module or its API routes. Creator Video/Salevo Video legacy hosting and the isolated `paginadevendas` deployment branch are the only newly authorized retirement targets. MediaForge will continue evolving after retirement; no false claim of final audiovisual readiness is allowed.
