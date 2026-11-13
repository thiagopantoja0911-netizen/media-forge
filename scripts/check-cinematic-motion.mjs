// CI-only smoke: real multimedia bytes, GSAP transitions, narration, score and two event-SFX.
// This deliberately uses test sources, never marketing footage.
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildMotionComposition } from "../src/motion/composer.mjs";

const run=promisify(execFile),dest=resolve(process.argv[2]||".mediaforge/cinematic-ci");
await mkdir(join(dest,"_fixture"),{recursive:true});
const cache=join(dest,"_fixture");
await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i",
  "testsrc2=size=540x960:rate=30:duration=3",
  "-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",join(cache,"shot-1.mp4")]);
await copyFile(join(cache,"shot-1.mp4"),join(cache,"shot-2.mp4"));
await copyFile(join(cache,"shot-1.mp4"),join(cache,"shot-4.mp4"));
await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i",
  "color=c=0x0b2f50:s=540x960:d=1","-frames:v","1",join(cache,"shot-3.jpg")]);
for(const [name,freq,seconds] of [["voice.wav",320,12],["music.wav",150,12],["sweep.wav",450,.5],["impact.wav",580,.5]]){
  await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i",
    "sine=frequency="+freq+":duration="+seconds,"-ac","1","-ar","24000",join(cache,name)]);
}
const scenes=[],frames=90,types=["footage","footage","photo","footage"],transitions=["cut","whip","dip","match-cut"];
for(let i=0;i<4;i++)scenes.push({
  id:"shot-"+(i+1),type:types[i],startFrame:i*frames,endFrame:(i+1)*frames,
  headline:i%2?"Nova perspectiva":"A luz transforma",detail:"Movimento científico demonstrativo",
  media:"assets/shot-"+(i+1)+(i===2?".jpg":".mp4"),
  camera:i%2?"truck-right":"dolly-in",transition:transitions[i],
  events:[
    {id:"enter-"+(i+1),action:"enter",startFrame:0,peakFrame:10,endFrame:18},
    {id:"camera-"+(i+1),action:"camera",startFrame:22,peakFrame:37,endFrame:80}
  ]
});
const audioCues=[
{id:"voice",role:"voice",src:"assets/voice.wav",startFrame:0,endFrame:330,volume:1,provenance:"CI test source"},
{id:"music",role:"music",src:"assets/music.wav",startFrame:0,endFrame:360,volume:.6,provenance:"CI test source"},
{id:"sweep",role:"sfx",src:"assets/sweep.wav",startFrame:37,endFrame:49,volume:.45,provenance:"CI test source",eventId:"camera-1"},
{id:"impact",role:"sfx",src:"assets/impact.wav",startFrame:217,endFrame:229,volume:.45,provenance:"CI test source",eventId:"camera-3"}
];
const plan={format:"mediaforge-motion-v1",productionMode:"cinematic",title:"Cinematic QA — MediaForge",
width:540,height:960,fps:30,totalFrames:360,audioMode:"voice-led",
palette:{ground:"#070b12",ink:"#fffbf4",accent:"#ffb066",paper:"#ffffff"},scenes,audioCues};
const names=["shot-1.mp4","shot-2.mp4","shot-3.jpg","shot-4.mp4","voice.wav","music.wav","sweep.wav","impact.wav"];
const assets=await Promise.all(names.map(async name=>({
  path:"assets/"+name,contentBase64:(await readFile(join(cache,name))).toString("base64")
})));
const result=await buildMotionComposition(plan,assets);
if(!result.readiness.testRenderReady)throw Error("Cinematic test is not renderable");
for(const f of result.projectFiles){
 const out=join(dest,f.path);await mkdir(dirname(out),{recursive:true});
 await writeFile(out,typeof f.content==="string"?Buffer.from(f.content,"utf8"):Buffer.from(f.contentBase64,"base64"));
}
console.log("Cinematic smoke project:",dest,JSON.stringify(result.readiness.cinematicCraft));
