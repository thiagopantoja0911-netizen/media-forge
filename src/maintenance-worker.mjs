// Trusted local worker executor: fixed operations only, no shell command payloads.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { resolve,join,basename } from "node:path";
import { STAGING_BRANCH, STAGING_COMMIT } from "./maintenance-bridge.mjs";

const exec=promisify(execFile);
const REPO_URL=/^(?:https:\/\/github\.com\/thiagopantoja0911-netizen\/media-forge(?:\.git)?|git@github\.com:thiagopantoja0911-netizen\/media-forge(?:\.git)?)$/i;
const RUN=(file,args,cwd,timeout=30000)=>exec(file,args,{cwd,timeout,windowsHide:true,maxBuffer:1000000}).then(r=>r.stdout.trim());

export async function executeMaintenanceTask(task,root=process.cwd()) {
 if(!task||!["diagnose","update-staging"].includes(task.kind))throw Error("MAINTENANCE_KIND_DENIED");
 if(task.branch!==STAGING_BRANCH||task.expectedCommit!==STAGING_COMMIT)throw Error("MAINTENANCE_TARGET_DENIED");
 const cwd=resolve(root);
 if(basename(cwd).toLowerCase()!=="mediaforge-staging")throw Error("UNEXPECTED_INSTALL_DIRECTORY");
 await access(join(cwd,".git"));
 await access(join(cwd,".env.local"));
 const origin=await RUN("git",["remote","get-url","origin"],cwd);
 if(!REPO_URL.test(origin))throw Error("UNTRUSTED_GIT_ORIGIN");
 const branch=await RUN("git",["symbolic-ref","--short","HEAD"],cwd);
 if(branch!==STAGING_BRANCH)throw Error("UNEXPECTED_GIT_BRANCH");
 const before=await RUN("git",["rev-parse","HEAD"],cwd);
 const tracked=await RUN("git",["status","--porcelain","--untracked-files=no"],cwd);
 const status={branch,currentCommit:before,expectedCommit:STAGING_COMMIT,trackedClean:tracked.length===0,originVerified:true};
 if(task.kind==="diagnose")return {operation:"diagnose",...status};
 if(tracked)throw Error("TRACKED_FILES_MODIFIED");
 await RUN("git",["fetch","--no-tags","origin",STAGING_BRANCH],cwd,120000);
 const remote=await RUN("git",["rev-parse","refs/remotes/origin/"+STAGING_BRANCH],cwd);
 if(remote!==STAGING_COMMIT)throw Error("REMOTE_COMMIT_NOT_PINNED");
 // Fast-forward only. Never reset or overwrite local modifications.
 await RUN("git",["merge-base","--is-ancestor",before,remote],cwd);
 if(before!==remote)await RUN("git",["merge","--ff-only","refs/remotes/origin/"+STAGING_BRANCH],cwd,120000);
 const after=await RUN("git",["rev-parse","HEAD"],cwd);
 if(after!==STAGING_COMMIT)throw Error("COMMIT_MISMATCH_AFTER_UPDATE");
 for(const file of ["src/remote-worker-client.mjs","src/maintenance-bridge.mjs","src/maintenance-worker.mjs","src/motion/procedural-motion.mjs"])
  await RUN("node",["--check",join(cwd,file)],cwd,30000);
 await RUN("node",["--test","test/maintenance-bridge.test.mjs","test/procedural-motion.test.mjs"],cwd,120000);
 return {operation:"update-staging",previousCommit:before,currentCommit:after,branch,tests:"passed",restartRequired:before!==after,originVerified:true,trackedClean:true};
}
