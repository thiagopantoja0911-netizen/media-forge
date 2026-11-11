import { mkdtemp, mkdir, writeFile, rm, readdir, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";
import { buildCreatorComposition } from "../src/creator-composer.mjs";

// Locally created test PNGs, no external service or image-generation claims.
function pngImage(index, width = 240, height = 426) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    scanlines[start] = 0;
    for (let x = 0; x < width; x++) {
      const offset = start + 1 + x * 4;
      scanlines[offset] = Math.min(255, 24 + index * 28 + Math.round(x / width * 52));
      scanlines[offset + 1] = Math.min(255, 38 + index * 17 + Math.round(y / height * 60));
      scanlines[offset + 2] = Math.min(255, 75 + index * 14 + Math.round((x + y) / (width + height) * 88));
      scanlines[offset + 3] = 255;
    }
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, payload) {
    const label = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4), check = Buffer.alloc(4);
    length.writeUInt32BE(payload.length, 0);
    check.writeUInt32BE(crc32(Buffer.concat([label, payload])), 0);
    return Buffer.concat([length, label, payload, check]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 7 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function cli(dir, args) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["--yes", "hyperframes@0.9.25", ...args], {
      cwd: dir, env: { ...process.env, CI: "1" }, shell: process.platform === "win32", windowsHide: true
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", x => { stdout += x; });
    p.stderr.on("data", x => { stderr += x; });
    p.on("error", reject);
    p.on("close", code => {
      process.stdout.write("HyperFrames " + args[0] + ": " + stdout.slice(-12000) + "\n");
      if (stderr) process.stderr.write(stderr.slice(-3500));
      if (code !== 0) reject(new Error("HyperFrames " + args[0] + " failed: code " + code));
      else resolve(stdout);
    });
  });
}

const draft = {
  version: 1, title: "Teste técnico: composição com 5 imagens reais",
  topic: "Validar cinco cenas com arquivos PNG locais",
  duration: "15", intent: "demonstracao", tone: "direto",
  selectedHook: "hookA", hookA: "Tudo começa aqui", hookB: "O que você vê?", hookC: "Antes e depois",
  scenes: [
    { spoken: "A primeira imagem abre a história.", onscreen: "Abertura", action: "Aproximação suave", sound: "" },
    { spoken: "O contexto muda o plano.", onscreen: "Contexto", action: "Movimento lateral", sound: "" },
    { spoken: "A imagem mostra um detalhe.", onscreen: "Prova", action: "Zoom in", sound: "" },
    { spoken: "Agora revele a totalidade.", onscreen: "Revelação", action: "Afastar a câmera", sound: "" },
    { spoken: "O fim mantém a narrativa.", onscreen: "Fechamento", action: "Pausar e encerrar", sound: "" }
  ]
};
const assets = Array.from({ length: 5 }, (_, index) => {
  const bytes = pngImage(index);
  return { filename: "reference-" + index + ".png", mimeType: "image/png", sizeBytes: bytes.length, contentBase64: bytes.toString("base64") };
});

const dir = await mkdtemp(join(tmpdir(), "mediaforge-media-check-"));
try {
  const plan = await buildCreatorComposition(importSalevoStudioDraft(draft).manifest, { scenes: assets });
  if (plan.readiness.media.attachedScenes !== 5) throw new Error("Expected five attached scene media files");
  for (const file of plan.projectFiles) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contentBase64 ? Buffer.from(file.contentBase64, "base64") : file.content, file.contentBase64 ? undefined : "utf8");
  }
  await cli(dir, ["check", "--json"]);
  await cli(dir, ["snapshot", "--review"]);
  const snapDir = join(dir, ".hyperframes", "artifacts", "snapshots");
  const snapshots = await readdir(snapDir, { recursive: true });
  if (snapshots.length === 0) throw new Error("No media review snapshots created");
  if (process.env.RUNNER_TEMP) {
    const output = join(process.env.RUNNER_TEMP, "mediaforge-creator-snapshots", "real-media");
    await mkdir(output, { recursive: true });
    await cp(snapDir, output, { recursive: true });
  }
  process.stdout.write("Five local PNG assets passed HyperFrames check and snapshot review.\n");
} finally {
  await rm(dir, { force: true, recursive: true });
}
