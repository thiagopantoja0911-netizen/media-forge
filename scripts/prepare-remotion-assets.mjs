import {mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
const run=promisify(execFile);
const assets=resolve("remotion-public/remotion-assets");
await mkdir(assets,{recursive:true});
await run(ffmpegStatic||"ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=540x960:rate=30",
 "-t","12","-pix_fmt","yuv420p","-c:v","libx264","-preset","ultrafast","-crf","31",join(assets,"background.mp4")],{timeout:180000});
const svg='<svg width="480" height="230" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="18" width="432" height="194" rx="42" fill="#15172b" stroke="#7bfbd9" stroke-width="8"/><text x="240" y="99" text-anchor="middle" fill="#7bfbd9" font-family="Arial" font-size="38" font-weight="bold">MEDIAFORGE</text><text x="240" y="152" text-anchor="middle" fill="white" font-family="Arial" font-size="26">REMOTION · 3 LAYERS</text></svg>';
await sharp({create:{width:480,height:230,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from(svg)}]).png().toFile(join(assets,"badge.png"));
console.log("MediaForge Remotion demo assets prepared in existing project.");
