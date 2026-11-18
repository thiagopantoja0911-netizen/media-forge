// MediaForge Remotion v1 project contract. The same data drives Player and MP4.
export const demoProject = Object.freeze({
  id: "mediaforge-remotion-stage1", title: "MediaForge · 3 camadas / 12s",
  width: 540, height: 960, fps: 30, durationInFrames: 360,
  layers: [
    {id:"background",type:"video",src:"remotion-assets/background.mp4",zIndex:0,x:0,y:0,width:540,height:960,opacity:1,loop:true,startFrame:0,endFrame:360},
    {id:"badge",type:"image",src:"remotion-assets/badge.png",zIndex:2,x:90,y:112,width:360,height:220,opacity:0.96,startFrame:0,endFrame:360},
    {id:"headline",type:"text",text:"UMA IDEIA.\\nTRÊS CAMADAS.",zIndex:3,x:38,y:408,width:464,height:238,opacity:1,
      color:"#ffffff",fontSize:58,fontWeight:900,startFrame:0,endFrame:360,
      keyframes:[{frame:0,y:452,opacity:0},{frame:24,y:408,opacity:1},{frame:330,y:408,opacity:1},{frame:359,y:382,opacity:0}]}
  ]
});
export function validateLayerProject(project) {
  if(!project||!Number.isInteger(project.fps)||project.fps<1||project.fps>120||!Number.isInteger(project.durationInFrames)||project.durationInFrames<1||
    !Number.isInteger(project.width)||!Number.isInteger(project.height)||project.width<16||project.height<16)throw Error("Invalid composition dimensions");
  if(!Array.isArray(project.layers)||project.layers.length<1||project.layers.length>40)throw Error("Invalid layers");
  const ids=new Set();
  for(const l of project.layers){
    if(!["video","image","text","shape","audio"].includes(l.type)||typeof l.id!=="string"||ids.has(l.id))throw Error("Invalid layer type/id");
    ids.add(l.id);
    for(const p of ["x","y","width","height","opacity","zIndex","startFrame","endFrame"])if(!Number.isFinite(l[p]))throw Error("Invalid layer property "+p);
    if(l.endFrame<=l.startFrame||l.startFrame<0||l.endFrame>project.durationInFrames||l.opacity<0||l.opacity>1)throw Error("Invalid layer timing");
    if(["video","image"].includes(l.type)&&(!/^remotion-assets\/[a-zA-Z0-9._-]+$/.test(l.src)))throw Error("Invalid asset path");
    if(l.keyframes){if(!Array.isArray(l.keyframes)||l.keyframes.some((k,i)=>!Number.isInteger(k.frame)||k.frame<0||i>0&&k.frame<=l.keyframes[i-1].frame))throw Error("Invalid keyframes");}
  }
  return project;
}
