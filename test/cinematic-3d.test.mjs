import test from "node:test";
import assert from "node:assert/strict";
import { buildCinematic3dProject } from "../src/cinematic-3d.mjs";
import { validateProjectFiles } from "../src/job-schema.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

function asBackendFiles(files) {
  return files.map(f=>f.encoding==="base64"
    ? {path:f.path,contentBase64:f.content}
    : {path:f.path,content:f.content});
}

test("cinematic 3D exports a complete, locally bundled Three.js HyperFrames project",async()=>{
  const project=await buildCinematic3dProject({
    title:"Teste de profundidade real",headline:"UM NOVO ÂNGULO",
    subtitle:"Luz e movimento",duration_seconds:12,aspect_ratio:"9:16",
    shape:"torus-knot",accent_color:"#a9edcf",camera:"dolly"
  });
  assert.equal(project.title,"Teste de profundidade real");
  assert.equal(project.durationSeconds,12);
  assert.equal(project.resolution,"portrait-4k");
  assert.equal(project.fps,60);
  assert.equal(project.productionMetadata.artisticQA,"pending-user-review");
  const files=new Map(project.projectFiles.map(f=>[f.path,f.content]));
  assert.equal(files.size,8);
  const index=files.get("index.html");
  assert.match(index,/data-width="2160" data-height="3840"/);
  assert.match(index,/data-motion-blur="on"/);
  assert.match(index,/data-motion-blur-shutter="180"/);
  assert.match(index,/data-duration="12"/);
  assert.match(index,/__timelines\["main"\] = timeline/);
  assert.match(index,/UM NOVO ÂNGULO/);
  assert.ok(index.indexOf('window.__timelines["main"] = timeline')>index.indexOf("timeline.fromTo"));
  const scene=files.get("assets/scene.mjs");
  assert.match(scene,/import \* as THREE/);
  assert.match(scene,/new THREE\.WebGLRenderer/);
  assert.match(scene,/THREE\.ACESFilmicToneMapping/);
  assert.match(scene,/new THREE\.PerspectiveCamera/);
  assert.match(scene,/window\.addEventListener\("hf-seek"/);
  assert.match(scene,/\.waitUntil\(queue\)/);
  assert.match(scene,/buildReady\["mediaforge-cinematic-3d"\]=ready/);
  assert.doesNotMatch(scene,/requestAnimationFrame|setInterval|Date\.now|Math\.random|https?:\/\//);
  assert.match(files.get("assets/three/build/three.module.js"),/from '\.\/three\.core\.js'/);
  assert.ok(files.get("assets/three/build/three.core.js").length>1_000_000);
  assert.ok(files.get("assets/three/examples/jsm/loaders/GLTFLoader.js").length>50_000);
  assert.match(files.get("assets/three/LICENSE"),/MIT License/);
  const validation=validateProjectFiles(asBackendFiles(project.projectFiles));
  assert.equal(validation.ok,true,validation.errors.join("; "));
  assert.ok(validation.bytes<24*1024*1024);
});

test("cinematic options validate input before loading or queueing",async()=>{
  const base={title:"Valid",duration_seconds:10};
  for(const invalid of [
    {duration_seconds:9},{duration_seconds:31},{shape:"unsafe"},
    {camera:"unsafe"},{aspect_ratio:"3:2"},{accent_color:"url(https://example.com)"},
    {headline:"X".repeat(122)},{model_glb_base64:"notbase64"}
  ]){
    await assert.rejects(()=>buildCinematic3dProject({...base,...invalid}));
  }
  const escaped=await buildCinematic3dProject({...base,headline:'<script>alert("X")</script>'});
  const html=escaped.projectFiles.find(f=>f.path==="index.html").content;
  assert.doesNotMatch(html,/<script>alert/);
  assert.match(html,/&lt;script&gt;/);
});

test("GLB input must be self-contained glTF 2.0",async()=>{
  function glb(manifest){
    const json=Buffer.from(JSON.stringify(manifest));
    const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);
    json.copy(padded);
    const out=Buffer.alloc(20+padded.length);
    out.write("glTF",0);out.writeUInt32LE(2,4);
    out.writeUInt32LE(out.length,8);
    out.writeUInt32LE(padded.length,12);
    out.write("JSON",16);padded.copy(out,20);
    return out.toString("base64");
  }
  const base={title:"Modelo",duration_seconds:10};
  const external=glb({asset:{version:"2.0"},buffers:[{uri:"https://evil.example/scene.bin",byteLength:8}]});
  await assert.rejects(()=>buildCinematic3dProject({...base,model_glb_base64:external}),/incorporados/);
  const compressed=glb({asset:{version:"2.0"},extensionsRequired:["KHR_draco_mesh_compression"]});
  await assert.rejects(()=>buildCinematic3dProject({...base,model_glb_base64:compressed}),/extensões/);
  const embedded=glb({asset:{version:"2.0"},scenes:[{nodes:[]}],scene:0});
  const result=await buildCinematic3dProject({...base,model_glb_base64:embedded});
  assert.equal(result.projectFiles.find(f=>f.path==="assets/hero.glb").content,embedded);
  assert.equal(result.productionMetadata.shape,"glb");
});

test("MCP advertises cinematic 3D creator alongside existing tools",()=>{
  const names=VIDEOS_SECRETS_TOOLS.map(tool=>tool.name);
  assert.ok(names.includes("create_video"));
  assert.ok(names.includes("renderer_status"));
  assert.ok(names.includes("list_videos"));
  assert.ok(names.includes("get_video"));
  const cinematic=VIDEOS_SECRETS_TOOLS.find(tool=>tool.name==="create_cinematic_3d");
  assert.ok(cinematic);
  assert.ok(cinematic.inputSchema.required.includes("title"));
  assert.ok(cinematic.inputSchema.properties.model_glb_base64);
});
