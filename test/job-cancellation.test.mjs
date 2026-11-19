import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runSupervisedCommand} from "../src/supervised-command.mjs";
import {requestCancellation,reconcileExpiredLease,acknowledgeCancellation,cancellationRequested} from "../src/job-cancellation.mjs";

const now="2026-11-19T00:20:00.000Z";
function processingJob(expiresAt="2026-11-19T00:22:00.000Z"){
 return {id:"1".repeat(32),status:"processing",attempts:1,progress:41,
  workerLease:{id:"lease-1",workerId:"pc",expiresAt}};
}
test("queued cancellation is terminal/idempotent, never deletes assets",()=>{
 const job={id:"a".repeat(32),status:"queued",progress:0,project:{sourceDir:"a".repeat(32)},assets:["image"]};
 assert.equal(requestCancellation(job,now).changed,true);
 assert.equal(job.status,"cancelled");
 assert.deepEqual(job.assets,["image"]);
 assert.equal(job.project.sourceDir,"a".repeat(32));
 assert.equal(requestCancellation(job,now).changed,false);
});
test("active cancellation waits for matching lease and acknowledges only once",()=>{
 const job=processingJob();
 const originalLease=job.workerLease.id;
 assert.equal(requestCancellation(job,now).changed,true);
 assert.equal(job.status,"processing");
 assert.equal(job.phase,"cancelling");
 assert.equal(job.workerLease.id,originalLease);
 assert.equal(cancellationRequested(job,"lease-1"),true);
 assert.equal(cancellationRequested(job,"another-lease"),false);
 assert.equal(requestCancellation(job,now).changed,false);
 assert.equal(acknowledgeCancellation(job,"2026-11-19T00:20:10.000Z"),true);
 assert.equal(job.status,"cancelled");
 assert.equal(job.workerLease,undefined);
 assert.equal(acknowledgeCancellation(job,now),false);
});
test("expired live lease is requeued preserving project; cancelled lease is terminal",()=>{
 const old=processingJob("2026-11-19T00:10:00.000Z");
 old.renderTelemetry={framesCompleted:30,totalFrames:900};
 old.project={sourceDir:old.id};
 assert.equal(reconcileExpiredLease(old,now),true);
 assert.equal(old.status,"queued");
 assert.equal(old.progress,0);
 assert.equal(old.renderTelemetry,undefined);
 assert.equal(old.project.sourceDir,old.id);
 const cancelling=processingJob("2026-11-19T00:10:00.000Z");
 requestCancellation(cancelling,now);
 assert.equal(cancelling.status,"cancelled");
 assert.equal(cancelling.workerLease,undefined);
});
test("unexpired lease is untouched, retry-limit expires terminally",()=>{
 const live=processingJob();
 assert.equal(reconcileExpiredLease(live,now),false);
 assert.equal(live.status,"processing");
 const attempts=processingJob("2026-11-19T00:10:00.000Z");
 attempts.attempts=3;
 assert.equal(reconcileExpiredLease(attempts,now),true);
 assert.equal(attempts.status,"failed");
 assert.equal(attempts.error.code,"WORKER_TIMEOUT");
});
test("supervised subprocess cancellation is bounded and preserves logs",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mediaforge-cancel-"));
 try{
  const controller=new AbortController();
  const pending=runSupervisedCommand(process.execPath,
    ["-e","setInterval(()=>process.stdout.write('Capturing 1/120 frames\\n'),2000)"],
    dir,join(dir,"cancel"),{phase:"render",totalFrames:120,env:{},signal:controller.signal});
  setTimeout(()=>controller.abort(),350);
  await assert.rejects(pending,e=>{assert.equal(e.code,"JOB_CANCELLED");return true;});
  assert.equal(typeof(await readFile(join(dir,"cancel.stdout.log"),"utf8")),"string");
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("queue UI uses explicit confirmation and never cancels when opened",async()=>{
 const js=await readFile(new URL("../editor-studio/queue-panel.js",import.meta.url),"utf8");
 const html=await readFile(new URL("../editor-studio/index.html",import.meta.url),"utf8");
 const server=await readFile(new URL("../src/editor-studio-http.mjs",import.meta.url),"utf8");
 assert.doesNotThrow(()=>new Script(js));
 assert.match(js,/window\.confirm/);
 assert.match(js,/cancel\.addEventListener\("click"/);
 assert.match(js,/j\.cancelRequestedAt/);
 assert.match(html,/queue-panel\.js/);
 assert.match(server,/assertSameOrigin\(request\)/);
});
