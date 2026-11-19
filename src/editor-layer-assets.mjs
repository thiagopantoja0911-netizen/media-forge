import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { editorStoreDir, saveEditorProject, validateEditorProject } from "./editor-studio-core.mjs";

const TYPES={mp4:"video/mp4",webm:"video/webm"};
const MAX_ONE=16*1024*1024,ID=/^[a-f0-9]{32}$/;
const fail=(code,message,status=422)=>Object.assign(new Error(message),{code,status});
export const editorLayerAssetPath=(projectId,assetId,extension)=>{
  if(!ID.test(projectId)||!ID.test(assetId)||!Object.hasOwn(TYPES,extension))throw fail("EDITOR_LAYER_ASSET_ID_INVALID","Identificador de vídeo inválido.");
  return join(editorStoreDir(),projectId+"-video-"+assetId+"."+extension);
};
function validateBytes(bytes,extension){
  if(!Buffer.isBuffer(bytes)||bytes.length<64||bytes.length>MAX_ONE)throw fail("EDITOR_LAYER_ASSET_SIZE_INVALID","Vídeo deve ter entre 64 bytes e 16 MB.");
  if(extension==="mp4"&&bytes.toString("ascii",4,8)!=="ftyp")throw fail("EDITOR_LAYER_ASSET_FORMAT_INVALID","Arquivo MP4/MOV inválido.");
  if(extension==="webm"&&!bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))throw fail("EDITOR_LAYER_ASSET_FORMAT_INVALID","Arquivo WebM inválido.");
  return TYPES[extension];
}
export async function storeEditorLayerAsset(project,body){
  validateEditorProject(project);
  const name=String(body?.filename??"").trim().slice(0,90),extension=name.split(".").at(-1).toLowerCase();
  if(!name||!Object.hasOwn(TYPES,extension)||typeof body?.base64!=="string"||body.base64.length>22_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64))
    throw fail("EDITOR_LAYER_ASSET_REQUEST_INVALID","Envie MP4 ou WebM válido, com até 16 MB.");
  const bytes=Buffer.from(body.base64,"base64"),mime=validateBytes(bytes,extension);
  const id=randomUUID().replaceAll("-",""),asset={id,name,size:bytes.length,extension,mime};
  const next={...project,layerAssets:[...(project.layerAssets??[]),asset]};
  validateEditorProject(next);
  await mkdir(editorStoreDir(),{recursive:true});
  const path=editorLayerAssetPath(project.id,id,extension);
  await writeFile(path,bytes,{flag:"wx"});
  try{return {project:await saveEditorProject(next,{expectedRevision:project.revision}),asset};}
  catch(error){await unlink(path).catch(()=>{});throw error;}
}
export async function loadEditorLayerAsset(project,assetId){
  const asset=(project.layerAssets??[]).find(item=>item.id===assetId);
  if(!asset)throw fail("EDITOR_LAYER_ASSET_NOT_FOUND","Vídeo não encontrado.",404);
  return {asset,bytes:await readFile(editorLayerAssetPath(project.id,asset.id,asset.extension))};
}
export async function buildEditorLayerAssets(project,{sceneIndex}={}){
  const start=sceneIndex===undefined?0:project.scenes[sceneIndex].startFrame;
  const end=sceneIndex===undefined?project.totalFrames:project.scenes[sceneIndex].endFrame;
  const ids=new Set((project.layers??[]).filter(layer=>layer.type==="video"&&layer.endFrame>start&&layer.startFrame<end).map(layer=>layer.assetId));
  const files=[];
  for(const id of ids){const {asset,bytes}=await loadEditorLayerAsset(project,id);files.push({path:"assets/layers/"+asset.id+"."+asset.extension,contentBase64:bytes.toString("base64")});}
  return files;
}
