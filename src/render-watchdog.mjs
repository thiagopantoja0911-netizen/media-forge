// Progress is accepted only when HyperFrames reports captured frames explicitly.
// A worker heartbeat is a connectivity signal, never proof that video is advancing.
const limits = {
  check: {hard: 12 * 60_000},
  render: {firstFrame: 12 * 60_000, noFrame: 10 * 60_000, hard: 75 * 60_000}
};

function budget(env, name, fallback) {
  const value=Number(env[name]);
  return Number.isSafeInteger(value) && value >= 30_000 && value <= 8 * 60 * 60_000
    ? value : fallback;
}

export function renderWatchdogBudgets(env=process.env, phase="render") {
  if(phase==="check") return {hardMs:budget(env,"MEDIAFORGE_CHECK_TIMEOUT_MS",limits.check.hard)};
  return {
    firstFrameMs:budget(env,"MEDIAFORGE_FIRST_FRAME_TIMEOUT_MS",limits.render.firstFrame),
    noFrameMs:budget(env,"MEDIAFORGE_NO_FRAME_TIMEOUT_MS",limits.render.noFrame),
    hardMs:budget(env,"MEDIAFORGE_RENDER_HARD_TIMEOUT_MS",limits.render.hard)
  };
}

export function framesFromHyperFramesLine(line, totalFrames) {
  if(typeof line!=="string" || !Number.isSafeInteger(totalFrames) || totalFrames<=0) return null;
  // Error summaries often repeat old frame counters. They are not capture telemetry.
  if(/\bstuck\b|\bno frame progress\b|\bfail(?:ed|ure)?\b|\berror\b/i.test(line))return null;
  const matches=[];
  const patterns=[
    /["']framesCompleted["']\s*:\s*(\d+)/gi,
    /\b(?:captured|rendered|completed)\s+(\d+)\s*(?:\/|of)\s*(\d+)\s*frames?\b/gi,
    /\b(?:capturing|rendering|captured|rendered|frame)\s*(?:frame\s*)?(\d+)\s*(?:\/|of)\s*(\d+)\b/gi,
    /\bframe\s*[=:]\s*(\d+)\s*(?:\/|of)\s*(\d+)\b/gi
  ];
  for(const pattern of patterns)for(const match of line.matchAll(pattern)){
    const count=Number(match[1]);
    const declaredTotal=match[2]===undefined?totalFrames:Number(match[2]);
    if(Number.isSafeInteger(count)&&count>0&&count<=totalFrames && declaredTotal===totalFrames)matches.push(count);
  }
  return matches.length ? Math.max(...matches) : null;
}

export function createFrameWatchdog({totalFrames,startedAt=Date.now(),budgets=renderWatchdogBudgets()}){
  let framesCompleted=0,lastFrameAt=null;
  const partials=new Map();
  function observe(chunk, at=Date.now(), channel="stdout") {
    let partial=(partials.get(channel)||"")+String(chunk);
    // Each output stream has its own tail, never join unrelated fragments.
    if(partial.length>16384)partial=partial.slice(-8192);
    const lines=partial.split(/[\r\n]+/);
    partials.set(channel,lines.pop()??"");
    let advanced=false;
    for(const line of lines){
      const n=framesFromHyperFramesLine(line,totalFrames);
      if(n!==null && n>framesCompleted){framesCompleted=n;lastFrameAt=at;advanced=true;}
    }
    return advanced?{framesCompleted,totalFrames,lastFrameAt}:null;
  }
  function inspect(at=Date.now()) {
    if(at-startedAt>=budgets.hardMs)return {code:"RENDER_HARD_TIMEOUT",message:"HyperFrames exceeded maximum render duration"};
    if(framesCompleted===0 && at-startedAt>=budgets.firstFrameMs)
      return {code:"RENDER_FIRST_FRAME_TIMEOUT",message:"HyperFrames produced no verified frames before the first-frame deadline"};
    if(framesCompleted>0 && at-lastFrameAt>=budgets.noFrameMs)
      return {code:"RENDER_CAPTURE_STALLED",message:"HyperFrames stopped advancing captured frames"};
    return null;
  }
  return {observe,inspect,get state(){return {framesCompleted,totalFrames,lastFrameAt,startedAt};}};
}

export function percentageFromFrames(completed,total){
  if(!Number.isFinite(completed)||!Number.isFinite(total)||total<=0)return 40;
  return Math.min(90,40+Math.floor(50*Math.max(0,Math.min(total,completed))/total));
}

export function orderQueuedJobs(jobs) {
  return [...jobs].sort((a,b)=>{
    const left=Date.parse(a.createdAt),right=Date.parse(b.createdAt);
    const first=Number.isFinite(left)?left:Number.MAX_SAFE_INTEGER;
    const second=Number.isFinite(right)?right:Number.MAX_SAFE_INTEGER;
    return first-second || String(a.id).localeCompare(String(b.id));
  });
}

export function applyWorkerProgress(job,body,now=new Date().toISOString()){
  const progress=Number(body.progress);
  const attempt=Number(body.renderAttempt);
  const previousAttempt=Number(job.renderTelemetry?.renderAttempt||0);
  const hasAttempt=Number.isSafeInteger(attempt)&&attempt>0&&attempt<=20;
  if(hasAttempt&&attempt<previousAttempt)return job; // stale HTTP frame update
  const newAttempt=hasAttempt&&attempt>previousAttempt;
  if(newAttempt){
    job.renderTelemetry={renderAttempt:attempt,framesCompleted:0,totalFrames:null,lastFrameAt:null,startedAt:now};
  }
  if(Number.isFinite(progress)){
    const bounded=Math.max(0,Math.min(99,Math.floor(progress)));
    job.progress=newAttempt?bounded:Math.max(job.progress||0,bounded);
  }
  const total=Number(body.totalFrames),completed=Number(body.framesCompleted);
  if(Number.isSafeInteger(total)&&total>0&&total<=2_000_000 &&
     Number.isSafeInteger(completed)&&completed>=0&&completed<=total){
    const prior=job.renderTelemetry||{renderAttempt:0,framesCompleted:0};
    if(completed>Number(prior.framesCompleted||0)){
      job.renderTelemetry={...prior,totalFrames:total,framesCompleted:completed,lastFrameAt:now};
    }else if(prior.totalFrames===null||prior.totalFrames===undefined){
      job.renderTelemetry={...prior,totalFrames:total};
    }
  }
  if(typeof body.phase==="string")job.phase=body.phase.slice(0,40);
  job.progressMessage=String(body.message||"Renderizando").replace(/[\r\n]+/g," ").slice(0,255);
  job.updatedAt=now;
  return job;
}
