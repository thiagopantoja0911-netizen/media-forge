import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildCinematic3dProject } from "../src/cinematic-3d.mjs";

// WebGL smoke test at 540x960 to avoid exhausting software GPUs in CI.
// This runs the same browser scene logic as the 4K project; it does not
// constitute an approved 4K render or an artistic quality review.
const dir=await mkdtemp(join(tmpdir(),"mediaforge-3d-webgl-"));
const pinned=process.env.HYPERFRAMES_VERSION || "0.9.31";
function run(args, timeout=180000){
  return new Promise((resolve,reject)=>{
    const child=spawn("npx",["--yes","hyperframes@"+pinned,...args],{
      cwd:dir,shell:process.platform==="win32",windowsHide:true,
      env:{...process.env,CI:"1"}
    });
    let stdout="",stderr="";
    const max=200000;
    child.stdout.on("data",c=>stdout=(stdout+c).slice(-max));
    child.stderr.on("data",c=>stderr=(stderr+c).slice(-max));
    const timer=setTimeout(()=>child.kill("SIGTERM"),timeout);
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{
      clearTimeout(timer);
      if(code===0)resolve({stdout,stderr});
      else reject(new Error("hyperframes "+args[0]+" failed code "+code+"\n"+stderr.slice(-5500)+"\n"+stdout.slice(-1500)));
    });
  });
}
try{
  const project=await buildCinematic3dProject({
    title:"Cinematic 3D CI smoke test",
    headline:"CINEMATIC DEPTH",
    subtitle:"HyperFrames + Three.js, deterministic seeks",
    duration_seconds:10,aspect_ratio:"9:16",camera:"dolly"
  });
  for(const file of project.projectFiles){
    let body=file.encoding==="base64" ? Buffer.from(file.content,"base64") : file.content;
    if(file.path==="index.html" || file.path==="assets/scene.mjs"){
      body=body.replaceAll("2160","540").replaceAll("3840","960");
    }
    const target=join(dir,file.path);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,body);
  }
  process.stdout.write("3D HyperFrames check... (software GPU, 540x960)\n");
  const checked=await run(["check","--json","--no-craft"],180000);
  process.stdout.write(checked.stdout.slice(-8000)+"\n");
  const snapshots=await run(["snapshot","--at","0,1,0","--no-end"],180000);
  process.stdout.write("3D screenshot smoke complete:\n"+snapshots.stdout.slice(-5500)+"\n");
} finally {
  await rm(dir,{recursive:true,force:true});
}
