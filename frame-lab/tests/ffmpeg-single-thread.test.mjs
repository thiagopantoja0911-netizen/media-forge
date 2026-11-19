import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const analyzer=readFileSync(new URL("../analyze-node.mjs",import.meta.url),"utf8");

test("Frame Lab streams native frames with a strict FFmpeg thread budget",()=>{
 assert.match(analyzer,/"-threads","1","-filter_threads","1","-filter_complex_threads","1"/);
 assert.match(analyzer,/"-vsync","0",\s*"-threads:v","1"/);
 assert.match(analyzer,/"-f","rawvideo","-pix_fmt","rgb24"/);
 assert.match(analyzer,/while\(start<chunk\.length\)/);
 assert.match(analyzer,/await onFrame\(buf,count\+\+\)/);
});
test("Frame Lab analyzer parses as modern Node ESM",()=>{
 assert.doesNotThrow(()=>new Script(analyzer.replace(/^import[^;]*;\s*$/gm,"").replace(/^export\s+/gm,""),{filename:"analyze-node.mjs"}));
});
