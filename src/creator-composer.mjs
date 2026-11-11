import { readFile } from "node:fs/promises";

const WIDTH = 2160;
const HEIGHT = 3840;
const SCENE_IDS = ["scene-01", "scene-02", "scene-03", "scene-04", "scene-05"];
const SCENE_BEATS = ["hook", "context", "proof", "reveal", "payoff"];
const PALETTES = [
  { ground: "#F2D94E", ink: "#171717", accent: "#F24E35", accentText: "#B52B20", slabLeft: 1260, slabTop: 560, slabWidth: 900, slabHeight: 380, titleLeft: 216, titleTop: 1120 },
  { ground: "#2FC4D1", ink: "#111111", accent: "#F4D84D", accentText: "#10252B", slabLeft: -150, slabTop: 600, slabWidth: 960, slabHeight: 420, titleLeft: 420, titleTop: 1080 },
  { ground: "#151515", ink: "#F6F1E7", accent: "#F4D84D", accentText: "#F4D84D", slabLeft: 1260, slabTop: 560, slabWidth: 900, slabHeight: 400, titleLeft: 216, titleTop: 1040 },
  { ground: "#FF684A", ink: "#151515", accent: "#F4D84D", accentText: "#151515", slabLeft: -160, slabTop: 620, slabWidth: 960, slabHeight: 400, titleLeft: 216, titleTop: 1100 },
  { ground: "#A8DC4A", ink: "#111111", accent: "#F24E35", accentText: "#B32025", slabLeft: 1280, slabTop: 600, slabWidth: 880, slabHeight: 400, titleLeft: 216, titleTop: 1060 }
];
const MAX_AUDIO_FILE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_TOTAL_BYTES = 18 * 1024 * 1024;
const AUDIO_TYPES = {
  wav: ["audio/wav", "audio/x-wav", "audio/vnd.wave"],
  mp3: ["audio/mpeg", "audio/mp3"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  aac: ["audio/aac", "audio/aacp"],
  ogg: ["audio/ogg"],
  opus: ["audio/ogg"],
  webm: ["audio/webm"]
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function textValue(value, limit = 2000) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function truncateAtWord(value, limit) {
  const text = textValue(value, 2000).trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
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

function validateAudioAsset(asset, role) {
  if (asset == null) return null;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    throw new TypeError("Arquivo de áudio inválido: " + role);
  }
  const filename = textValue(asset.filename, 140).split(/[\\/]/).pop();
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension || !Object.hasOwn(AUDIO_TYPES, extension)) {
    throw new TypeError("Formato de áudio não suportado em " + role + "; use WAV, MP3, M4A, AAC, OGG, OPUS ou WEBM");
  }
  const mimeType = textValue(asset.mimeType, 100).toLowerCase().split(";")[0] || AUDIO_TYPES[extension][0];
  if (!AUDIO_TYPES[extension].includes(mimeType) && mimeType !== "application/octet-stream") {
    throw new TypeError("Tipo MIME não corresponde ao arquivo de áudio " + role);
  }
  const encoded = asset.contentBase64;
  if (typeof encoded !== "string" || !encoded.length || encoded.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new TypeError("Conteúdo Base64 inválido em " + role);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) {
    throw new TypeError("Conteúdo Base64 inválido em " + role);
  }
  if (bytes.byteLength > MAX_AUDIO_FILE_BYTES) {
    throw new TypeError("Cada arquivo de áudio deve ter no máximo 12 MB");
  }
  if (asset.sizeBytes !== undefined && asset.sizeBytes !== bytes.byteLength) {
    throw new TypeError("Tamanho declarado não corresponde ao arquivo " + role);
  }
  const durationSeconds = Number(asset.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.25 || durationSeconds > 1200) {
    throw new TypeError("Duração do áudio inválida em " + role);
  }
  const paths = {
    voiceover: "assets/audio/voiceover." + extension,
    music: "assets/audio/music." + extension
  };
  return {
    path: paths[role],
    filename,
    mimeType,
    contentBase64: encoded,
    sizeBytes: bytes.byteLength,
    durationSeconds
  };
}

function sceneHost(scene, index) {
  const id = SCENE_IDS[index];
  return `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${scene.start}" data-duration="${scene.end - scene.start}" data-track-index="${index + 1}" data-track-kind="graphics" data-beat="${SCENE_BEATS[index]}" data-width="${WIDTH}" data-height="${HEIGHT}"></div>`;
}

function audioTag(asset, id, index, duration, volume, fades = false) {
  if (!asset) return "";
  const clipDuration = Math.min(duration, asset.durationSeconds);
  const fadeIn = Math.min(0.6, clipDuration / 3);
  const fadeOut = Math.min(1.2, clipDuration / 3);
  return [
    '<audio id="', id, '" src="', asset.path,
    '" data-start="0" data-duration="', clipDuration.toFixed(3),
    '" data-track-index="', index, '" data-volume="', volume, '"',
    fades ? ' data-fade-in="' + fadeIn.toFixed(3) + '" data-fade-out="' + fadeOut.toFixed(3) + '"' : "",
    '></audio>'
  ].join("");
}

function makeIndexHtml(duration, scenes, audioAssets) {
  const hosts = scenes.map(sceneHost).join("\n    ");
  const voice = audioTag(audioAssets.voiceover, "voiceover", 10, duration, 1);
  const musicVolume = audioAssets.voiceover ? 0.14 : 0.9;
  const music = audioTag(audioAssets.music, "music", 11, duration, musicVolume, true);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=2160, height=3840">
  <title>MediaForge Forge Midjourney Project</title>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${WIDTH}" data-height="${HEIGHT}" style="background:${PALETTES[0].ground}">
    ${hosts}
    <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${duration}" data-track-index="70" data-track-kind="captions" data-width="${WIDTH}" data-height="${HEIGHT}" style="z-index:80;pointer-events:none"></div>
    ${voice}
    ${music}
    ${scenes.slice(0, -1).map((scene, index) => {
      const id = "transition-" + String(index + 1).padStart(2, "0");
      return '<div id="' + id + '" data-composition-id="' + id + '" data-composition-src="compositions/' + id + '.html" data-start="' + Math.max(0, scene.end - 1.1).toFixed(3) + '" data-duration="2.2" data-track-index="' + (90 + index) + '" data-track-kind="graphics" data-beat="transition" data-width="' + WIDTH + '" data-height="' + HEIGHT + '" style="z-index:' + (90 + index) + ';pointer-events:none"></div>';
    }).join("\n    ")}
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

function sceneHtml(scene, index, duration, brief) {
  const id = SCENE_IDS[index];
  const palette = PALETTES[index];
  const seconds = Number(duration);
  const titleLimit = seconds <= 3.5 ? 44 : seconds <= 6 ? 64 : 84;
  const fullTitle = textValue(scene.onscreen, 220).trim()
    || (index === 0 ? textValue(brief.chosenHook || scene.spoken, 120).trim() : scene.name);
  const title = truncateAtWord(fullTitle, titleLimit);
  const words = title.split(/\s+/).filter(Boolean);
  const accentWord = words.pop() || title;
  const prefix = words.join(" ");
  const label = "MEDIAFORGE / " + String(index + 1).padStart(2, "0") + " — " + textValue(scene.name, 50).toUpperCase();
  const safePrefix = escapeHtml(prefix);
  const safeAccentWord = escapeHtml(accentWord);
  const safeLabel = escapeHtml(label);
  const variables = escapeHtml(JSON.stringify([
    { id: "headlinePrefix", type: "string", label: "Texto principal", default: prefix, maxLength: 220 },
    { id: "headlineAccent", type: "string", label: "Palavra de destaque", default: accentWord, maxLength: 80 },
    { id: "sceneLabel", type: "string", label: "Identificação da cena", default: label, maxLength: 100 },
    { id: "ground", type: "color", label: "Fundo", default: palette.ground },
    { id: "ink", type: "color", label: "Texto", default: palette.ink },
    { id: "accent", type: "color", label: "Bloco gráfico", default: palette.accent },
    { id: "accentText", type: "color", label: "Palavra destacada", default: palette.accentText }
  ]));
  const safeDuration = Number(duration).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  const slab = {
    left: palette.slabLeft,
    top: palette.slabTop,
    width: palette.slabWidth,
    height: palette.slabHeight
  };
  const titleLeft = palette.titleLeft;
  const titleTop = palette.titleTop;
  const opening = [
    `tl.fromTo("#${id}-slab", { x: 260 }, { x: 0, duration: 0.56, ease: "expo.out" }, 0);`,
    `tl.fromTo("#${id}-rule", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.42, ease: "power4.out" }, 0.06);`,
    `tl.fromTo("#${id}-title", { y: 0 }, { y: -4, duration: 0.3, ease: "none" }, 0);`
  ][index];
  const titleMotion = [
    "",
    `tl.fromTo("#${id}-title", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.42, ease: "power4.out" }, 0.12);`,
    `tl.fromTo("#${id}-title", { y: 86, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "power4.out" }, 0.1);`,
    `tl.fromTo("#${id}-title", { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0)", duration: 0.4, ease: "power4.out" }, 0.14);`,
    `tl.fromTo("#${id}-title", { scaleX: 0.9, opacity: 0, transformOrigin: "left center" }, { scaleX: 1, opacity: 1, duration: 0.34, ease: "expo.out" }, 0.08);`
  ][index];
  const openingMotion = index === 0
    ? opening
    : [
        `tl.fromTo("#${id}-slab", { x: -260 }, { x: 0, duration: 0.58, ease: "power3.out" }, 0);`,
        `tl.fromTo("#${id}-slab", { scaleY: 0.3, transformOrigin: "center top" }, { scaleY: 1, duration: 0.5, ease: "expo.out" }, 0);`,
        `tl.fromTo("#${id}-slab", { y: 260 }, { y: 0, duration: 0.55, ease: "power3.out" }, 0);`,
        `tl.fromTo("#${id}-slab", { x: 180 }, { x: 0, duration: 0.58, ease: "expo.out" }, 0);`
      ][index - 1] + `\ntl.fromTo("#${id}-rule", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.42, ease: "power4.out" }, 0.06);`;
  const drift = [[-42, 14, 2], [28, -10, -2], [38, 12, 2], [-24, -12, -2], [-34, 10, 2], [22, -8, -2]];
  const motionBeats = [];
  for (let beat = 0, at = 1.65; at + 1.3 < seconds; beat += 1, at += 2.8) {
    const [x, y, rotation] = drift[(index + beat) % drift.length];
    motionBeats.push(`tl.to("#${id}-slab", { x: ${x}, y: ${y}, rotation: ${rotation}, duration: 1.3, ease: "power2.inOut" }, ${at.toFixed(2)});`);
  }
  const kickerMotion = `tl.fromTo("#${id}-kicker", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }, 0.05);`;
  const titleScript = titleMotion ? titleMotion : "";
  return `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--ground);
      color: var(--ink);
      font-family: Inter, Arial, sans-serif;
    }
    #${id}-slab {
      position: absolute;
      left: ${slab.left}px;
      top: ${slab.top}px;
      width: ${slab.width}px;
      height: ${slab.height}px;
      background: var(--accent);
      clip-path: polygon(18% 0, 100% 0, 82% 100%, 0 100%);
      z-index: 1;
    }
    #${id}-kicker {
      position: absolute;
      left: 216px;
      top: 460px;
      right: 216px;
      color: var(--ink);
      font-size: 56px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: .16em;
      text-transform: uppercase;
      z-index: 3;
    }
    #${id}-rule {
      position: absolute;
      left: 216px;
      top: 900px;
      width: 1728px;
      height: 20px;
      background: var(--ink);
      z-index: 2;
    }
    #${id}-title {
      position: absolute;
      left: ${titleLeft}px;
      right: 216px;
      top: ${titleTop}px;
      max-width: 1728px;
      margin: 0;
      z-index: 3;
      font-size: 292px;
      line-height: 0.94;
      font-weight: 900;
      letter-spacing: -0.065em;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    #${id}-title-prefix { color: var(--ink); }
    #${id}-title-accent { color: var(--accentText); }
  </style>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="${safeDuration}" data-width="${WIDTH}" data-height="${HEIGHT}" data-composition-variables='${variables}' style="--ground:${palette.ground};--ink:${palette.ink};--accent:${palette.accent};--accentText:${palette.accentText}">
    <div id="${id}-slab" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="1" data-layout-allow-overflow></div>
    <div id="${id}-rule" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="2"></div>
    <div id="${id}-kicker" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="3" data-var-text="sceneLabel">${safeLabel}</div>
    <h1 id="${id}-title" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="4" data-beat="${SCENE_BEATS[index]}"><span id="${id}-title-prefix" data-var-text="headlinePrefix">${safePrefix}</span> <span id="${id}-title-accent" data-var-text="headlineAccent">${safeAccentWord}</span></h1>
  </div>
  <script>
    const tl_${id.replaceAll("-", "_")} = gsap.timeline({ paused: true });
    ${openingMotion.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    ${kickerMotion.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    ${titleScript.replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    ${motionBeats.join("\n").replaceAll("tl.", "tl_" + id.replaceAll("-", "_") + ".")}
    window.__timelines = window.__timelines || {};
    window.__timelines["${id}"] = tl_${id.replaceAll("-", "_")};
  </script>
</template>
`;
}

function motionSpec(assertions) {
  return JSON.stringify({ assertions }, null, 2) + "\n";
}

function makeCaptionsHtml(scenes, duration) {
  const variables = [];
  const entries = [];
  const tweens = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const seconds = scene.end - scene.start;
    const limit = seconds <= 3.5 ? 56 : seconds <= 6 ? 72 : 96;
    const caption = truncateAtWord(scene.spoken, limit);
    if (!caption) continue;
    const start = Math.min(scene.end - 0.4, scene.start + 0.18);
    const clipDuration = Math.max(0.8, scene.end - start - 0.16);
    const variableId = "caption" + String(index + 1).padStart(2, "0");
    variables.push({ id: variableId, type: "string", label: "Legenda " + (index + 1), default: caption, maxLength: 280 });
    entries.push(`<div id="caption-${index + 1}" class="clip caption-block" data-start="${start.toFixed(3)}" data-duration="${clipDuration.toFixed(3)}" data-track-index="${index + 1}" data-beat="${SCENE_BEATS[index]}"><span class="caption-text" data-var-text="${variableId}">${escapeHtml(caption)}</span></div>`);
    const end = Math.max(start + 0.5, scene.end - 0.12);
    tweens.push(`tl.fromTo("#caption-${index + 1}", { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: "power3.out" }, ${start.toFixed(3)});`);
    tweens.push(`tl.to("#caption-${index + 1}", { opacity: 0, duration: 0.14, ease: "power2.in" }, ${Math.max(start + 0.25, end - 0.16).toFixed(3)});`);
  }
  const vars = escapeHtml(JSON.stringify(variables));
  const tweenScript = tweens.join("\n").replaceAll("tl.", "tl_captions.");
  return `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; font-family: Inter, Arial, sans-serif; --caption-accent: #F24E35; }
    .caption-block {
      position: absolute;
      left: 216px;
      right: 216px;
      bottom: 1200px;
      padding: 26px 32px;
      color: #fff;
      background: rgba(17, 17, 17, .9);
      border-left: 14px solid var(--caption-accent);
      font-size: 68px;
      line-height: 1.16;
      font-weight: 800;
      letter-spacing: -.025em;
      overflow-wrap: anywhere;
    }
    .caption-text { display: block; }
  </style>
  <div id="root" data-composition-id="captions" data-start="0" data-duration="${duration}" data-width="${WIDTH}" data-height="${HEIGHT}" data-composition-variables='${vars}'>
    ${entries.join("\n    ")}
  </div>
  <script>
    const tl_captions = gsap.timeline({ paused: true });
    ${tweenScript}
    window.__timelines = window.__timelines || {};
    window.__timelines["captions"] = tl_captions;
  </script>
</template>
`;
}

function hash(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function wipePath(index, band, orientation, bands) {
  const points = [];
  if (orientation === "horizontal") {
    const bandHeight = HEIGHT / bands;
    const y0 = band * bandHeight + bandHeight / 2 + hash(index * 31 + band) * 26;
    points.push([-120, y0 + hash(index * 37 + band) * 20]);
    for (let i = 1; i <= 8; i += 1) {
      const x = (WIDTH + 240) * (i / 8) - 120;
      const y = y0 + (i % 2 ? -1 : 1) * bandHeight * 0.32 + hash(index * 43 + band * 17 + i) * 18;
      points.push([x, y]);
    }
  } else {
    const bandWidth = WIDTH / bands;
    const x0 = band * bandWidth + bandWidth / 2 + hash(index * 41 + band) * 18;
    points.push([x0 + hash(index * 53 + band) * 18, -160]);
    for (let i = 1; i <= 8; i += 1) {
      const y = (HEIGHT + 320) * (i / 8) - 160;
      const x = x0 + (i % 2 ? -1 : 1) * bandWidth * 0.32 + hash(index * 59 + band * 13 + i) * 16;
      points.push([x, y]);
    }
  }
  return "M " + points.map(point => point[0].toFixed(1) + " " + point[1].toFixed(1)).join(" L ");
}

function makeTransitionHtml(index, color, type) {
  const compositionId = "transition-" + String(index).padStart(2, "0");
  const group = "fx-" + index;
  let style = "#root{position:absolute;inset:0;overflow:hidden;pointer-events:none;}";
  let markup = "";
  const tweens = [];

  if (type === "flash") {
    style += ".fx-group{position:absolute;inset:0;opacity:0;overflow:hidden;}";
    style += "#" + group + "-wash{position:absolute;inset:0;background:#fffaf0;opacity:0;z-index:2;}";
    style += "#" + group + "-sweep{position:absolute;left:-40%;top:-8%;width:180%;height:116%;opacity:0;background:linear-gradient(100deg,transparent 16%," + color + " 42%,#fff 50%," + color + " 58%,transparent 84%);z-index:1;}";
    markup = '<div id="' + group + '" class="clip fx-group" data-start="0" data-duration="2.2" data-track-index="20" style="opacity:0">' +
      '<div id="' + group + '-sweep" class="clip" data-start="0" data-duration="2.2" data-track-index="21" data-layout-allow-overflow></div>' +
      '<div id="' + group + '-wash" class="clip" data-start="0" data-duration="2.2" data-track-index="22"></div>' +
      '</div>';
    tweens.push('tl.set("#' + group + '",{opacity:1},0);');
    tweens.push('tl.fromTo("#' + group + '-sweep",{xPercent:-18,opacity:0},{xPercent:18,opacity:.92,duration:.42,ease:"power3.inOut"},.68);');
    tweens.push('tl.fromTo("#' + group + '-wash",{opacity:0},{opacity:.96,duration:.06,ease:"power4.in"},1.04);');
    tweens.push('tl.to("#' + group + '-wash",{opacity:0,duration:.24,ease:"power3.out"},1.1);');
    tweens.push('tl.to("#' + group + '",{opacity:0,duration:.01},1.82);');
  } else if (type === "iris") {
    style += ".fx-group{position:absolute;inset:0;opacity:0;overflow:hidden;}";
    style += "#" + group + "-iris{position:absolute;left:50%;top:50%;width:5200px;height:5200px;margin:-2600px 0 0 -2600px;border-radius:50%;background:" + color + ";transform:scale(.001);transform-origin:center center;}";
    markup = '<div id="' + group + '" class="clip fx-group" data-start="0" data-duration="2.2" data-track-index="20" style="opacity:0">' +
      '<div id="' + group + '-iris" class="clip" data-start="0" data-duration="2.2" data-track-index="21" data-layout-allow-overflow></div>' +
      '</div>';
    tweens.push('tl.set("#' + group + '",{opacity:1},0);');
    tweens.push('tl.fromTo("#' + group + '-iris",{scale:.001},{scale:1.12,duration:1.08,ease:"power3.in"},.02);');
    tweens.push('tl.to("#' + group + '-iris",{opacity:0,duration:.28,ease:"power2.out"},1.12);');
    tweens.push('tl.to("#' + group + '",{opacity:0,duration:.01},1.78);');
  } else if (type === "scribble") {
    const bands = 11;
    const orientation = "horizontal";
    const strokeWidth = HEIGHT / bands * 0.82;
    const paths = [];
    for (let band = 0; band < bands; band += 1) {
      const pathId = group + "-band-" + band;
      const initial = band % 2 ? -1000 : 1000;
      paths.push('<path id="' + pathId + '" class="clip" data-start="0" data-duration="2.2" data-track-index="' + (band + 1) + '" d="' + wipePath(index, band, orientation, bands) + '" pathLength="1000" stroke="' + color + '" stroke-width="' + strokeWidth.toFixed(1) + '" stroke-dasharray="1000" stroke-dashoffset="' + initial + '"></path>');
      tweens.push('tl.to("#' + pathId + '",{strokeDashoffset:0,duration:.5,ease:"power2.in"},' + (.05 + .025 * band).toFixed(3) + ');');
      tweens.push('tl.to("#' + pathId + '",{strokeDashoffset:' + initial + ',duration:.48,ease:"power2.out"},1.43);');
    }
    style += ".fx-group{position:absolute;inset:0;opacity:0;overflow:hidden;}";
    style += ".fx-group svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:1;}";
    style += ".fx-group path{fill:none;stroke-linecap:round;stroke-linejoin:round;}";
    style += "#" + group + "-solid{position:absolute;inset:0;background:" + color + ";opacity:0;z-index:2;}";
    markup = '<div id="' + group + '" class="clip fx-group" data-start="0" data-duration="2.2" data-track-index="20" style="opacity:0">' +
      '<svg viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" preserveAspectRatio="none" data-layout-allow-overflow>' + paths.join("") + '</svg>' +
      '<div id="' + group + '-solid" class="clip" data-start="0" data-duration="2.2" data-track-index="40"></div>' +
      '</div>';
    tweens.push('tl.set("#' + group + '",{opacity:1},0);');
    tweens.push('tl.to("#' + group + '-solid",{opacity:1,duration:.1,ease:"none"},.86);');
    tweens.push('tl.to("#' + group + '-solid",{opacity:0,duration:.16,ease:"none"},1.42);');
    tweens.push('tl.to("#' + group + '",{opacity:0,duration:.01},2.12);');
  } else {
    style += ".fx-group{position:absolute;inset:0;opacity:0;overflow:hidden;}";
    style += "#" + group + "-whip{position:absolute;left:-30%;top:0;width:160%;height:100%;background:linear-gradient(90deg," + color + " 0%," + color + " 72%,rgba(255,255,255,.98) 86%,transparent 100%);}";
    style += "#" + group + "-streak{position:absolute;left:-25%;top:0;width:150%;height:100%;background:linear-gradient(90deg,transparent 38%,rgba(255,255,255,.72) 49%,transparent 60%);opacity:0;}";
    markup = '<div id="' + group + '" class="clip fx-group" data-start="0" data-duration="2.2" data-track-index="20" style="opacity:0">' +
      '<div id="' + group + '-whip" class="clip" data-start="0" data-duration="2.2" data-track-index="21" data-layout-allow-overflow></div>' +
      '<div id="' + group + '-streak" class="clip" data-start="0" data-duration="2.2" data-track-index="22" data-layout-allow-overflow></div>' +
      '</div>';
    tweens.push('tl.set("#' + group + '",{opacity:1},0);');
    tweens.push('tl.fromTo("#' + group + '-whip",{xPercent:-120},{xPercent:0,duration:.38,ease:"power3.in"},.72);');
    tweens.push('tl.to("#' + group + '-whip",{xPercent:120,duration:.4,ease:"power3.out"},1.1);');
    tweens.push('tl.fromTo("#' + group + '-streak",{xPercent:-140,opacity:0},{xPercent:140,opacity:.8,duration:.36,ease:"power3.inOut"},.78);');
    tweens.push('tl.to("#' + group + '",{opacity:0,duration:.01},1.82);');
  }

  const jsId = compositionId.replaceAll("-", "_");
  const script = tweens.join("\n").replaceAll("tl.", "tl_" + jsId + ".");
  return '<template>\n' +
    '  <style>\n' + style + '\n' +
    '  </style>\n' +
    '  <div id="root" data-composition-id="' + compositionId + '" data-start="0" data-duration="2.2" data-width="' + WIDTH + '" data-height="' + HEIGHT + '">\n' +
    '    ' + markup + '\n' +
    '  </div>\n' +
    '  <script>\n' +
    '    const tl_' + jsId + ' = gsap.timeline({ paused: true });\n' +
    '    ' + script + '\n' +
    '    window.__timelines = window.__timelines || {};\n' +
    '    window.__timelines["' + compositionId + '"] = tl_' + jsId + ';\n' +
    '  </script>\n' +
    '</template>\n';
}

export async function buildCreatorComposition(manifest, mediaInput = {}) {
  const duration = validateManifest(manifest);
  const scenes = manifest.brief.scenes;
  const voiceover = validateAudioAsset(mediaInput.voiceover, "voiceover");
  const music = validateAudioAsset(mediaInput.music, "music");
  const totalAudioBytes = (voiceover?.sizeBytes ?? 0) + (music?.sizeBytes ?? 0);
  if (totalAudioBytes > MAX_AUDIO_TOTAL_BYTES) {
    throw new TypeError("A soma dos arquivos de áudio deve ter no máximo 18 MB");
  }
  const audioAssets = { voiceover, music };
  const projectFiles = [
    { path: "index.html", content: makeIndexHtml(duration, scenes, audioAssets), encoding: "utf8" }
  ];
  const motionAssertions = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const sceneId = SCENE_IDS[index];
    projectFiles.push({
      path: "compositions/" + sceneId + ".html",
      content: sceneHtml(scene, index, scene.end - scene.start, manifest.brief),
      encoding: "utf8"
    });
    const titleBy = [0.05, 0.7, 0.58, 0.68, 0.58][index];
    motionAssertions.push(
      { kind: "appearsBy", selector: "#" + sceneId + "-title", bySec: scene.start + titleBy },
      { kind: "appearsBy", selector: "#" + sceneId + "-kicker", bySec: scene.start + 0.4 }
    );
  }
  projectFiles.push({
    path: "compositions/captions.html",
    content: makeCaptionsHtml(scenes, duration),
    encoding: "utf8"
  });
  motionAssertions.push(...scenes.map((scene, index) => ({
    kind: "appearsBy",
    selector: "#caption-" + (index + 1),
    bySec: Math.min(scene.end - 0.25, scene.start + 0.68)
  })));
  const transitionTypes = ["flash", "scribble", "iris", "whip"];
  const transitionColors = PALETTES.slice(1).map(palette => palette.ground);
  for (let index = 0; index < scenes.length - 1; index += 1) {
    const id = "transition-" + String(index + 1).padStart(2, "0");
    projectFiles.push({
      path: "compositions/" + id + ".html",
      content: makeTransitionHtml(index + 1, transitionColors[index], transitionTypes[index]),
      encoding: "utf8"
    });
    const group = "fx-" + (index + 1);
    const selector = transitionTypes[index] === "flash" ? "#" + group + "-sweep"
      : transitionTypes[index] === "scribble" ? "#" + group + "-solid"
      : transitionTypes[index] === "iris" ? "#" + group + "-iris"
      : "#" + group + "-whip";
    motionAssertions.push({
      kind: "appearsBy",
      selector,
      bySec: Math.max(0, scenes[index].end - 1.1) + 1.08
    });
  }
  projectFiles.push({
    path: "index.motion.json",
    content: motionSpec(motionAssertions),
    encoding: "utf8"
  });
  const gsap = await readFile(new URL("../assets/gsap.min.js", import.meta.url), "utf8");
  projectFiles.push({ path: "assets/gsap.min.js", content: gsap, encoding: "utf8" });
  if (voiceover) projectFiles.push({ path: voiceover.path, contentBase64: voiceover.contentBase64, encoding: "base64" });
  if (music) projectFiles.push({ path: music.path, contentBase64: music.contentBase64, encoding: "base64" });
  projectFiles.push({
    path: "creator-storyboard.json",
    content: JSON.stringify({
      ...manifest,
      audioAssets: {
        voiceover: voiceover ? { filename: voiceover.filename, durationSeconds: voiceover.durationSeconds, sizeBytes: voiceover.sizeBytes } : null,
        music: music ? { filename: music.filename, durationSeconds: music.durationSeconds, sizeBytes: music.sizeBytes } : null
      }
    }, null, 2) + "\n",
    encoding: "utf8"
  });

  const blockers = [];
  const warnings = scenes.flatMap((scene, index) => {
    const seconds = scene.end - scene.start;
    const titleLimit = seconds <= 3.5 ? 44 : seconds <= 6 ? 64 : 84;
    const captionLimit = seconds <= 3.5 ? 56 : seconds <= 6 ? 72 : 96;
    const fullTitle = textValue(scene.onscreen, 220).trim()
      || (index === 0 ? textValue(manifest.brief.chosenHook || scene.spoken, 120).trim() : scene.name);
    const fullCaption = textValue(scene.spoken, 280).trim();
    const result = [];
    if (fullTitle.length > titleLimit) result.push("Cena " + (index + 1) + ": texto principal reduzido visualmente; o texto integral está em creator-storyboard.json.");
    if (fullCaption.length > captionLimit) result.push("Cena " + (index + 1) + ": legenda reduzida visualmente; o texto integral está em creator-storyboard.json.");
    return result;
  });
  if (!voiceover) blockers.push("Narração ainda não foi anexada. Exporte uma voz do VoiceStudio ou anexe uma gravação WAV/MP3.");
  else if (Math.abs(voiceover.durationSeconds - duration) > 1.5) blockers.push("A narração tem " + voiceover.durationSeconds.toFixed(2) + " s e o vídeo " + duration + " s; ajustar a timeline e sincronizar as falas.");
  if (!music) blockers.push("Trilha musical ainda não foi anexada.");
  else if (music.durationSeconds < duration - 0.5) blockers.push("A trilha musical termina antes do vídeo; não haverá loop automático.");
  if (scenes.some(scene => textValue(scene.sound).trim())) blockers.push("As notas de som por cena ainda precisam ser resolvidas em efeitos sonoros reais e licenciados.");
  blockers.push("As cenas ainda usam tipografia e blocos gráficos; faltam imagens ou vídeos específicos do assunto.");
  blockers.push("A composição precisa passar por HyperFrames check, preview e revisão visual no Worker antes de liberar a fila.");

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
      audio: {
        voiceover: voiceover ? { attached: true, durationSeconds: voiceover.durationSeconds } : { attached: false },
        music: music ? { attached: true, durationSeconds: music.durationSeconds } : { attached: false }
      },
      warnings,
      blockers,
      notes: [
        "O gancho fica visível no frame zero.",
        "Cada cena é uma subcomposição independente e editável.",
        "As legendas estão em uma única faixa captions.",
        "As transições alternam flash editorial, rabisco, íris e whip, cobrindo cada corte antes de revelar a próxima cena.",
        "O texto do usuário é escapado antes de entrar no HTML.",
        "Arquivos de áudio são copiados para o pacote e nunca enviados à fila automaticamente."
      ]
    }
  };
}
