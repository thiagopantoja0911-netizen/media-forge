import {spawn} from "node:child_process";
import {stat,rename,unlink} from "node:fs/promises";
import {dirname,join,resolve,relative,sep,basename} from "node:path";

const safeInside=(root,target)=>{const rel=relative(root,resolve(target));return rel!==""&&rel!==".."&&!rel.startsWith(".."+sep)&&!rel.startsWith(sep);};
const number=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const seconds=(frames,fps)=>frames/(Number(String(fps).split("/")[0])/Number(String(fps).split("/")[1]||1));
const fmt=n=>Number(n.toFixed(4)).toString();
const label=i=>"cue"+i;

export function buildCinematicAudioFilterGraph(plan,projectDir){
 const cues=Array.isArray(plan?.audioCues)?plan.audioCues:[];
 const duration=seconds(plan.totalFrames,plan.fps);
 if(!Number.isFinite(duration)||duration<=0)throw new Error("Cinematic audio mix: invalid timeline duration");
 if(!cues.length)throw new Error("Cinematic audio mix: no audio cues");
 const filters=[],inputs=[],groups={bed:[],voice:[],sfx:[]};
 for(const [i,cue] of cues.entries()){
  if(!cue||!["music","voice","sfx","ambience"].includes(cue.role)||typeof cue.src!=="string"||
     !cue.src.startsWith("assets/")||cue.src.split(/[\\/]/).includes(".."))
    throw new Error("Cinematic audio mix: invalid cue "+i);
  const start=seconds(cue.startFrame,plan.fps),end=seconds(cue.endFrame,plan.fps),clip=end-start;
  if(!number(start,0,duration)||!number(end,start+.001,duration+.001)||!number(cue.volume,0,1))
    throw new Error("Cinematic audio mix: invalid timing/volume for "+cue.id);
  const path=resolve(projectDir,cue.src);
  if(!safeInside(projectDir,path))throw new Error("Cinematic audio mix: asset escaped project directory");
  inputs.push(path);
  const delay=Math.max(0,Math.round(start*1000));
  const parts=["atrim=0:"+fmt(clip),"asetpts=PTS-STARTPTS","aresample=48000","aformat=sample_fmts=fltp:channel_layouts=stereo",
    "volume="+fmt(cue.volume)];
  if(cue.role==="music"||cue.role==="ambience"){
   const fadeIn=Math.min(.35,clip/4),fadeOut=Math.min(.8,clip/4);
   if(fadeIn>.02)parts.push("afade=t=in:st=0:d="+fmt(fadeIn));
   if(fadeOut>.02)parts.push("afade=t=out:st="+fmt(Math.max(0,clip-fadeOut))+":d="+fmt(fadeOut));
  }
  parts.push("adelay="+delay+"|"+delay);
  filters.push("["+i+":a]"+parts.join(",")+"["+label(i)+"]");
  groups[cue.role==="music"||cue.role==="ambience"?"bed":cue.role].push("["+label(i)+"]");
 }
 if(!cues.some(c=>c.role==="music"))throw new Error("Cinematic audio mix: a music/ambience bed is required");
 if(!groups.sfx.length)throw new Error("Cinematic audio mix: at least one event SFX is required");
 const mix=(items,out)=>{if(items.length===1){filters.push(items[0]+"anull["+out+"]");return;}
  filters.push(items.join("")+"amix=inputs="+items.length+":normalize=0:dropout_transition=0["+out+"]");};
 mix(groups.bed,"bed");
 mix(groups.sfx,"sfx");
 let finalInputs=["[bed]","[sfx]"];
 if(groups.voice.length){
  mix(groups.voice,"voice");
  if(plan.audioMix?.voiceDucking!==true)throw new Error("Cinematic audio mix: voice ducking must be enabled");
  filters.push("[bed][voice]sidechaincompress=threshold=0.025:ratio=7:attack=20:release=260:makeup=1[ducked]");
  finalInputs=["[ducked]","[voice]","[sfx]"];
 }
 filters.push(finalInputs.join("")+"amix=inputs="+finalInputs.length+":normalize=0:dropout_transition=0,alimiter=limit=0.841,loudnorm=I="+
  fmt(plan.audioMix?.targetIntegratedLUFS??-15)+":TP="+fmt(Math.min(plan.audioMix?.maxTruePeakDbtp??-1,-1.5))+":LRA=11[master]");
 return {inputs,filterComplex:filters.join(";"),durationSeconds:duration,outputLabel:"[master]"};
}

function run(executable,args,{timeoutMs=600000}={}){
 return new Promise((resolvePromise,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,shell:false,stdio:["ignore","ignore","pipe"]});
  let stderr="",settled=false;
  const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolvePromise(value);};
  const timer=setTimeout(()=>{child.kill();finish(Object.assign(new Error("Cinematic FFmpeg audio operation timed out"),{code:"CINEMATIC_AUDIO_TIMEOUT"}));},timeoutMs);
  child.stderr.on("data",b=>{stderr+=b.toString();if(stderr.length>12000)stderr=stderr.slice(-8000);});
  child.on("error",e=>finish(Object.assign(new Error("FFmpeg unavailable: "+e.message),{code:"FFMPEG_UNAVAILABLE"})));
  child.on("close",code=>code===0?finish(null,{stderr}):finish(Object.assign(new Error("FFmpeg audio operation failed ("+code+"): "+stderr.slice(-1800)),{code:"CINEMATIC_AUDIO_MIX_FAILED"})));
 });
}
export async function mixCinematicAudio({videoPath,projectDir,plan,ffmpegBin=process.env.FFMPEG_BIN||"ffmpeg",timeoutMs=600000}={}){
 const graph=buildCinematicAudioFilterGraph(plan,projectDir);
 for(const path of graph.inputs){const info=await stat(path).catch(()=>null);if(!info?.isFile()||info.size<16)throw new Error("Cinematic audio asset missing/empty: "+basename(path));}
 const master=join(projectDir,"cinematic-audio-master.wav");
 const args=["-y","-hide_banner","-loglevel","error"];
 for(const input of graph.inputs)args.push("-i",input);
 args.push("-filter_complex",graph.filterComplex,"-map",graph.outputLabel,"-t",fmt(graph.durationSeconds),
  "-ar","48000","-ac","2","-c:a","pcm_s16le",master);
 await run(ffmpegBin,args,{timeoutMs});
 const temp=join(dirname(videoPath),basename(videoPath,".mp4")+".cinematic-mixed.mp4");
 await run(ffmpegBin,["-y","-hide_banner","-loglevel","error","-i",videoPath,"-i",master,
  "-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-ar","48000",
  "-t",fmt(graph.durationSeconds),"-movflags","+faststart",temp],{timeoutMs});
 const backup=videoPath+".pre-cinematic-mix.bak";
 await unlink(backup).catch(()=>{});
 await rename(videoPath,backup);
 try{await rename(temp,videoPath);}
 catch(error){await rename(backup,videoPath).catch(()=>{});throw error;}
 await unlink(backup).catch(()=>{});
 return {status:"mixed",durationSeconds:graph.durationSeconds,voiceDucking:plan.audioMix?.voiceDucking===true,
  stems:{music:plan.audioCues.filter(c=>c.role==="music").length,voice:plan.audioCues.filter(c=>c.role==="voice").length,
   ambience:plan.audioCues.filter(c=>c.role==="ambience").length,sfx:plan.audioCues.filter(c=>c.role==="sfx").length}};
}
