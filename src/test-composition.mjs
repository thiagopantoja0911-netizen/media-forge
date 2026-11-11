import { readFile } from "node:fs/promises";

export const TEST_COMPOSITION_INDEX_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediaForge — HyperFrames Render Test</title>
</head>
<body>
  <div id="root"
       data-composition-id="main"
       data-start="0"
       data-duration="10"
       data-width="3840"
       data-height="2160">
    <div id="test-scene"
         data-composition-id="test-scene"
         data-composition-src="compositions/test-scene.html"
         data-start="0"
         data-duration="10"
         data-track-index="1"
         data-width="3840"
         data-height="2160"></div>
  </div>

  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = gsap.timeline({ paused: true });
  </script>
</body>
</html>
`;

export const TEST_COMPOSITION_SCENE_HTML = `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(ellipse at 50% 42%, rgba(67, 83, 160, .38), transparent 58%),
        linear-gradient(135deg, #090d18 0%, #111a31 55%, #090d18 100%);
      color: #f7f8ff;
      font-family: Inter, Arial, sans-serif;
    }

    #test-eyebrow {
      position: absolute;
      top: 650px;
      left: 0;
      width: 100%;
      color: #a8b8ff;
      text-align: center;
      font-size: 64px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
    }

    #test-eyebrow-text,
    #test-title-text,
    #test-subtitle-text {
      display: inline-block;
    }

    #test-title {
      position: absolute;
      top: 790px;
      left: 0;
      width: 100%;
      margin: 0;
      text-align: center;
      font-size: 224px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -.055em;
    }

    #test-subtitle {
      position: absolute;
      top: 1090px;
      left: 0;
      width: 100%;
      margin: 0;
      color: #c2cbe0;
      text-align: center;
      font-size: 64px;
      line-height: 1.35;
    }

    #test-progress {
      position: absolute;
      top: 1450px;
      left: 1360px;
      width: 1120px;
      height: 16px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255,255,255,.16);
    }

    #test-progress-clip {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }

    #test-progress-fill {
      width: 100%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #879bff, #71e6d1);
      transform-origin: left center;
    }
  </style>

  <div id="root"
       data-composition-id="test-scene"
       data-width="3840"
       data-height="2160">
    <div id="test-eyebrow" class="clip" data-start="0" data-duration="10" data-track-index="1">
      <span id="test-eyebrow-text">Pipeline de renderização</span>
    </div>

    <h1 id="test-title" class="clip" data-start="0" data-duration="10" data-track-index="2">
      <span id="test-title-text">MediaForge</span>
    </h1>

    <p id="test-subtitle" class="clip" data-start="0" data-duration="10" data-track-index="3">
      <span id="test-subtitle-text">HyperFrames · composição, timeline e render</span>
    </p>

    <div id="test-progress">
      <div id="test-progress-clip" class="clip" data-start="2" data-duration="7" data-track-index="4">
        <div id="test-progress-fill"></div>
      </div>
    </div>
  </div>

  <script>
    const timeline = gsap.timeline({ paused: true });

    timeline.fromTo("#test-eyebrow-text",
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" },
      0.3
    );

    timeline.fromTo("#test-title-text",
      { opacity: 0, y: 48, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: "power4.out" },
      0.55
    );

    timeline.fromTo("#test-subtitle-text",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" },
      1.2
    );

    timeline.fromTo("#test-progress-fill",
      { scaleX: 0 },
      { scaleX: 1, duration: 7, ease: "none" },
      2
    );

    window.__timelines = window.__timelines || {};
    window.__timelines["test-scene"] = timeline;
  </script>
</template>
`;

export async function getTestCompositionFiles() {
  const gsap = await readFile(new URL("../assets/gsap.min.js", import.meta.url), "utf8");
  return [
    { path: "index.html", content: TEST_COMPOSITION_INDEX_HTML, encoding: "utf8" },
    { path: "compositions/test-scene.html", content: TEST_COMPOSITION_SCENE_HTML, encoding: "utf8" },
    { path: "assets/gsap.min.js", content: gsap, encoding: "utf8" }
  ];
}
