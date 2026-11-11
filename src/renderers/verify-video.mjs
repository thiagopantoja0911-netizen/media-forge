import { spawn } from "node:child_process";

function rational(value) {
  if (typeof value === "number") return value;
  const [a,b] = String(value ?? "").split("/").map(Number);
  if (!Number.isFinite(a)) return null;
  if (!Number.isFinite(b) || b === 0) return a;
  return a / b;
}
function expectedDimensions(project = {}) {
  const ratio = project.aspectRatio ?? project.aspect_ratio ?? "9:16";
  const preset = String(project.resolution ?? "");
  const presets = {
    "portrait-4k":[2160,3840],"landscape-4k":[3840,2160],"square-4k":[2160,2160],
    "portrait-1440p":[1440,2560],"landscape-1440p":[2560,1440],"square-1440p":[1440,1440],
    "portrait":[1080,1920],"landscape":[1920,1080],"square":[1080,1080],
    "4k":ratio==="16:9"?[3840,2160]:ratio==="1:1"?[2160,2160]:[2160,3840],
    "uhd":ratio==="16:9"?[3840,2160]:ratio==="1:1"?[2160,2160]:[2160,3840],
    "1080p":ratio==="16:9"?[1920,1080]:ratio==="1:1"?[1080,1080]:[1080,1920],
    "1440p":ratio==="16:9"?[2560,1440]:ratio==="1:1"?[1440,1440]:[1440,2560]
  };
  return presets[preset] ?? null;
}
export function validateProbeData(probe, project = {}) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("MP4 final não contém stream de vídeo.");
  const width = Number(video.width), height = Number(video.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("FFprobe não conseguiu confirmar as dimensões do vídeo.");
  }
  const expected = expectedDimensions(project);
  if (expected && (width !== expected[0] || height !== expected[1])) {
    throw new Error("Resolução final divergente: esperado " + expected.join("x") + ", recebido " + width + "x" + height + ". Não será reduzida automaticamente.");
  }
  const fps = rational(video.avg_frame_rate) ?? rational(video.r_frame_rate);
  const expectedFps = rational(project.fps ?? 60);
  if (expectedFps !== null && (fps === null || Math.abs(fps - expectedFps) > 0.1)) {
    throw new Error("FPS final divergente: esperado " + expectedFps + ", recebido " + (fps ?? "desconhecido") + ".");
  }
  const duration = Number(probe?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Duração do MP4 não pôde ser confirmada.");
  const expectedDuration = Number(project.durationSeconds ?? project.duration_seconds);
  if (Number.isFinite(expectedDuration) && expectedDuration > 0 && Math.abs(duration - expectedDuration) > Math.max(1.25, expectedDuration * 0.03)) {
    throw new Error("Duração final divergente: esperado aproximadamente " + expectedDuration + "s, recebido " + duration.toFixed(2) + "s.");
  }
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  return {
    width,height,fps:Number(fps?.toFixed(3)),durationSeconds:Number(duration.toFixed(3)),
    videoCodec:video.codec_name ?? null,audioPresent:audio.length>0,
    audioStreams:audio.length,format:probe?.format?.format_name ?? null
  };
}
export async function verifyVideoArtifact(filePath, project, ffprobePath = process.env.MEDIAFORGE_FFPROBE_PATH) {
  if (!ffprobePath) throw new Error("FFprobe não configurado. Instale as dependências do worker Windows antes de renderizar.");
  const output = await new Promise((resolve,reject) => {
    const child=spawn(ffprobePath,[
      "-v","error","-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels",
      "-show_entries","format=duration,size,format_name","-of","json",filePath
    ],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",chunk=>stdout+=chunk.toString());
    child.stderr.on("data",chunk=>stderr+=chunk.toString());
    child.on("error",reject);
    child.on("close",code=>code===0?resolve(stdout):reject(new Error("FFprobe falhou ("+code+"): "+stderr.slice(-3000))));
  });
  let probe;
  try{probe=JSON.parse(output);}catch{throw new Error("FFprobe retornou JSON inválido.");}
  return validateProbeData(probe,project);
}
