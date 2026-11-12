import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,writeFile,access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderArgs } from "../src/renderers/hyperframes.mjs";

test("deployment preserves cinematic fork motion blur without enabling it on regular motion", () => {
  const previous = process.env.HYPERFRAMES_BIN;
  try {
    const job = { project: { fps: 60 }, metadata: { kind: "cinematic-3d", motionBlur: { enabled: true } } };
    delete process.env.HYPERFRAMES_BIN;
    assert.throws(() => renderArgs(job, "out.mp4"), /validated local HyperFrames fork/);
    process.env.HYPERFRAMES_BIN = "C:/MediaForge-HyperFrames/hyperframes.cmd";
    assert.ok(renderArgs(job, "out.mp4").includes("--cinematic-motion-blur"));
    assert.ok(!renderArgs({ project: job.project }, "out.mp4").includes("--cinematic-motion-blur"));
  } finally {
    if (previous === undefined) delete process.env.HYPERFRAMES_BIN;
    else process.env.HYPERFRAMES_BIN = previous;
  }
});

test("renderer preserves structured preflight failures and never starts render after failure",async()=>{
  const root=await mkdtemp(join(tmpdir(),"mediaforge-render-"));
  const project=join(root,"bad");await mkdir(project);
  await writeFile(join(project,"index.html"),"<!doctype html>");
  await writeFile(join(project,"hyperframes"),`const fs=require('node:fs');
if(process.argv[2]==='check') {console.log(JSON.stringify({ok:false,layout:{findings:[{severity:'error',code:'outside_frame',selector:'#headline',message:'Headline outside canvas'}]}}));console.error('progress '.repeat(1000));process.exit(1);}
fs.writeFileSync('render-started','bad');`);
  const previous={...process.env};
  try {
    process.env.MEDIAFORGE_PROJECTS_DIR=root;process.env.MEDIAFORGE_OUTPUT_DIR=join(root,"out");process.env.HYPERFRAMES_BIN=process.execPath;
    const {renderWithHyperFrames}=await import("../src/renderers/hyperframes.mjs?diagnostic-test");
    let failure;
    try {await renderWithHyperFrames({id:"bad",project:{sourceDir:"bad"}});}catch(error){failure=error;}
    assert.equal(failure.code,"HYPERFRAMES_PREFLIGHT_FAILED");assert.equal(failure.retryable,false);
    assert.match(failure.message,/Headline outside canvas/);
    const report=JSON.parse(await readFile(failure.diagnostics.stdout,"utf8"));assert.equal(report.ok,false);
    assert.ok((await readFile(failure.diagnostics.stderr,"utf8")).length>7000);
    await assert.rejects(access(join(project,"render-started")));
  } finally {
    for(const name of ["MEDIAFORGE_PROJECTS_DIR","MEDIAFORGE_OUTPUT_DIR","HYPERFRAMES_BIN"]) {if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
  }
});
