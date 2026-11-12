import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleStudioApi } from "../src/studio-api.mjs";
const plan=JSON.parse(await readFile(new URL("../examples/motion/widget-study.json",import.meta.url),"utf8"));
async function send({render=false,authorized=true,confirm=false,origin="https://studio.test",motionPlan=plan}={}) {
  let code,body;const queued=[];
  await handleStudioApi({request:{url:"/api/studio/motion/"+(render?"render":"compose"),method:"POST",headers:{host:"studio.test",origin,"content-type":"application/json"}},response:{writeHead(c){code=c;},end(b){body=JSON.parse(b);}},isAdminSession:async()=>authorized,parseBody:async()=>({motionPlan,confirmControlledRender:confirm}),createJob:async job=>{queued.push(job);return{id:"a".repeat(32),status:"queued"};}});
  return {code,body,queued};
}
test("motion compose is authenticated and never queues a render",async()=>{
  assert.equal((await send({authorized:false})).code,401);
  assert.equal((await send({origin:"https://elsewhere.test"})).code,403);
  const r=await send();assert.equal(r.code,200);assert.equal(r.queued.length,0);assert.ok(r.body.projectFiles.find(f=>f.path==="motion-plan.json"));
});
test("motion render preserves explicit submission and pending creative review",async()=>{
  assert.equal((await send({render:true})).code,428);
  const r=await send({render:true,confirm:true});assert.equal(r.code,202);assert.equal(r.queued.length,1);assert.equal(r.body.readiness.renderReady,false);assert.equal(r.queued[0].metadata.motionPlan,true);
});
test("invalid motion plan is rejected before queueing",async()=>{
  const r=await send({render:true,confirm:true,motionPlan:{...plan,totalFrames:800}});assert.equal(r.queued.length,0);assert.notEqual(r.code,202);
});
