import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

const here=fileURLToPath(new URL("../", import.meta.url));
const ffmpeg=ffmpegStatic?.default||ffmpegStatic;

async function execute(bin,args,{cwd,timeout=180000}={}){
  const child=spawn(bin,args,{cwd,stdio:["ignore","pipe","pipe"]});
  let out="",err="";
  child.stdout.on("data",x=>out+=String(x));
  child.stderr.on("data",x=>err=(err+String(x)).slice(-2500));
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Timeout "+bin))},timeout);
    child.on("error",e=>{clearTimeout(timer);reject(e)});
    child.on("exit",code=>{
      clearTimeout(timer);
      if(code===0)resolve({out,err});
      else reject(new Error(bin+" exited "+code+": "+err));
    });
  });
}
test("all frames, layer tracking, scene proposal and easing summary with WASM", {timeout:180000}, async()=>{
  const temp=await mkdtemp(join(tmpdir(),"frame-lab-node-"));
  try{
    const video=join(temp,"reference.mp4"),out=join(temp,"results");
    await mkdir(out);
    await execute(ffmpeg,["-y","-hide_banner","-loglevel","error","-f","lavfi",
      "-i","testsrc2=size=192x108:rate=30","-frames:v","13","-an",
      "-c:v","mpeg4","-q:v","3",video],{timeout:60000});
    await writeFile(join(temp,"objects.json"),JSON.stringify({objects:[{
      id:"main",label:"Micro motion layer",x:8,y:8,w:130,h:80,startFrame:0
    }]}));
    const {out:stdout}=await execute(process.execPath,[
      join(here,"analyze-node.mjs"),"--reference",video,"--render",video,"--output",out
    ],{cwd:temp,timeout:170000});
    const report=JSON.parse(await readFile(join(out,"report.json"),"utf8"));
    assert.equal(report.reference.frameCount,13);
    assert.equal(report.render.frameCount,13);
    assert.equal(report.comparison.length,13);
    assert.equal((await readdir(join(out,"frames_reference"))).length,13);
    assert.equal((await readdir(join(out,"frames_flow"))).length,13);
    assert.equal((await readdir(join(out,"frames_diff"))).length,13);
    assert.ok(report.reconstruction);
    assert.equal(report.reconstruction.referenceFrameCount,13);
    assert.ok(report.reconstruction.camera.keyframes.length>=2);
    assert.equal(report.reconstruction.objects.length,1);
    assert.equal(report.reconstruction.objects[0].rawSampleCount,12);
    assert.ok(report.reconstruction.automaticLayers instanceof Array);
    assert.ok(report.reconstruction.objects[0].keyframes.length>=2);
    assert.ok(report.reference.frames.some(r=>r.frame_mean_luma_diff>0));
    assert.ok(report.comparison.every(x=>x.maeRgb<1), "same source should compare to itself");
    assert.ok(report.reconstruction.objects[0].rawSamples.some(x=>Math.abs(x.x_px)>.001||
      Math.abs(x.y_px)>.001));
    assert.equal(report.reconstruction.interpolatedFrames,0);
  }finally{await rm(temp,{recursive:true,force:true});}
});
