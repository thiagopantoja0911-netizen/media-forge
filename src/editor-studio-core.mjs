import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getEditorStylePreset, applyEditorStylePreset } from "./editor-style-presets.mjs";
import { validateSceneTypography } from "./editor-typography.mjs";
import { validateMotionV2 } from "./editor-motion-v2.mjs";
import { validateEditorTimeline } from "./editor-timeline.mjs";

const TITLE_MAX=100, MAX_AUDIO=10, MAX_SCENES=12, MAX_VISUAL_ASSETS=8;
export const EDITOR_VISUAL_TYPES=["screen","card-grid"];
export const EDITOR_ASSET_EXTENSIONS=["png","webp","svg"];
export const EDITOR_SHAPES=["torus-knot","icosahedron","sphere","torus","cube","cone","rings"];
export const EDITOR_CAMERAS=["orbit","dolly","reveal","truck-left","truck-right","arc"];
export const EDITOR_TRANSITIONS=["cut","match-cut","push","iris","whip","dip"];
const ALLOWED_RATIOS=["9:16","16:9","1:1"];
const AUDIO_ROLES=["voice","music","sfx"];
const FILE_ID=/^[a-f0-9]{32}$/;
const compact=(v,n=120)=>String(v??"").trim().replace(/[\u0000-\u001f]/g," ").slice(0,n);
const failure=(code,message,status=422)=>Object.assign(new Error(message),{code,status});
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const number=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
const rgb=v=>typeof v==="string"&&/^#[a-fA-F0-9]{6}$/.test(v);
const finish=(v,decimals=2)=>Number(v.toFixed(decimals));
function normalizeConcept(input){
  const idea=compact(input.idea,400);
  if(idea.length<8)throw failure("IDEA_REQUIRED","Escreva a ideia com ao menos 8 caracteres.");
  return idea;
}
export function makeEditorProject(input={}){
  const idea=normalizeConcept(input);
  const brand=compact(input.brand||"MediaForge",80);
  const title=compact(input.title||idea.slice(0,80),TITLE_MAX);
  const fps=([30,60].includes(input.fps)?input.fps:30);
  const duration=integer(input.duration_seconds,10,60)?input.duration_seconds:30;
  const aspectRatio=ALLOWED_RATIOS.includes(input.aspect_ratio)?input.aspect_ratio:"9:16";
  const concept=idea.replace(/[.!?]+$/,"");
  const preferred=Array.isArray(input.scenes)&&input.scenes.length>=3&&input.scenes.length<=MAX_SCENES?input.scenes:null;
  const defaults=[
    {kicker:"A IDEIA",headline:concept.slice(0,72),detail:"Uma nova maneira de olhar o assunto.",shape:"torus-knot",camera:"reveal"},
    {kicker:"O DESAFIO",headline:"O que está impedindo o próximo passo?",detail:brand+" apresenta o problema com clareza.",shape:"icosahedron",camera:"orbit"},
    {kicker:"O INSIGHT",headline:"Existe uma maneira melhor.",detail:concept.slice(0,95),shape:"sphere",camera:"dolly"},
    {kicker:"O MECANISMO",headline:"Veja como a mudança acontece.",detail:"Da ideia à demonstração em movimento.",shape:"rings",camera:"arc"},
    {kicker:"NA PRÁTICA",headline:"Menos explicação. Mais ação.",detail:"Mostre o processo, não apenas o resultado.",shape:"cube",camera:"truck-left"},
    {kicker:"A TRANSFORMAÇÃO",headline:"Cada detalhe faz diferença.",detail:"Evolução visual, ritmo e profundidade.",shape:"torus",camera:"orbit"},
    {kicker:"PRÓXIMO PASSO",headline:"Transforme a ideia em movimento.",detail:brand+" · explore o próximo passo.",shape:"cone",camera:"dolly"}
  ];
  const shots=preferred??defaults;
  const weights=shots.map((s,i)=>Math.max(1,Number(s.weight)||Number(s.duration_seconds)|| (i===0||i===shots.length-1?3.2:4.4)));
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  const totalFrames=duration*fps;
  const scenes=[];
  let cursor=0;
  for(let i=0;i<shots.length;i++){
    const src=shots[i];
    const allot=i===shots.length-1?totalFrames-cursor:Math.max(fps,Math.round(totalFrames*weights[i]/totalWeight));
    const remaining=shots.length-i-1;
    const end=i===shots.length-1?totalFrames:Math.min(totalFrames-remaining*fps,cursor+allot);
    const rawColor=src.accent??(["#fb3569","#85ddf9","#eab96e","#b1f28e","#9f89fc","#ffad77","#e9e9e9"][i%7]);
    scenes.push({
      id:"scene-"+(i+1),
      startFrame:cursor,endFrame:end,
      kicker:compact(src.kicker??src.label??defaults[i%defaults.length].kicker,45),
      headline:compact(src.headline??src.text??defaults[i%defaults.length].headline,96),
      detail:compact(src.detail??src.subtitle??defaults[i%defaults.length].detail,150),
      shape:EDITOR_SHAPES.includes(src.shape)?src.shape:defaults[i%defaults.length].shape,
      camera:EDITOR_CAMERAS.includes(src.camera)?src.camera:defaults[i%defaults.length].camera,
      transition:EDITOR_TRANSITIONS.includes(src.transition)?src.transition:i===0?"cut":["whip","match-cut","push","iris","match-cut","dip"][i%6],
      accent:rgb(rawColor)?rawColor:"#ffffff",
      energy:number(src.energy,0,1)?src.energy:.72,
      depth:number(src.depth,0,1)?src.depth:.85,
      depthOfField:number(src.depthOfField,0,1)?src.depthOfField:0,
      textScale:number(src.textScale,.5,1.5)?src.textScale:1,
      ...(src.glow?{glow:src.glow}:{}),
      ...(src.visual?{visual:src.visual}:{}),
      ...(src.motionBlur!==undefined?{motionBlur:src.motionBlur}:{}),
      ...(src.typography!==undefined?{typography:src.typography}:{})
    });
    cursor=end;
  }
  const project={version:1,id:randomUUID().replaceAll("-",""),revision:0,brand,title,idea,
    fps,aspectRatio,totalFrames,
    mode:"cinematic-3d",preset:compact(input.preset||"cinematic-3d-editor-v1",80),
    scenes,audio:[],assets:[],layerAssets:[],layers:[],captions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const prepared=input.style_preset?applyEditorStylePreset(project,input.style_preset):project;
  validateEditorProject(prepared);
  return prepared;
}
export function validateEditorProject(p){
  if(!p||typeof p!=="object"||Array.isArray(p))throw failure("PROJECT_INVALID","Projeto inválido.");
  if(!FILE_ID.test(p.id))throw failure("PROJECT_ID_INVALID","Identificador inválido.");
  if(!integer(p.version,1,1)||!integer(p.revision,0,1e7))throw failure("PROJECT_REVISION_INVALID","Revisão inválida.");
  if(typeof p.title!=="string"||!p.title.trim()||p.title.length>TITLE_MAX||typeof p.idea!=="string"||p.idea.length>400||p.idea.length<8)
    throw failure("PROJECT_TITLE_INVALID","Título ou ideia inválidos.");
  if(typeof p.brand!=="string"||p.brand.length>80)throw failure("PROJECT_BRAND_INVALID","Marca inválida.");
  if(![30,60].includes(p.fps)||!ALLOWED_RATIOS.includes(p.aspectRatio)||!integer(p.totalFrames,p.fps*10,p.fps*60))
    throw failure("PROJECT_FORMAT_INVALID","FPS, proporção ou duração não suportados.");
  if(p.mode!=="cinematic-3d")throw failure("PROJECT_MODE_INVALID","Somente cinematic-3d é suportado nesta versão.");
  if(p.stylePreset!==undefined)getEditorStylePreset(p.stylePreset);
  if(p.assets!==undefined&&(!Array.isArray(p.assets)||p.assets.length>MAX_VISUAL_ASSETS))
    throw failure("VISUAL_ASSETS_INVALID","Máximo de oito assets visuais.");
  const assetIds=new Set();let assetBytes=0;
  for(const a of p.assets??[]){
    if(!a||!FILE_ID.test(a.id)||assetIds.has(a.id)||!EDITOR_ASSET_EXTENSIONS.includes(a.extension)||
      typeof a.name!=="string"||!a.name.trim()||a.name.length>90||
      !integer(a.size,32,2*1024*1024)||!["image/png","image/webp","image/svg+xml"].includes(a.mime))
      throw failure("VISUAL_ASSET_INVALID","Asset visual inválido.");
    assetIds.add(a.id);assetBytes+=a.size;
  }
  if(assetBytes>8*1024*1024)throw failure("VISUAL_ASSETS_TOO_LARGE","Assets visuais ultrapassam 8 MB.");
  if(!Array.isArray(p.scenes)||p.scenes.length<3||p.scenes.length>MAX_SCENES)throw failure("SCENES_INVALID","O projeto precisa de 3 a 12 cenas.");
  let cursor=0; const names=new Set();
  for(const [i,s] of p.scenes.entries()){
    if(!s||!/^scene-[1-9][0-9]?$/.test(s.id)||names.has(s.id))throw failure("SCENE_ID_INVALID","ID de cena duplicado ou inválido.");
    names.add(s.id);
    if(!integer(s.startFrame,0,p.totalFrames)||!integer(s.endFrame,1,p.totalFrames)||
       s.startFrame!==cursor||s.endFrame-s.startFrame<p.fps)
       throw failure("SCENE_TIMING_INVALID","As cenas precisam ser contíguas e ter pelo menos um segundo.");
    cursor=s.endFrame;
    for(const [key,lim] of [["kicker",45],["headline",96],["detail",150]])
      if(typeof s[key]!=="string"||s[key].length>lim||(key==="headline"&&!s[key].trim()))
        throw failure("SCENE_TEXT_INVALID","Texto inválido na cena "+(i+1)+": "+key);
    if(!EDITOR_SHAPES.includes(s.shape)||!EDITOR_CAMERAS.includes(s.camera)||!EDITOR_TRANSITIONS.includes(s.transition)||
       !rgb(s.accent)||!number(s.energy,0,1)||!number(s.depth,0,1)||!number(s.textScale,.5,1.5))
      throw failure("SCENE_STYLE_INVALID","Estilo 3D inválido na cena "+(i+1));
    if(s.glow!==undefined){
      const g=s.glow;
      if(!g||typeof g!=="object"||!rgb(g.color)||!number(g.intensity,0,1)||
        !number(g.speed,0,3)||!number(g.x,-1,1)||!number(g.y,-1,1))
        throw failure("SCENE_GLOW_INVALID","Configuração de glow inválida na cena "+(i+1));
    }
    if(s.motionBlur!==undefined&&!number(s.motionBlur,0,1))
      throw failure("SCENE_MOTION_BLUR_INVALID","Motion blur fora do intervalo 0–1.");
    if(s.depthOfField!==undefined&&!number(s.depthOfField,0,1))
      throw failure("SCENE_DOF_INVALID","Depth of Field fora do intervalo 0–1.");
    if(s.typography!==undefined&&!validateSceneTypography(s.typography))
      throw failure("SCENE_TYPOGRAPHY_INVALID","Tipografia inválida: use família segura, modo, pesos 100–900, bloom e stagger 0–1.");
    if(s.visual!==undefined){
      const v=s.visual;
      if(v?.assetIds!==undefined&&(!Array.isArray(v.assetIds)||!v.assetIds.length||v.assetIds.length>12||v.assetIds.some(id=>!assetIds.has(id))))
        throw failure("SCENE_VISUAL_ASSETS_INVALID","Grid contém imagens não importadas.");
      if(!v||!EDITOR_VISUAL_TYPES.includes(v.type)||!assetIds.has(v.assetId)||
        !Array.isArray(v.position)||v.position.length!==3||!v.position.every(n=>number(n,-8,8))||
        !Array.isArray(v.rotation)||v.rotation.length!==3||!v.rotation.every(n=>number(n,-180,180))||
        !number(v.scale,.2,4)||!number(v.depth,0,1)||
        (v.type==="card-grid"&&(!integer(v.columns,1,4)||!integer(v.rows,1,4)||v.columns*v.rows>12||!number(v.scroll,-2,2))))
        throw failure("SCENE_VISUAL_INVALID","Asset, mockup ou grid inválido na cena "+(i+1));
    }
  }
  if(cursor!==p.totalFrames)throw failure("SCENES_GAP","A timeline não termina no último frame.");
  if(p.layerAssets!==undefined&&(!Array.isArray(p.layerAssets)||p.layerAssets.length>8))throw failure("EDITOR_LAYER_ASSETS_INVALID","Máximo de oito vídeos importados.");
  const videoIds=new Set();let videoBytes=0;
  for(const asset of p.layerAssets??[]){
    if(!asset||!FILE_ID.test(asset.id)||videoIds.has(asset.id)||!["mp4","webm"].includes(asset.extension)||
      typeof asset.name!=="string"||!asset.name.trim()||asset.name.length>90||
      !integer(asset.size,64,16*1024*1024)||!["video/mp4","video/webm"].includes(asset.mime))
      throw failure("EDITOR_LAYER_ASSET_INVALID","Asset de vídeo inválido.");
    videoIds.add(asset.id);videoBytes+=asset.size;
  }
  if(videoBytes>48*1024*1024)throw failure("EDITOR_LAYER_ASSETS_TOO_LARGE","Vídeos importados ultrapassam 48 MB.");
  if(!Array.isArray(p.audio)||p.audio.length>MAX_AUDIO)throw failure("AUDIO_INVALID","Máximo de dez faixas de áudio.");
  const audioNames=new Set();
  for(const a of p.audio){
    if(!a||!FILE_ID.test(a.id)||audioNames.has(a.id)||!AUDIO_ROLES.includes(a.role)||!FILE_ID.test(a.assetId)||
       !integer(a.startFrame,0,p.totalFrames-1)||!integer(a.endFrame,a.startFrame+1,p.totalFrames)||
       !number(a.volume,0,1)||typeof a.name!=="string"||a.name.length>90||
       !["wav","mp3","m4a","ogg"].includes(a.extension))
      throw failure("AUDIO_TRACK_INVALID","Trilha de áudio inválida.");
    audioNames.add(a.id);
  }
  validateEditorTimeline(p);
  validateMotionV2(p);
  return p;
}
export const editorStoreDir=()=>resolve(process.env.MEDIAFORGE_DATA_DIR??".mediaforge","editor-projects");
const projectFile=id=>{
  if(!FILE_ID.test(id))throw failure("PROJECT_ID_INVALID","ID inválido.");
  return join(editorStoreDir(),id+".json");
};
export async function loadEditorProject(id){
  try{return validateEditorProject(JSON.parse(await readFile(projectFile(id),"utf8")));}
  catch(e){if(e.code==="ENOENT")throw failure("PROJECT_NOT_FOUND","Projeto não encontrado.",404);throw e;}
}
export async function saveEditorProject(project,{expectedRevision}={}){
  validateEditorProject(project);
  await mkdir(editorStoreDir(),{recursive:true});
  const file=projectFile(project.id);
  let old=null;
  try{old=await loadEditorProject(project.id);}catch(e){if(e.code!=="PROJECT_NOT_FOUND")throw e;}
  if(expectedRevision!==undefined&&old?.revision!==expectedRevision)
    throw failure("EDITOR_CONFLICT","Projeto modificado por outra sessão. Reabra antes de salvar.",409);
  const next={...project,revision:old?old.revision+1:0,createdAt:old?.createdAt??project.createdAt,updatedAt:new Date().toISOString()};
  const temp=file+"."+randomUUID().replaceAll("-","")+".tmp";
  await writeFile(temp,JSON.stringify(next,null,2)+"\n",{flag:"wx"});
  await rename(temp,file);
  return next;
}
export async function latestEditorProject(){
  await mkdir(editorStoreDir(),{recursive:true});
  const names=(await readdir(editorStoreDir())).filter(v=>/^[a-f0-9]{32}\.json$/.test(v));
  const sorted=(await Promise.all(names.map(async name=>({name,mtime:(await stat(join(editorStoreDir(),name))).mtimeMs})))).sort((a,b)=>b.mtime-a.mtime);
  for(const row of sorted){try{return await loadEditorProject(row.name.slice(0,32));}catch{}}
  return null;
}
export function updateEditorProject(original,input){
  if(!input||input.id!==original.id||input.version!==original.version||input.createdAt!==original.createdAt)
    throw failure("EDITOR_ID_MISMATCH","Projeto enviado não corresponde ao aberto.");
  if(input.revision!==original.revision)throw failure("EDITOR_CONFLICT","Sua edição está desatualizada.",409);
  return validateEditorProject({...input,revision:original.revision});
}
