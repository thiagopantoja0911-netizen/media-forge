import test from "node:test";
import assert from "node:assert/strict";
import {framesFromHyperFramesLine,createFrameWatchdog,percentageFromFrames,orderQueuedJobs,renderWatchdogBudgets,applyWorkerProgress} from "../src/render-watchdog.mjs";

test("observes only evidence of captured frames (including split output and carriage return)",()=>{
 const tracker=createFrameWatchdog({totalFrames:360,startedAt:0,budgets:{firstFrameMs:100,noFrameMs:70,hardMs:1000}});
 assert.equal(tracker.observe("[INFO] [Render] captured 12/360 fra",10),null);
 assert.deepEqual(tracker.observe("mes\r",20),{framesCompleted:12,totalFrames:360,lastFrameAt:20});
 assert.equal(tracker.observe('{"framesCompleted":34,"totalFrames":360}\n',30).framesCompleted,34);
 assert.equal(tracker.observe("[ERROR] capture stuck at frame 50/360\n",40),null);
 assert.equal(tracker.state.framesCompleted,34);
 assert.equal(percentageFromFrames(tracker.state.framesCompleted,360),44);
});

test("watchdog stops missing first frame, stalled progress, and hard overrun",()=>{
 const b={firstFrameMs:100,noFrameMs:60,hardMs:1000};
 const noFrames=createFrameWatchdog({totalFrames:360,startedAt:0,budgets:b});
 assert.equal(noFrames.inspect(99),null);
 assert.equal(noFrames.inspect(100).code,"RENDER_FIRST_FRAME_TIMEOUT");
 const stalled=createFrameWatchdog({totalFrames:360,startedAt:0,budgets:b});
 stalled.observe("Captured 25/360 frames\n",30);
 assert.equal(stalled.inspect(89),null);
 assert.equal(stalled.inspect(90).code,"RENDER_CAPTURE_STALLED");
 assert.equal(stalled.inspect(1000).code,"RENDER_HARD_TIMEOUT");
});

test("heartbeat or verbose logs do not refresh verified-frame watchdog",()=>{
 const tracker=createFrameWatchdog({totalFrames:1800,startedAt:0,budgets:{firstFrameMs:100,noFrameMs:60,hardMs:1000}});
 tracker.observe("[INFO] Chrome process alive\n",80);
 assert.equal(tracker.inspect(120).code,"RENDER_FIRST_FRAME_TIMEOUT");
});

test("watchdog settings are bounded, and capture progress capped",()=>{
 assert.equal(renderWatchdogBudgets({MEDIAFORGE_RENDER_HARD_TIMEOUT_MS:"-1"}).hardMs,75*60_000);
 assert.equal(renderWatchdogBudgets({MEDIAFORGE_FIRST_FRAME_TIMEOUT_MS:"900000"}).firstFrameMs,900000);
 assert.equal(percentageFromFrames(360,360),90);
 assert.equal(percentageFromFrames(0,360),40);
 assert.equal(percentageFromFrames(9999,360),90);
 assert.equal(framesFromHyperFramesLine("stuck at frame 0/1800",1800),null);
});

test("queue claims oldest createdAt rather than lexicographic job id",()=>{
 const jobs=[
  {id:"0000",createdAt:"2026-11-18T23:03:00Z"},
  {id:"ffff",createdAt:"2026-11-18T18:13:00Z"},
  {id:"bbbb",createdAt:"2026-11-18T18:12:00Z"}
 ];
 assert.deepEqual(orderQueuedJobs(jobs).map(x=>x.id),["bbbb","ffff","0000"]);
 assert.deepEqual(jobs.map(x=>x.id),["0000","ffff","bbbb"]);
});

test("progress updates require verified frames and only reset for a newer render attempt",()=>{
 const job={progress:10};
 applyWorkerProgress(job,{progress:40,phase:"capturing",renderAttempt:1,framesCompleted:0,totalFrames:360},"2026-11-18T22:00:00.000Z");
 assert.equal(job.progress,40);
 assert.equal(job.renderTelemetry.lastFrameAt,null);
 applyWorkerProgress(job,{progress:53,phase:"capturing",renderAttempt:1,framesCompleted:100,totalFrames:360},"2026-11-18T22:00:30.000Z");
 assert.equal(job.renderTelemetry.framesCompleted,100);
 assert.equal(job.renderTelemetry.lastFrameAt,"2026-11-18T22:00:30.000Z");
 applyWorkerProgress(job,{progress:55,phase:"capturing",renderAttempt:1,framesCompleted:100,totalFrames:360},"2026-11-18T22:00:31.000Z");
 assert.equal(job.renderTelemetry.lastFrameAt,"2026-11-18T22:00:30.000Z");
 applyWorkerProgress(job,{progress:40,phase:"capturing",renderAttempt:2,framesCompleted:0,totalFrames:360},"2026-11-18T22:01:00.000Z");
 assert.equal(job.progress,40);
 assert.equal(job.renderTelemetry.framesCompleted,0);
 assert.equal(job.renderTelemetry.lastFrameAt,null);
 applyWorkerProgress(job,{progress:80,renderAttempt:1,framesCompleted:200,totalFrames:360},"2026-11-18T22:01:10.000Z");
 assert.equal(job.progress,40);
 assert.equal(job.renderTelemetry.framesCompleted,0);
});
