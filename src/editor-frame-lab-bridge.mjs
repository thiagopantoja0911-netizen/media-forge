/* Optional, non-destructive Frame Lab bridge for Motion V2 editor renders.
 * Each render receives a NEW Frame Lab project; source reference is never altered.
 * Completion of the MP4 is independent from OpenCV analyzer availability.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, cp, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
const ID=/^[a-f0-9]{32}$/;
export async function createMotionV2Comparison({
 referenceProjectId,artifactPath,jobId,
 dataRoot=resolve(process.env.FRAME_LAB_DATA_DIR||join(process.env.MEDIAFORGE_DATA_DIR||".mediaforge","frame-lab")),
 startAnalysis
}={}){
 if(!ID.test(referenceProjectId||"")||!ID.test(jobId||"")||typeof artifactPath!=="string"||!artifactPath)
  throw new Error("Frame Lab comparison requires valid reference, job and artifact.");
 const root=resolve(dataRoot),source=join(root,referenceProjectId,"reference.mp4");
 const info=await stat(source).catch(()=>null);
 if(!info?.isFile()||info.size<128)throw new Error("Frame Lab reference is missing or empty.");
 const artifact=await stat(artifactPath).catch(()=>null);
 if(!artifact?.isFile()||artifact.size<128)throw new Error("Rendered MP4 missing.");
 if(artifact.size>120*1024*1024)throw new Error("Frame Lab MP4 exceeds 120 MiB.");
 const comparisonId=randomUUID().replaceAll("-",""),destination=join(root,comparisonId);
 await mkdir(destination,{recursive:false,mode:0o700});
 await Promise.all([
   cp(source,join(destination,"reference.mp4")),
   cp(artifactPath,join(destination,"render.mp4")),
   writeFile(join(destination,"objects.json"),JSON.stringify({objects:[]}),{flag:"wx",mode:0o600}),
   writeFile(join(destination,"motion-origin.json"),JSON.stringify({
     referenceProjectId,jobId,createdAt:new Date().toISOString(),source:"mediaforge-motion-v2"
   }),{flag:"wx",mode:0o600})
 ]);
 let status="ready",reason=null;
 try{
   if(typeof startAnalysis==="function"){
     const result=await startAnalysis(comparisonId);
     status=result?.status||"queued";
   }
 }catch(error){
   // An occupied analyzer is a retryable condition; never invalidate MP4 delivery.
   status="pending";reason=String(error?.message||error).slice(0,240);
 }
 return {comparisonId,status,reason,referenceProjectId};
}
