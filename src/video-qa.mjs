import { spawn } from "node:child_process";
import { fpsValue } from "./motion/plan.mjs";

/**
 * Technical verification only. This is NOT an artistic approval.
 * ffprobe may be installed alongside FFmpeg on the Windows worker.
 */
export function evaluateVideoProbe(data, project, expectsAudio = false) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const video = streams.find(s => s.codec_type === "video");
  const audio = streams.find(s => s.codec_type === "audio");
  const issues = [];
  const expected = {
    "portrait": [1080,1920], "landscape": [1920,1080], "square": [1080,1080],
    "portrait-4k": [2160,3840], "landscape-4k": [3840,2160], "square-4k": [2160,2160],
    "4k": [3840,2160], "uhd": [3840,2160], "1080p": [1920,1080],
    "landscape-1440p": [2560,1440], "portrait-1440p": [1440,2560], "square-1440p": [1440,1440],
    "1440p": [2560,1440], "qhd": [2560,1440], "1080p-square": [1080,1080],
    "square-1080p": [1080,1080], "4k-square": [2160,2160],
    "1440p-portrait": [1440,2560], "1440p-square": [1440,1440]
  };
  const target = expected[project.resolution] || (project.width && project.height ? [project.width,project.height] : null);
  if (!video) issues.push("MP4 sem stream de vídeo");
  if (target && video && (Number(video.width) !== target[0] || Number(video.height) !== target[1])) {
    issues.push("Resolução diferente de " + target.join("x"));
  }
  const fpsParts = String(video?.avg_frame_rate || "0/1").split("/");
  const fps = Number(fpsParts[0]) / Number(fpsParts[1] || 1);
  const expectedFps = fpsValue(project.fps ?? 60);
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


/**
 * Audio QA checks the actual rendered mix, not just the existence of an AAC track.
 * It cannot prove the narration's words or SFX are audible; artistic listening remains separate.
 */
export function evaluateAudioLoudness({integratedLufs,truePeakDb}={}) {
  const i=Number(integratedLufs), tp=Number(truePeakDb);
  if(!Number.isFinite(i)||!Number.isFinite(tp)) return {
    status:"failed",kind:"ffmpeg-loudnorm-analysis",integratedLufs:null,truePeakDb:null,
    issues:["Mix sem loudness mensurável (possível silêncio)."],warnings:[]
  };
  const issues=[],warnings=[];
  if(i < -25) issues.push("Mix muito baixa ("+i.toFixed(1)+" LUFS).");
  else if(i < -19) warnings.push("Mix baixa para social; revisar reprodução em celular.");
  if(i > -10) issues.push("Mix excessivamente alta ("+i.toFixed(1)+" LUFS).");
  else if(i > -13) warnings.push("Mix alta para social; conferir inteligibilidade.");
  if(tp > -1) issues.push("Pico verdadeiro acima de -1 dBTP ("+tp.toFixed(1)+" dBTP).");
  return {status:issues.length?"failed":"passed",kind:"ffmpeg-loudnorm-analysis",
    integratedLufs:i,truePeakDb:tp,issues,warnings,artisticReview:"pending"};
}

export async function inspectRenderedAudio(path,{timeoutMs=90000}={}) {
  const executable=process.env.FFMPEG_BIN||"ffmpeg";
  return new Promise(resolve=>{
    let output="",settled=false;
    const complete=result=>{if(!settled){settled=true;resolve(result);}};
    const child=spawn(executable,["-hide_banner","-nostats","-i",path,"-vn","-map","0:a:0",
      "-af","loudnorm=I=-16:TP=-1:LRA=11:print_format=json","-f","null","-"],
      {windowsHide:true,shell:false});
    const timer=setTimeout(()=>{child.kill();complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["Audio QA timeout"],warnings:[]})},timeoutMs);
    child.on("error",error=>{clearTimeout(timer);complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["FFmpeg unavailable: "+error.message],warnings:[]})});
    child.stderr.on("data",buf=>{output+=buf.toString();if(output.length>500000)output=output.slice(-150000)});
    child.on("close",code=>{
      clearTimeout(timer);
      if(settled)return;
      if(code!==0){complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["FFmpeg exited "+code],warnings:[]});return;}
      const field=key=>{
        const hits=[...output.matchAll(new RegExp('"'+key+'"\\s*:\\s*"([^"]+)"',"g"))];
        return hits.length?Number(hits.at(-1)[1]):NaN;
      };
      complete(evaluateAudioLoudness({integratedLufs:field("input_i"),truePeakDb:field("input_tp")}));
    });
  });
}
