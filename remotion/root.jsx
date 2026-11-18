import React from "react";
import {Composition,registerRoot} from "remotion";
import {LayeredComposition} from "./composition.jsx";
import {demoProject,validateLayerProject} from "./project.mjs";
const Root=()=> <Composition id="MediaForgeLayers" component={LayeredComposition}
  width={demoProject.width} height={demoProject.height} fps={demoProject.fps}
  durationInFrames={demoProject.durationInFrames} defaultProps={{project:demoProject}}
  calculateMetadata={({props})=>{
    const p=validateLayerProject(props.project);
    return {width:p.width,height:p.height,fps:p.fps,durationInFrames:p.durationInFrames};
  }} />;
registerRoot(Root);
