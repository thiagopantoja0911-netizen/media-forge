// Fixed-purpose maintenance bridge. Never accept arbitrary shell commands.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readState, updateState } from "./state-store.mjs";

export const STAGING_BRANCH="feature/conexoes-mediaforge-primeiro";
export const STAGING_COMMIT="62ba1062031c689505df2f23ffb55b746ad76c2c";
const TASK_KINDS=new Set(["diagnose","update-staging"]);
const LEASE_MS=120000,MAX_TASKS=30;
const TASK_ID=/^[a-f0-9]{32}$/;
const now=()=>new Date().toISOString();

function reply(response,status,obj){
 response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
 response.end(JSON.stringify(obj));
}
function originOK(request){
 const origin=request.headers.origin;
 const host=request.headers["x-forwarded-host"]||request.headers.host;
 if(typeof origin!=="string"||typeof host!=="string")return false;
 try{
  const u=new URL(origin);
  const expected=String(host).split(",")[0].trim();
  return u.host===expected && (u.protocol==="https:"||["localhost","127.0.0.1"].includes(u.hostname));
 }catch{return false;}
}
async function bodyJSON(request){
 const buffers=[];let bytes=0;
 for await(const chunk of request){bytes+=chunk.length;if(bytes>4096)throw Error("REQUEST_TOO_LARGE");buffers.push(chunk);}
 return JSON.parse(Buffer.concat(buffers).toString("utf8")||"{}");
}
function redact(t){return {id:t.id,kind:t.kind,status:t.status,createdAt:t.createdAt,updatedAt:t.updatedAt,workerId:t.workerId,report:t.report,error:t.error};}

export async function handleMaintenanceAdmin({request,response,url,isAdminSession}){
 const path=url.pathname;
 if(path!=="/maintenance"&&!path.startsWith("/api/maintenance/"))return false;
 if(!(await isAdminSession(request))){reply(response,401,{error:"ADMIN_SESSION_REQUIRED"});return true;}
 if(path==="/maintenance"&&request.method==="GET"){
  const page=await readFile(new URL("../desktop/maintenance.html",import.meta.url),"utf8");
  response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'","referrer-policy":"no-referrer"});
  response.end(page);return true;
 }
 if(path==="/api/maintenance/tasks"&&request.method==="POST"){
  if(!originOK(request)){reply(response,403,{error:"ORIGIN_NOT_ALLOWED"});return true;}
  try{
   const input=await bodyJSON(request),kind=input.kind;
   if(!TASK_KINDS.has(kind)){reply(response,422,{error:"UNSUPPORTED_TASK"});return true;}
   if(kind==="update-staging"&&input.confirmation!=="ATUALIZAR MEDIAFORGE"){reply(response,422,{error:"EXPLICIT_CONFIRMATION_REQUIRED"});return true;}
   const result=await updateState(state=>{
    state.maintenanceTasks??={};
    if(Object.values(state.maintenanceTasks).some(t=>["queued","running"].includes(t.status)))return null;
    const id=randomUUID().replaceAll("-","");
    const task={id,kind,status:"queued",createdAt:now(),updatedAt:now(),expectedCommit:STAGING_COMMIT,branch:STAGING_BRANCH};
    state.maintenanceTasks[id]=task;
    const keys=Object.keys(state.maintenanceTasks).sort((a,b)=>state.maintenanceTasks[b].createdAt.localeCompare(state.maintenanceTasks[a].createdAt));
    for(const key of keys.slice(MAX_TASKS))delete state.maintenanceTasks[key];
    return task;
   });
   if(!result){reply(response,409,{error:"ANOTHER_TASK_ACTIVE"});return true;}
   reply(response,202,{ok:true,task:redact(result)});
  }catch(error){reply(response,400,{error:error.message});}
  return true;
 }
 const m=/^\/api\/maintenance\/tasks\/([a-f0-9]{32})$/.exec(path);
 if(m&&request.method==="GET"){
  const state=await readState(),task=state.maintenanceTasks?.[m[1]];
  reply(response,task?200:404,task?{ok:true,task:redact(task)}:{error:"NOT_FOUND"});return true;
 }
 reply(response,405,{error:"NOT_ALLOWED"});return true;
}
export async function handleMaintenanceWorker({request,response,url}){
 const path=url.pathname;
 if(!path.startsWith("/v1/worker/maintenance/"))return false;
 if(request.method!=="POST"){reply(response,405,{error:"METHOD_NOT_ALLOWED"});return true;}
 try{
  const input=await bodyJSON(request);
  if(path==="/v1/worker/maintenance/claim"){
   const workerId=String(input.workerId||"").slice(0,90);
   if(!/^[A-Za-z0-9_.-]{1,90}$/.test(workerId)){reply(response,422,{error:"INVALID_WORKER"});return true;}
   const task=await updateState(state=>{
    const items=Object.values(state.maintenanceTasks||{}).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const selected=items.find(t=>t.status==="queued");
    if(!selected)return null;
    selected.status="running";selected.updatedAt=now();selected.workerId=workerId;
    selected.leaseId=randomUUID();selected.expiresAt=new Date(Date.now()+LEASE_MS).toISOString();
    return {...selected};
   });
   reply(response,200,{ok:true,task:task?{id:task.id,kind:task.kind,expectedCommit:task.expectedCommit,branch:task.branch,leaseId:task.leaseId}:null});return true;
  }
  if(path==="/v1/worker/maintenance/complete"){
   const taskId=String(input.id||""),leaseId=String(input.leaseId||""),workerId=String(input.workerId||"");
   if(!TASK_ID.test(taskId)){reply(response,422,{error:"INVALID_TASK"});return true;}
   const result=await updateState(state=>{
    const task=state.maintenanceTasks?.[taskId];
    if(!task||task.status!=="running"||task.leaseId!==leaseId||task.workerId!==workerId)return false;
    task.status=input.success===true?"done":"failed";task.updatedAt=now();
    task.report=typeof input.report==="object"&&input.report?JSON.parse(JSON.stringify(input.report).slice(0,3000)):null;
    task.error=input.success===true?null:String(input.error||"UNKNOWN_ERROR").slice(0,500);
    delete task.leaseId;delete task.expiresAt;
    return true;
   });
   reply(response,result?200:409,{ok:result,error:result?undefined:"LEASE_INVALID"});return true;
  }
  reply(response,404,{error:"NOT_FOUND"});return true;
 }catch(error){reply(response,400,{error:error.message});return true;}
}
