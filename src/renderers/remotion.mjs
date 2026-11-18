import {mkdir,readFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {bundle} from "@remotion/bundler";
import {selectComposition,renderMedia} from "@remotion/renderer";
import {validateLayerProject} from "../../remotion/project.mjs";
const projectsRoot=resolve(process.env.MEDIAFORGE_PROJECTS_DIR??".mediaforge/projects");
const outputRoot=resolve(process.env.MEDIAFORGE_OUTPUT_DIR??".mediaforge/outputs");
export async function renderWithRemotion(job) {
  // A trusted server-generated composition only. Never execute user-supplied JSX or code.
  const sourceDir=String(job.project.sourceDir||"");
  if(!/^[a-f0-9]{32}$/.test(sourceDir))throw Error("Invalid remotion project source");
  const root=join(projectsRoot,sourceDir);
  const project=validateLayerProject(JSON.parse(await readFile(join(root,"remotion/project.json"),"utf8")));
  await mkdir(outputRoot,{recursive:true});
  const serveUrl=await bundle({entryPoint:resolve("remotion/root.jsx"),publicDir:root,
    outDir:join(root,".remotion-bundle")});
  const composition=await selectComposition({serveUrl,id:"MediaForgeLayers",inputProps:{project}});
  const outputPath=join(outputRoot,job.id+".mp4");
  await renderMedia({serveUrl,composition,inputProps:{project},codec:"h264",outputLocation:outputPath,
    overwrite:true,crf:26,concurrency:2});
  return {outputPath,motionReview:{width:project.width,height:project.height,expectsAudio:false},
    diagnosticsDir:root,renderer:"remotion"};
}
