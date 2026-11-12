import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,writeFile,access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
