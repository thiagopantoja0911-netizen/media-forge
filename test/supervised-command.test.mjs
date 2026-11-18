import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runSupervisedCommand} from "../src/supervised-command.mjs";

test("supervised render streams verified frames and writes diagnostics while child exits",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mediaforge-watchdog-"));
 try{
  const observed=[];
  const r=await runSupervisedCommand(process.execPath,[
    "-e",'process.stdout.write("Captured 12/120 frames\\n");process.stderr.write("render log\\n");'
  ],dir,join(dir,"render"),{
    phase:"render",totalFrames:120,env:{},onVerifiedFrame:state=>observed.push(state.framesCompleted)
  });
  assert.equal(r.framesCompleted,12);
  assert.deepEqual(observed,[12]);
  assert.match(await readFile(join(dir,"render.stdout.log"),"utf8"),/Captured 12\/120 frames/);
  assert.match(await readFile(join(dir,"render.stderr.log"),"utf8"),/render log/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("supervised nonzero exit retains code and diagnostics",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mediaforge-watchdog-"));
 try{
  await assert.rejects(runSupervisedCommand(process.execPath,[
    "-e",'process.stderr.write("synthetic failure\\n");process.exit(7);'
  ],dir,join(dir,"check"),{phase:"check",env:{}}),error=>{
    assert.equal(error.code,"HYPERFRAMES_FAILED");
    assert.equal(error.exitCode,7);
    return true;
  });
  assert.match(await readFile(join(dir,"check.stderr.log"),"utf8"),/synthetic failure/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
