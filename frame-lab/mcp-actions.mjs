import { randomBytes, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile, rename, rm, stat, open } from "node:fs/promises";
import { join } from "node:path";
import { readProjectPackage } from "./project-bundle.mjs";
import { safeDir, readJson, writeJson, fileExists, statusOf, capabilities, startAnalysis } from "./handler.mjs";

const ID=/^[a-f0-9]{32}$/;
const KINDS=new Set(["reference","render","project"]);
const MAX_CHUNK=384*1024;
const busy=new Set();
const QUALITIES=new Set(["draft","looks","standard","high","delivery"]);

function fail(message,status=400){
  throw Object.assign(new Error(message),{status});
}
function assertId(id){if(!ID.test(String(id)))fail("Invalid Frame Lab id",404);return id;}
function assertKind(kind){if(!KINDS.has(kind))fail("Unsupported upload kind");return kind;}
function maxFor(kind){return kind==="project"?16*1024*1024:120*1024*1024;}
function uploadDir(id){return join(safeDir(assertId(id)),".mcp-uploads");}
function uploadMeta(id,uploadId){
  if(!ID.test(String(uploadId)))fail("Invalid upload id",404);
  return join(uploadDir(id),uploadId+".json");
}
function uploadPart(id,uploadId){return join(uploadDir(id),uploadId+".part");}
async function ensureProject(id){
  assertId(id);
  if(!(await fileExists(safeDir(id))))fail("Project not found",404);
}
async function canMutate(id,getJob){
  await ensureProject(id);
  const st=await statusOf(id);
  if(st.running)fail("Frame Lab analysis is active",409);
  const queued=await readJson(join(safeDir(id),"render-job.json"),null);
  if(queued&&typeof getJob==="function"){
    const j=await getJob(queued.jobId);
    if(j&&["queued","processing"].includes(j.status))
      fail("MediaForge rendering is active",409);
  }
}
async function renderJobStatus(id,getJob){
  const queued=await readJson(join(safeDir(id),"render-job.json"),null);
  if(!queued)return null;
  const job=typeof getJob==="function"?await getJob(queued.jobId):null;
  if(!job)return {id:queued.jobId,status:"unknown"};
  return {id:job.id,status:job.status,progress:job.progress||0,
    error:job.error||null,
    result:job.result?{
      fileName:job.result.fileName||null,sha256:job.result.sha256||null,
      artifactUploaded:job.result.artifactUploaded===true,
      technicalQA:job.result.report?.technicalQA||null
    }:null};
}
export const FRAME_LAB_MCP_TOOLS=[
  {name:"frame_lab_capabilities",description:"Verifica se o motor de análise de todos os frames (OpenCV/FFmpeg) está pronto no servidor MediaForge.",inputSchema:{type:"object",additionalProperties:false}},
  {name:"frame_lab_create_project",description:"Cria projeto privado Frame Lab para analisar uma referência de movimento enviada pelo chat.",inputSchema:{type:"object",additionalProperties:false}},
  {name:"frame_lab_list_projects",description:"Lista projetos Frame Lab e estados resumidos (apenas com escopo de leitura MediaForge).",inputSchema:{type:"object",additionalProperties:false,properties:{limit:{type:"integer",minimum:1,maximum:100}}}},
  {name:"frame_lab_start_upload",description:"Inicia upload binário seguro e retomável de reference MP4, render MP4 ou ZIP editável, vindo de anexos do chat. Retorna upload_id; use chunks base64 com offsets e SHA-256 final.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    kind:{type:"string",enum:["reference","render","project"]},
    total_bytes:{type:"integer",minimum:128,maximum:125829120},
    sha256:{type:"string",pattern:"^[0-9a-f]{64}$"}
  },required:["project_id","kind","total_bytes","sha256"]}},
  {name:"frame_lab_upload_chunk",description:"Envia parte do arquivo binário em base64 (máximo 384KiB por chamada); offset sequencial, sem saltos. Resposta informa next_offset para retomar com segurança.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    offset:{type:"integer",minimum:0,maximum:125829120},
    content_base64:{type:"string",description:"Bytes base64 do arquivo local anexado a esta conversa; máximo 384 KiB decodificado."}
  },required:["project_id","upload_id","offset","content_base64"]}},
  {name:"frame_lab_upload_status",description:"Consulta progresso/offset do upload para retomar sem retransmitir dados.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id","upload_id"]}},
  {name:"frame_lab_finish_upload",description:"Confere tamanho, SHA-256 e tipo do upload antes de disponibilizar o vídeo ou ZIP ao Frame Lab.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id","upload_id"]}},
  {name:"frame_lab_analyze",description:"Inicia análise de todos os quadros nativos da referência, incluindo fluxo óptico, micro movimentos, cenas e easing.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}},
  {name:"frame_lab_status",description:"Consulta análise, número de quadros, existência de arquivos, e job de renderização do projeto Frame Lab.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}},
  {name:"frame_lab_report",description:"Obtém relatório limitado por páginas, com metadados, câmera, easing e métricas por frame (até 25 frames por consulta), sem respostas gigantes.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    frame_offset:{type:"integer",minimum:0},frame_limit:{type:"integer",minimum:1,maximum:25},
    include_layers:{type:"boolean"}
  },required:["project_id"]}},
  {name:"frame_lab_render",description:"Depois da análise e importação de ZIP reconstruído, submete ao worker HyperFrames com confirmação explícita; o MP4 volta ao Frame Lab para comparação.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    confirm_render:{type:"boolean"},
    quality:{type:"string",enum:["draft","looks","standard","high","delivery"]}
  },required:["project_id","confirm_render"]}},
  {name:"frame_lab_compare",description:"Quando o MP4 real estiver presente, reanalisa referência e render em paralelo e calcula diferença por frame; não declara equivalência visual automaticamente.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}}
];
export const FRAME_LAB_MCP_NAMES=new Set(FRAME_LAB_MCP_TOOLS.map(tool=>tool.name));
export const FRAME_LAB_READ_TOOLS=new Set(["frame_lab_capabilities","frame_lab_list_projects",
  "frame_lab_upload_status","frame_lab_status","frame_lab_report"]);
export async function executeFrameLabMcp(name,args={}, {createJob,getJob}={}){
  if(!FRAME_LAB_MCP_NAMES.has(name))fail("Unknown Frame Lab tool",404);
  if(name==="frame_lab_capabilities")return capabilities();
  if(name==="frame_lab_create_project"){
    const id=randomBytes(16).toString("hex");
    await mkdir(safeDir(id),{recursive:false,mode:0o700});
    await writeJson(join(safeDir(id),"objects.json"),{objects:[]});
    return {ok:true,id,status:"waiting",uploadKinds:["reference","render","project"]};
  }
  if(name==="frame_lab_list_projects"){
    const limit=Math.max(1,Math.min(100,Math.floor(Number(args.limit)||30)));
    const ids=(await readdir(join(safeDir("0".repeat(32)),".."))).filter(x=>ID.test(x)).slice(-limit).reverse();
    const projects=[];
    for(const id of ids)try{projects.push(await statusOf(id))}catch{}
    return {ok:true,projects};
  }
  const id=assertId(args.project_id);
  await ensureProject(id);
  const dir=safeDir(id);
  if(name==="frame_lab_status")return {ok:true,...await statusOf(id),renderJob:await renderJobStatus(id,getJob)};
  if(name==="frame_lab_start_upload"){
    await canMutate(id,getJob);
    const kind=assertKind(args.kind);
    const total=Number(args.total_bytes),sha=String(args.sha256||"");
    if(!Number.isSafeInteger(total)||total<128||total>maxFor(kind))fail("File size exceeds upload limit",413);
    if(!/^[0-9a-f]{64}$/.test(sha))fail("Expected SHA-256 is required");
    const uploadId=randomBytes(16).toString("hex");
    await mkdir(uploadDir(id),{recursive:true,mode:0o700});
    await writeFile(uploadPart(id,uploadId),Buffer.alloc(0),{flag:"wx",mode:0o600});
    await writeJson(uploadMeta(id,uploadId),{id:uploadId,kind,total,sha256:sha,received:0,
      createdAt:new Date().toISOString()});
    return {ok:true,upload_id:uploadId,next_offset:0,max_chunk_bytes:MAX_CHUNK,total_bytes:total};
  }
  if(["frame_lab_upload_chunk","frame_lab_upload_status","frame_lab_finish_upload"].includes(name)){
    const uploadId=String(args.upload_id||"");
    const path=uploadMeta(id,uploadId);
    const meta=await readJson(path,null);
    if(!meta)fail("Upload session not found",404);
    if(name==="frame_lab_upload_status")return {ok:true,kind:meta.kind,
      next_offset:meta.received,total_bytes:meta.total,complete:meta.received===meta.total};
    const key=id+":"+uploadId;
    if(busy.has(key))fail("Concurrent upload mutation blocked",409);
    busy.add(key);
    try{
      await canMutate(id,getJob);
      const part=uploadPart(id,uploadId);
      if(name==="frame_lab_upload_chunk"){
        const offset=Number(args.offset),base64=String(args.content_base64||"");
        if(!Number.isSafeInteger(offset)||offset!==meta.received)
          fail("Upload offset mismatch; expected "+meta.received,409);
        if(base64.length===0||base64.length>Math.ceil(MAX_CHUNK/3)*4+4||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
          fail("Invalid or oversized base64 upload chunk",413);
        const bytes=Buffer.from(base64,"base64");
        if(!bytes.length||bytes.length>MAX_CHUNK||meta.received+bytes.length>meta.total)
          fail("Chunk exceeds upload limits",413);
        const current=await stat(part).catch(()=>null);
        if(!current||current.size!==meta.received)fail("Upload data offset out of sync",409);
        const fd=await open(part,"a");
        try{await fd.writeFile(bytes)}finally{await fd.close()}
        meta.received+=bytes.length;
        await writeJson(path,meta);
        return {ok:true,upload_id:uploadId,next_offset:meta.received,
          total_bytes:meta.total,complete:meta.received===meta.total};
      }
      if(meta.received!==meta.total)fail("Upload is incomplete: "+meta.received+"/"+meta.total,409);
      const current=await stat(part).catch(()=>null);
      if(!current?.isFile()||current.size!==meta.total)fail("Uploaded file size mismatch",409);
      const hash=createHash("sha256");
      for await(const chunk of createReadStream(part))hash.update(chunk);
      if(hash.digest("hex")!==meta.sha256)fail("SHA-256 mismatch: upload rejected",422);
      const fd=await open(part,"r");
      const head=Buffer.alloc(12);
      try{await fd.read(head,0,12,0)}finally{await fd.close()}
      if(meta.kind==="project"){
        if(head.subarray(0,2).toString("hex")!=="504b")fail("ZIP signature missing",422);
        await readProjectPackage(part);
      }else if(head.subarray(4,8).toString("ascii")!=="ftyp"){
        fail("MP4 signature missing",422);
      }
      const dest=join(dir,meta.kind==="project"?"project.zip":meta.kind+".mp4");
      // Uploaded reference/render invalidates cached comparison, not imported authored layers.
      if(meta.kind!=="project"){
        await rm(join(dir,"results"),{force:true,recursive:true});
        if(meta.kind==="reference"){
          await rm(join(dir,"render.mp4"),{force:true});
          await rm(join(dir,"render-job.json"),{force:true});
        }
      }
      await rename(part,dest);
      await rm(path,{force:true});
      return {ok:true,kind:meta.kind,bytes:meta.received,sha256:meta.sha256,
        project_id:id,ready:true};
    }finally{busy.delete(key)}
  }
  if(name==="frame_lab_analyze"){
    return {ok:true,...await startAnalysis(id)};
  }
  if(name==="frame_lab_report"){
    const report=await readJson(join(dir,"results","report.json"),null);
    if(!report)fail("Frame Lab analysis report not ready",404);
    const offset=Math.max(0,Math.floor(Number(args.frame_offset)||0));
    const limit=Math.max(1,Math.min(25,Math.floor(Number(args.frame_limit)||10)));
    const reference=report.reference||{};
    const comparison=Array.isArray(report.comparison)?report.comparison.slice(offset,offset+limit):[];
    const frames=Array.isArray(reference.frames)?reference.frames.slice(offset,offset+limit):[];
    const simplified=frames.map((f,i)=>({
      frame:offset+i,time_s:f.time_s,camera_dx_px:f.camera_dx_px,
      camera_dy_px:f.camera_dy_px,residual_p95_px:f.residual_p95_px,
      subpixel_motion_fraction:f.subpixel_motion_fraction,
      regions:f.regions?.slice(0,12)||[]
    }));
    const tracks=report.reconstruction&&args.include_layers===true?{
      sceneCuts:report.reconstruction.sceneCuts?.slice(0,80)||[],
      camera:report.reconstruction.camera?{
        keyframes:report.reconstruction.camera.keyframes?.slice(0,80)||[],
        segments:report.reconstruction.camera.segments?.slice(0,50)||[]
      }:null,
      objects:report.reconstruction.objects?.map(o=>({
        id:o.id,label:o.label,keyframeCount:o.keyframes?.length||0,
        keyframes:o.keyframes?.slice(0,50)||[]
      })).slice(0,40)||[]
    }:null;
    return {ok:true,project_id:id,
      reference:{width:reference.width,height:reference.height,fps:reference.fps,
        frameCount:reference.frameCount,duration_s:reference.duration_s},
      render:report.render?{width:report.render.width,height:report.render.height,
        fps:report.render.fps,frameCount:report.render.frameCount}:null,
      frame_offset:offset,returned_frames:simplified.length,total_frames:reference.frameCount,
      frames:simplified,comparison, ...(tracks?{reconstruction:tracks}:{})};
  }
  if(name==="frame_lab_render"){
    if(args.confirm_render!==true)fail("Explicit confirm_render:true is required",428);
    if(typeof createJob!=="function")fail("MediaForge render queue not available",503);
    await canMutate(id,getJob);
    const report=await readJson(join(dir,"results","report.json"),null);
    if(!report)fail("Analyze the reference before rendering",409);
    const path=join(dir,"project.zip");
    if(!(await fileExists(path)))fail("Upload the authored project ZIP first",409);
    const prev=await renderJobStatus(id,getJob);
    if(prev&&["queued","processing"].includes(prev.status))fail("Previous job still processing",409);
    const archive=await readProjectPackage(path);
    const w=Number(report.reference.width),h=Number(report.reference.height);
    const ratio=Math.abs(w/h-9/16)<.04?"9:16":Math.abs(w/h-16/9)<.04?"16:9":
      Math.abs(w/h-1)<.04?"1:1":null;
    if(!ratio)fail("Reference aspect ratio unsupported by renderer",422);
    const fps=Math.min(120,Math.max(1,Math.round(Number(report.reference.fps)||30)));
    const quality=QUALITIES.has(args.quality)?args.quality:"standard";
    const job=await createJob({prompt:"MCP Frame Lab reconstruction of "+id,project:{
      title:"Frame Lab chat — "+id.slice(0,9),durationSeconds:Number(report.reference.duration_s)||1,
      aspectRatio:ratio,outputs:["video"],renderer:"hyperframes",fps,
      resolution:ratio==="9:16"?"portrait":ratio==="16:9"?"landscape":"square",
      quality,workers:1,preflight:true
    },projectFiles:archive.projectFiles,metadata:{
      source:"frame-lab",frameLabProjectId:id,mode:"reconstruction",
      expectsAudio:archive.projectFiles.some(f=>/\.(?:m4a|mp3|wav)$/i.test(f.path)),
      qaStatus:"pending-reference-comparison"
    }});
    await writeJson(join(dir,"render-job.json"),{jobId:job.id,createdAt:new Date().toISOString()});
    return {ok:true,project_id:id,job_id:job.id,status:job.status,
      message:"Submitted to Windows worker. Do not mark completed until the MP4 returns."};
  }
  if(name==="frame_lab_compare"){
    if(!(await fileExists(join(dir,"render.mp4"))))fail("Rendered MP4 not available",409);
    return {ok:true,...await startAnalysis(id)};
  }
  fail("Unsupported Frame Lab action");
}
