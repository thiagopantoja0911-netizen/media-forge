import { randomUUID } from "node:crypto";

const ID=/^[a-f0-9]{32}$/;
const TYPES=new Set(["video","image","text","shape"]);
const EASING=new Set(["linear","ease-in","ease-out","ease-in-out","spring"]);
const BLENDS=new Set(["normal","screen","multiply","overlay","lighten","darken"]);
const PROPS=["x","y","z","width","height","scale","rotationX","rotationY","rotationZ","opacity"];
const fail=(code,message)=>Object.assign(new Error(message),{code});
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const num=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const hex=v=>typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v);
const safeGradient=v=>typeof v==="string"&&v.length<=240&&/^(?:linear|radial)-gradient\([#0-9a-fA-F%,.\sdeg]+\)$/.test(v);
const clean=(v,max)=>String(v??"").replace(/[\u0000-\u001f]/g," ").trim().slice(0,max);
const id=()=>randomUUID().replaceAll("-","");

export function validateEditorTimeline(project){
  const layers=project.layers??[],captions=project.captions??[];
  if(!Array.isArray(layers)||layers.length>40)throw fail("EDITOR_LAYERS_INVALID","Máximo de 40 camadas independentes.");
  if(!Array.isArray(captions)||captions.length>120)throw fail("EDITOR_CAPTIONS_INVALID","Máximo de 120 blocos de legenda.");
  const imageIds=new Set((project.assets??[]).map(a=>a.id));
  const videoIds=new Set((project.layerAssets??[]).map(a=>a.id));
  const layerIds=new Set();
  for(const layer of layers){
    if(!layer||!ID.test(layer.id)||layerIds.has(layer.id)||!TYPES.has(layer.type))throw fail("EDITOR_LAYER_INVALID","ID ou tipo de camada inválido.");
    layerIds.add(layer.id);
    if(typeof layer.name!=="string"||!layer.name.trim()||layer.name.length>90)throw fail("EDITOR_LAYER_NAME_INVALID","Nome de camada inválido.");
    if(!int(layer.startFrame,0,project.totalFrames-1)||!int(layer.endFrame,layer.startFrame+1,project.totalFrames))throw fail("EDITOR_LAYER_TIMING_INVALID","Intervalo de camada fora da duração do projeto.");
    for(const [key,min,max] of [["x",-4320,4320],["y",-4320,4320],["z",-10000,10000],["width",1,4320],["height",1,4320],["scale",.01,20],["rotationX",-3600,3600],["rotationY",-3600,3600],["rotationZ",-3600,3600],["opacity",0,1]])
      if(!num(layer[key],min,max))throw fail("EDITOR_LAYER_PROPERTY_INVALID","Propriedade inválida na camada "+layer.id+": "+key);
    if(!int(layer.zIndex,-100,200)||!BLENDS.has(layer.blendMode))throw fail("EDITOR_LAYER_STACK_INVALID","Ordem ou blend mode inválido.");
    if(layer.color!==undefined&&!hex(layer.color))throw fail("EDITOR_LAYER_COLOR_INVALID","Cor de camada inválida.");
    if(layer.background!==undefined&&!safeGradient(layer.background))throw fail("EDITOR_LAYER_BACKGROUND_INVALID","Use apenas linear-gradient ou radial-gradient com cores hexadecimais.");
    if(layer.type==="image"&&!imageIds.has(layer.assetId))throw fail("EDITOR_LAYER_ASSET_INVALID","Camada de imagem precisa apontar para um asset importado.");
    if(layer.type==="video"&&!videoIds.has(layer.assetId))throw fail("EDITOR_LAYER_ASSET_INVALID","Camada de vídeo precisa apontar para um vídeo importado.");
    if(layer.type==="text"&&(typeof layer.text!=="string"||layer.text.length>1200))throw fail("EDITOR_LAYER_TEXT_INVALID","Texto da camada excede 1.200 caracteres.");
    if(layer.fontFamily!==undefined&&!["sans","serif","mono"].includes(layer.fontFamily))throw fail("EDITOR_LAYER_FONT_INVALID","Família tipográfica inválida.");
    if(layer.fontSize!==undefined&&!num(layer.fontSize,8,360))throw fail("EDITOR_LAYER_FONT_INVALID","Tamanho tipográfico inválido.");
    if(layer.fontWeight!==undefined&&!int(layer.fontWeight,100,900))throw fail("EDITOR_LAYER_FONT_INVALID","Peso tipográfico inválido.");
    if(layer.textAlign!==undefined&&!["left","center","right"].includes(layer.textAlign))throw fail("EDITOR_LAYER_ALIGN_INVALID","Alinhamento inválido.");
    if(layer.type==="video"){
      if(!num(layer.trimStartSeconds??0,0,3600)||!num(layer.speed??1,.1,4)||typeof (layer.loop??false)!=="boolean")
        throw fail("EDITOR_VIDEO_PLAYBACK_INVALID","Trim, velocidade ou loop de vídeo inválido.");
    }
    if(layer.keyframes!==undefined){
      if(!Array.isArray(layer.keyframes)||layer.keyframes.length>120)throw fail("EDITOR_KEYFRAMES_INVALID","Máximo de 120 keyframes por camada.");
      let last=-1;
      for(const keyframe of layer.keyframes){
        if(!keyframe||!int(keyframe.frame,0,project.totalFrames)||keyframe.frame<=last||!EASING.has(keyframe.easing??"linear"))
          throw fail("EDITOR_KEYFRAMES_INVALID","Keyframes precisam estar em ordem crescente e usar easing válido.");
        last=keyframe.frame;
        const keys=Object.keys(keyframe).filter(k=>k!=="frame"&&k!=="easing");
        if(!keys.length||keys.some(k=>!PROPS.includes(k)))throw fail("EDITOR_KEYFRAME_PROPERTY_INVALID","Keyframe contém propriedade não suportada.");
        for(const k of keys){
          const bounds={x:[-4320,4320],y:[-4320,4320],z:[-10000,10000],width:[1,4320],height:[1,4320],scale:[.01,20],rotationX:[-3600,3600],rotationY:[-3600,3600],rotationZ:[-3600,3600],opacity:[0,1]}[k];
          if(!num(keyframe[k],bounds[0],bounds[1]))throw fail("EDITOR_KEYFRAME_VALUE_INVALID","Valor de keyframe inválido: "+k);
        }
      }
    }
  }
  const captionIds=new Set();
  for(const caption of captions){
    if(!caption||!ID.test(caption.id)||captionIds.has(caption.id))throw fail("EDITOR_CAPTION_ID_INVALID","ID de legenda inválido ou duplicado.");
    captionIds.add(caption.id);
    if(typeof caption.text!=="string"||!caption.text.trim()||caption.text.length>500)throw fail("EDITOR_CAPTION_TEXT_INVALID","Legenda vazia ou longa demais.");
    if(!int(caption.startFrame,0,project.totalFrames-1)||!int(caption.endFrame,caption.startFrame+1,project.totalFrames))throw fail("EDITOR_CAPTION_TIMING_INVALID","Tempo de legenda inválido.");
    if(!["karaoke","boxed","minimal","outline"].includes(caption.style)||!["none","fade","rise","typewriter"].includes(caption.animation))throw fail("EDITOR_CAPTION_STYLE_INVALID","Estilo ou animação de legenda inválido.");
    if(!num(caption.x,0,1080)||!num(caption.y,0,1920)||!num(caption.width,100,1080)||!num(caption.fontSize,18,120)||
      !hex(caption.color)||!hex(caption.highlightColor)||!hex(caption.backgroundColor)||
      !num(caption.backgroundOpacity,0,1)||!int(caption.zIndex,0,200)||!["left","center","right"].includes(caption.align))
      throw fail("EDITOR_CAPTION_STYLE_INVALID","Propriedades visuais da legenda inválidas.");
    if(caption.wordTimings!==undefined){
      const words=caption.text.trim().split(/\s+/);
      if(!Array.isArray(caption.wordTimings)||caption.wordTimings.length!==words.length)throw fail("EDITOR_CAPTION_WORD_TIMINGS_INVALID","Forneça um tempo para cada palavra da legenda.");
      let previous=caption.startFrame;
      for(const timing of caption.wordTimings){
        if(!timing||!int(timing.startFrame,caption.startFrame,caption.endFrame-1)||!int(timing.endFrame,timing.startFrame+1,caption.endFrame)||timing.startFrame<previous)
          throw fail("EDITOR_CAPTION_WORD_TIMINGS_INVALID","Tempos das palavras precisam estar ordenados dentro da legenda.");
        previous=timing.endFrame;
      }
    }
  }
  return project;
}

const layerFields=["name","type","assetId","text","color","background","fontFamily","fontSize","fontWeight","textAlign","x","y","z","width","height","rotationX","rotationY","rotationZ","scale","opacity","zIndex","startFrame","endFrame","blendMode","trimStartSeconds","speed","loop","keyframes"];
const captionFields=["text","startFrame","endFrame","style","animation","x","y","width","fontSize","color","highlightColor","backgroundColor","backgroundOpacity","zIndex","align","wordTimings"];
function copyFields(target,source,fields){
  if(!source||typeof source!=="object"||Array.isArray(source))throw fail("EDITOR_OPERATION_INVALID","Operação sem objeto de propriedades.");
  for(const key of Object.keys(source)){
    if(!fields.includes(key))throw fail("EDITOR_OPERATION_PROPERTY_INVALID","Propriedade não permitida: "+key);
    target[key]=source[key];
  }
}
function makeLayer(project,input={}){
  const type=input.type;
  if(!TYPES.has(type))throw fail("EDITOR_LAYER_TYPE_INVALID","Tipo de camada inválido.");
  const image=project.aspectRatio==="9:16"?[1080,1920]:project.aspectRatio==="16:9"?[1920,1080]:[1080,1080];
  const [width,height]=image;
  return {
    id:ID.test(input.id??"")?input.id:id(),name:clean(input.name??(type==="text"?"Texto":type==="shape"?"Forma 3D":type==="image"?"Imagem":"Vídeo"),90),
    type,startFrame:input.startFrame??0,endFrame:input.endFrame??project.totalFrames,
    x:input.x??(type==="text"?80:0),y:input.y??(type==="text"?height*.65:0),z:input.z??0,
    width:input.width??(type==="text"?width-160:width),height:input.height??(type==="text"?220:height),
    rotationX:input.rotationX??0,rotationY:input.rotationY??0,rotationZ:input.rotationZ??0,
    scale:input.scale??1,opacity:input.opacity??1,zIndex:input.zIndex??(type==="video"?-1:type==="shape"?0:type==="image"?12:20),
    blendMode:input.blendMode??"normal",keyframes:input.keyframes??[],
    ...(input.color!==undefined?{color:input.color}:{}),
    ...(input.background!==undefined?{background:input.background}:{}),
    ...(input.text!==undefined?{text:input.text}:{}),
    ...(input.assetId!==undefined?{assetId:input.assetId}:{}),
    ...(input.fontFamily!==undefined?{fontFamily:input.fontFamily}:{}),
    ...(input.fontSize!==undefined?{fontSize:input.fontSize}:{}),
    ...(input.fontWeight!==undefined?{fontWeight:input.fontWeight}:{}),
    ...(input.textAlign!==undefined?{textAlign:input.textAlign}:{}),
    ...(input.trimStartSeconds!==undefined?{trimStartSeconds:input.trimStartSeconds}:{}),
    ...(input.speed!==undefined?{speed:input.speed}:{}),
    ...(input.loop!==undefined?{loop:input.loop}:{})
  };
}
function makeCaption(project,input={}){
  const height=project.aspectRatio==="9:16"?1920:project.aspectRatio==="16:9"?1080:1080;
  return {
    id:ID.test(input.id??"")?input.id:id(),text:clean(input.text,500),
    startFrame:input.startFrame??0,endFrame:input.endFrame??Math.min(project.totalFrames,project.fps*3),
    style:input.style??"karaoke",animation:input.animation??"rise",
    x:input.x??54,y:input.y??height-360,width:input.width??972,fontSize:input.fontSize??48,
    color:input.color??"#ffffff",highlightColor:input.highlightColor??"#72f2d0",
    backgroundColor:input.backgroundColor??"#07111f",backgroundOpacity:input.backgroundOpacity??.82,
    zIndex:input.zIndex??80,align:input.align??"center",
    ...(input.wordTimings?{wordTimings:input.wordTimings}:{})
  };
}
export function applyEditorTimelineOperations(project,{layer_operations=[],caption_operations=[]}={}){
  const next=JSON.parse(JSON.stringify(project));
  next.layers??=[];next.captions??=[];
  if(!Array.isArray(layer_operations)||layer_operations.length>80||!Array.isArray(caption_operations)||caption_operations.length>120)
    throw fail("EDITOR_OPERATIONS_LIMIT","Limite de operações da timeline excedido.");
  for(const op of layer_operations){
    if(!op||!["add","update","remove","reorder","add_keyframe","remove_keyframe"].includes(op.action))throw fail("EDITOR_LAYER_OPERATION_INVALID","Ação de camada inválida.");
    if(op.action==="add"){next.layers.push(makeLayer(next,op.layer??{}));continue;}
    const index=next.layers.findIndex(layer=>layer.id===op.layer_id);
    if(index<0)throw fail("EDITOR_LAYER_NOT_FOUND","Camada não encontrada: "+String(op.layer_id));
    const layer=next.layers[index];
    if(op.action==="remove"){next.layers.splice(index,1);continue;}
    if(op.action==="reorder"){layer.zIndex=op.zIndex;continue;}
    if(op.action==="update"){copyFields(layer,op.changes,layerFields);continue;}
    layer.keyframes??=[];
    if(op.action==="add_keyframe"){
      if(!op.keyframe||typeof op.keyframe!=="object")throw fail("EDITOR_KEYFRAME_INVALID","Keyframe ausente.");
      layer.keyframes.push(op.keyframe);layer.keyframes.sort((a,b)=>a.frame-b.frame);continue;
    }
    layer.keyframes=layer.keyframes.filter(keyframe=>keyframe.frame!==op.frame);
  }
  for(const op of caption_operations){
    if(!op||!["add","update","remove"].includes(op.action))throw fail("EDITOR_CAPTION_OPERATION_INVALID","Ação de legenda inválida.");
    if(op.action==="add"){next.captions.push(makeCaption(next,op.caption??{}));continue;}
    const index=next.captions.findIndex(caption=>caption.id===op.caption_id);
    if(index<0)throw fail("EDITOR_CAPTION_NOT_FOUND","Legenda não encontrada: "+String(op.caption_id));
    if(op.action==="remove"){next.captions.splice(index,1);continue;}
    copyFields(next.captions[index],op.changes,captionFields);
  }
  validateEditorTimeline(next);
  return next;
}
