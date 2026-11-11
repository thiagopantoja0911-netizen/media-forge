import test from "node:test";
import assert from "node:assert/strict";
import { startHeartbeatLoop } from "../src/worker-heartbeat.mjs";

test("heartbeat loop retries independently and can be stopped",async()=>{
  let calls=0,errors=0;
  const stop=startHeartbeatLoop(async()=>{
    calls++;
    if(calls===1)throw new Error("temporary network error");
  },{intervalMs:10,onError:()=>errors++});
  await new Promise(resolve=>setTimeout(resolve,55));
  stop();
  const finalCalls=calls;
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.ok(finalCalls>=3,"heartbeat did not retry on schedule");
  assert.equal(calls,finalCalls,"heartbeat continued after stop");
  assert.equal(errors,1,"transient failure was not reported");
});
