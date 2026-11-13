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
 return {projectFiles:files,bytes:total,files:files.length};
}
export async function readProjectPackage(path) {
 const file=await readFile(path);
 return unpackProjectZip(file);
}
// Exposed for normal ZIP-authored projects. The original video's analysis is never
// mistaken for an authored vector reconstruction; users can upload an editable project.
