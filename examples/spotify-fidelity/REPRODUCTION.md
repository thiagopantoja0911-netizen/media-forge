# Spotify × Apple — fidelity reconstruction

Original reference: https://www.tiktok.com/@simo.design/video/7558134029304778016
Nature: unofficial personal motion-design concept, submitted by the user as a fidelity benchmark.

## Reproduction constraints
- Reference: 15.86 s, 1280×720, ~29.97 FPS.
- The source MP4 must **never** be used as the video layer in the rendered reconstruction.
- Live HTML and GSAP animate the independent UI layers; PNG stills are limited to playlist artwork and the album mosaic.
- Sound comes from the *original TikTok audio track* through its public metadata as a separate <audio> clip.
- The checked-in source HTML intentionally contains __ORIGINAL_SOUND_URL__; update it with the current media URL only when creating a rendering package. Signed TikTok URLs can expire. Never interpret an output's hasAudio=true as proof of non-silent reproduction.

## Timeline from source (seconds)
- 0.00–2.11: initial Spotify × Apple typography/mark
- 2.11–3.24: "Playlists Made For You"
- 3.24–4.74: horizontally animated five Daily Mix cards
- 4.74–5.60: "Discover new sounds"
- 5.60–7.73: angled mosaic and "Every week."
- 7.73–10.88: player card, with overlaid "Collect what you love" from 8.94
- 10.88–11.97: Liked Songs confirmation
- 11.97–12.52: "Feel every word."
- 12.52–14.10: Spotify lyric card
- 14.10–15.85: Spotify closing card

## Technical render findings
- First HyperFrames check: text_occluded at #mosaicTitle, content_overlap at div.lyricMain. Fixed lyric text spacing and moved mosaic heading to an independent foreground clip.
- Second check: remaining mosaic text occlusion; resolved with a dedicated timed overlay.
- Third check passed; render initially failed because 1920×1080 required non-integer 1.5× scale from 1280×720.
- MediaForge Premium Motion requires 60 FPS. Rendering as landscape-1440p (2560×1440; integer 2×) and 60 FPS is a compatibility workaround. Output is **not** identical in frame rate or pixel size to the reference; compare after resizing/downsampling and frame-time alignment.
- Job 83c077e1af304dee842b4e4d246374a4 completed rendering, but the strict cinematic audio QA rejected the output as too quiet: -37.6 LUFS.
- Original audio was retained and its digital gain increased by parallel, identical, exactly synchronized audio lanes. This is a gain workaround within the HTML/media-mix API; no new material is inserted.
- Current test job: ed5c9a993ac84fec81ad472ddc4f31c4 (Windows MediaForge, landscape-1440p, 60FPS, high, preflight).
- Visual comparison to the source and listening review remain separate from automated FFprobe/FFmpeg QA.
