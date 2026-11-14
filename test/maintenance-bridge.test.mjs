import test from "node:test";
import assert from "node:assert/strict";
import {executeMaintenanceTask} from "../src/maintenance-worker.mjs";
import {STAGING_BRANCH,STAGING_COMMIT,handleMaintenanceAdmin} from "../src/maintenance-bridge.mjs";

test("maintenance executor rejects arbitrary commands",async()=>{
 await assert.rejects(executeMaintenanceTask({kind:"powershell",branch:STAGING_BRANCH,expectedCommit:STAGING_COMMIT}),/MAINTENANCE_KIND_DENIED/);
});
test("maintenance executor locks branch and commit before touching disk",async()=>{
 await assert.rejects(executeMaintenanceTask({kind:"update-staging",branch:"main",expectedCommit:STAGING_COMMIT}),/MAINTENANCE_TARGET_DENIED/);
 await assert.rejects(executeMaintenanceTask({kind:"update-staging",branch:STAGING_BRANCH,expectedCommit:"not-a-commit"}),/MAINTENANCE_TARGET_DENIED/);
});
test("executor rejects unexpected repository directory",async()=>{
 await assert.rejects(executeMaintenanceTask({kind:"diagnose",branch:STAGING_BRANCH,expectedCommit:STAGING_COMMIT},process.cwd()),/UNEXPECTED_INSTALL_DIRECTORY/);
});
test("admin maintenance UI requires session",async()=>{
 const out={status:0,body:"",writeHead(s){this.status=s;},end(s){this.body=s;}};
 const invoked=await handleMaintenanceAdmin({request:{method:"GET",headers:{}},response:out,url:new URL("https://example.com/maintenance"),isAdminSession:async()=>false});
 assert.equal(invoked,true);assert.equal(out.status,401);assert.match(out.body,/ADMIN_SESSION_REQUIRED/);
});
test("nonmaintenance URLs remain unaffected",async()=>{
 const invoked=await handleMaintenanceAdmin({request:{},response:{},url:new URL("https://example.com/health"),isAdminSession:async()=>{throw Error("should not auth")}});
 assert.equal(invoked,false);
});
