// Frame-accurate exposure schedule shared by browser preview and HyperFrames captures.
// No wall-clock, previous-frame cache, or cross-cut temporal contamination.
export function temporalShutterSamples(scene,time,fps,preview=false){
  const strength=Number(scene?.motionBlur??0);
  const start=Number(scene?.startFrame)/fps,end=Number(scene?.endFrame)/fps;
  const t=Math.max(start,Math.min(end-0.00001,Number(time)||0));
  if(!Number.isFinite(strength)||strength<=0)return [t];
  const amount=Math.max(0,Math.min(1,strength));
  const count=preview?3:amount>.55?5:3;
  const half=(amount*.85/fps)/2;
  const values=[];
  for(let i=0;i<count;i++){
    const sample=t-half+(2*half*i)/(count-1);
    values.push(Math.max(start,Math.min(end-0.00001,sample)));
  }
  return values;
}
