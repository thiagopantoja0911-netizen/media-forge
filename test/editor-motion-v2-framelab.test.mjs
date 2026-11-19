import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,mkdir,writeFile,readFile,stat,rm } from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import { createMotionV2Comparison } from "../src/editor-frame-lab-bridge.mjs";
import { makeEditorProject,validateEditorProject } from "../src/editor-studio-core.mjs";
import { readFileSync } from "node:fs";
const text=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const REF="a".repeat(32),JOB="b".repeat(32);
test("real MP4 QA creates an isolated Frame Lab comparison without altering reference",async()=>{
 const root=await mkdtemp(join(tmpdir(),"mf-mv2-qa-"));
 try{
   const source=join(root,REF,"reference.mp4");await mkdir(join(root,REF));
   await writeFile(source,Buffer.alloc(2048,0x42));
   const render=join(root,"final.mp4");await writeFile(render,Buffer.alloc(2048,0x62));
   let called=null;
   const r=await createMotionV2Comparison({referenceProjectId:REF,artifactPath:render,jobId:JOB,dataRoot:root,
     startAnalysis:async id=>{called=id;return {status:"queued"};}});
   assert.match(r.comparisonId,/^[a-f0-9]{32}$/);
   assert.notEqual(r.comparisonId,REF);
   assert.equal(called,r.comparisonId);
   assert.equal(r.status,"queued");
   assert.deepEqual(await readFile(source),Buffer.alloc(2048,0x42));
   assert.deepEqual(await readFile(join(root,r.comparisonId,"render.mp4")),Buffer.alloc(2048,0x62));
   assert.equal(JSON.parse(await readFile(join(root,r.comparisonId,"motion-origin.json"),"utf8")).jobId,JOB);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("Frame Lab is optional; overloaded analyzer leaves MP4 intact",async()=>{
 const root=await mkdtemp(join(tmpdir(),"mf-mv2-qab-"));
 try{
   await mkdir(join(root,REF));await writeFile(join(root,REF,"reference.mp4"),Buffer.alloc(200,0x42));
   const render=join(root,"render.mp4");await writeFile(render,Buffer.alloc(200,0x61));
   const r=await createMotionV2Comparison({referenceProjectId:REF,artifactPath:render,jobId:JOB,dataRoot:root,
     startAnalysis:async()=>{throw new Error("busy");}});
   assert.equal(r.status,"pending");assert.equal(r.reason,"busy");
   assert.equal((await stat(render)).size,200);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("invalid/missing reference is rejected before a comparison project is created",async()=>{
 const root=await mkdtemp(join(tmpdir(),"mf-mv2-qac-"));
 try{
   const render=join(root,"render.mp4");await writeFile(render,Buffer.alloc(200,0x61));
   await assert.rejects(()=>createMotionV2Comparison({referenceProjectId:REF,artifactPath:render,jobId:JOB,dataRoot:root}),/reference is missing/);
   await assert.rejects(()=>createMotionV2Comparison({referenceProjectId:"../secrets",artifactPath:render,jobId:JOB,dataRoot:root}),/requires valid/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("native editor QA is opt-in and never hijacks ordinary video downloads",()=>{
 const file=text("src/remote-worker-server.mjs"),http=text("src/editor-studio-http.mjs");
 assert.match(file,/source==="mediaforge-visual-editor"/);
 assert.match(file,/createMotionV2Comparison/);
 assert.match(file,/motionV2FrameLabProjectId/);
 assert.match(http,/frameLabReferenceProjectId/);
 assert.match(http,/motionQA:/);
 const p=makeEditorProject({idea:"Teste de editor de vídeo avançado"});
 p.motionV2={version:1,enabled:true,frameLabProjectId:REF,
   background:{keyframes:[{frame:0,color:"#ffffff",accent:"#efefef",pattern:"solid"}]},moves:{}};
 assert.doesNotThrow(()=>validateEditorProject(p));
 p.motionV2.frameLabProjectId="javascript:evil";
 assert.throws(()=>validateEditorProject(p),/Frame Lab/);
});
