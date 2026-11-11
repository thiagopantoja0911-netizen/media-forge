import test from "node:test";
import assert from "node:assert/strict";
import { defaultDataDirectory, isPathInside, mediaForgeDataDirectory, resolveStoragePath } from "../src/storage-paths.mjs";

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

test("server and OAuth state store share the same tilde-expanded data directory",()=>{
  const options={configured:"~/.mediaforge-runtime",production:true,home:"/home/u123",cwd:"/app/releases/current"};
  const dataDir=mediaForgeDataDirectory(options);
  assert.equal(dataDir,"/home/u123/.mediaforge-runtime");
  assert.equal(resolveStoragePath(dataDir,{home:"/home/u123",cwd:"/app/releases/current"}),dataDir);
});

test("persistent storage classification detects release-relative directories",()=>{
  assert.equal(isPathInside("/home/u123/releases/current","/home/u123/releases/current/.mediaforge"),true);
  assert.equal(isPathInside("/home/u123/releases/current","/home/u123/.mediaforge-runtime"),false);
  assert.equal(isPathInside("/home/u123/releases/current","/home/u123/releases/previous/.mediaforge"),false);
});
