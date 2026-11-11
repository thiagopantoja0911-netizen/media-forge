import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";
import { buildCreatorComposition } from "../src/creator-composer.mjs";

const SECONDS = 15;
const sampleRate = 24_000;
const qaDir = join(process.env.RUNNER_TEMP || tmpdir(), "forge-midjourney-technical-qa");
const outfile = join(qaDir, "forge-midjourney-15s-2160x3840-60fps-technical.mp4");
const draft = {
  version: 1,
  title: "Forge Midjourney — teste técnico 15s 4K60",
  topic: "Validação isolada do fluxo de cinco cenas e duas faixas de áudio",
  duration: "15",
  intent: "demonstracao",
  tone: "direto",
  hookA: "Cinco cenas, uma linha do tempo",
  hookB: "Teste de composição vertical",
  hookC: "Uma validação antes do render final",
  selectedHook: "hookA",
  scenes: [
    { spoken: "Cena um: abertura", onscreen: "O PRIMEIRO QUADRO", action: "Abrir com título", sound: "diagnóstico" },
    { spoken: "Cena dois: contexto", onscreen: "CINCO CENAS", action: "Exibir contexto", sound: "diagnóstico" },
    { spoken: "Cena três: prova", onscreen: "DUAS FAIXAS DE ÁUDIO", action: "Alternar ritmo", sound: "diagnóstico" },
    { spoken: "Cena quatro: revelação", onscreen: "QUATRO TRANSIÇÕES", action: "Mostrar transição", sound: "diagnóstico" },
    { spoken: "Cena cinco: fechamento", onscreen: "TESTE DE 15 SEGUNDOS", action: "Encerrar", sound: "diagnóstico" }
  ]
};

function diagnosticWav(track) {
  const bytes = sampleRate * SECONDS * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write("RIFF", 0, 4, "ascii");
  out.writeUInt32LE(36 + bytes, 4);
  out.write("WAVEfmt ", 8, 8, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, 4, "ascii");
  out.writeUInt32LE(bytes, 40);
  for (let n = 0; n < sampleRate * SECONDS; n += 1) {
    const sec = n / sampleRate;
    const fade = Math.min(1, sec / 0.15, (SECONDS - sec) / 0.28);
    const freq = track === "voiceover" ? 190 + 35 * Math.floor(sec / 3) : 110;
    const val = track === "voiceover"
      ? Math.sin(2 * Math.PI * freq * sec) * 0.055
      : (Math.sin(2 * Math.PI * freq * sec) + Math.sin(2 * Math.PI * freq * 1.5 * sec) * 0.3) * 0.027;
    out.writeInt16LE(Math.round(32767 * val * fade), 44 + 2 * n);
  }
  return out;
}
function audioAsset(track) {
  const bytes = diagnosticWav(track);
  return {
    filename: track + "-diagnostic.wav",
    mimeType: "audio/wav",
    sizeBytes: bytes.byteLength,
    durationSeconds: SECONDS,
    contentBase64: bytes.toString("base64")
  };
}

function command(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(file, args, {
      cwd, env: { ...process.env, CI: "1" }, windowsHide: true
    });
    let logs = "";
    for (const output of [p.stdout, p.stderr]) output.on("data", chunk => {
      logs += String(chunk);
      if (logs.length > 40000) logs = logs.slice(-24000);
    });
    p.on("error", reject);
    p.on("close", code => {
      if (code !== 0) reject(new Error(file + " exit " + code + "\n" + logs.slice(-6000)));
      else resolve(logs);
    });
  });
}

const directory = await mkdtemp(join(tmpdir(), "forge-15s-compose-"));
await mkdir(qaDir, { recursive: true });
try {
  const project = await buildCreatorComposition(
    importSalevoStudioDraft(draft).manifest,
    { voiceover: audioAsset("voiceover"), music: audioAsset("music") }
  );
  if (project.readiness.renderReady !== false) throw new Error("Production readiness must stay false");
  if (!project.readiness.audio.voiceover.attached || !project.readiness.audio.music.attached) {
    throw new Error("Diagnostic audio inputs were not packaged");
  }
  for (const file of project.projectFiles) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, typeof file.content === "string"
      ? Buffer.from(file.content, "utf8")
      : Buffer.from(file.contentBase64, "base64"));
  }
  console.log("Checking isolated 15s HyperFrames project...");
  await command("npx", ["--yes", "hyperframes@0.9.25", "check", "--json"], directory);
  console.log("Rendering 2160x3840, 60fps, quality high, 15s (technical fixture)...");
  const log = await command("npx", [
    "--yes", "hyperframes@0.9.25", "render",
    "--resolution", "portrait-4k", "--fps", "60",
    "--quality", "high", "--output", outfile
  ], directory);
  console.log("HyperFrames render command completed. Tail:", log.slice(-1500));
  const probeRaw = await command("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,nb_frames",
    "-of", "json", outfile
  ], directory);
  const probe = JSON.parse(probeRaw);
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");
  if (!video || video.width !== 2160 || video.height !== 3840) {
    throw new Error("Incorrect 4K portrait video stream: " + JSON.stringify(video));
  }
  if (video.avg_frame_rate !== "60/1") {
    throw new Error("Incorrect FPS: " + video.avg_frame_rate);
  }
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - SECONDS) > 0.25) {
    throw new Error("Incorrect MP4 duration: " + duration);
  }
  if (!audio) throw new Error("MP4 lacks audio track");
  const report = {
    scope: "TECHNICAL QA ONLY — diagnostic tones are neither narration nor musical delivery",
    date: new Date().toISOString(),
    project: {
      seconds: SECONDS, width: 2160, height: 3840, fps: 60,
      scenes: 5, transitions: 4,
      voiceoverSource: "synthetic low-volume diagnostic WAV (not natural speech)",
      musicSource: "synthetic low-volume diagnostic WAV (not musical arrangement)",
      renderReady: false
    },
    probe,
    results: {
      renderCompleted: true, videoResolutionOk: true,
      fpsOk: true, durationOk: true, audioTrackPresent: true
    },
    remaining: [
      "No actual narration/music/scene SFX quality review",
      "No topic-specific licensed footage or images",
      "No Windows Worker job executed by this CI run",
      "No subjective audiovisual quality signoff"
    ]
  };
  await writeFile(join(qaDir, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log("Technical video QA passed", JSON.stringify(report.results));
} catch (error) {
  await writeFile(join(qaDir, "FAILURE.txt"), String(error.stack || error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
