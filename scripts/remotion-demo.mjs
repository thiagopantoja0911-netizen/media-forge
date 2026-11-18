// Generates a real MP4 file as the background asset, a PNG overlay, then renders
// the SAME composition component used by the Player inside the existing editor.
import {mkdir,stat} from "node:fs/promises";
import {join,resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import {bundle} from "@remotion/bundler";
import {selectComposition,renderMedia} from "@remotion/renderer";
import {demoProject,validateLayerProject} from "../remotion/project.mjs";
const run=promisify(execFile);
const out=resolve(".mediaforge/remotion-stage1");
const publicDir=resolve("remotion-public");
const assets=join(publicDir,"remotion-assets");
await mkdir(out,{recursive:true});await mkdir(assets,{recursive:true});
const input=join(assets,"background.mp4");
const f=ffmpegStatic||"ffmpeg";
await run(f,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=540x960:rate=30",
 "-t","12","-pix_fmt","yuv420p","-c:v","libx264","-preset","ultrafast","-crf","31",input],{timeout:180000});
await sharp({create:{width:480,height:230,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
 .composite([{input:Buffer.from('<svg width="480" height="230" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="18" width="432" height="194" rx="42" fill="#15172b" stroke="#7bfbd9" stroke-width="8"/><text x="240" y="99" text-anchor="middle" fill="#7bfbd9" font-family="Arial" font-size="38" font-weight="bold">MEDIAFORGE</text><text x="240" y="152" text-anchor="middle" fill="white" font-family="Arial" font-size="26">REMOTION · 3 LAYERS</text></svg>')}]).png().toFile(join(assets,"badge.png"));
const project=validateLayerProject(demoProject);
const serveUrl=await bundle({entryPoint:resolve("remotion/root.jsx"),publicDir,outDir:join(out,"bundle")});
const composition=await selectComposition({serveUrl,id:"MediaForgeLayers",inputProps:{project}});
const file=join(out,"mediaforge-remotion-12s.mp4");
await renderMedia({serveUrl,composition,codec:"h264",outputLocation:file,inputProps:{project},overwrite:true,crf:26,concurrency:2});
const result={file,bytes:(await stat(file)).size,frames:project.durationInFrames,fps:project.fps,duration:project.durationInFrames/project.fps,layers:project.layers.map(l=>({id:l.id,type:l.type,zIndex:l.zIndex}))};
console.log(JSON.stringify(result,null,2));
