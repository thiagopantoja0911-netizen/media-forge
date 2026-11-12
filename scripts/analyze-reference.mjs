import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve, join } from "node:path";

function run(command,args) {
  return new Promise((done,fail)=>{
    const child=spawn(command,args,{windowsHide:true,shell:false});
    let stdout="",stderr="";
    child.stdout.on("data",c=>stdout+=c);child.stderr.on("data",c=>stderr+=c);
    child.on("error",fail);child.on("close",code=>code===0?done({stdout,stderr}):fail(new Error(command+" failed: "+stderr.slice(-1500))));
  });
}
const [input,output,eventAt] = process.argv.slice(2);
if(!input||!output) {
  console.error("Usage: node scripts/analyze-reference.mjs video.mp4 evidence-dir [event-seconds]");process.exitCode=1;
} else {
  try {
    const path=resolve(input),dir=resolve(output);
    const probe=JSON.parse((await run(process.env.FFPROBE_BIN||"ffprobe",["-v","error","-show_streams","-show_format","-of","json",path])).stdout);
    const video=probe.streams.find(s=>s.codec_type==="video");
    if(!video)throw new Error("No video stream");
    const duration=Number(video.duration??probe.format.duration);
    if(!Number.isFinite(duration)||duration<=0)throw new Error("Unknown duration");
    const at=eventAt===undefined?Math.min(2,duration/2):Number(eventAt);
    if(!Number.isFinite(at)||at<0||at>=duration)throw new Error("Event time outside video");
    await mkdir(dir,{recursive:true});
    const ffmpeg=process.env.FFMPEG_BIN||"ffmpeg";
    await run(ffmpeg,["-v","error","-i",path,"-vf",`fps=12/${duration},scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2,tile=4x3`,"-frames:v","1","-n",join(dir,"atlas.jpg")]);
    const cuts=await run(ffmpeg,["-hide_banner","-i",path,"-an","-vf","select='gt(scene,0.25)',showinfo","-f","null","-"]);
    // Native-cadence samples for constant-FPS references; preserve pts in the source for VFR analysis.
    const stripStart=Math.max(0,at-.2);
    await run(ffmpeg,["-v","error","-ss",String(stripStart),"-i",path,"-vf","scale=160:240:force_original_aspect_ratio=decrease,pad=160:240:(ow-iw)/2:(oh-ih)/2,tile=8x3","-frames:v","1","-n",join(dir,"motion.jpg")]);
    let loudness=null;
    const audioStreams=probe.streams.filter(s=>s.codec_type==="audio");
    if(audioStreams.length) {
      const measured=await run(ffmpeg,["-hide_banner","-i",path,"-map","0:a:0","-vn","-af","loudnorm=print_format=json","-f","null","-"]);
      const match=/\{\s*"input_i"[\s\S]*?\}/.exec(measured.stderr);
      loudness=match?JSON.parse(match[0]):null;
    }
    const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);
    const report={source:basename(path),sha256:hash.digest("hex"),durationSeconds:duration,width:video.width,height:video.height,fps:video.avg_frame_rate,audioStreams:audioStreams.map(s=>({codec:s.codec_name,channels:s.channels,sampleRate:s.sample_rate})),loudnessFirstAudioStream:loudness,cutCandidates:[...cuts.stderr.matchAll(/pts_time:([\d.]+)/g)].map(m=>Number(m[1])),microSample:{eventSeconds:at,startSeconds:stripStart,frames:24,cadence:"source frames; inspect original PTS for VFR"},notes:["Scene-score candidates are not confirmed cuts or beats.","Atlas is navigation only; inspect additional events and both sides of every important transition.","No audio transcription or music identification was performed.","Observed patterns and proposed implementation timings must be recorded separately."]};
    await writeFile(join(dir,"reference.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
    console.log(JSON.stringify(report,null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
