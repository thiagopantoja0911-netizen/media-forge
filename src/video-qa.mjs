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
  // Explicit dimensions come from the inspected motion plan and are authoritative.
  // Resolution aliases such as "1080p" are ambiguous about orientation and are only fallbacks.
  const target = project.width && project.height
    ? [Number(project.width), Number(project.height)]
    : (expected[project.resolution] || null);
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
export function evaluateAudioLoudness({integratedLufs,truePeakDb,silenceSegments=[],clippedSamples=0,maxVolumeDb=NaN}={}) {
 const i=Number(integratedLufs),tp=Number(truePeakDb),clipped=Number(clippedSamples),maxVol=Number(maxVolumeDb);
 if(!Number.isFinite(i)||!Number.isFinite(tp))return {status:"failed",kind:"ffmpeg-loudnorm-analysis",
  integratedLufs:null,truePeakDb:null,issues:["Mix sem loudness mensurável (possível silêncio)."],warnings:[]};
 const issues=[],warnings=[];
 if(i< -25)issues.push("Mix muito baixa ("+i.toFixed(1)+" LUFS).");
 else if(i< -19)warnings.push("Mix baixa para social; revisar reprodução em celular.");
 if(i> -10)issues.push("Mix excessivamente alta ("+i.toFixed(1)+" LUFS).");
 else if(i> -13)warnings.push("Mix alta para social; conferir inteligibilidade.");
 if(i< -16||i> -14)warnings.push("Loudness fora da meta de publicação de -16 a -14 LUFS.");
 if(tp> -1)issues.push("Pico verdadeiro acima de -1 dBTP ("+tp.toFixed(1)+" dBTP).");
 if(Number.isFinite(maxVol)&&maxVol>-.1)issues.push("Amostras próximas de clipping (max_volume "+maxVol.toFixed(1)+" dB).");
 if(Number.isFinite(clipped)&&clipped>0)issues.push("FFmpeg detectou "+clipped+" amostras clipadas.");
 const longSilences=Array.isArray(silenceSegments)?silenceSegments.filter(s=>Number.isFinite(s.durationSeconds)&&s.durationSeconds>=2):[];
 if(longSilences.length)warnings.push("Silêncios maiores que 2s detectados: "+longSilences.length+"; conferir pausas, voz e trilha por escuta.");
 return {status:issues.length?"failed":"passed",kind:"ffmpeg-loudnorm-analysis",integratedLufs:i,truePeakDb:tp,
  maxVolumeDb:Number.isFinite(maxVol)?maxVol:null,clippedSamples:Number.isFinite(clipped)?clipped:null,
  issues,warnings,silenceSegments:Array.isArray(silenceSegments)?silenceSegments:[],artisticReview:"pending"};
}

export async function inspectRenderedAudio(path,{timeoutMs=90000,durationSeconds=null}={}) {
 const executable=process.env.FFMPEG_BIN||"ffmpeg";
 return new Promise(resolve=>{
  let output="",settled=false;
  const complete=result=>{if(!settled){settled=true;resolve(result);}};
  const child=spawn(executable,["-hide_banner","-nostats","-i",path,"-vn","-map","0:a:0",
   "-af","loudnorm=I=-15:TP=-1:LRA=11:print_format=json,silencedetect=noise=-45dB:d=2,astats=metadata=1:reset=0,volumedetect",
   "-f","null","-"],{windowsHide:true,shell:false});
  const timer=setTimeout(()=>{child.kill();complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["Audio QA timeout"],warnings:[]});},timeoutMs);
  child.on("error",error=>{clearTimeout(timer);complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["FFmpeg unavailable: "+error.message],warnings:[]});});
  child.stderr.on("data",buf=>{output+=buf.toString();if(output.length>500000)output=output.slice(-150000);});
  child.on("close",code=>{
   clearTimeout(timer);if(settled)return;
   if(code!==0){complete({status:"unverified",kind:"ffmpeg-loudnorm-analysis",issues:["FFmpeg exited "+code],warnings:[]});return;}
   const field=key=>{
    const hits=[...output.matchAll(new RegExp('"'+key+'"\\s*:\\s*"([^"]+)"',"g"))];
    return hits.length?Number(hits.at(-1)[1]):NaN;
   };
   const starts=[...output.matchAll(/silence_start:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
   const ends=[...output.matchAll(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g)]
    .map(m=>({end:Number(m[1]),durationSeconds:Number(m[2])}));
   const silenceSegments=ends.map((e,i)=>({startSeconds:starts[i]??Math.max(0,e.end-e.durationSeconds),
    endSeconds:e.end,durationSeconds:e.durationSeconds}));
   if(starts.length>ends.length&&Number.isFinite(durationSeconds)){
    const start=starts.at(-1);if(durationSeconds>start)silenceSegments.push({startSeconds:start,endSeconds:durationSeconds,durationSeconds:durationSeconds-start});
   }
   const clippedHits=[...output.matchAll(/Number of samples clipped:\s*([0-9]+)/gi)].map(m=>Number(m[1]));
   const maxHits=[...output.matchAll(/max_volume:\s*(-?[0-9.]+)\s*dB/gi)].map(m=>Number(m[1]));
   complete(evaluateAudioLoudness({integratedLufs:field("input_i"),truePeakDb:field("input_tp"),silenceSegments,
    clippedSamples:clippedHits.length?Math.max(...clippedHits):0,maxVolumeDb:maxHits.length?Math.max(...maxHits):NaN}));
  });
 });
}

function averageHash(frame){
 const samples=[];
 for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const sx=Math.min(63,x*8+4),sy=Math.min(63,y*8+4);samples.push(frame[sy*64+sx]);
 }
 const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
 let hash=0n;for(let i=0;i<samples.length;i++)if(samples[i]>=mean)hash|=1n<<BigInt(i);
 return hash;
}
function bitCount(value){let n=0;while(value){value&=value-1n;n++;}return n;}
export async function inspectRenderedFrames(path,{plan=null,timeoutMs=120000,sampleFps=10,durationSeconds=null}={}) {
 const executable=process.env.FFMPEG_BIN||"ffmpeg",frameBytes=64*64;
 return new Promise(resolve=>{
  const chunks=[];let totalBytes=0,stderr="",settled=false;
  const complete=result=>{if(!settled){settled=true;clearTimeout(timer);resolve(result);}};
  const child=spawn(executable,["-hide_banner","-i",path,"-an","-vf","fps="+sampleFps+",scale=64:64:flags=area,format=gray,freezedetect=n=-50dB:d=5",
   "-f","rawvideo","-pix_fmt","gray","pipe:1"],{windowsHide:true,shell:false,stdio:["ignore","pipe","pipe"]});
  const timer=setTimeout(()=>{child.kill();complete({status:"unverified",kind:"ffmpeg-frame-inspection",issues:["Frame inspection timeout"]});},timeoutMs);
  child.on("error",error=>complete({status:"unverified",kind:"ffmpeg-frame-inspection",issues:["FFmpeg unavailable: "+error.message]}));
  child.stdout.on("data",buf=>{totalBytes+=buf.length;if(totalBytes>32*1024*1024){child.kill();complete({status:"unverified",kind:"ffmpeg-frame-inspection",issues:["Frame sample limit exceeded"]});return;}chunks.push(buf);});
  child.stderr.on("data",buf=>{stderr+=buf.toString();if(stderr.length>300000)stderr=stderr.slice(-100000);});
  child.on("close",code=>{
   if(settled)return;
   if(code!==0){complete({status:"unverified",kind:"ffmpeg-frame-inspection",issues:["FFmpeg frame sampler exited "+code]});return;}
   const raw=Buffer.concat(chunks),count=Math.floor(raw.length/frameBytes),frames=[];
   let blackRun=0,maxBlackRun=0,blackFrames=0;
   for(let i=0;i<count;i++){
    const frame=raw.subarray(i*frameBytes,(i+1)*frameBytes);
    let sum=0,dark=0;for(const px of frame){sum+=px;if(px<16)dark++;}
    const mean=sum/frameBytes,black=mean<9&&dark/frameBytes>.97;
    if(black){blackFrames++;blackRun++;maxBlackRun=Math.max(maxBlackRun,blackRun);}else blackRun=0;
    frames.push({timeSeconds:i/sampleFps,meanBrightness:Number(mean.toFixed(2)),hash:averageHash(frame)});
   }
   const freezeStarts=[...stderr.matchAll(/freeze_start:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
   const freezeEnds=[...stderr.matchAll(/freeze_end:\s*([0-9.]+)\s*\|\s*freeze_duration:\s*([0-9.]+)/g)]
    .map(m=>({end:Number(m[1]),durationSeconds:Number(m[2])}));
   const freezeSegments=freezeEnds.map((x,i)=>({startSeconds:freezeStarts[i]??Math.max(0,x.end-x.durationSeconds),
    endSeconds:x.end,durationSeconds:x.durationSeconds}));
   if(freezeStarts.length>freezeEnds.length&&Number.isFinite(durationSeconds)){
    const start=freezeStarts.at(-1);if(durationSeconds>start)freezeSegments.push({startSeconds:start,endSeconds:durationSeconds,durationSeconds:durationSeconds-start});
   }
   const duplicateScenePairs=[];
   if(Array.isArray(plan?.scenes)){
    const planFps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
    const samples=plan.scenes.map(scene=>{
     const mid=(scene.startFrame+scene.endFrame)/2/planFps;
     const idx=Math.min(frames.length-1,Math.max(0,Math.round(mid*sampleFps)));
     return {sceneId:scene.id,media:scene.media,hash:frames[idx]?.hash};
    }).filter(x=>x.hash!==undefined);
    for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
     if(samples[i].media!==samples[j].media&&bitCount(samples[i].hash^samples[j].hash)===0)
      duplicateScenePairs.push({first:samples[i].sceneId,second:samples[j].sceneId});
    }
   }
   const issues=[],warnings=[];
   if(count===0)issues.push("Nenhum quadro foi decodificado para inspeção");
   if(maxBlackRun>=Math.ceil(sampleFps*.5))issues.push("Quadros pretos consecutivos por "+(maxBlackRun/sampleFps).toFixed(1)+"s");
   if(duplicateScenePairs.length)issues.push("Cenas com frames praticamente idênticos: "+duplicateScenePairs.length);
   if(freezeSegments.some(s=>s.durationSeconds>5))warnings.push("Planos congelados acima de 5s: "+freezeSegments.filter(s=>s.durationSeconds>5).length);
   complete({status:issues.length?"failed":"passed",kind:"ffmpeg-frame-inspection",sampleFps,frameSamples:count,
    blackFrameCount:blackFrames,maxBlackRunSeconds:Number((maxBlackRun/sampleFps).toFixed(2)),freezeSegments,duplicateScenePairs,issues,warnings,
    sampleFrames:frames.filter((_,i)=>i%sampleFps===0).map(f=>({timeSeconds:f.timeSeconds,meanBrightness:f.meanBrightness})),
    artisticReview:"pending"});
  });
 });
}
