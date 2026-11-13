import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { requireMotionPlan, frameSeconds, fpsValue } from "./plan.mjs";

export async function inspectMotionProject(projectDir, project) {
  let plan;
  try { plan=JSON.parse(await readFile(join(projectDir,"motion-plan.json"),"utf8")); }
  catch(error) { if(error.code==="ENOENT") return null; throw Object.assign(error,{retryable:false,code:"INVALID_MOTION_PLAN"}); }
  const review=requireMotionPlan(plan);
  if(Math.abs(frameSeconds(plan.totalFrames,plan.fps)-project.durationSeconds)>1/fpsValue(plan.fps) || Math.abs(fpsValue(plan.fps)-fpsValue(project.fps))>.001) throw Object.assign(new Error("Motion plan duration/FPS differs from job"),{code:"INVALID_MOTION_PLAN",retryable:false});
  for(const source of [...plan.scenes.map(s=>s.media),...(plan.audioCues??[]).map(c=>c.src)].filter(Boolean)) {
    try { await access(join(projectDir,source)); }
    catch { throw Object.assign(new Error("Missing motion asset: "+source),{code:"INVALID_MOTION_PLAN",retryable:false}); }
  }
  return {format:plan.format,productionMode:plan.productionMode??"standard",cinematicCraft:review.cinematicCraft,width:plan.width,height:plan.height,sceneCount:plan.scenes.length,sceneTypes:[...new Set(plan.scenes.map(s=>s.type))],eventCount:plan.scenes.reduce((n,s)=>n+s.events.length,0),expectsAudio:plan.audioMode!=="silent-study",audioMode:plan.audioMode,audioCues:{music:(plan.audioCues??[]).filter(c=>c.role==="music").length,voice:(plan.audioCues??[]).filter(c=>c.role==="voice").length,sfx:(plan.audioCues??[]).filter(c=>c.role==="sfx").length},warnings:review.warnings,artisticReview:"pending"};
}
