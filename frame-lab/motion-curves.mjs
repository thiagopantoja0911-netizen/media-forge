/* Measurement-derived reconstruction plan: timelines, estimated easing, scene changes
   and persistent layer candidates. Does not manufacture unseen intermediate frames. */

const n = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const fix = (v, precision=5) => Number(n(v).toFixed(precision));
const hypot = (a,b) => Math.hypot(n(a),n(b));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function smoothSamples(values, radius=2) {
  if (values.length <= 3 || radius === 0) return values.slice();
  // Smoothness is a suggested curve, not a replacement for original frame samples.
  const weights=[1,4,6,4,1];
  return values.map((_,i)=>{
    let sum=0, total=0;
    for(let d=-radius;d<=radius;d++){
      const j=clamp(i+d,0,values.length-1);
      const w=radius===2?weights[d+2]:1;
      sum+=values[j]*w;total+=w;
    }
    return fix(sum/total,6);
  });
}
function distanceToLine(point,a,b,fields) {
  const ta=n(a.time_s),tb=n(b.time_s),t=n(point.time_s);
  const fraction=tb>ta?clamp((t-ta)/(tb-ta),0,1):0;
  let metric=0;
  for(const [field,weight] of fields){
    const target=n(a[field])+(n(b[field])-n(a[field]))*fraction;
    const delta=(n(point[field])-target)*weight;
    metric+=delta*delta;
  }
  return Math.sqrt(metric);
}
export function simplifyKeyframes(samples,fields,epsilon=0.25) {
  if(samples.length<3) return samples.map(s=>s.frame);
  const keep=new Set([0,samples.length-1]);
  const work=[[0,samples.length-1]];
  while(work.length){
    const [first,last]=work.pop();
    let worst=0,index=-1;
    for(let i=first+1;i<last;i++){
      const error=distanceToLine(samples[i],samples[first],samples[last],fields);
      if(error>worst){worst=error;index=i;}
    }
    if(index!==-1 && worst>epsilon){
      keep.add(index);work.push([first,index],[index,last]);
    }
  }
  return [...keep].sort((a,b)=>a-b).map(i=>samples[i].frame);
}
function labelEase(samples) {
  if(samples.length<4)return "insufficient-data";
  const coords=samples.map(s=>[n(s.x_px),n(s.y_px)]);
  const net=hypot(coords.at(-1)[0]-coords[0][0],coords.at(-1)[1]-coords[0][1]);
  if(net<.4)return "hold-or-loop";
  const velocities=[];
  for(let i=1;i<samples.length;i++){
    const dt=Math.max(.00001,n(samples[i].time_s)-n(samples[i-1].time_s));
    velocities.push(hypot(coords[i][0]-coords[i-1][0],coords[i][1]-coords[i-1][1])/dt);
  }
  const k=Math.max(1,Math.floor(velocities.length/4));
  const a=velocities.slice(0,k).reduce((x,y)=>x+y,0)/k;
  const mid=velocities.slice(k,-k).length?
    velocities.slice(k,-k).reduce((x,y)=>x+y,0)/(velocities.length-2*k):a;
  const b=velocities.slice(-k).reduce((x,y)=>x+y,0)/k;
  if(mid<2)return "hold-or-loop";
  if(a<mid*.6&&b<mid*.6)return "ease-in-out";
  if(a<mid*.65&&b>=mid*.6)return "ease-in";
  if(b<mid*.65&&a>=mid*.6)return "ease-out";
  if(Math.max(a,mid,b)-Math.min(a,mid,b)<mid*.3)return "near-linear";
  return "complex-or-multiphase";
}
function refineKeyframes(samples,threshold=.25){
  const f=[["x_px",1],["y_px",1],["rotation_deg",.13],
    ["scale_x",40],["scale_y",40]];
  const indices=new Set(simplifyKeyframes(samples,f,threshold));
  for(let i=1;i<samples.length-1;i++){
    const prev=samples[i-1],now=samples[i],next=samples[i+1];
    const v0=[n(now.x_px)-n(prev.x_px),n(now.y_px)-n(prev.y_px)];
    const v1=[n(next.x_px)-n(now.x_px),n(next.y_px)-n(now.y_px)];
    const m0=hypot(...v0),m1=hypot(...v1);
    // Preserve fast direction reversals, otherwise RDP may erase an overshoot.
    if(m0>.1&&m1>.1&&(v0[0]*v1[0]+v0[1]*v1[1])/(m0*m1)<-.1)
      indices.add(now.frame);
  }
  return [...indices].sort((a,b)=>a-b);
}
function affineObjectSamples(rows,objId){
  const samples=[];
  for(const row of rows){
    const o=row.objects?.find(x=>x.id===objId);
    if(!o?.kinematics)continue;
    samples.push({frame:row.frame,time_s:n(row.time_s),
      x_px:n(o.kinematics.x_px),y_px:n(o.kinematics.y_px),
      rotation_deg:n(o.kinematics.rotation_deg),
      scale_x:n(o.kinematics.scale_x,1),scale_y:n(o.kinematics.scale_y,1),
      shear_proxy:o.shear_proxy??null,
      deformation_residual_px:o.deformation_residual_px??null,
      brightness_delta:o.brightness_delta??null,
      bbox:o.bbox??null,method:o.method||"estimated",
      confidence:o.inlier_ratio??null});
  }
  return samples;
}
function reconstructTrack(id,label,samples,type,precision){
  if(!samples.length)return null;
  const smoothX=smoothSamples(samples.map(s=>s.x_px));
  const smoothY=smoothSamples(samples.map(s=>s.y_px));
  const keyframes=refineKeyframes(samples,precision);
  const indices=new Map(samples.map((s,i)=>[s.frame,i]));
  const motionStarts=keyframes.map(frame=>indices.get(frame)).filter(i=>i!==undefined);
  const segments=[];
  for(let i=1;i<motionStarts.length;i++){
    const start=motionStarts[i-1],end=motionStarts[i];
    if(end<=start)continue;
    segments.push({startFrame:samples[start].frame,endFrame:samples[end].frame,
      start_s:samples[start].time_s,end_s:samples[end].time_s,
      estimatedEase:labelEase(samples.slice(start,end+1)),
      maxSmoothDeviationPx:fix(Math.max(...samples.slice(start,end+1).map((s,j)=>
        hypot(s.x_px-smoothX[start+j],s.y_px-smoothY[start+j]))))});
  }
  return {id,label,type,
    startFrame:samples[0].frame,endFrame:samples.at(-1).frame,
    rawSampleCount:samples.length,
    keyframes: keyframes.map(frame=>{
      const sample=samples[indices.get(frame)];
      return {frame,time_s:sample.time_s,
        x_px:fix(sample.x_px),y_px:fix(sample.y_px),
        rotation_deg:fix(sample.rotation_deg),
        scale_x:fix(sample.scale_x),scale_y:fix(sample.scale_y)};
    }),
    segments,
    rawSamples:samples,
    smoothing:{method:"binomial-5-point",interpretation:"suggested-only",
      x_px:smoothX,y_px:smoothY},
    mapping:"relative-to-first-tracked-frame",
    opacity:"not-recoverable-from-flattened-rgb"
  };
}
function matchRegions(rows) {
  let nextId=1, prior=[];
  const catalogue=new Map();
  for(const row of rows){
    const candidates=(row.regions||[]).slice(0,36);
    const used=new Set();
    const current=[];
    for(const region of candidates){
      let best=null,score=Infinity;
      for(const priorRegion of prior){
        if(used.has(priorRegion.id))continue;
        const a=priorRegion.rect,b=region;
        const cx=a.x+a.w*.5+n(priorRegion.dx_px);
        const cy=a.y+a.h*.5+n(priorRegion.dy_px);
        const bx=b.x+b.w*.5,by=b.y+b.h*.5;
        const dist=hypot(bx-cx,by-cy);
        const gate=Math.max(20,.6*Math.max(a.w,a.h,b.w,b.h));
        const size=Math.abs(Math.log((b.w*b.h+1)/(a.w*a.h+1)));
        const penalty=dist/gate+size*.35;
        if(dist<gate&&penalty<score){score=penalty;best=priorRegion;}
      }
      const id=best&&score<1.3?best.id:"auto-"+(nextId++);
      used.add(id);
      const currentRegion={id,rect:region,dx_px:n(region.dx),dy_px:n(region.dy)};
      current.push(currentRegion);
      const track=catalogue.get(id)||{id,label:"Camada sugerida "+id,
        type:"automatic-region",source:"flow-proposal",samples:[]};
      track.samples.push({frame:row.frame,time_s:n(row.time_s),
        x:region.x,y:region.y,w:region.w,h:region.h,
        dx_px:n(region.dx),dy_px:n(region.dy),
        local_motion_px:n(region.local_motion_px),
        area:n(region.area)});
      catalogue.set(id,track);
      region.trackId=id;
    }
    prior=current;
  }
  const layers=[...catalogue.values()].filter(x=>x.samples.length>=3);
  layers.sort((a,b)=>b.samples.length-a.samples.length);
  return layers.slice(0,60).map(layer=>({...layer,
    firstFrame:layer.samples[0].frame,lastFrame:layer.samples.at(-1).frame,
    caveat:"Region identity is tentative; verify visual masks and occlusions."}));
}
function detectSceneChanges(rows) {
  const events=[];
  for(const row of rows.slice(1)){
    const diff=n(row.frame_mean_luma_diff);
    const changed=n(row.changed_pixel_fraction);
    if(diff>34&&changed>.40)
      events.push({frame:row.frame,time_s:row.time_s,type:"probable-cut",
        confidence:"heuristic",meanLumaDiff:diff,changedPixelFraction:changed});
  }
  return events;
}
export function summarizeMotion(report,{pixelTolerance=.25}={}){
  const rows=report.reference.frames;
  if(!rows.length)return null;
  const cameraSamples=rows.map(row=>({frame:row.frame,time_s:n(row.time_s),
    x_px:n(row.camera_kinematics?.x_px),y_px:n(row.camera_kinematics?.y_px),
    rotation_deg:0,scale_x:1,scale_y:1}));
  const camera=reconstructTrack("camera","Fundo / câmera",cameraSamples,"background",pixelTolerance);
  const ids=new Map();
  for(const row of rows)for(const obj of row.objects||[]){
    if(!ids.has(obj.id))ids.set(obj.id,obj.label);
  }
  const objects=[];
  for(const [id,label] of ids){
    const samples=affineObjectSamples(rows,id);
    const track=reconstructTrack(id,label,samples,"labeled-object",pixelTolerance);
    if(track)objects.push(track);
  }
  const regionLayers=matchRegions(rows);
  const sceneCuts=detectSceneChanges(rows);
  return {
    version:"frame-lab-reconstruction-2.0",referenceFrameCount:rows.length,
    resolution:[report.reference.width,report.reference.height],
    timing:"native-decoded-pts",interpolatedFrames:0,
    pixelTolerance,sceneCuts,camera,objects,
    automaticLayers:regionLayers,
    mappingInstructions:"Replace suggested IDs with your actual DOM/canvas layers; user must verify automatic regions.",
    confidenceLimitations:[
      "Subpixel optical flow measures estimated apparent motion, not true vector animation parameters.",
      "Background-only camera transform is estimated; parallax may confound the result.",
      "Opacity, z-depth, masks, and 3D geometry cannot be uniquely recovered from a flattened video.",
      "Suggested keyframes and easing are models. Raw frame samples remain authoritative."
    ]
  };
}
