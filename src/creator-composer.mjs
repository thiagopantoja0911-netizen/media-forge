import { readFile } from "node:fs/promises";

const WIDTH = 2160;
const HEIGHT = 3840;
const SCENE_IDS = ["scene-01", "scene-02", "scene-03", "scene-04", "scene-05"];
const ACCENTS = ["#91f4d5", "#b5a2ff", "#ffbd72", "#82c8ff", "#f1a6cf"];
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
  return [
    '<div id="', id, '" data-composition-id="', id,
    '" data-composition-src="compositions/', id, '.html"',
    '" data-start="', scene.start, '" data-duration="', scene.end - scene.start,
    '" data-track-index="', index + 1, '" data-track-kind="graphics"',
    '" data-width="', WIDTH, '" data-height="', HEIGHT, '"></div>'
  ].join("");
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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediaForge Creator Project</title>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${WIDTH}" data-height="${HEIGHT}">
    ${hosts}
    ${voice}
    ${music}
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
  const sceneSeconds = Number(duration);
  const titleLimit = sceneSeconds <= 3.5 ? 44 : sceneSeconds <= 6 ? 64 : 96;
  const captionLimit = sceneSeconds <= 3.5 ? 36 : sceneSeconds <= 6 ? 70 : 120;
  const fullTitle = textValue(scene.onscreen, 220).trim()
    || (index === 0 ? textValue(scene.spoken, 120).trim() : scene.name);
  const title = fullTitle.slice(0, titleLimit);
  const fullCaption = textValue(scene.spoken, 280).trim();
  const caption = fullCaption.slice(0, captionLimit);
  const kicker = "MEDIAFORGE / " + String(index + 1).padStart(2, "0") + " — " + textValue(scene.name, 50).toUpperCase();
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
      font-size: 58px;
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
    .clip { position: absolute; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${WIDTH}" data-height="${HEIGHT}" data-composition-variables='${variables}'>
    <div id="${id}-orb" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="1"></div>
    <div id="${id}-bar" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="2"></div>
    <div id="${id}-kicker" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="3">${safeKicker}</div>
    <h1 id="${id}-title" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="4" data-var-text="headline">${safeTitle}</h1>
    ${caption ? `<p id="${id}-caption" class="clip" data-start="0" data-duration="${safeDuration}" data-track-index="5">${safeCaption}</p>` : ""}
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
    const titleLimit = seconds <= 3.5 ? 44 : seconds <= 6 ? 64 : 96;
    const captionLimit = seconds <= 3.5 ? 36 : seconds <= 6 ? 70 : 120;
    const title = textValue(scene.onscreen, 220).trim() || (index === 0 ? textValue(scene.spoken, 120).trim() : scene.name);
    const caption = textValue(scene.spoken, 280).trim();
    const result = [];
    if (title.length > titleLimit) result.push("Cena " + (index + 1) + ": texto principal reduzido visualmente; o texto integral está em creator-storyboard.json.");
    if (caption.length > captionLimit) result.push("Cena " + (index + 1) + ": legenda reduzida visualmente; o texto integral está em creator-storyboard.json.");
    return result;
  });
  if (!voiceover) blockers.push("Narração ainda não foi anexada. Exporte uma voz do VoiceStudio ou anexe uma gravação WAV/MP3.");
  else if (Math.abs(voiceover.durationSeconds - duration) > 1.5) blockers.push("A narração tem " + voiceover.durationSeconds.toFixed(2) + " s e o vídeo " + duration + " s; ajustar a timeline e sincronizar as falas.");
  if (!music) blockers.push("Trilha musical ainda não foi anexada.");
  else if (music.durationSeconds < duration - 0.5) blockers.push("A trilha musical termina antes do vídeo; não haverá loop automático.");
  if (scenes.some(scene => textValue(scene.sound).trim())) blockers.push("As notas de som por cena ainda precisam ser resolvidas em efeitos sonoros reais e licenciados.");
  blockers.push("As cenas usam tipografia cinética abstrata; faltam imagens ou vídeos específicos do assunto.");
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
        "A primeira cena mantém o gancho visível no frame zero.",
        "Cada cena é uma subcomposição independente e editável.",
        "O texto do usuário é escapado antes de entrar no HTML.",
        "Arquivos de áudio são copiados para o pacote e nunca enviados à fila automaticamente."
      ]
    }
  };
}
