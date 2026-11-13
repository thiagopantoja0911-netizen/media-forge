import { unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { extname, posix } from "node:path";

const MAX_ZIP_BYTES=16*1024*1024;
const MAX_FILES=80;
const MAX_UNCOMPRESSED_BYTES=24*1024*1024;
const ALLOWED=new Set([".html",".css",".js",".mjs",".json",".png",".jpg",".jpeg",".webp",
  ".gif",".svg",".m4a",".mp3",".wav",".woff",".woff2",".webm",".mp4",".txt",".md"]);

function invalid(message) {
 const error=new Error(message);error.status=422;return error;
}
function safePath(name){
 return typeof name==="string" && name.length>0 && name.length<240
   && !name.includes("\\") && !name.includes("\0") && !name.startsWith("/")
   && !/^[A-Za-z]:/.test(name) && !name.split("/").some(p=>p===".."||p==="."||!p);
}
function adaptFrameMappedCanvas(files){
  const html=files.find(f=>f.path==="index.html");
  if(!html||typeof html.content!=="string")return {converted:false};
  const original=html.content;
  // Only convert the explicit frame-mapped Canvas project format from Frame Lab.
  if(!original.includes("window.__frameLabReady=false;")||
     !original.includes("window.__frameLabSeek=")||
     !original.includes('id="stage"'))return {converted:false};
  const dimensions=/const W=(\d+),H=(\d+),FPS=(\d+),DURATION=(\d+)\/(\d+);/.exec(original);
  if(!dimensions)throw invalid("Frame-mapped Canvas project missing timing metadata");
  const [_,ww,hh,fps,total,divisor]=dimensions;
  const duration=Number(total)/Number(divisor);
  if(!Number.isFinite(duration)||duration<=0||duration>3600)
    throw invalid("Invalid Canvas timeline duration");
  const seconds=String(Number(duration.toFixed(6)));
  let adapted=original.replace(/<body>/i,'<body><div id="root" data-composition-id="main" data-start="0" data-duration="'+seconds+'" data-width="'+ww+'" data-height="'+hh+'">');
  adapted=adapted.replace(/<canvas id="stage"/i,
    '<canvas class="clip" data-start="0" data-duration="'+seconds+'" data-track-index="1" id="stage"');
  if(!adapted.includes('data-composition-id="main"')||
      !adapted.includes('class="clip"'))throw invalid("Canvas conversion could not map scene");
  const audio=files.find(f=>f.path==="assets/original_audio.m4a");
  const sound=audio?'<audio id="referenceAudio" class="clip" data-start="0" data-duration="'+seconds+'" data-track-index="2" src="assets/original_audio.m4a" data-volume="1"></audio>':"";
  adapted=adapted.replace(/<\/body>/i,sound+'</div></body>');
  const ready=adapted.indexOf("window.__frameLabReady=false;");
  const scriptEnd=adapted.indexOf("</script>",ready);
  if(ready<0||scriptEnd<0)throw invalid("Canvas project initialization cannot be converted");
  const deterministic=[
    'window.__frameLabReady=true;',
    'window.addEventListener("hf-seek", event => {',
    '  const time=Number(event.detail?.time)||0;',
    '  const imageReady=Promise.all([car,logo].map(img=>',
    '    img.complete ? Promise.resolve() :',
    '    new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});',
    '      img.addEventListener("error",resolve,{once:true})})));',
    '  if(car.complete&&logo.complete)paint(time);',
    '  else if(typeof event.detail?.waitUntil==="function")event.detail.waitUntil(imageReady.then(()=>paint(time)));',
    '});',
    'window.__timelines=window.__timelines||{};',
    'const frameLabTimeline=gsap.timeline({paused:true});',
    'frameLabTimeline.to({frame:0},{frame:1,duration:DURATION,ease:"none"});',
    'window.__timelines["main"]=frameLabTimeline;',
    'paint(0);'
  ].join("\n")+"\n";
  adapted=adapted.slice(0,ready)+deterministic+adapted.slice(scriptEnd);
  html.content=adapted;
  return {converted:true,source:"frame-mapped-canvas",durationSeconds:duration,
    width:Number(ww),height:Number(hh),fps:Number(fps)};
}
export function unpackProjectZip(buffer,{maxCompressed=MAX_ZIP_BYTES}={}){
 if(!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array))throw invalid("ZIP bytes required");
 if(buffer.length<22 || buffer.length>maxCompressed)throw invalid("ZIP exceeds limit or empty");
 let count=0,total=0;
 const data=unzipSync(new Uint8Array(buffer),{
   filter(entry){
     if(entry.name.endsWith("/"))return false;
     count++;
     if(count>MAX_FILES)throw invalid("Project ZIP exceeds 80 files");
     if(!safePath(entry.name))throw invalid("Unsafe filename in ZIP");
     if(entry.originalSize>MAX_UNCOMPRESSED_BYTES)throw invalid("ZIP entry exceeds expanded limit");
     total+=entry.originalSize;
     if(total>MAX_UNCOMPRESSED_BYTES)throw invalid("ZIP expands past 24 MiB");
     if(!ALLOWED.has(extname(entry.name).toLowerCase()))throw invalid("Disallowed project file: "+entry.name);
     return true;
   }
 });
 let paths=Object.keys(data).filter(k=>!k.endsWith("/"));
 if(!paths.length)throw invalid("ZIP has no files");
 // Common leading folder is allowed, as in downloadable Studio projects.
 const first=paths[0].split("/")[0];
 if(paths.every(x=>x.startsWith(first+"/")))paths=paths.map(x=>x.slice(first.length+1));
 const files=paths.map((path,i)=>{
   if(!safePath(path))throw invalid("Unsafe project path");
   const source=Object.keys(data).filter(k=>!k.endsWith("/"))[i];
   const bytes=Buffer.from(data[source]);
   return {
     path,
     ...( /\.(?:html|css|js|mjs|json|svg|txt|md)$/i.test(path)?
       {content:bytes.toString("utf8")}:{contentBase64:bytes.toString("base64")})
   };
 });
 if(new Set(files.map(x=>x.path)).size!==files.length)throw invalid("Duplicate project path");
 if(!files.some(f=>f.path==="index.html"))throw invalid("Project must contain index.html");
 const conversion=adaptFrameMappedCanvas(files);
 return {projectFiles:files,bytes:total,files:files.length,conversion};
}
export async function readProjectPackage(path) {
 const file=await readFile(path);
 return unpackProjectZip(file);
}
// Exposed for normal ZIP-authored projects. The original video's analysis is never
// mistaken for an authored vector reconstruction; users can upload an editable project.
