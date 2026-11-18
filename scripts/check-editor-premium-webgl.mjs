import { mkdtemp, mkdir, writeFile, rm, readFile, readdir, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makeEditorProject, saveEditorProject } from "../src/editor-studio-core.mjs";
import { storeEditorVisualAsset } from "../src/editor-visual-assets.mjs";
import { buildEditorRenderFiles } from "../src/editor-studio-engine.mjs";

const dir=await mkdtemp(join(tmpdir(),"mediaforge-editor-premium-smoke-"));
const data=join(dir,"private");
const prior=process.env.MEDIAFORGE_DATA_DIR;
process.env.MEDIAFORGE_DATA_DIR=data;
const version=process.env.HYPERFRAMES_VERSION||"0.9.31";
const run=(args,timeout=220000)=>new Promise((resolve,reject)=>{
 const proc=spawn("npx",["--yes","hyperframes@"+version,...args],{
   cwd:join(dir,"project"),shell:process.platform==="win32",windowsHide:true,
   env:{...process.env,CI:"1"}
 });
 let out="",err="";
 proc.stdout.on("data",x=>out=(out+x).slice(-120000));
 proc.stderr.on("data",x=>err=(err+x).slice(-120000));
 const timer=setTimeout(()=>proc.kill("SIGTERM"),timeout);
 proc.on("error",e=>{clearTimeout(timer);reject(e);});
 proc.on("close",code=>{clearTimeout(timer);if(code===0)resolve(out);
   else reject(new Error("HyperFrames "+args[0]+" exit="+code+"\n"+err.slice(-8000)+"\n"+out.slice(0,13000)));
 });
});
try{
 const p=await saveEditorProject(makeEditorProject({
   idea:"Mockup visual de produto em perspectiva 3D com grid de cards e aurora.",
   duration_seconds:12,aspect_ratio:"9:16",fps:30,style_preset:"spotify-dark-glow",
   scenes:[
     {headline:"UMA NOVA EXPERIÊNCIA",duration_seconds:4},
     {headline:"TUDO NO SEU RITMO",duration_seconds:4},
     {headline:"EXPLORE AGORA",duration_seconds:4}
   ]
 }));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="360" height="240">'+
   '<rect width="360" height="240" rx="22" fill="#152137"/>'+
   '<rect x="22" y="22" width="316" height="28" rx="10" fill="#25da88"/>'+
   '<rect x="22" y="72" width="204" height="18" rx="5" fill="#d8e7ff"/>'+
   '<rect x="22" y="111" width="122" height="100" rx="8" fill="#7b5aea"/>'+
   '<rect x="158" y="111" width="180" height="100" rx="8" fill="#2f8ca4"/></svg>';
 const {project,asset}=await storeEditorVisualAsset(p,{filename:"product-card.svg",base64:Buffer.from(svg).toString("base64")});
 project.scenes[0].visual={type:"screen",assetId:asset.id,
   position:[0,0,0],rotation:[0,-17,0],scale:1,depth:.8};
 project.scenes[1].visual={type:"card-grid",assetId:asset.id,
   position:[0,0,0],rotation:[0,15,0],scale:.58,depth:.8,columns:3,rows:4,scroll:1};
 project.scenes[2].glow={color:"#64ffd5",intensity:.65,speed:.6,x:.2,y:-.2};
 project.scenes[0].motionBlur=.65;
 project.scenes[1].motionBlur=.75;
 project.scenes[0].typography={
   mode:"words",family:"sans",weightFrom:300,weightTo:900,bloom:.6,bloomColor:"#55ffd0",stagger:.8
 };
 project.scenes[1].typography={
   mode:"letters",family:"sans",weightFrom:400,weightTo:900,bloom:.38,bloomColor:"#b077ff",stagger:.75
 };
 const root=join(dir,"project");
 await mkdir(root,{recursive:true});
 const files=await buildEditorRenderFiles(project);
 for(const file of files){
   const path=join(root,file.path);await mkdir(dirname(path),{recursive:true});
   let body=file.contentBase64?Buffer.from(file.contentBase64,"base64"):file.content;
   // Software GPU check at half-size without altering layout proportions.
   if(file.path==="index.html")
     body=body.replaceAll("1080px","540px").replaceAll("1920px","960px")
       .replace('data-width="1080"','data-width="540"').replace('data-height="1920"','data-height="960"');
   if(file.path==="assets/scene.mjs")
     body=body.replace("const W=1080,H=1920,","const W=540,H=960,");
   await writeFile(path,body);
 }
 process.stdout.write("Premium WebGL + SVG asset: hyperframes check...\n");
 const checked=await run(["check","--json","--no-craft"]);
 process.stdout.write(checked.slice(-7000)+"\n");
 const snapped=await run(["snapshot","--at","0.5,5.0,5.0","--no-end"]);
 process.stdout.write(snapped.slice(-7000)+"\n");
 const base=join(root,".hyperframes","artifacts","snapshots");
 const folders=(await readdir(base,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();
 const last=folders.at(-1);if(!last)throw new Error("Nenhum snapshot gerado");
 const imgs=await readdir(join(base,last));
 const first=imgs.find(x=>/frame-01.*5.*png/.test(x)),repeat=imgs.find(x=>/frame-02.*5.*png/.test(x));
 if(!first||!repeat)throw new Error("Snapshots repetidos não encontrados");
 const a=await readFile(join(base,last,first)),b=await readFile(join(base,last,repeat));
 if(!a.equals(b))throw new Error("Quadros renderizados no mesmo tempo não são determinísticos");
 process.stdout.write("Preview premium: textura SVG carregada, snapshot determinístico.\n");
 if(process.env.RUNNER_TEMP){
   const destination=join(process.env.RUNNER_TEMP,"mediaforge-editor-premium-samples");
   await mkdir(destination,{recursive:true});
   const sheet=join(base,last,"contact-sheet.jpg");
   await cp(sheet,join(destination,"contact-sheet.jpg"));
 }
}finally{
 if(prior===undefined)delete process.env.MEDIAFORGE_DATA_DIR;
 else process.env.MEDIAFORGE_DATA_DIR=prior;
 await rm(dir,{recursive:true,force:true});
}
