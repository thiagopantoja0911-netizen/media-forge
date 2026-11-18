// Integration smoke: exercises the SAME renderer adapter used on Windows.
import {mkdir,stat,writeFile,copyFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import {demoProject,validateLayerProject} from "../remotion/project.mjs";
import {renderWithRemotion} from "../src/renderers/remotion.mjs";
const run=promisify(execFile);
const id="0123456789abcdef0123456789abcdef";
const out=resolve(".mediaforge/remotion-stage1");
const source=resolve(".mediaforge/projects",id);
const publicAssets=join(source,"public","remotion-assets");
await mkdir(out,{recursive:true});await mkdir(publicAssets,{recursive:true});
const background=join(publicAssets,"background.mp4"),badge=join(publicAssets,"badge.png");
await run(ffmpegStatic||"ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=540x960:rate=30",
 "-t","12","-pix_fmt","yuv420p","-c:v","libx264","-preset","ultrafast","-crf","31",background],{timeout:180000});
const svg='<svg width="480" height="230" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="18" width="432" height="194" rx="42" fill="#15172b" stroke="#7bfbd9" stroke-width="8"/><text x="240" y="99" text-anchor="middle" fill="#7bfbd9" font-family="Arial" font-size="38" font-weight="bold">MEDIAFORGE</text><text x="240" y="152" text-anchor="middle" fill="white" font-family="Arial" font-size="26">REMOTION · 3 LAYERS</text></svg>';
await sharp({create:{width:480,height:230,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from(svg)}]).png().toFile(badge);
await mkdir(join(source,"remotion"),{recursive:true});
await writeFile(join(source,"index.html"),"<!doctype html><title>MediaForge Remotion worker project</title>");
await writeFile(join(source,"remotion","project.json"),JSON.stringify(validateLayerProject(demoProject)));
const rendered=await renderWithRemotion({id,project:{sourceDir:id}});
const file=join(out,"mediaforge-remotion-12s.mp4");
await copyFile(rendered.outputPath,file);
const p=demoProject;
console.log(JSON.stringify({file,bytes:(await stat(file)).size,frames:p.durationInFrames,fps:p.fps,
duration:p.durationInFrames/p.fps,renderer:rendered.renderer,layers:p.layers.map(l=>({id:l.id,type:l.type,zIndex:l.zIndex}))},null,2));
