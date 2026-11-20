import {spawn} from "node:child_process";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import assert from "node:assert/strict";
import {makeCinematicV2Fixture} from "../test/fixtures/cinematic-v2-fixture.mjs";
import {mixCinematicAudio} from "../src/cinematic-audio-mix.mjs";
import {inspectRenderedAudio,inspectRenderedFrames,inspectRenderedVideo} from "../src/video-qa.mjs";

function run(command,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{shell:false,windowsHide:true,stdio:["ignore","ignore","pipe"]});
  let stderr="";child.stderr.on("data",b=>{stderr+=b.toString();if(stderr.length>10000)stderr=stderr.slice(-8000);});
  child.on("error",reject);
  child.on("close",code=>code===0?resolve():reject(new Error(command+" exited "+code+": "+stderr.slice(-2500))));
 });
}
const ffmpeg=process.env.FFMPEG_BIN||"ffmpeg";
const root=await mkdtemp(join(tmpdir(),"mediaforge-cinematic-v2-"));
try{
 const projectDir=join(root,"project"),assets=join(projectDir,"assets");
 await mkdir(assets,{recursive:true});
 const plan=makeCinematicV2Fixture();
 plan.width=320;plan.height=568;
 let index=0;
 for(const cue of plan.audioCues){
  const path=join(projectDir,cue.src);
  await mkdir(dirname(path),{recursive:true});
  const duration=Math.max(1.1,(cue.endFrame-cue.startFrame)/30+.5);
  const frequency=330+(index++*37)%700;
  const args=["-y","-hide_banner","-loglevel","error","-f","lavfi","-i",
   "sine=frequency="+frequency+":sample_rate=48000:duration="+duration,"-ac","2","-ar","48000"];
  if(path.toLowerCase().endsWith(".mp3"))args.push("-c:a","libmp3lame","-q:a","5",path);
  else args.push("-c:a","pcm_s16le",path);
  await run(ffmpeg,args);
 }
 const videoPath=join(root,"synthetic-cinematic.mp4");
 await run(ffmpeg,["-y","-hide_banner","-loglevel","error","-f","lavfi","-i",
  "color=c=0x101821:s=320x568:r=10:d=45","-vf",
  "drawbox=x='mod(t*17,180)':y='mod(t*13,420)':w=120:h=120:color=white:t=fill,format=yuv420p",
  "-an","-c:v","libx264","-preset","ultrafast","-crf","34","-t","45",videoPath]);
 const mix=await mixCinematicAudio({videoPath,projectDir,plan,ffmpegBin:ffmpeg});
 const tech=await inspectRenderedVideo(videoPath,{width:320,height:568,fps:10,durationSeconds:45},true);
 const audio=await inspectRenderedAudio(videoPath,{durationSeconds:45});
 const frames=await inspectRenderedFrames(videoPath,{plan,durationSeconds:45});
 assert.equal(tech.status,"passed",JSON.stringify(tech));
 assert.equal(audio.status,"passed",JSON.stringify(audio));
 assert.equal(frames.status,"passed",JSON.stringify(frames));
 assert.ok(frames.frameSamples>=400,"expected full timeline frame samples");
 assert.equal(frames.blackFrameCount,0);
 assert.ok(mix.voiceDucking);
 process.stdout.write(JSON.stringify({ok:true,video:tech,audio,frames:{status:frames.status,sampleFps:frames.sampleFps,
  frameSamples:frames.frameSamples,blackFrameCount:frames.blackFrameCount,freezeSegments:frames.freezeSegments},
  audioMix:mix},null,2)+"\n");
}finally{
 await rm(root,{recursive:true,force:true});
}
