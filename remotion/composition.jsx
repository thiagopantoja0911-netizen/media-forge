import React from "react";
import {AbsoluteFill,Img,OffthreadVideo,interpolate,useCurrentFrame,staticFile,Sequence} from "remotion";
const urlFor=(src)=>{
  if(typeof window!=="undefined"&&window.location.pathname.startsWith("/editor/"))return "/editor/"+src;
  return staticFile(src);
};
const animated=(layer,frame,key)=>{
  const keys=layer.keyframes||[];
  const values=keys.filter(k=>Number.isFinite(k[key]));
  if(values.length===0)return layer[key];
  if(values.length===1)return values[0][key];
  return interpolate(frame,values.map(k=>k.frame),values.map(k=>k[key]),{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
};
export const LayeredComposition=({project})=>{
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor:"#070a13",overflow:"hidden"}}>
    {[...project.layers].sort((a,b)=>a.zIndex-b.zIndex).map(layer=>{
      if(frame<layer.startFrame||frame>=layer.endFrame)return null;
      const x=animated(layer,frame,"x"),y=animated(layer,frame,"y"),opacity=animated(layer,frame,"opacity");
      const transform=\`translate(\${x}px,\${y}px) rotate(\${animated(layer,frame,"rotation")||0}deg) scale(\${animated(layer,frame,"scale")||1})\`;
      const base={position:"absolute",left:0,top:0,width:layer.width,height:layer.height,transform,transformOrigin:"top left",opacity,zIndex:layer.zIndex};
      if(layer.type==="video")return <div key={layer.id} style={{...base,overflow:"hidden"}}><OffthreadVideo src={urlFor(layer.src)} muted loop={layer.loop} style={{width:"100%",height:"100%",objectFit:"cover"}} /></div>;
      if(layer.type==="image")return <Img key={layer.id} src={urlFor(layer.src)} style={{...base,objectFit:"contain"}}/>;
      if(layer.type==="text")return <div key={layer.id} style={{...base,color:layer.color||"white",fontFamily:"Arial,sans-serif",fontWeight:layer.fontWeight||700,fontSize:layer.fontSize||48,letterSpacing:"-1px",whiteSpace:"pre-line",lineHeight:1.1,textShadow:"0 5px 28px #000c",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>{String(layer.text||"").replaceAll("\\n","\n")}</div>;
      if(layer.type==="shape")return <div key={layer.id} style={{...base,background:layer.color||"#845dff",borderRadius:layer.borderRadius||0}}/>;
      return null;
    })}
  </AbsoluteFill>;
};
