import { validateLayerProject } from "./project.mjs";

const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const seconds=(frames,fps)=>Number((frames/fps).toFixed(6));
const safeId=(value)=>{if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error("Unsafe HyperFrames element id");return value;};
const safeColor=(value,fallback)=>typeof value==="string"&&/^#[0-9a-fA-F]{3,8}$/.test(value)?value:fallback;
const assetUrl=(src)=>{
  if(typeof src!=="string"||!/^remotion-assets\/[a-zA-Z0-9._-]+$/.test(src))throw Error("Unsafe Remotion asset path");
  return "./assets/"+src.slice("remotion-assets/".length);
};
export function buildHyperFramesHtml(inputProject){
  const project=validateLayerProject(inputProject);
  const compositionId=safeId(project.id);
  const duration=seconds(project.durationInFrames,project.fps);
  const timelineLayers=project.layers.filter((layer)=>Array.isArray(layer.keyframes)&&layer.keyframes.length)
    .map((layer)=>({id:safeId(layer.id),x:layer.x,y:layer.y,opacity:layer.opacity,keyframes:layer.keyframes}));
  const elements=project.layers.map((layer)=>{
    const id=safeId(layer.id);
    const start=seconds(layer.startFrame,project.fps);
    const clipDuration=seconds(layer.endFrame-layer.startFrame,project.fps);
    const common=' id="'+escapeHtml(id)+'" class="clip" data-start="'+start+'" data-duration="'+clipDuration+'" data-track-index="'+layer.zIndex+'"';
    const animated=Array.isArray(layer.keyframes)&&layer.keyframes.length>0;
    const transform=animated?"":"transform:translate("+layer.x+"px,"+layer.y+"px) rotate("+(Number(layer.rotation)||0)+"deg) scale("+(Number(layer.scale)||1)+");";
    const base="position:absolute;left:0;top:0;width:"+layer.width+"px;height:"+layer.height+"px;z-index:"+layer.zIndex+";opacity:"+layer.opacity+";"+transform;
    if(layer.type==="video")return '<video'+common+' src="'+escapeHtml(assetUrl(layer.src))+'" muted playsinline style="'+base+'object-fit:cover"></video>';
    if(layer.type==="image")return '<img'+common+' src="'+escapeHtml(assetUrl(layer.src))+'" alt="" style="'+base+'object-fit:contain">';
    if(layer.type==="text"){
      const style=base+"display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-line;line-height:1.1;color:"+safeColor(layer.color,"#ffffff")+";font-family:Arial,sans-serif;font-size:"+(Number(layer.fontSize)||48)+"px;font-weight:"+(Number(layer.fontWeight)||700)+";letter-spacing:-1px;text-shadow:0 5px 28px #000c;";
      return '<div'+common+' style="'+style+'">'+escapeHtml(layer.text||"")+'</div>';
    }
    if(layer.type==="shape")return '<div'+common+' style="'+base+'background:'+safeColor(layer.color,"#845dff")+';border-radius:'+(Number(layer.borderRadius)||0)+'px"></div>';
    if(layer.type==="audio")return '<audio'+common+' src="'+escapeHtml(assetUrl(layer.src))+'" data-volume="'+Math.max(0,Math.min(1,Number(layer.volume)||0))+'"></audio>';
    throw Error("Unsupported HyperFrames layer type: "+layer.type);
  }).join("\n");
  const timelineConfig=JSON.stringify(timelineLayers).replace(/</g,"\\u003c");
  const timelineScript=[
    "window.__timelines=window.__timelines||{};",
    "const timeline=gsap.timeline({paused:true});",
    "const layers="+timelineConfig+";",
    "for(const layer of layers){",
    " const element=document.getElementById(layer.id);",
    " timeline.set(element,{x:layer.x,y:layer.y,opacity:layer.opacity,rotation:0,scale:1},0);",
    " const keys=layer.keyframes;",
    " if(!keys.length)continue;",
    " const initial={};for(const key of ['x','y','opacity','rotation','scale'])if(Number.isFinite(keys[0][key]))initial[key]=keys[0][key];",
    " timeline.set(element,initial,keys[0].frame/"+project.fps+");",
    " for(let i=1;i<keys.length;i++){",
    "  const previous=keys[i-1],current=keys[i],props={};",
    "  for(const key of ['x','y','opacity','rotation','scale'])if(Number.isFinite(current[key]))props[key]=current[key];",
    "  props.duration=(current.frame-previous.frame)/"+project.fps+";props.ease='none';",
    "  timeline.to(element,props,previous.frame/"+project.fps+");",
    " }",
    "}",
    "window.__timelines["+JSON.stringify(compositionId)+"]=timeline;"
  ].join("\n");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(project.title)+'</title>'+
    '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#070a13}#root{position:relative;width:'+project.width+'px;height:'+project.height+'px;overflow:hidden;background:#070a13;isolation:isolate}video,img{display:block}</style>'+
    '</head><body><div id="root" data-composition-id="'+escapeHtml(compositionId)+'" data-start="0" data-duration="'+duration+'" data-width="'+project.width+'" data-height="'+project.height+'" data-fps="'+project.fps+'">'+elements+
    '</div><script src="./assets/gsap.min.js"></script><script>'+timelineScript+'</script></body></html>';
}
