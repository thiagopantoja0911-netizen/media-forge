import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("MediaForge dashboard includes job history, progress, profile and local MP4 path",async()=>{
  const panel=await readFile(new URL("../src/panel.mjs",import.meta.url),"utf8");
  for(const marker of ["id=\"jobsBody\"","id=\"lastUpdate\"","workerSeen","progressMessage","outputPath","p.resolution","p.fps","p.quality","/api/jobs"])
    assert.ok(panel.includes(marker),"Missing dashboard field: "+marker);
});
