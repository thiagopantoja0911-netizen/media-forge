import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";
import {fileURLToPath} from "node:url";
const html=await readFile(fileURLToPath(new URL("../public/index.html",import.meta.url)),"utf8");
test("Frame Lab page script parses and registers the workflow controls",()=>{
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js,{filename:"frame-lab-index.html.js"}));
 for(const id of ["sourceFile","renderFile","projectZip","uploadReconstruction",
    "submitRender","refreshRender","compareFinal","renderJobStatus",
    "newProject","projectSelect","engineBadge","graph","sourceView","renderView"]){
   assert.ok(html.includes('id="'+id+'"'),"Missing user interface element: "+id);
 }
 assert.ok(js.includes('boot().catch(err)'),"App must initialize capability detection");
});
