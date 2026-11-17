import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeEditorProject, saveEditorProject } from "../src/editor-studio-core.mjs";
import { readEditorPreviewReview, saveEditorPreviewReview,
  requireApprovedEditorPreview, validateEditorPreviewReview, editorReviewGateEnabled
} from "../src/editor-review-gate.mjs";

const before=process.env.MEDIAFORGE_DATA_DIR;
const dir=await mkdtemp(join(tmpdir(),"mediaforge-preview-gate-"));
process.env.MEDIAFORGE_DATA_DIR=dir;
test.after(async()=>{
  if(before===undefined)delete process.env.MEDIAFORGE_DATA_DIR;
  else process.env.MEDIAFORGE_DATA_DIR=before;
  await rm(dir,{recursive:true,force:true});
});
const make=()=>makeEditorProject({idea:"Um filme motivacional com 3D, tipografia e camera suave.",duration_seconds:30,fps:30});
function checks(p){
  return p.scenes.map(s=>({
    scene_id:s.id,samples_seconds:[.15,Math.min(1.15,(s.endFrame-s.startFrame)/p.fps-.15)],
    preview_ready:true,text_legible:true,motion_ok:true,visual_ok:true,
    notes:"Observei os quadros iniciais e intermediarios na previa real desta cena."
  }));
}
test("temporary review gate is enabled unless legacy mode is explicit",()=>{
  const previous=process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW;
  delete process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW;
  assert.equal(editorReviewGateEnabled(),true);
  process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW="legacy";
  assert.equal(editorReviewGateEnabled(),false);
  if(previous===undefined)delete process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW;
  else process.env.MEDIAFORGE_EDITOR_REVIEW_FLOW=previous;
});
test("cannot render before reviewing and approving all actual scene previews",async()=>{
  const p=await saveEditorProject(make());
  const before=await readEditorPreviewReview(p);
  assert.equal(before.approved,false);
  await assert.rejects(()=>requireApprovedEditorPreview(p),e=>e.code==="PREVIEW_APPROVAL_REQUIRED"&&e.status===428);
  const partial={expected_revision:p.revision,decision:"pass",checks:checks(p).slice(0,1)};
  assert.throws(()=>validateEditorPreviewReview(p,partial),e=>e.code==="PREVIEW_NOT_APPROVED");
  const fail=await saveEditorPreviewReview(p,{expected_revision:p.revision,decision:"fail",
    checks:[{...checks(p)[0],visual_ok:false}],summary:"Primeira cena com problema visual."});
  assert.equal(fail.status,"rejected");
  await assert.rejects(()=>requireApprovedEditorPreview(p),e=>e.code==="PREVIEW_APPROVAL_REQUIRED");
  const done=await saveEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",
    checks:checks(p),summary:"Todas as cenas avaliadas em pelo menos dois instantes."});
  assert.equal(done.approved,true);
  assert.equal((await requireApprovedEditorPreview(p)).status,"approved");
});
test("editing invalidates previous preview approval automatically",async()=>{
  const p=await saveEditorProject(make());
  await saveEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",checks:checks(p)});
  const edited=await saveEditorProject({...p,scenes:p.scenes.map((s,i)=>i===0?{...s,headline:"Novo texto editado"}:s)},{
    expectedRevision:p.revision
  });
  const review=await readEditorPreviewReview(edited);
  assert.equal(review.status,"stale");
  assert.equal(review.approved,false);
  await assert.rejects(()=>requireApprovedEditorPreview(edited),e=>e.code==="PREVIEW_APPROVAL_REQUIRED");
  await assert.rejects(()=>saveEditorPreviewReview(edited,{expected_revision:p.revision,decision:"pass",checks:checks(edited)}),
    e=>e.code==="PREVIEW_REVISION_CONFLICT"&&e.status===409);
});
test("review requires two distinct times and explicit visual observations",()=>{
 const p=make();
 const one=checks(p);
 one[0].samples_seconds=[.4,.4];
 assert.throws(()=>validateEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",checks:one}),
   e=>e.code==="PREVIEW_SAMPLES_INVALID");
 const two=checks(p);
 two[0].notes="generic";
 assert.throws(()=>validateEditorPreviewReview(p,{expected_revision:p.revision,decision:"pass",checks:two}),
   e=>e.code==="PREVIEW_NOTES_INVALID");
});
