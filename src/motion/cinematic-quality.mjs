// Media-first cinematic production gate. Enforced before the Windows job is queued.
// Does not claim artistic quality: it prevents known slideshow and silent-render failures.
import { frameSeconds, fpsValue } from "./plan.mjs";

const movingTypes = new Set(["footage", "widget", "product", "collage"]);
const stagedTypes = new Set(["kinetic", "end-card"]);
const photoExtensions = /\.(?:jpe?g|png|webp)$/i;
const videoExtensions = /\.(?:mp4|webm)$/i;

export function reviewCinematicCraft(plan) {
  const errors = [], warnings = [];
  if (plan?.productionMode !== "cinematic") return { ok: true, errors, warnings, metrics: null };
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const cues = Array.isArray(plan.audioCues) ? plan.audioCues : [];
  const fps = fpsValue(plan.fps);
  const frames = Number(plan.totalFrames);
  if (!Number.isFinite(fps) || !Number.isFinite(frames) || fps <= 0 || frames <= 0) {
    return {ok:false,errors:["Cinematic mode requires valid duration and FPS"],warnings,metrics:null};
  }
  const duration=frameSeconds(frames,plan.fps);
  if (duration>=20 && scenes.length<Math.max(5,Math.ceil(duration/6))) {
    errors.push("Cinematic mode: too few shots for the runtime; 45s needs at least 8 distinct shots.");
  }
  const types=new Set();
  const transitionKinds=new Set();
  const usedMedia=new Map();
  let footageSeconds=0,photoSeconds=0,motionSeconds=0,previousMedia=null,staticRuns=0,previousStatic=false;
  for (const scene of scenes) {
    if (!scene || typeof scene !== "object") continue;
    types.add(scene.type);
    const length=frameSeconds((scene.endFrame??0)-(scene.startFrame??0),plan.fps);
    const source=String(scene.media||"");
    if (scene.type==="footage") {
      if(!videoExtensions.test(source)) errors.push(scene.id+": footage requires packaged MP4/WEBM, not a static image or URL");
      footageSeconds+=Math.max(0,length);
    } else if(scene.type==="photo") {
      if(!photoExtensions.test(source)) errors.push(scene.id+": photo requires packaged JPEG/PNG/WEBP");
      photoSeconds+=Math.max(0,length);
    }
    if(source) {
      if(source===previousMedia) errors.push(scene.id+": repeated consecutive media (slide-style sequence)");
      usedMedia.set(source,(usedMedia.get(source)||0)+Math.max(0,length));
      previousMedia=source;
    } else previousMedia=null;
    if(scene.type==="footage") motionSeconds+=Math.max(0,length);
    else if(movingTypes.has(scene.type) && Array.isArray(scene.events) && scene.events.some(e=>e && ["state","focus","camera"].includes(e.action))) motionSeconds+=Math.max(0,length);
    else if(scene.type==="photo" && Array.isArray(scene.events) && scene.events.some(e=>e?.action==="camera")) motionSeconds+=Math.max(0,length)*.45;
    const isStatic=scene.type==="photo"||stagedTypes.has(scene.type);
    if(isStatic&&previousStatic) staticRuns++; else if(!isStatic)staticRuns=0;
    if(staticRuns>=2) errors.push(scene.id+": 3 consecutive still/title shots; use moving footage or action");
    previousStatic=isStatic;
    if(isStatic&&length>5) errors.push(scene.id+": static shot longer than 5s");
    if(scene.type==="photo"&&!scene.events?.some(e=>e?.action==="camera")) errors.push(scene.id+": static photo must have a timed camera move");
    if(scene.type==="footage"&&!scene.events?.some(e=>e?.action==="enter"||e?.action==="focus"||e?.action==="camera")) warnings.push(scene.id+": footage shot has no directed motion event");
    if(scene!==scenes[0]) transitionKinds.add(scene.transition||"cut");
  }
  if(types.size<2 && scenes.length>2) errors.push("Cinematic mode: use contrasting shot types, not identical slides");
  if(transitionKinds.size<2 && scenes.length>=5) errors.push("Cinematic mode: vary motivated transitions; one transition for every cut reads as a template");
  if(footageSeconds/duration<.30) errors.push("Cinematic mode: include at least 30% actual moving footage; still-photo pans alone are insufficient");
  if(photoSeconds/duration>.40) errors.push("Cinematic mode: static photos exceed 40% of runtime");
  if(motionSeconds/duration<.52) errors.push("Cinematic mode: at least 52% of the film needs meaningful visible motion");
  for (const [path,seconds] of usedMedia) if(seconds/duration>.28) errors.push("Cinematic mode: repeated asset dominates the timeline: "+path);
  const roles=role=>cues.filter(c=>c?.role===role);
  const music=roles("music"),voice=roles("voice"),sfx=roles("sfx");
  if(plan.audioMode==="silent-study") errors.push("Cinematic mode cannot silently fall back to a study");
  if(!music.length) errors.push("Cinematic mode requires a licensed music stem");
  if(music.length && !music.some(c=>c.startFrame===0&&c.endFrame>=frames-1)) errors.push("Music must cover the full film (no unplanned audio gap)");
  if(plan.audioMode==="voice-led"&&!voice.length) errors.push("Cinematic voice-led production requires a packaged voiceover");
  if(sfx.length<2) errors.push("Cinematic mode requires at least two actual event-synced micro-SFX assets");
  if(new Set(sfx.map(c=>c.src)).size<2 && sfx.length>=2) warnings.push("Repeated SFX sample; alternate takes where possible");
  if(sfx.length>Math.max(4,Math.ceil(duration/2))) warnings.push("Too many SFX; reserve sound for meaningful actions");
  const anchors=new Map();
  for(const scene of scenes) for(const event of scene.events||[]) if(event?.id)anchors.set(event.id,scene.startFrame+event.peakFrame);
  for(const cue of sfx){
    const anchor=anchors.get(cue.eventId);
    if(anchor!==undefined&&Math.abs(anchor-cue.startFrame)>Math.ceil(fps*.08))errors.push(cue.id+": SFX must land within 80ms of the visual event peak");
  }
  const metrics={durationSeconds:duration,shotCount:scenes.length,shotTypes:[...types],footagePct:Math.round(100*footageSeconds/duration),photoPct:Math.round(100*photoSeconds/duration),motionPct:Math.round(100*motionSeconds/duration),sfxCount:sfx.length,musicCount:music.length,voiceCount:voice.length};
  return {ok:errors.length===0,errors,warnings,metrics,artisticReview:"pending"};
}
