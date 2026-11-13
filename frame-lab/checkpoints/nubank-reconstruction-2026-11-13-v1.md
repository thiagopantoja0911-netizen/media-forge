# Frame Lab — Nubank reconstruction checkpoint V1 (2026-11-13)

## Verified input
- Source clip: "E se a @Nubank me contratasse para a próxima campanha_ ... .mp4"
- 1080 × 1920 HEVC, 30 FPS, 316 frames, 10.533333 s, AAC audio.
- Source SHA-256: `41399fc930709c77307516be085ad9b8c45dd44284f63dadecdfb99e1b37d478`
- Source archived with conversation attachment, *not* committed to GitHub.

## MediaForge/Frame Lab status
- Remote Frame Lab supports native ffprobe, OpenCV 5.0 WASM, per-frame motion, paginated reports, resumable upload, render and compare tools. Server reports engineReady=true.
- Browser accessed `https://mediaforge.salevo.site/frame-lab`, project list confirmed.
- Remote Frame Lab project ID `0801dbdf3edfe53ea55b191bc3df5199`.
- Remote reference binary upload **not completed**. Current connector expects base64 per chunk and does not have direct access to attachment bytes. Consequently remote analyze/render/compare remain **not executed**.
- HyperFrames worker online on 2026-11-13.

## Local rendering V1
- Editable time-seekable Canvas2D composition in `nubank_rebuild/index.html` with extracted image assets and preserved audio; rendered locally with `skia-canvas`, Node22, FFmpeg.
- Output `Nubank_FrameLab_Recriacao_V1.mp4`: 1080×1920, 30 FPS, 316 frames. SHA-256 `c145c15e120c56094855b4b0f13f53aacce32c983d86401ccf77b3a6fae742e9`.
- Full temporal comparison, all 316 frames at 270×480: mean pixel absolute error **28.8004/255**, mean PSNR **20.3500 dB**.
- **FAIL**: output is not visually identical. Major mismatches in background color, intro phone perspective, investment card motion, and final typography. Do not use as final fidelity proof or call it a finished replica.
- All source scripts, project assets, comparison contact sheet, hash and metrics preserved in conversation sandbox artifact `Nubank_FrameLab_Projeto_V1.zip`, paired with MP4 and comparison JPEG.

## No-regression acceptance
1. Preserve clip duration, 316 frames, dimensions, FPS, and reference audio.
2. Independently verify video against source on every frame, both subjective and objective.
3. Retain source original SHA and all versioned artifacts; never overwrite V1.
4. Complete remote upload (actual reference bytes), Frame Lab `analyze` and report, project ZIP upload, `render`, and `compare`.
5. Pass fidelity review before declaring output identical.
