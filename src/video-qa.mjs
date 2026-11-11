import { spawn } from "node:child_process";

/**
 * Technical verification only. This is NOT an artistic approval.
 * ffprobe may be installed alongside FFmpeg on the Windows worker.
 */
export function evaluateVideoProbe(data, project, expectsAudio = false) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const video = streams.find(s => s.codec_type === "video");
  const audio = streams.find(s => s.codec_type === "audio");
  const issues = [];
  const expected = { "portrait-4k": [2160, 3840], "4k": [3840, 2160], "1080p": [1920, 1080] };
  const target = expected[project.resolution] || null;
  if (!video) issues.push("MP4 sem stream de vídeo");
  if (target && video && (Number(video.width) !== target[0] || Number(video.height) !== target[1])) {
    issues.push("Resolução diferente de " + target.join("x"));
  }
  const fpsParts = String(video?.avg_frame_rate || "0/1").split("/");
  const fps = Number(fpsParts[0]) / Number(fpsParts[1] || 1);
  const expectedFps = Number(project.fps) || 60;
  if (!Number.isFinite(fps) || fps < 1 || Math.abs(fps - expectedFps) > 0.65) {
    issues.push("FPS incorreto: " + (Number.isFinite(fps) ? fps.toFixed(2) : "desconhecido"));
  }
  const duration = Number(data?.format?.duration ?? video?.duration);
  if (!Number.isFinite(duration) || duration <= 0 ||
      Math.abs(duration - Number(project.durationSeconds)) > 0.75) {
    issues.push("Duração divergente da timeline");
  }
  if (expectsAudio && !audio) issues.push("O MP4 não contém áudio, embora tenha locução");
  return {
    status: issues.length ? "failed" : "passed",
    kind: "technical-ffprobe",
    width: Number(video?.width) || null,
    height: Number(video?.height) || null,
    fps: Number.isFinite(fps) ? Number(fps.toFixed(3)) : null,
    durationSeconds: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null,
    hasAudio: Boolean(audio),
    issues,
    artisticReview: "pending",
    note: "Verificação de codecs/metadados não avalia narrativa, frames, mixagem, legibilidade nem qualidade criativa."
  };
}

export async function inspectRenderedVideo(path, project, expectsAudio = false) {
  const executable = process.env.FFPROBE_BIN || "ffprobe";
  return new Promise(resolve => {
    const args = ["-v", "error", "-show_streams", "-show_format", "-of", "json", path];
    let output = "", errorOutput = "", settled = false;
    const complete = (result) => { if (!settled) { settled = true; resolve(result); } };
    const child = spawn(executable, args, { windowsHide: true, shell: false });
    child.on("error", error => complete({
      status: "unverified", kind: "technical-ffprobe",
      issues: ["FFprobe indisponível: " + error.message.slice(0, 240)],
      artisticReview: "pending"
    }));
    child.stdout.on("data", chunk => { if (output.length < 2_000_000) output += chunk.toString(); });
    child.stderr.on("data", chunk => { if (errorOutput.length < 2_000) errorOutput += chunk.toString(); });
    child.on("close", code => {
      if (settled) return;
      if (code !== 0) {
        complete({ status: "unverified", kind: "technical-ffprobe",
          issues: ["FFprobe retornou código " + code + ": " + errorOutput.slice(0, 250)],
          artisticReview: "pending" });
        return;
      }
      try { complete(evaluateVideoProbe(JSON.parse(output), project, expectsAudio)); }
      catch (error) {
        complete({ status: "unverified", kind: "technical-ffprobe",
          issues: ["Não foi possível interpretar o resultado FFprobe: " + error.message],
          artisticReview: "pending" });
      }
    });
  });
}
