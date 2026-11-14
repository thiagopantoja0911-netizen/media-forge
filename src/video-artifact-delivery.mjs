// Private, short-lived MP4 delivery links. A lease-authenticated Windows worker
// uploads bytes with a SHA256 before we mark a normal job as completed.
// Link possession authorizes only one immutable MP4 for at most five minutes.
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import {join,resolve} from "node:path";

const key=randomBytes(32);
const HEX=/^[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
const LIFE=5*60*1000;
export const MAX_DELIVERED_VIDEO_BYTES=256*1024*1024;
export const deliveredVideoRoot=()=>resolve(process.env.MEDIAFORGE_DATA_DIR||".mediaforge","artifacts");
export function deliveredVideoPath(id){
 if(typeof id!=="string"||!HEX.test(id))throw Error("ARTIFACT_ID_INVALID");
 return join(deliveredVideoRoot(),id+".mp4");
}
function signature(id,expires,sha){
 return createHmac("sha256",key).update(id+":"+expires+":"+sha,"utf8").digest("hex");
}
function verifiedData(job){
 if(!job||!HEX.test(job.id||"")||job.status!=="completed")return null;
 const r=job.result;
 if(!r||r.artifactUploaded!==true||r.location!=="mediaforge-hostinger"
   ||!SHA.test(r.sha256||"")||!Number.isSafeInteger(r.size)||r.size<128||r.size>MAX_DELIVERED_VIDEO_BYTES)return null;
 return r;
}
export async function signedVideoDownload(job){
 const result=verifiedData(job);
 if(!result)return null;
 const path=deliveredVideoPath(job.id);
 let st;
 try {st=await stat(path);}catch{return null;}
 if(!st.isFile()||st.size!==result.size)return null;
 const expires=Date.now()+LIFE;
 const sig=signature(job.id,expires,result.sha256);
 const base=String(process.env.MEDIAFORGE_PUBLIC_URL||process.env.MEDIAFORGE_OAUTH_ISSUER||"https://mediaforge.salevo.site").replace(/\/+$/,"");
 if(!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(base))return null;
 return {url:base+"/v1/video-download/"+job.id+"?expires="+expires+"&signature="+sig,
   expiresAt:new Date(expires).toISOString(),size:st.size,sha256:result.sha256};
}
function deny(res,status){
 res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
 res.end(JSON.stringify({ok:false,error:status===404?"NOT_FOUND":"LINK_INVALID_OR_EXPIRED"}));
}
export async function handleSignedVideoDownload({request,response,url,getJob}){
 if(!url.pathname.startsWith("/v1/video-download/"))return false;
 if(request.method!=="GET"){deny(response,405);return true;}
 const id=url.pathname.slice("/v1/video-download/".length);
 if(!HEX.test(id)){deny(response,404);return true;}
 const expText=url.searchParams.get("expires")||"";
 const sig=url.searchParams.get("signature")||"";
 if(!/^\d{13}$/.test(expText)||!SHA.test(sig)){deny(response,403);return true;}
 const exp=Number(expText);
 if(!Number.isSafeInteger(exp)||exp<Date.now()||exp>Date.now()+LIFE){deny(response,403);return true;}
 const job=await getJob(id);
 const stored=verifiedData(job);
 if(!stored){deny(response,404);return true;}
 const expected=Buffer.from(signature(id,exp,stored.sha256),"hex");
 const actual=Buffer.from(sig,"hex");
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){deny(response,403);return true;}
 let st;
 try{st=await stat(deliveredVideoPath(id));}catch{deny(response,404);return true;}
 if(!st.isFile()||st.size!==stored.size){deny(response,404);return true;}
 response.writeHead(200,{"content-type":"video/mp4","content-length":String(st.size),
   "content-disposition":'attachment; filename="mediaforge-'+id+'.mp4"',
   "x-content-type-options":"nosniff","cache-control":"private, no-store",
   "referrer-policy":"no-referrer"});
 const stream=createReadStream(deliveredVideoPath(id));
 stream.on("error",()=>response.destroy());
 stream.pipe(response);
 return true;
}
