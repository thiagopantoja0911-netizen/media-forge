// Stateless, non-destructive motion-plan editing. The renderer consumes the
// returned plan in a NEW job; editing never mutates an existing queued job.
import { validateMotionPlan, TRANSITIONS } from "./plan.mjs";

const textFields = new Set(["headline","eyebrow","detail","metricLabel","controlLabel"]);
const cameras = new Set(["dolly-in","pull-back","truck-left","truck-right","arc-reveal","locked"]);
const paletteKeys = new Set(["ground","ink","accent","paper"]);
const operations = new Set([
  "set_text","set_camera","set_transition","set_scene_duration",
  "set_audio_volume","align_sfx","set_event_timing","set_palette_color"
]);
const idPattern=/^[a-z][a-z0-9-]{0,47}$/;
const safeText = value => typeof value === "string" && !/[\u0000-\u001f]/.test(value);
const fail = (code, detail) => {
  const error = new Error(detail);
  error.code=code;
  error.status=422;
  throw error;
};
const findScene = (plan,id) => {
  const scene=plan.scenes.find(scene=>scene.id===id);
  if(!scene)fail("SCENE_NOT_FOUND","Cena não encontrada: "+String(id).slice(0,80));
  return scene;
};
const findCue = (plan,id) => {
  const cue=(plan.audioCues||[]).find(cue=>cue.id===id);
  if(!cue)fail("AUDIO_CUE_NOT_FOUND","Cue de áudio não encontrada: "+String(id).slice(0,80));
  return cue;
};
const clone = value => JSON.parse(JSON.stringify(value));

function applyOne(plan,edit) {
  if(!edit || typeof edit!=="object" || Array.isArray(edit) || !operations.has(edit.action))
    fail("EDITOR_OPERATION_INVALID","Operação de edição não suportada.");
  const action=edit.action;
  if(action==="set_text"){
    const scene=findScene(plan,edit.scene_id),field=edit.field;
    if(!textFields.has(field))fail("EDITOR_FIELD_INVALID","Campo de texto inválido.");
    const limit=field==="headline"?72:100;
    if(!safeText(edit.text)||edit.text.length>limit||(field==="headline"&&!edit.text.trim()))
      fail("EDITOR_TEXT_INVALID","Texto inválido ou ultrapassou o limite de "+limit+" caracteres.");
    const before=scene[field]??null;
    scene[field]=edit.text;
    return {action,scene_id:scene.id,field,before,after:scene[field]};
  }
  if(action==="set_camera"){
    const scene=findScene(plan,edit.scene_id);
    if(!cameras.has(edit.camera))fail("EDITOR_CAMERA_INVALID","Movimento de câmera não suportado.");
    if(!["footage","photo","product","collage"].includes(scene.type))
      fail("EDITOR_CAMERA_UNSUPPORTED","Esta cena não tem rig de câmera; para kinetic/widget edite a animação, não a câmera.");
    const before=scene.camera??null;
    scene.camera=edit.camera;
    return {action,scene_id:scene.id,before,after:scene.camera};
  }
  if(action==="set_transition"){
    const scene=findScene(plan,edit.scene_id);
    if(!TRANSITIONS.includes(edit.transition))fail("EDITOR_TRANSITION_INVALID","Transição não suportada.");
    const before=scene.transition??"cut";
    scene.transition=edit.transition;
    return {action,scene_id:scene.id,before,after:scene.transition};
  }
  if(action==="set_scene_duration"){
    const scene=findScene(plan,edit.scene_id);
    const frames=edit.frames;
    if(!Number.isInteger(frames)||frames<1||frames>plan.totalFrames*2)
      fail("EDITOR_DURATION_INVALID","A duração deve ser um número positivo de quadros.");
    const current=scene.endFrame-scene.startFrame;
    const delta=frames-current;
    if(delta===0)return {action,scene_id:scene.id,before:current,after:frames,shiftFrames:0};
    const oldEnd=scene.endFrame,oldTotal=plan.totalFrames,newEnd=scene.startFrame+frames;
    // Never silently delete a sound that starts inside a removed tail.
    if(delta<0&&(plan.audioCues||[]).some(cue=>
      cue.startFrame>=newEnd&&cue.startFrame<oldEnd))
      fail("EDITOR_AUDIO_TRIM_CONFLICT","O trecho cortado contém início de áudio. Ajuste os cues antes de encurtar.");
    // Reject events ending after the new local duration before shifting other scenes.
    if(scene.events.some(event=>event.endFrame>=frames))
      fail("EDITOR_EVENT_TRIM_CONFLICT","A cena contém uma animação além do novo ponto de corte.");
    const later=plan.scenes.indexOf(scene)+1;
    scene.endFrame=newEnd;
    for(const following of plan.scenes.slice(later)){
      following.startFrame+=delta;
      following.endFrame+=delta;
    }
    for(const cue of plan.audioCues||[]){
      if(cue.startFrame>=oldEnd)cue.startFrame+=delta;
      if(cue.endFrame>oldEnd || (cue.role==="music"&&oldEnd===oldTotal&&cue.endFrame===oldTotal))
        cue.endFrame+=delta;
    }
    plan.totalFrames+=delta;
    return {action,scene_id:scene.id,before:current,after:frames,shiftFrames:delta};
  }
  if(action==="set_audio_volume"){
    const cue=findCue(plan,edit.cue_id);
    if(typeof edit.volume!=="number"||!Number.isFinite(edit.volume)||edit.volume<0||edit.volume>1)
      fail("EDITOR_VOLUME_INVALID","Volume deve estar entre zero e um.");
    const before=cue.volume;
    cue.volume=edit.volume;
    return {action,cue_id:cue.id,before,after:cue.volume};
  }
  if(action==="align_sfx"){
    const cue=findCue(plan,edit.cue_id);
    if(cue.role!=="sfx")fail("EDITOR_ROLE_INVALID","Somente efeitos sonoros têm pico de evento.");
    const scene=plan.scenes.find(scene=>scene.events.some(e=>e.id===cue.eventId));
    const event=scene?.events.find(e=>e.id===cue.eventId);
    if(!scene||!event)fail("EDITOR_EVENT_MISSING","Evento associado ao SFX não foi encontrado.");
    const before=cue.startFrame;
    const target=scene.startFrame+event.peakFrame;
    const duration=cue.endFrame-cue.startFrame;
    cue.startFrame=target;
    cue.endFrame=target+duration;
    return {action,cue_id:cue.id,event_id:cue.eventId,before,after:target};
  }
  if(action==="set_event_timing"){
    const scene=findScene(plan,edit.scene_id);
    const event=scene.events.find(e=>e.id===edit.event_id);
    if(!event)fail("EDITOR_EVENT_MISSING","Evento de animação não encontrado.");
    const timing=edit.timing;
    if(!timing||typeof timing!=="object"||Array.isArray(timing)||
      !["startFrame","peakFrame","endFrame"].every(k=>Number.isInteger(timing[k])))
      fail("EDITOR_TIMING_INVALID","Informe início, pico e fim em quadros inteiros.");
    const before={startFrame:event.startFrame,peakFrame:event.peakFrame,endFrame:event.endFrame};
    const shift=timing.peakFrame-event.peakFrame;
    Object.assign(event,timing);
    // Keep linked audio synchronized when the visual event peak moves.
    for(const cue of plan.audioCues||[])if(cue.role==="sfx"&&cue.eventId===event.id){
      cue.startFrame+=shift;
      cue.endFrame+=shift;
    }
    return {action,scene_id:scene.id,event_id:event.id,before,after:{
      startFrame:event.startFrame,peakFrame:event.peakFrame,endFrame:event.endFrame
    }};
  }
  if(action==="set_palette_color"){
    if(!paletteKeys.has(edit.color_key)||typeof edit.color!=="string"||
      !/^#[0-9a-f]{6}$/i.test(edit.color))
      fail("EDITOR_COLOR_INVALID","Cor inválida: use #RRGGBB e uma chave de paleta conhecida.");
    plan.palette??={};
    const before=plan.palette[edit.color_key]??null;
    plan.palette[edit.color_key]=edit.color;
    return {action,color_key:edit.color_key,before,after:edit.color};
  }
  fail("EDITOR_OPERATION_INVALID","Operação não suportada.");
}

export function editMotionPlan({motion_plan,edits,expected_revision}={}){
  if(!motion_plan || typeof motion_plan!=="object" || Array.isArray(motion_plan))
    fail("EDITOR_PLAN_REQUIRED","Envie o motion_plan editável; um MP4 final não contém essas camadas.");
  const original=validateMotionPlan(motion_plan);
  if(!original.ok)fail("EDITOR_SOURCE_INVALID","Projeto de origem inválido: "+original.errors.slice(0,3).join("; "));
  const revision=motion_plan.editorRevision??0;
  if(!Number.isSafeInteger(revision)||revision<0)fail("EDITOR_REVISION_INVALID","Revisão de origem inválida.");
  if(expected_revision!==undefined&&expected_revision!==revision)
    fail("EDITOR_REVISION_CONFLICT","A revisão mudou. Releia o plano antes de editar.");
  if(!Array.isArray(edits)||edits.length<1||edits.length>16)
    fail("EDITOR_BATCH_INVALID","Envie entre uma e dezesseis alterações.");
  const next=clone(motion_plan);
  const changes=edits.map(edit=>applyOne(next,edit));
  const review=validateMotionPlan(next);
  if(!review.ok)fail("EDITOR_RESULT_INVALID","Edição rejeitada pelo validador: "+review.errors.slice(0,4).join("; "));
  next.editorRevision=revision+1;
  return {
    status:"edited-not-rendered",
    revision:next.editorRevision,
    previousRevision:revision,
    plan:next,
    changes,
    validation:{ok:true,warnings:review.warnings},
    nextStep:"Use create_motion_video com este plano e os assets originais para gerar uma prévia ou nova renderização. Nenhum job foi modificado.",
    requiresNewRender:true
  };
}
