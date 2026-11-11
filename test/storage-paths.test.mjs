import test from "node:test";
import assert from "node:assert/strict";
import { defaultDataDirectory, resolveStoragePath } from "../src/storage-paths.mjs";

test("tilde storage paths resolve against the stable account home",()=>{
  assert.equal(resolveStoragePath("~/.mediaforge-runtime",{home:"/home/u123",cwd:"/app/current"}),"/home/u123/.mediaforge-runtime");
});
test("relative storage paths resolve from cwd and absolute paths remain absolute",()=>{
  assert.equal(resolveStoragePath(".mediaforge",{home:"/home/u123",cwd:"/app/current"}),"/app/current/.mediaforge");
  assert.equal(resolveStoragePath("/var/lib/mediaforge",{home:"/home/u123",cwd:"/app/current"}),"/var/lib/mediaforge");
});
test("production defaults to a home-directory path outside a versioned release",()=>{
  assert.equal(defaultDataDirectory({production:true,home:"/home/u123"}),"/home/u123/.mediaforge-runtime");
  assert.equal(defaultDataDirectory({production:false,home:"/home/u123"}),".mediaforge");
});
