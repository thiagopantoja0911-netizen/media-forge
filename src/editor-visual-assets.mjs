import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { editorStoreDir, saveEditorProject, validateEditorProject } from "./editor-studio-core.mjs";

const MAX_ONE=2*1024*1024;
const TYPES={png:"image/png",webp:"image/webp",svg:"image/svg+xml"};
const fail=(code,message,status=422)=>Object.assign(new Error(message),{code,status});
const idReg=/^[a-f0-9]{32}$/;
export const editorImagePath=(p,id,extension)=>{
  if(!idReg.test(p)||!idReg.test(id)||!Object.hasOwn(TYPES,extension))
    throw fail("VISUAL_ASSET_ID_INVALID","Identificador de imagem inválido.");
  return join(editorStoreDir(),p+"-image-"+id+"."+extension);
};
export function validateEditorVisualBytes(bytes,extension){
  if(!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>MAX_ONE||!Object.hasOwn(TYPES,extension))
    throw fail("VISUAL_ASSET_SIZE_INVALID","Envie PNG, WEBP ou SVG com até 2 MB.");
  if(extension==="png"){
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
      bytes.subarray(12,16).toString()!=="IHDR")
      throw fail("VISUAL_ASSET_FORMAT_INVALID","Cabeçalho PNG inválido.");
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    if(w<1||h<1||w>4096||h>4096)throw fail("VISUAL_ASSET_DIMENSIONS_INVALID","Imagem maior que 4096px.");
  } else if(extension==="webp"){
    if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"||
      !["VP8 ","VP8L","VP8X"].includes(bytes.toString("ascii",12,16)))
      throw fail("VISUAL_ASSET_FORMAT_INVALID","Cabeçalho WEBP inválido.");
  } else {
    const text=bytes.toString("utf8");
    const inspected=text.replaceAll("http://www.w3.org/2000/svg","");
    if(!/<svg(?:\s|>)/i.test(text)||!/<\/svg\s*>/i.test(text)||
      /<!doctype|<!entity|<\?xml-stylesheet|<script|<style|<foreignObject|<iframe|<image|<use|<audio|<video|<object|<embed|<animate|<set\b|on[a-z]+\s*=|\bhref\s*=|\b(?:src|xlink:href)\s*=|url\s*\(|@import|data:|https?:|javascript:|&(?:#|[a-z])/i.test(inspected))
      throw fail("VISUAL_ASSET_SVG_UNSAFE","SVG com referências, scripts ou conteúdo ativo não permitido.");
  }
  return TYPES[extension];
}
export async function storeEditorVisualAsset(project,body){
  validateEditorProject(project);
  const name=String(body?.filename??"").trim().slice(0,90);
  const extension=name.split(".").at(-1).toLowerCase();
  if(!name||!Object.hasOwn(TYPES,extension)||typeof body?.base64!=="string"||
    body.base64.length>3e6||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64))
    throw fail("VISUAL_ASSET_REQUEST_INVALID","Envie PNG, WEBP ou SVG em base64 válido.");
  const bytes=Buffer.from(body.base64,"base64");
  const mime=validateEditorVisualBytes(bytes,extension);
  const id=randomUUID().replaceAll("-","");
  const asset={id,name,size:bytes.length,extension,mime};
  const next={...project,assets:[...(project.assets??[]),asset]};
  validateEditorProject(next);
  await mkdir(editorStoreDir(),{recursive:true});
  const path=editorImagePath(project.id,id,extension);
  await writeFile(path,bytes,{flag:"wx"});
  try{
    return {project:await saveEditorProject(next,{expectedRevision:project.revision}),asset};
  }catch(error){await unlink(path).catch(()=>{});throw error;}
}
export async function loadEditorVisualAsset(project,assetId){
  const asset=(project.assets??[]).find(a=>a.id===assetId);
  if(!asset)throw fail("VISUAL_ASSET_NOT_FOUND","Imagem não encontrada.",404);
  return {asset,bytes:await readFile(editorImagePath(project.id,asset.id,asset.extension))};
}
export async function buildEditorVisualAssets(project,{sceneIndex}={}){
  const scenes=sceneIndex===undefined?project.scenes:[project.scenes[sceneIndex]];
  const assetIds=new Set([...scenes.flatMap(s=>s?.visual?[s.visual.assetId,...(s.visual.assetIds??[])]:[]),
    ...(project.layers??[]).filter(layer=>layer.type==="image").map(layer=>layer.assetId)].filter(Boolean));
  const files=[];
  for(const id of assetIds){
    const {asset,bytes}=await loadEditorVisualAsset(project,id);
    files.push({path:"assets/images/"+asset.id+"."+asset.extension,contentBase64:bytes.toString("base64")});
  }
  return files;
}
