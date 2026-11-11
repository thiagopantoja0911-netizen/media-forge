import { readFile } from "node:fs/promises";

const WIDTH = 2160;
const HEIGHT = 3840;
const SCENE_IDS = ["scene-01", "scene-02", "scene-03", "scene-04", "scene-05"];
const ACCENTS = ["#91f4d5", "#b5a2ff", "#ffbd72", "#82c8ff", "#f1a6cf"];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function textValue(value, limit = 2000) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function validateManifest(manifest) {
  if (!manifest || manifest.format !== "mediaforge-planning-v1"
      || manifest.renderReady !== false || !manifest.brief
      || !Array.isArray(manifest.brief.scenes) || manifest.brief.scenes.length !== 5) {
    throw new TypeError("Esperado manifesto MediaForge com cinco cenas e renderReady=false");
  }
  const duration = Number(manifest.project?.durationSeconds);
  if (![15, 30, 45, 60].includes(duration)) {
    throw new TypeError("Duração do projeto não suportada");
  }
  const scenes = manifest.brief.scenes;
  let cursor = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    if (!scene || !Number.isFinite(scene.start) || !Number.isFinite(scene.end)
        || scene.start !== cursor || scene.end <= scene.start) {
      throw new TypeError("Timeline inválida na cena " + (i + 1));
    }
    cursor = scene.end;
  }
  if (cursor !== duration) throw new TypeError("A timeline precisa terminar na duração do projeto");
  return duration;
}

function sceneHost(scene, index) {
  const id = SCENE_IDS[index];
  return [
    '<div id="', id, '" data-composition-id="', id,
    '" data-composition-src="compositions/', id, '.html"',
    '" data-start="', scene.start, '" data-duration="', scene.end - scene.start,
    '" data-track-index="', index + 1, '" data-track-kind="graphics"',
    '" data-width="', WIDTH, '" data-height="', HEIGHT, '"></div>'
  ].join("");
}

function makeIndexHtml(duration, scenes) {
  const hosts = scenes.map(sceneHost).join("\n    ");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediaForge Creator Project</title>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${WIDTH}" data-height="${HEIGHT}">
    ${hosts}
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = gsap.timeline({ paused: true });
  </script>
</body>
</html>
`;
}

function sceneHtml(scene, index, duration) {
  const id = SCENE_IDS[index];
  const accent = ACCENTS[index];
  const title = textValue(scene.onscreen, 220).trim()
    || (index === 0 ? textValue(scene.spoken, 120).trim() : scene.name);
  const kicker = "MEDIAFORGE / " + String(index + 1).padStart(2, "0") + " — " + textValue(scene.name, 50).toUpperCase();
  const caption = textValue(scene.spoken, 280).trim();
  const variables = escapeHtml(JSON.stringify([
    { id: "headline", type: "string", label: "Texto principal", default: title, maxLength: 220 },
    { id: "accent", type: "color", label: "Cor de destaque", default: accent }
  ]));
  const safeTitle = escapeHtml(title);
  const safeKicker = escapeHtml(kicker);
  const safeCaption = escapeHtml(caption);
  const safeDuration = Number(duration).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  const openingMotion = [
    `tl.fromTo("#${id}-orb", { rotation: -18, scale: 0.78, opacity: 0.12 }, { rotation: 0, scale: 1, opacity: 0.42, duration: 0.72, ease: "power4.out" }, 0);`,
    `tl.fromTo("#${id}-bar", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.48, ease: "expo.out" }, 0.08);`,
    `tl.fromTo("#${id}-orb", { scale: 0.62, rotation: 12, opacity: 0.08 }, { scale: 1, rotation: 0, opacity: 0.38, duration: 0.62, ease: "power3.out" }, 0);`,
    `tl.fromTo("#${id}-bar", { y: 110, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power4.out" }, 0.1);`,
    `tl.fromTo("#${id}-orb", { scale: 1.24, rotation: -9, opacity: 0.08 }, { scale: 1, rotation: 0, opacity: 0.4, duration: 0.78, ease: "power2.out" }, 0);`
  ][index];
  const motionBeats = [];
  const drift = [
    [-130, 72, 12], [105, -54, -17], [160, 38, 20], [-95, -66, -14],
    [-145, 52, 16], [88, -34, -12], [125, 72, 18], [-110, -58, -16]
  ];
  for (let beat = 0, at = 1.35; at + 1.35 < duration; beat += 1, at += 2.45) {
    const [x, y, rotation] = drift[(index + beat) % drift.length];
    const scale = beat % 2 === 0 ? 1.075 : 0.94;
    motionBeats.push(`tl.to("#${id}-orb", { x: ${x}, y: ${y}, rotation: ${rotation}, scale: ${scale}, duration: 1.35, ease: "power2.inOut" }, ${at.toFixed(2)});`);
  }
  const motion = [openingMotion, ...motionBeats].join("\n");
  const titleMotion = index === 0
    ? `tl.fromTo("#${id}-title", { y: 0, scale: 1 }, { y: -10, scale: 1.015, duration: 0.42, ease: "power2.out" }, 0.05);`
    : `tl.fromTo("#${id}-title", { y: 88, opacity: 0, filter: "blur(10px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.42, ease: "power4.out" }, 0.12);`;
  const captionMotion = caption
    ? `tl.fromTo("#${id}-caption", { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, 0.55);`
    : "";
  return `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      overflow: hidden;
      color: #f7f8ff;
      background:
        radial-gradient(ellipse at 52% 42%, rgba(74, 91, 165, .36), transparent 56%),
        linear-gradient(152deg, #080d18 0%, #101a2c 54%, #090e18 100%);
      font-family: Inter, Arial, sans-serif;
    }
    #${id}-orb {
      position: absolute;
      width: 1580px;
      height: 1580px;
      left: 290px;
      top: 820px;
      border: 3px solid var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 130px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    #${id}-bar {
      position: absolute;
      left: 180px;
      top: 790px;
      width: 1800px;
      height: 12px;
      border-radius: 99px;
      background: var(--accent);
    }
    #${id}-kicker {
      position: absolute;
      top: 470px;
      left: 180px;
      right: 180px;
      color: var(--accent);
      font-size: 42px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: .18em;
    }
    #${id}-title {
      position: absolute;
      top: 1040px;
      left: 180px;
      right: 180px;
      margin: 0;
      font-size: 188px;
      line-height: 1.06;
      font-weight: 900;
      letter-spacing: -.055em;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    #${id}-caption {
      position: absolute;
      top: 2180px;
      left: 190px;
      right: 190px;
      color: #d2d9e8;
      font-size: 66px;
      line-height: 1.34;
      font-weight: 500;
      letter-spacing: -.02em;
      overflow-wrap: anywhere;
    }
    #${id}-index {
      position: absolute;
      top: 3350px;
      left: 180px;
      color: rgba(235,242,255,.56);
      font-size: 32px;
      letter-spacing: .2em;
    }
    .clip { position: absolute; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${WIDTH}" data-height="${HEIGHT}" data-composition-variables='${variables}'>
    <div id="${id}-orb" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="1"></div>
    <div id="${id}-bar" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="2"></div>
    <div id="${id}-kicker" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="3">${safeKicker}</div>
    <h1 id="${id}-title" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="4" data-var-text="headline">${safeTitle}</h1>
    ${caption ? `<p id="${id}-caption" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="5">${safeCaption}</p>` : ""}
    <span id="${id}-index" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="6">0${index + 1} / 05</span>
  </div>
  <script>
    const tl_${id.replaceAll("-", "_")} = gsap.timeline({ paused: true });
    ${motion.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    ${titleMotion.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    ${captionMotion.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    window.__timelines = window.__timelines || {};
    window.__timelines["${id}"] = tl_${id.replaceAll("-", "_")};
  </script>
</template>
`;
}

export async function buildCreatorComposition(manifest) {
  const duration = validateManifest(manifest);
  const scenes = manifest.brief.scenes;
  const projectFiles = [
    { path: "index.html", content: makeIndexHtml(duration, scenes), encoding: "utf8" }
  ];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    projectFiles.push({
      path: "compositions/" + SCENE_IDS[index] + ".html",
      content: sceneHtml(scene, index, scene.end - scene.start),
      encoding: "utf8"
    });
  }
  const gsap = await readFile(new URL("../assets/gsap.min.js", import.meta.url), "utf8");
  projectFiles.push({ path: "assets/gsap.min.js", content: gsap, encoding: "utf8" });
  projectFiles.push({
    path: "creator-storyboard.json",
    content: JSON.stringify(manifest, null, 2) + "\n",
    encoding: "utf8"
  });

  return {
    project: {
      title: textValue(manifest.project.title, 160),
      durationSeconds: duration,
      aspectRatio: "9:16",
      outputs: ["video", "project"],
      renderer: "hyperframes",
      resolution: "portrait-4k",
      fps: 60,
      quality: "high",
      preflight: true
    },
    projectFiles,
    readiness: {
      renderReady: false,
      blockers: [
        "Narração ainda não foi gerada nem anexada como arquivo de áudio.",
        "Música e efeitos sonoros ainda não foram anexados.",
        "As cenas usam tipografia cinética abstrata; faltam imagens ou vídeos específicos do assunto.",
        "A composição precisa passar por HyperFrames check, preview e revisão visual no Worker antes de liberar a fila."
      ],
      notes: [
        "A primeira cena mantém o gancho visível no frame zero.",
        "Cada cena é uma subcomposição independente e editável.",
        "O texto do usuário é escapado antes de entrar no HTML."
      ]
    }
  };
}
