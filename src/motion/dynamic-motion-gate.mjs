// Motion intent contract: structural preflight for dynamic social/commercial films.
// Not a substitute for inspecting the resulting rendered frames and audio.
export const DEFAULT_DYNAMIC_MOTION_PROFILE = Object.freeze({
  name: 'dynamic-motion-v1',
  maxIdleSeconds: 0.8,
  minActiveRatio: 0.60,
  minCameraEventsPer10Seconds: 2,
  minDepthLayers: 3,
  minTransitionsPer10Seconds: 2,
  maxExplicitHoldFraction: 0.2
});

const meaningfulScopes = new Set(['camera','ui','scene','foreground','midground','transition']);
const bannedKinds = new Set(['fade-only','static-card','slow-push-loop','breathing-loop','decorative-pulse']);
const transitionKinds = new Set(['match-cut','button-zoom','morph','carry','whip','iris','object-wipe','camera-pass']);
const isPositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isText = s => typeof s === 'string' && s.trim().length > 0;
const quantize = n => Math.round(n*1000)/1000;

/**
 * Verify the declared production plan before the expensive HyperFrames render.
 * Coverage derives from planned meaningful actions, NOT sampled pixels. It must
 * be followed by frame inspection. The plan does not prove what the video shows.
 *
 * Opt-out is explicit: use motionProfile='study' in the job for intentionally
 * static, calm, accessibility-led, or educational studies.
 */
export function validateDynamicMotionPlan(plan, opts={}) {
  const issues=[];
  const rules={...DEFAULT_DYNAMIC_MOTION_PROFILE,...opts};
  if (!plan || typeof plan!=='object' || Array.isArray(plan))
    return {ok:false,issues:['motion-plan.json must be a JSON object'],metrics:{}};
  if (plan.profile !== 'dynamic-motion-v1') issues.push('profile must be dynamic-motion-v1');
  const duration=plan.durationSeconds;
  if(!isPositive(duration) || duration>3600) issues.push('durationSeconds must be positive and <= 3600');
  const fps=plan.fps;
  if(!Number.isInteger(fps)||fps<24||fps>240) issues.push('fps must be an integer between 24 and 240');
  if(!isText(plan.intent)) issues.push('intent must specify the film purpose');
  if(!Number.isFinite(duration)||duration<=0) return {ok:false,issues,metrics:{}};

  const layers=Array.isArray(plan.layers)?plan.layers:[];
  if(layers.length < rules.minDepthLayers) issues.push(`at least ${rules.minDepthLayers} distinct depth layers required`);
  const layerRoles=new Set(layers.map(l=>l?.role));
  for(const role of ['background','midground','foreground']) if(!layerRoles.has(role)) issues.push(`missing ${role} layer`);
  const depths=layers.filter(l=>l&&Number.isFinite(l.depth)).map(l=>l.depth);
  if(new Set(depths).size<3) issues.push('background/midground/foreground must have distinct depths');
  for(const [i,l] of layers.entries()) if(!isText(l?.id)||!isText(l?.movement)) issues.push(`layers[${i}] needs id and planned movement`);

  const beats=Array.isArray(plan.beats)?plan.beats:[];
  if(beats.length<Math.min(3,Math.ceil(duration/2.5))) issues.push('provide at least three meaningful story/action beats');
  let last=0;
  for(const [i,b] of beats.entries()){
    if(!Number.isFinite(b?.start)||!Number.isFinite(b?.end)||b.end<=b.start||b.start<0||b.end>duration+.001) issues.push(`beats[${i}] invalid time range`);
    if(Number.isFinite(b?.start)&&b.start>last+.05) issues.push(`beats have uncovered gap at ${quantize(last)}s`);
    if(Number.isFinite(b?.end)) last=Math.max(last,b.end);
    if(!isText(b?.action)||!isText(b?.stateBefore)||!isText(b?.stateAfter)||b.stateBefore===b.stateAfter) issues.push(`beats[${i}] must show an observable state change`);
  }
  if(beats.length && last<duration-.05) issues.push('beats do not cover the complete film');

  const events=Array.isArray(plan.events)?plan.events:[];
  if(!events.length) issues.push('events list is empty: no meaningful motion scheduled');
  const active=[];let camera=0,nonCamera=0;
  const ids=new Set();
  for(const [i,e] of events.entries()){
    if(!isText(e?.id)||ids.has(e.id)) issues.push(`events[${i}] needs unique id`);
    if(isText(e?.id)) ids.add(e.id);
    if(!Number.isFinite(e?.start)||!isPositive(e?.duration)||e.start<0||e.start+e.duration>duration+.03){issues.push(`events[${i}] invalid timing`);continue;}
    if(!isText(e?.target)||!isText(e?.kind)) issues.push(`events[${i}] requires concrete target and movement kind`);
    if(!meaningfulScopes.has(e?.scope)) {
      if(e?.scope==='background') continue; // background glow alone cannot pass motion gate.
      issues.push(`events[${i}] unknown/nonmeaningful scope`);continue;
    }
    if(bannedKinds.has(e.kind)) issues.push(`events[${i}] decorative or static motion is not a meaningful action`);
    if(e.scope==='camera') camera++;else nonCamera++;
    active.push([e.start,Math.min(duration,e.start+e.duration)]);
  }
  const transitions=Array.isArray(plan.transitions)?plan.transitions:[];
  const minTransitions=duration>=8?Math.ceil(rules.minTransitionsPer10Seconds*duration/10):Math.min(1,transitions.length||1);
  if(transitions.length<minTransitions) issues.push(`expected at least ${minTransitions} motivated transitions`);
  for(const [i,t] of transitions.entries()) {
    if(!Number.isFinite(t?.at)||!isPositive(t?.duration)||t.at<0||t.at+t.duration>duration+.03) issues.push(`transitions[${i}] invalid timing`);
    if(!transitionKinds.has(t?.kind)) issues.push(`transitions[${i}] must be an object/camera-driven transition (not a crossfade)`);
    for(const key of ['carrier','cause','fromState','toState']) if(!isText(t?.[key])) issues.push(`transitions[${i}] missing ${key}`);
    if(t?.fromState===t?.toState) issues.push(`transitions[${i}] no state change`);
  }
  const minCamera=duration>=8?Math.ceil(rules.minCameraEventsPer10Seconds*duration/10):1;
  if(camera<minCamera) issues.push(`only ${camera} camera events; expected at least ${minCamera}`);
  if(nonCamera<3) issues.push('needs at least three meaningful UI/scene/foreground actions');

  const holds=Array.isArray(plan.holds)?plan.holds:[];
  let totalHold=0;
  for(const [i,h] of holds.entries()){
    if(!Number.isFinite(h?.start)||!Number.isFinite(h?.end)||h.end<=h.start||h.start<0||h.end>duration+.01||!isText(h?.reason)){
      issues.push(`holds[${i}] requires valid start/end and reading/CTA reason`);continue;
    }
    totalHold+=h.end-h.start;
  }
  if(totalHold>duration*rules.maxExplicitHoldFraction+.01) issues.push('explicit static holds consume too much of a dynamic commercial');
  const isHold=t=>holds.some(h=>Number.isFinite(h.start)&&Number.isFinite(h.end)&&t>=h.start&&t<h.end);
  let activeSamples=0,eligibleSamples=0,streak=0,maxIdle=0;
  const dt=Math.min(1/Math.max(24,fps||60),1/30);
  for(let t=0;t<duration-.00001;t+=dt){
    if(isHold(t)){streak=0;continue;}
    eligibleSamples++;
    const isActive=active.some(([a,b])=>t>=a-.000001&&t<b-.000001);
    if(isActive){activeSamples++;streak=0;} else {streak+=dt;maxIdle=Math.max(maxIdle,streak);}
  }
  const ratio=eligibleSamples?activeSamples/eligibleSamples:0;
  if(maxIdle>rules.maxIdleSeconds+.017) issues.push(`unmotivated motion gap ${quantize(maxIdle)}s exceeds ${rules.maxIdleSeconds}s`);
  if(ratio<rules.minActiveRatio) issues.push(`planned meaningful motion covers ${Math.round(ratio*100)}% (min ${Math.round(rules.minActiveRatio*100)}%)`);
  const metrics={durationSeconds:duration,cameraEvents:camera,meaningfulEvents:active.length,transitions:transitions.length,layers:layers.length,plannedActiveRatio:quantize(ratio),maxPlannedIdleSeconds:quantize(maxIdle),holdSeconds:quantize(totalHold)};
  return {ok:issues.length===0,issues,metrics};
}

export function enforceDynamicMotionPlan(plan,opts={}){
  const report=validateDynamicMotionPlan(plan,opts);
  if(!report.ok){const err=new Error('Dynamic motion preflight failed: '+report.issues.join('; '));err.code='DYNAMIC_MOTION_GATE_FAILED';err.report=report;throw err;}
  return report;
}
