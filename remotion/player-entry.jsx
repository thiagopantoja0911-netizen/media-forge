import React from "react";
import {createRoot} from "react-dom/client";
import {Player} from "@remotion/player";
import {LayeredComposition} from "./composition.jsx";
import {validateLayerProject} from "./project.mjs";
const target=document.getElementById("remotion-player-root");
const status=document.getElementById("remotion-status");
fetch("/api/editor/remotion/demo",{credentials:"same-origin",cache:"no-store"})
 .then(async response=>{if(!response.ok)throw Error("HTTP "+response.status);return response.json();})
 .then(({project})=>{
   const p=validateLayerProject(project);
   createRoot(target).render(<Player component={LayeredComposition}
     inputProps={{project:p}} durationInFrames={p.durationInFrames}
     compositionWidth={p.width} compositionHeight={p.height} fps={p.fps}
     controls autoPlay={false} style={{width:"100%",aspectRatio:p.width+"/"+p.height}} />);
   status.textContent="Remotion Player · "+p.layers.length+" camadas · "+(p.durationInFrames/p.fps)+"s";
 }).catch(e=>{status.textContent="Prévia Remotion indisponível: "+e.message;});
