/**
 * Optional stock-footage acquisition for a cinematic motion plan.
 *
 * Pexels stock is a filmed scene, not synthetic acting. Its semantic fitness and
 * releases must be reviewed by a person; never auto-approve artistic continuity.
 * No API key => fail closed. No substitution with vectors or geometric actors.
 *
 * https://www.pexels.com/api/documentation/
 * https://www.pexels.com/license/
 */
const maxAssetBytes=3_400_000;
const maxTotalBytes=19_000_000;
const allowedHost=host=>host==="videos.pexels.com"||host.endsWith(".videos.pexels.com");
const safeQuery=v=>typeof v==="string"&&v.trim().length>=4&&v.length<=180&& !/[\x00-\x1f]/.test(v);
function fatal(message,code="STOCK_SOURCE_UNAVAILABLE"){const e=new Error(message);e.code=code;e.retryable=false;return e;}
async function responseLimited(url,fetchImpl,maxBytes){
  const u=new URL(url);
  if(u.protocol!=="https:"||!allowedHost(u.hostname))throw fatal("Stock video URL is not on an approved Pexels media host","STOCK_URL_UNTRUSTED");
  const response=await fetchImpl(u.href,{redirect:"error",signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw fatal("Stock footage download failed: HTTP "+response.status);
  const size=Number(response.headers.get("content-length"));
  if(Number.isFinite(size)&&size>maxBytes)throw fatal("Stock clip exceeds project size budget");
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>maxBytes)throw fatal("Stock clip exceeds project size budget");chunks.push(Buffer.from(chunk));}
  const video=Buffer.concat(chunks);
  if(video.length<16||video.toString("ascii",4,8)!=="ftyp")throw fatal("Downloaded stock clip is not an MP4");
  return video;
}
/** 
 * Searches ONLY for missing footage assets, not every graphic or private media.
 * Requires explicit opt-in, a valid per-scene query and provider credentials.
 */
export async function fillMissingCinematicFootage(plan,assetFiles,{apiKey=process.env.PEXELS_API_KEY,fetchImpl=fetch,enabled=false}={}){
 const existing=new Set(assetFiles.map(f=>f.path));
 const missing=plan.scenes.filter(s=>s.type==="footage"&&s.media&&!existing.has(s.media));
 if(!missing.length)return {assets:assetFiles,plan,provenance:[],sourcedCount:0};
 if(!enabled)throw fatal("Cinematic footage missing; supply asset files or opt into stock footage");
 if(!apiKey||typeof apiKey!=="string")throw fatal("PEXELS_API_KEY is not configured; stock footage cannot be sourced");
 if(missing.length>8)throw fatal("Stock sourcing capped at eight scenes per job");
 for(const scene of missing)if(!safeQuery(scene.stockQuery)||!/^assets\/[\w./-]+\.mp4$/.test(scene.media)||
   scene.media.split("/").includes(".."))throw fatal("Each missing scene needs a safe stockQuery and local assets/*.mp4 path");
 const clone={...plan,scenes:plan.scenes.map(s=>({...s}))};
 const files=[...assetFiles],provenance=[],used=new Set();let total=0;
 for(const scene of missing){
  const q=new URL("https://api.pexels.com/v1/videos/search");
  q.searchParams.set("query",scene.stockQuery.trim());
  q.searchParams.set("orientation",plan.height>plan.width?"portrait":"landscape");
  q.searchParams.set("per_page","12");
  const response=await fetchImpl(q.href,{headers:{Authorization:apiKey},redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw fatal("Pexels search failed: HTTP "+response.status);
  const body=await response.json();
  const videos=Array.isArray(body.videos)?body.videos:[];
  let selected=null,clip=null;
  for(const entry of videos){
   if(!Number.isInteger(entry.id)||used.has(entry.id)||!Array.isArray(entry.video_files))continue;
   const options=entry.video_files.filter(f=>f.file_type==="video/mp4"&&
      Number.isInteger(f.width)&&Number.isInteger(f.height)&&f.width>=540&&f.height>=720&&
      typeof f.link==="string").sort((a,b)=>(a.width*a.height)-(b.width*b.height));
   for(const option of options.slice(0,3)){
    try {const bytes=await responseLimited(option.link,fetchImpl,Math.min(maxAssetBytes,maxTotalBytes-total));selected=entry;clip=bytes;break;}
    catch(e){if(e.code==="STOCK_URL_UNTRUSTED")throw e;}
   }
   if(selected)break;
  }
  if(!clip||!selected)throw fatal("No valid portrait stock clip within size budget for scene "+scene.id);
  total+=clip.length;used.add(selected.id);
  const provenanceUrl="https://www.pexels.com/video/"+selected.id+"/";
  const item=clone.scenes.find(s=>s.id===scene.id);
  item.mediaProvenance="Pexels stock video "+selected.id+": "+provenanceUrl;
  item.mediaRights="stock-licensed";
  files.push({path:scene.media,contentBase64:clip.toString("base64")});
  provenance.push({sceneId:scene.id,asset:scene.media,provider:"Pexels",videoId:selected.id,
    source:provenanceUrl,license:"https://www.pexels.com/license/",requiresVisualReview:true,bytes:clip.length});
 }
 return {assets:files,plan:clone,provenance,sourcedCount:provenance.length};
}
