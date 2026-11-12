import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { buildMotionComposition } from "../src/motion/composer.mjs";
import { isSafeRelativePath } from "../src/job-schema.mjs";

// Builds files only. Submission/rendering remains an explicit separate operation.
const [planFile, outputDir, assetDir] = process.argv.slice(2);
if (!planFile || !outputDir) {
  console.error("Usage: node scripts/compose-motion.mjs plan.json output-dir [asset-root]");
  process.exitCode = 1;
} else {
  try {
    const plan = JSON.parse(await readFile(planFile,"utf8"));
    const sources = [...new Set([...plan.scenes.map(s=>s.media),...(plan.audioCues??[]).map(c=>c.src)].filter(Boolean))];
    const files=[];
    for(const path of sources) {
      if(!assetDir || !isSafeRelativePath(path) || !path.startsWith("assets/")) throw new Error("Provide asset-root for " + path);
      const root=resolve(assetDir), full=resolve(root,path), rel=relative(root,full);
      if(rel.startsWith("..") || isAbsolute(rel)) throw new Error("Unsafe asset path");
      files.push({path,contentBase64:(await readFile(full)).toString("base64")});
    }
    const result=await buildMotionComposition(plan,files);
    const root=resolve(outputDir);
    await mkdir(root,{recursive:true});
    for(const f of result.projectFiles) {
      const target=resolve(root,f.path);
      await mkdir(dirname(target),{recursive:true});
      await writeFile(target,f.content??Buffer.from(f.contentBase64,"base64"),{flag:"wx"});
    }
    const job={prompt:plan.title,project:result.project,projectFiles:result.projectFiles,metadata:result.metadata};
    await writeFile(resolve(root,"mediaforge-job.json"),JSON.stringify(job,null,2),{flag:"wx"});
    await writeFile(resolve(root,"REVIEW.md"),`# ${plan.title}\n\nVisual review: PENDING. This is a composition, not an approved video.\n\n- Check first and last frame, every transition, reading time at phone size.\n- Check widget state, supplied imagery, voice alignment and audio tail.\n- Record reviewer, render hash and observations after watching the MP4.\n\n${result.readiness.warnings.map(w=>"- "+w).join("\n")}\n`,{flag:"wx"});
    console.log(JSON.stringify({outputDir:root,files:result.projectFiles.length,readiness:result.readiness},null,2));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
