import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editorStoreDir, loadEditorProject, validateEditorProject } from "./editor-studio-core.mjs";

const ID=/^[a-f0-9]{32}$/;
const failure=(code,message,status=422)=>Object.assign(new Error(message),{code,status});
const fileFor=id=>{
  if(!ID.test(id))throw failure("PROJECT_ID_INVALID","Identificador de projeto inválido.");
  return join(editorStoreDir(),id+"-preview-review.json");
};
const checkFlag=(v)=>typeof v==="boolean";
export const editorReviewGateEnabled=()=>process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW!=="legacy";

export async function readEditorPreviewReview(project){
  validateEditorProject(project);
  let saved=null;
  try{saved=JSON.parse(await readFile(fileFor(project.id),"utf8"));}
  catch(error){if(error.code!=="ENOENT")throw error;}
  if(!saved)return {status:"not-reviewed",approved:false,revision:project.revision,review:null};
  if(saved.revision!==project.revision)
    return {status:"stale",approved:false,revision:project.revision,review:saved};
  return {status:saved.decision==="pass"?"approved":"rejected",approved:saved.decision==="pass",revision:project.revision,review:saved};
}

export function validateEditorPreviewReview(project,input){
  validateEditorProject(project);
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw failure("PREVIEW_REVIEW_INVALID","Revisão da prévia inválida.");
  if(input.expected_revision!==project.revision)
    throw failure("PREVIEW_REVISION_CONFLICT","O projeto mudou. Verifique a prévia da versão atual.",409);
  if(!["pass","fail"].includes(input.decision))
    throw failure("PREVIEW_DECISION_INVALID","Decisão deve ser pass ou fail.");
  const checks=input.checks;
  const free=project.mode==="timeline-free";
  if(!Array.isArray(checks)||checks.length<1||checks.length>(free?1:project.scenes.length))
    throw failure("PREVIEW_CHECKS_INVALID","Informe as cenas efetivamente verificadas.");
  const sceneIds=new Set();
  const normalized=checks.map(check=>{
    const index=free?(check?.scene_id==="timeline"?0:-1):project.scenes.findIndex(s=>s.id===check?.scene_id);
    if(index<0||sceneIds.has(check.scene_id))
      throw failure("PREVIEW_SCENE_INVALID","Cena de prévia inválida ou repetida.");
    sceneIds.add(check.scene_id);
    const duration=free?project.totalFrames/project.fps:(project.scenes[index].endFrame-project.scenes[index].startFrame)/project.fps;
    const samples=check.samples_seconds;
    if(!Array.isArray(samples)||samples.length<2||samples.length>5||
       samples.some(t=>typeof t!=="number"||!Number.isFinite(t)||t<0||t>duration)||
       new Set(samples.map(t=>t.toFixed(3))).size<2)
      throw failure("PREVIEW_SAMPLES_INVALID","Confira pelo menos dois instantes distintos de cada cena.");
    const flags=["preview_ready","text_legible","motion_ok","visual_ok"];
    if(flags.some(key=>!checkFlag(check[key])))
      throw failure("PREVIEW_CHECK_FLAGS_INVALID","Informe o resultado explícito de cada verificação.");
    const notes=String(check.notes??"").trim();
    if(notes.length<12||notes.length>600)
      throw failure("PREVIEW_NOTES_INVALID","Descreva o que foi visto em cada cena (12 a 600 caracteres).");
    return {scene_id:check.scene_id,scene_index:index,samples_seconds:samples,
      preview_ready:check.preview_ready,text_legible:check.text_legible,
      motion_ok:check.motion_ok,visual_ok:check.visual_ok,notes};
  });
  const allPassed=normalized.every(c=>c.preview_ready&&c.text_legible&&c.motion_ok&&c.visual_ok);
  if(input.decision==="pass"&&(normalized.length!==(free?1:project.scenes.length)||!allPassed))
    throw failure("PREVIEW_NOT_APPROVED","Todas as cenas devem estar verificadas e aprovadas para renderizar.");
  if(input.decision==="fail"&&allPassed&&normalized.length===(free?1:project.scenes.length))
    throw failure("PREVIEW_FAILURE_REASON_REQUIRED","Indique qual verificação falhou antes de voltar ao editor.");
  return {
    version:1,projectId:project.id,revision:project.revision,decision:input.decision,
    reviewedBy:"preview-reviewer",reviewedAt:new Date().toISOString(),checks:normalized,
    summary:String(input.summary??"").trim().slice(0,700)
  };
}

export async function saveEditorPreviewReview(project,input){
  const review=validateEditorPreviewReview(project,input);
  const latest=await loadEditorProject(project.id);
  if(latest.revision!==project.revision)
    throw failure("PREVIEW_REVISION_CONFLICT","O projeto foi alterado enquanto a prévia era avaliada.",409);
  await mkdir(editorStoreDir(),{recursive:true});
  const file=fileFor(project.id),tmp=file+"."+randomUUID().replaceAll("-","")+".tmp";
  await writeFile(tmp,JSON.stringify(review,null,2)+"\n",{flag:"wx"});
  await rename(tmp,file);
  return readEditorPreviewReview(project);
}

export async function requireApprovedEditorPreview(project){
  if(!editorReviewGateEnabled())return {status:"legacy",approved:true,revision:project.revision};
  const result=await readEditorPreviewReview(project);
  if(!result.approved)
    throw failure("PREVIEW_APPROVAL_REQUIRED",
      "Render bloqueado: revise visualmente todas as cenas na prévia do editor e registre a aprovação da revisão atual. Status: "+result.status+".",428);
  return result;
}
