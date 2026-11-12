import { readFile } from "node:fs/promises";

const THREE_RELEASE = "0.180.0";
const MAX_GLB_BYTES = 8 * 1024 * 1024;
const THREE_FILES = [
  ["assets/three/build/three.core.js", "../node_modules/three/build/three.core.js"],
  ["assets/three/build/three.module.js", "../node_modules/three/build/three.module.js"],
  ["assets/three/examples/jsm/loaders/GLTFLoader.js", "../node_modules/three/examples/jsm/loaders/GLTFLoader.js"],
  ["assets/three/examples/jsm/utils/BufferGeometryUtils.js", "../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js"],
  ["assets/three/LICENSE", "../node_modules/three/LICENSE"]
];

function requiredText(value, name, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(name + " must be a non-empty string of at most " + max + " characters");
  }
  return value.trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function validateGlb(encoded) {
  if (encoded == null) return null;
  if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_GLB_BYTES / 3) * 4 + 4
      || encoded.length < 32 || encoded.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new TypeError("Modelo GLB inválido ou acima de 8 MB");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_GLB_BYTES || bytes.length < 32
      || bytes.toString("base64") !== encoded
      || bytes.toString("ascii", 0, 4) !== "glTF"
      || bytes.readUInt32LE(4) !== 2
      || bytes.readUInt32LE(8) !== bytes.length
      || bytes.toString("ascii", 16, 20) !== "JSON") {
    throw new TypeError("O arquivo deve ser GLB 2.0 íntegro, sem compressão externa");
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength <= 0 || 20 + jsonLength > bytes.length) {
    throw new TypeError("GLB com bloco JSON inválido");
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength)); }
  catch { throw new TypeError("GLB contém JSON inválido"); }
  if (manifest.asset?.version !== "2.0") throw new TypeError("Apenas glTF 2.0 é suportado");
  if ((manifest.extensionsRequired ?? []).length) {
    throw new TypeError("GLB com extensões obrigatórias não suportadas nesta versão (sem Draco/Meshopt)");
  }
  // Keep every reference inside the supplied self-contained GLB. The renderer
  // must not attempt to fetch remote textures, scripts, or model dependencies.
  for (const item of [...(manifest.buffers ?? []), ...(manifest.images ?? [])]) {
    if (typeof item.uri === "string") {
      throw new TypeError("GLB precisa conter todas as texturas e buffers incorporados");
    }
  }
  return encoded;
}

const INDEX_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MediaForge — Cinematic 3D</title>
  <style>
    html,body { margin:0; width:100%; height:100%; overflow:hidden; background:#080d16; }
    #root { position:absolute; inset:0; overflow:hidden; background:#080d16;
      font-family:Inter,Arial,sans-serif; color:#f6f8fb; }
    #studio-canvas { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .shade { position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(180deg,rgba(2,8,14,.45),transparent 33%,transparent 62%,rgba(2,8,14,.78)); }
    .overline { position:absolute; left:9%; top:10%; font-size:2.2vw; font-weight:800;
      letter-spacing:.21em; color:var(--accent); text-transform:uppercase; }
    .headline { position:absolute; left:9%; width:82%; top:18%; font-size:8vw;
      line-height:1.04; letter-spacing:-.062em; font-weight:900; text-wrap:balance;
      text-shadow:0 12px 40px #0008; }
    #hero-headline-inner { display:block; }
    .subline { position:absolute; left:9%; width:74%; bottom:18%; font-size:3.3vw;
      line-height:1.24; font-weight:500; color:#e1ebed; text-shadow:0 9px 25px #000b; }
    .rule { position:absolute;left:9%;right:9%;bottom:15%;height:2px;background:var(--accent);opacity:.5; }
    .mark { position:absolute;left:9%;bottom:11%;font-size:1.65vw;letter-spacing:.22em;
      font-weight:900;color:var(--accent); }
  </style>
  <script type="importmap">{"imports":{"three":"./assets/three/build/three.module.js"}}</script>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="__DURATION__"
       data-width="__WIDTH__" data-height="__HEIGHT__" data-motion-blur="on"
       data-motion-blur-shutter="180" data-motion-blur-events="on"
       style="--accent:__ACCENT__">
    <canvas id="studio-canvas" class="clip" data-start="0"
            data-duration="__DURATION__" data-track-index="1" aria-label="Animação 3D"></canvas>
    <div class="shade" data-layout-ignore></div>
    <div class="overline clip" data-start="0" data-duration="__DURATION__" data-track-index="2"
         data-motion-blur="off">MEDIAFORGE / CINEMATIC 3D</div>
    <h1 class="headline clip" data-start="0" data-duration="__DURATION__" data-track-index="3"
        data-motion-blur="off"><span id="hero-headline-inner">__HEADLINE__</span></h1>
    <div class="subline clip" data-start="0" data-duration="__DURATION__" data-track-index="4"
         data-motion-blur="off"><span id="hero-subtitle-inner">__SUBTITLE__</span></div>
    <div class="rule" data-layout-ignore></div>
    <div class="mark">DEPTH · LIGHT · MOTION</div>
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const timeline = gsap.timeline({ paused: true });
    timeline.fromTo("#hero-headline-inner", { opacity:1, y:0 },
      { opacity:1, y:-16, duration:.8, ease:"power2.out" }, 0);
    timeline.fromTo("#hero-subtitle-inner", { opacity:0, y:30 },
      { opacity:1, y:0, duration:.6, ease:"power3.out" }, .8);
    window.__timelines["main"] = timeline;
  </script>
  <script type="module" src="assets/scene.mjs"></script>
</body>
</html>`;

const SCENE_JS = `import * as THREE from "./three/build/three.module.js";
import { GLTFLoader } from "./three/examples/jsm/loaders/GLTFLoader.js";

// Seekable cinematic 3D: no timer, autoplay, random values or RAF loop.
// Each frame is a pure function of the HyperFrames timeline timestamp.
const W = __WIDTH__, H = __HEIGHT__, D = __DURATION__;
const CANVAS = document.getElementById("studio-canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#080d16");
scene.fog = new THREE.Fog("#080d16", 8, 23);
const camera = new THREE.PerspectiveCamera(37, W/H, .1, 100);
const renderer = new THREE.WebGLRenderer({
  canvas:CANVAS, antialias:true, alpha:false, preserveDrawingBuffer:true,
  powerPreference:"high-performance"
});
renderer.setPixelRatio(1);
renderer.setSize(W,H,false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const accent = new THREE.Color("__ACCENT__");
const hero = new THREE.Group();
scene.add(hero);

const metal = new THREE.MeshPhysicalMaterial({
 color:0xb6c6d3, metalness:.83, roughness:.30, clearcoat:.7, clearcoatRoughness:.22
});
const gold = new THREE.MeshPhysicalMaterial({
 color:accent, metalness:.70, roughness:.31, clearcoat:.65
});
const dark = new THREE.MeshStandardMaterial({color:0x121b28,metalness:.45,roughness:.62});
const shape = "__SHAPE__";
const model = "__HAS_MODEL__" === "true";
if (!model) {
 let geometry;
 if (shape === "sphere") geometry = new THREE.IcosahedronGeometry(1.52, 5);
 else if (shape === "cube") geometry = new THREE.BoxGeometry(2.25, 2.25, 2.25, 3, 3, 3);
 else if (shape === "torus") geometry = new THREE.TorusGeometry(1.25,.42,28,160);
 else geometry = new THREE.TorusKnotGeometry(1.1,.33,240,24,2,3);
 const mesh = new THREE.Mesh(geometry,metal);
 mesh.castShadow = true;
 mesh.receiveShadow = true;
 hero.add(mesh);
}
const orbit = new THREE.Group();
scene.add(orbit);
const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.25,.026,8,180),gold);
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.62,.015,8,180),metal);
ring1.rotation.x = .35; ring1.rotation.y = .25;
ring2.rotation.x = -.55; ring2.rotation.y = .55;
orbit.add(ring1,ring2);
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.72,1.84,.22,72),dark);
pedestal.position.y = -2.05;
pedestal.receiveShadow = true;
scene.add(pedestal);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({color:0x0c1620,metalness:.13,roughness:.68}));
ground.rotation.x=-Math.PI/2; ground.position.y=-2.25;
ground.receiveShadow=true;scene.add(ground);
scene.add(new THREE.AmbientLight(0x7b9eaf,.46));
const key = new THREE.DirectionalLight(0xffe0b5,3.9);
key.position.set(-3.8,5.6,6); key.castShadow=true;
key.shadow.mapSize.set(1024,1024);
key.shadow.camera.left=-5;key.shadow.camera.right=5;
key.shadow.camera.top=5;key.shadow.camera.bottom=-5;
key.shadow.bias=-.0008;scene.add(key);
const rim = new THREE.DirectionalLight(0x5dabff,3.6);
rim.position.set(4.3,2.7,-4);scene.add(rim);
const accentLight=new THREE.PointLight(accent,45,9,2);
accentLight.position.set(2,1.6,2.2);scene.add(accentLight);

function clamp01(x){return Math.max(0,Math.min(1,x));}
function smoother(x){x=clamp01(x);return x*x*x*(x*(x*6-15)+10);}
function draw(t){
  t=Math.max(0,Math.min(D,Number.isFinite(t)?t:0));
  const p=t/D, glide=smoother(p);
  // Camera: deliberately slow acceleration, clean deceleration, spatial parallax.
  const mode="__CAMERA__";
  const yaw= mode==="orbit" ? -.42+.80*glide : mode==="reveal" ? -.22+.47*glide : -.13+.24*glide;
  const distance=mode==="dolly" ? 9.3-2.4*glide : mode==="reveal" ? 6.8+1.45*glide : 7.8-.65*glide;
  camera.position.set(Math.sin(yaw)*distance, .35+Math.sin(p*Math.PI)*.16,
                      Math.cos(yaw)*distance);
  camera.lookAt(0,.05,0);
  hero.rotation.set(.08*Math.sin(p*Math.PI*1.5),p*Math.PI*2.0, .08*Math.sin(p*Math.PI));
  orbit.rotation.set(.15*Math.sin(p*Math.PI),p*Math.PI*.78,0);
  key.position.x=-3.8+2.4*glide; rim.intensity=3.0+.5*Math.sin(p*Math.PI);
  renderer.render(scene,camera);
}
async function loadModel(){
 if (!model) return;
 const url="./assets/hero.glb";
 const response=await fetch(url);
 if (!response.ok) throw new Error("Missing embedded hero model");
 const buffer=await response.arrayBuffer();
 const gltf=await new Promise((resolve,reject)=>{
   const loader=new GLTFLoader();
   loader.parse(buffer,"",resolve,reject);
 });
 const object=gltf.scene;
 const box=new THREE.Box3().setFromObject(object);
 const size=box.getSize(new THREE.Vector3());
 if (!Number.isFinite(size.length()) || size.length()===0)throw new Error("GLB without a visible model");
 const center=box.getCenter(new THREE.Vector3());
 object.position.sub(center);
 const scale=2.8/Math.max(size.x,size.y,size.z);
 const normalized=new THREE.Group();
 normalized.add(object); normalized.scale.setScalar(scale);
 object.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
 hero.add(normalized);
}
async function initialize(){
 await loadModel();
 await renderer.compileAsync(scene,camera);
 draw(0);
}
window.__hf=window.__hf||{};
window.__hf.buildReady=window.__hf.buildReady||{};
const ready=initialize();
window.__hf.buildReady["mediaforge-cinematic-3d"]=ready;
let queue=ready.then(()=>undefined);
window.addEventListener("hf-seek", event=>{
 const t=Number(event.detail.time??0);
 queue=queue.then(()=>draw(t));
 event.detail.waitUntil(queue);
});`;

export async function buildCinematic3dProject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Configuração 3D inválida");
  const title=requiredText(input.title,"title");
  const headline=requiredText(input.headline || title,"headline",120);
  const subtitle=requiredText(input.subtitle || "Luz, profundidade e movimento cinematográfico.","subtitle",180);
  const seconds=Number(input.duration_seconds ?? 10);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 30) throw new TypeError("duration_seconds: escolha de 10 a 30");
  const ratio=input.aspect_ratio ?? "9:16";
  if (!["9:16","16:9","1:1"].includes(ratio)) throw new TypeError("aspect_ratio inválido");
  const dimensions=ratio==="9:16" ? [2160,3840] : ratio==="16:9" ? [3840,2160] : [2160,2160];
  const accent=String(input.accent_color ?? "#a9edcf");
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw new TypeError("accent_color deve ser hexadecimal #RRGGBB");
  const shape=String(input.shape ?? "torus-knot");
  if (!["torus-knot","sphere","cube","torus"].includes(shape)) throw new TypeError("shape inválido");
  const camera=String(input.camera ?? "dolly");
  if (!["dolly","orbit","reveal"].includes(camera)) throw new TypeError("camera inválida");
  const model=validateGlb(input.model_glb_base64);

  const replacements={
    "__WIDTH__":String(dimensions[0]), "__HEIGHT__":String(dimensions[1]),
    "__DURATION__":String(seconds),"__ACCENT__":accent,
    "__SHAPE__":shape,"__CAMERA__":camera,"__HAS_MODEL__":String(Boolean(model))
  };
  const patch=source=>Object.entries(replacements).reduce((s,[key,value])=>s.replaceAll(key,value),source);
  const index=patch(INDEX_HTML).replace("__HEADLINE__",escapeHtml(headline))
    .replace("__SUBTITLE__",escapeHtml(subtitle));
  const scene=patch(SCENE_JS);
  const sources=await Promise.all(THREE_FILES.map(async ([path,file])=>({
    path,content:await readFile(new URL(file,import.meta.url),"utf8"),encoding:"utf8"
  })));
  const gsap=await readFile(new URL("../assets/gsap.min.js",import.meta.url),"utf8");
  const files=[
    {path:"index.html",content:index,encoding:"utf8"},
    {path:"assets/scene.mjs",content:scene,encoding:"utf8"},
    {path:"assets/gsap.min.js",content:gsap,encoding:"utf8"},
    ...sources
  ];
  if (model) files.push({path:"assets/hero.glb",content:model,encoding:"base64"});
  return {
    title,
    durationSeconds:seconds,
    aspectRatio:ratio,
    resolution:ratio==="9:16" ? "portrait-4k" : ratio==="16:9" ? "landscape-4k" : "square-4k",
    fps:60,
    projectFiles:files,
    productionMetadata:{kind:"cinematic-3d",version:1,shape:model?"glb":shape,camera,accent,threeVersion:THREE_RELEASE,
      motionBlur:{enabled:true,shutterAngle:180},artisticQA:"pending-user-review"}
  };
}
