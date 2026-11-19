
import { readFile } from "node:fs/promises";
import { validateEditorProject } from "./editor-studio-core.mjs";
import { buildEditorVisualAssets } from "./editor-visual-assets.mjs";
import { buildEditorLayerAssets } from "./editor-layer-assets.mjs";
import { buildEditorStyleDna, getEditorStylePreset } from "./editor-style-presets.mjs";
import { temporalShutterSamples } from "./editor-motion-blur.mjs";
import { motionV2Runtime } from "./editor-motion-v2.mjs";
import { buildEditorFreeTimelineModule } from "./editor-free-timeline.mjs";
import { sceneTypography, renderKineticTitle, EDITOR_FONT_STACKS } from "./editor-typography.mjs";
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dims=ratio=>ratio==="16:9"?[1920,1080]:ratio==="1:1"?[1080,1080]:[1080,1920];
function selectScenes(p,index){
  validateEditorProject(p);
  if(p.mode==="timeline-free"){
    if(index!==undefined)throw Object.assign(new Error("Não existem cenas no projeto de timeline livre."),{status:422});
    return [{id:"virtual-timeline",startFrame:0,endFrame:p.totalFrames}];
  }
  const items=index===undefined?p.scenes:[p.scenes[index]];
  if(items.some(v=>!v))throw Object.assign(new Error("Cena inválida."),{status:404});
  const offset=items[0].startFrame;
  return items.map(s=>({...s,startFrame:s.startFrame-offset,endFrame:s.endFrame-offset}));
}
export function buildEditorIndex(p,{sceneIndex,preview=false,projectId}={}){
  const shots=selectScenes(p,sceneIndex),[w,h]=dims(p.aspectRatio);
  const free=p.mode==="timeline-free";
  const duration=shots.at(-1).endFrame/p.fps;
  const frameOffset=sceneIndex===undefined||free?0:p.scenes[sceneIndex].startFrame;
  const frameEnd=frameOffset+shots.at(-1).endFrame;
  const motionEnabled=Boolean(p.motionV2?.enabled&&p.motionV2?.background?.keyframes?.length);
  const backgroundMarkup=motionEnabled?'<div id="motion-v2-bg" aria-hidden="true"></div>':'';
  const layerMarkup=(p.layers??[]).filter(layer=>layer.endFrame>frameOffset&&layer.startFrame<frameEnd).map(layer=>{
    const localStart=Math.max(0,layer.startFrame-frameOffset),localEnd=Math.min(frameEnd,layer.endFrame)-frameOffset;
    const common=' id="layer-'+layer.id+'" class="editor-layer clip" data-start="'+localStart/p.fps+'" data-duration="'+(localEnd-localStart)/p.fps+'" data-track-index="'+Math.max(1,layer.zIndex+20)+'" data-layout-allow-overlap';
    const base='position:absolute;left:0;top:0;width:'+layer.width+'px;height:'+layer.height+'px;z-index:'+(motionEnabled?layer.zIndex+8:layer.zIndex)+';opacity:'+layer.opacity+';mix-blend-mode:'+layer.blendMode+';transform:translate3d('+layer.x+'px,'+layer.y+'px,'+layer.z+'px) rotateX('+layer.rotationX+'deg) rotateY('+layer.rotationY+'deg) rotateZ('+layer.rotationZ+'deg) scale('+layer.scale+');transform-origin:top left;transform-style:preserve-3d;';
    if(layer.type==="video"){
      const asset=(p.layerAssets??[]).find(item=>item.id===layer.assetId);
      const url=preview?"/api/editor/projects/"+projectId+"/layer-assets/"+layer.assetId:"./assets/layers/"+layer.assetId+"."+asset.extension;
      return '<video'+common+' src="'+esc(url)+'" muted playsinline preload="auto" data-trim-start="'+(layer.trimStartSeconds??0)+'" data-speed="'+(layer.speed??1)+'" data-loop="'+Boolean(layer.loop)+'" style="'+base+'object-fit:cover"></video>';
    }
    if(layer.type==="image"){
      const asset=(p.assets??[]).find(item=>item.id===layer.assetId);
      const url=preview?"/api/editor/projects/"+projectId+"/assets/"+layer.assetId:"./assets/images/"+layer.assetId+"."+asset.extension;
      return '<img'+common+' src="'+esc(url)+'" alt="" style="'+base+'object-fit:contain">';
    }
    if(layer.type==="text"){
      const fonts={sans:"Arial,Helvetica,sans-serif",serif:"Georgia,serif",mono:"'Courier New',monospace",impact:"Impact,'Arial Black',sans-serif",
        verdana:"Verdana,Geneva,sans-serif",trebuchet:"'Trebuchet MS',Arial,sans-serif",tahoma:"Tahoma,Arial,sans-serif",times:"'Times New Roman',Times,serif"};
      const font=fonts[layer.fontFamily]||fonts.sans;
      const justify=(layer.textAlign||"left")==="left"?"flex-start":layer.textAlign==="right"?"flex-end":"center";
      const style=base+'display:flex;align-items:center;justify-content:'+justify+';text-align:'+(layer.textAlign||"left")+';white-space:pre-line;overflow-wrap:anywhere;color:'+(layer.color||"#ffffff")+';font-family:'+font+';font-size:'+(layer.fontSize||64)+'px;font-weight:'+(layer.fontWeight||800)+';line-height:1.08;text-shadow:0 6px 24px #000a;';
      return '<div'+common+' style="'+style+'">'+esc(layer.text||"")+'</div>';
    }
    return '<div'+common+' style="'+base+'background:'+(layer.background||layer.color||"#845dff")+';border-radius:24px"></div>';
  }).join("");
  const captionMarkup=(p.captions??[]).filter(caption=>caption.endFrame>frameOffset&&caption.startFrame<frameEnd).map(caption=>{
    const localStart=Math.max(0,caption.startFrame-frameOffset),localEnd=Math.min(frameEnd,caption.endFrame)-frameOffset;
    const words=caption.text.trim().split(/\s+/);
    const content=words.map((word,index)=>'<span class="editor-caption-word" data-word-index="'+index+'">'+esc(word)+'</span>').join(" ");
    const rgb=caption.backgroundColor.match(/[0-9a-fA-F]{2}/g).map(value=>parseInt(value,16));
    const bg='rgba('+rgb.join(",")+','+caption.backgroundOpacity+')';
    const style='left:'+caption.x+'px;top:'+caption.y+'px;width:'+caption.width+'px;font-size:'+caption.fontSize+'px;color:'+caption.color+';background:'+(caption.style==="minimal"||caption.style==="outline"?"transparent":bg)+';text-align:'+caption.align+';z-index:'+(caption.zIndex+50)+';';
    return '<div id="caption-layer-'+caption.id+'" class="editor-caption clip" data-animation="'+caption.animation+'" data-style="'+caption.style+'" data-start="'+localStart/p.fps+'" data-duration="'+(localEnd-localStart)/p.fps+'" data-track-index="'+(caption.zIndex+70)+'" data-layout-allow-overlap style="'+style+'">'+content+'</div>';
  }).join("");
  const labels=(free?[]:shots).map((s,i)=>
    '<div id="caption-'+i+'" class="caption clip" data-layout-ignore data-start="'+s.startFrame/p.fps+'" data-duration="'+(s.endFrame-s.startFrame)/p.fps+'" data-track-index="'+(i+2)+'">'+
    '<span class="eyebrow">'+esc(s.kicker)+'</span>'+
    '<h1 class="hero-title" aria-label="'+esc(s.headline)+'" style="font-family:'+EDITOR_FONT_STACKS[sceneTypography(s).family]+'">'+renderKineticTitle(s.headline,s.typography)+'</h1>'+
    '<p class="detail">'+esc(s.detail)+'</p>'+
    '<small class="chapter">CENA '+String(i+1).padStart(2,"0")+' / '+String(shots.length).padStart(2,"0")+'</small>'+
    '</div>').join("");
  const audio=preview?"":p.audio.map((a,i)=>
    '<audio id="audio-'+a.id+'" class="clip" src="assets/audio/'+a.assetId+'.'+a.extension+
    '" data-start="'+a.startFrame/p.fps+'" data-duration="'+(a.endFrame-a.startFrame)/p.fps+
    '" data-track-index="'+(40+i)+'" data-volume="'+a.volume+'"></audio>').join("");
  const vendor=preview?"/editor/vendor/three.module.js":"./assets/three/build/three.module.js";
  const gsap=preview?"/editor/vendor/gsap.min.js":"./assets/gsap.min.js";
  const script=preview?"/api/editor/projects/"+projectId+"/scene.mjs"+(sceneIndex===undefined?"":"?scene="+sceneIndex):"./assets/scene.mjs";
  const titleSize=w>h?96:110,detailSize=w>h?35:32;
  const colorMode=p.stylePreset==="apple-clean"?"light":"dark";
  const ink=colorMode==="light"?"#131b1b":"#f7f8fb";
  const supporting=colorMode==="light"?"#324242":"#dddde6";
  const style=[
    "*{box-sizing:border-box}html,body{margin:0;background:#070912}",
    "#root{position:relative;width:"+w+"px;height:"+h+"px;overflow:hidden;background:"+(free?(p.canvasColor??"#0b1018"):"#070912")+";font-family:Arial,Helvetica,sans-serif;color:"+ink+";isolation:isolate;perspective:1300px;perspective-origin:50% 50%}",
    "#world{position:absolute;inset:0;width:100%;height:100%;z-index:2;display:block}",
    "#motion-v2-bg{position:absolute;top:-9%;left:-9%;width:118%;height:118%;z-index:1;pointer-events:none;transform-origin:center center;will-change:transform,background}",
    ".caption{position:absolute;top:14%;left:10%;width:80%;z-index:3;pointer-events:none;transform-origin:15% 50%;will-change:transform,opacity"+(p.motionV2?.enabled&&p.motionV2?.hideSceneTitles?";display:none":"")+"}",
    ".editor-layer{position:absolute;pointer-events:none;will-change:transform,opacity;backface-visibility:visible}",
    ".editor-caption{position:absolute;box-sizing:border-box;padding:18px 28px;border-radius:18px;font-family:Arial,Helvetica,sans-serif;font-weight:800;line-height:1.18;pointer-events:none;white-space:normal;overflow-wrap:anywhere;box-shadow:0 8px 30px #0005;will-change:transform,opacity}",
    ".editor-caption[data-style=outline]{border:2px solid currentColor;text-shadow:0 4px 18px #000}",
    ".editor-caption[data-style=minimal]{text-shadow:0 4px 18px #000;box-shadow:none}",
    ".editor-caption-word{display:inline-block;transition:color .04s,text-shadow .04s}",
    ".eyebrow{display:inline-block;padding:13px 25px;border:2px solid #ffffff66;border-radius:100px;letter-spacing:.19em;font-size:28px;font-weight:800;background:#03030688}",
    ".hero-title{margin:47px 0 0;font-size:"+titleSize+"px;line-height:1.02;letter-spacing:-.06em;font-weight:900;overflow-wrap:anywhere;white-space:pre-wrap;text-shadow:0 14px 34px #000c}",
    ".kinetic-unit{display:inline-block;white-space:pre;will-change:transform,opacity,filter;transform-origin:50% 90%}",
    ".detail{margin:33px 0 0;max-width:88%;font-size:"+detailSize+"px;font-weight:600;line-height:1.35;color:"+supporting+";text-shadow:0 8px 22px #0005}",
    ".chapter{display:block;margin-top:32px;font-size:20px;letter-spacing:.2em;color:#a5afca;font-weight:800}"
  ].join("");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(p.title)+' — Editor MediaForge</title><style>'+style+'</style>'+
    '<script type="importmap">{"imports":{"three":"'+vendor+'"}}<\/script></head>'+
    '<body><div id="root" data-composition-id="main" data-width="'+w+'" data-height="'+h+
    '" data-fps="'+p.fps+'" data-duration="'+duration+'" data-motion-blur="off" data-motion-blur-shutter="0">'+
    (free?"":'<canvas id="world" class="clip" data-start="0" data-duration="'+duration+
    '" data-track-index="1" data-layout-allow-overlap aria-label="Cena 3D"></canvas>')+backgroundMarkup+layerMarkup+labels+captionMarkup+audio+'</div>'+
    '<script src="'+gsap+'"><\/script><script type="module" src="'+script+'"><\/script></body></html>';
}
function editorRuntime(){
  const motionEngine=motionV2Runtime(motionV2,W,H,FPS);
  const motionBackground=document.getElementById("motion-v2-bg");
  const canvas=document.getElementById("world");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance",preserveDrawingBuffer:true});
  // Reduced internal GPU buffer is limited to the dedicated 24s qualification build.
  const scale=preview?.58:renderScale;
  renderer.setSize(Math.round(W*scale),Math.round(H*scale),false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  // Temporal multisampling accumulates several actual Three.js frames around each requested timestamp.
  // The result does not depend on requestAnimationFrame, last captured frame or GPU history.
  const pixelsW=Math.round(W*scale),pixelsH=Math.round(H*scale);
  const colorTarget=new THREE.WebGLRenderTarget(pixelsW,pixelsH,{depthBuffer:true,stencilBuffer:false});
  colorTarget.depthTexture=new THREE.DepthTexture(pixelsW,pixelsH,THREE.UnsignedIntType);
  colorTarget.depthTexture.format=THREE.DepthFormat;
  const accumulationTarget=new THREE.WebGLRenderTarget(pixelsW,pixelsH,{depthBuffer:false,stencilBuffer:false});
  const passCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const passScene=new THREE.Scene();
  const blurPass=new THREE.ShaderMaterial({
    uniforms:{tInput:{value:colorTarget.texture},weight:{value:1}},
    depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,
    vertexShader:"varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:"uniform sampler2D tInput;uniform float weight;varying vec2 v;void main(){vec4 c=texture2D(tInput,v);gl_FragColor=vec4(c.rgb*weight,1.);}"
  });
  const passQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blurPass);passQuad.frustumCulled=false;passScene.add(passQuad);
  const resolveScene=new THREE.Scene();
  const resolveQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:accumulationTarget.texture,depthTest:false,depthWrite:false,toneMapped:false}));
  resolveQuad.frustumCulled=false;resolveScene.add(resolveQuad);
  // Depth-aware cinematic blur runs after temporal exposure accumulation. The
  // center exposure supplies a stable depth map, while the color can retain motion blur.
  const dofScene=new THREE.Scene();
  const dofMaterial=new THREE.ShaderMaterial({
    uniforms:{
      tColor:{value:accumulationTarget.texture},tDepth:{value:colorTarget.depthTexture},
      uTexel:{value:new THREE.Vector2(1/pixelsW,1/pixelsH)},uDof:{value:0},
      uFocusDistance:{value:7.5},uFocusRange:{value:3.2},uNear:{value:.1},uFar:{value:60},
      uMaxRadiusPixels:{value:14}
    },
    depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:`precision highp float;
      varying vec2 vUv;uniform sampler2D tColor;uniform sampler2D tDepth;
      uniform vec2 uTexel;uniform float uDof;uniform float uFocusDistance;
      uniform float uFocusRange;uniform float uNear;uniform float uFar;uniform float uMaxRadiusPixels;
      float linearDistance(float depth){
        float z=depth*2.0-1.0;
        return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear));
      }
      void main(){
        vec4 center=texture2D(tColor,vUv);
        float centerDepth=linearDistance(texture2D(tDepth,vUv).x);
        float coc=clamp(abs(centerDepth-uFocusDistance)/max(.001,uFocusRange),0.0,1.0)*uDof;
        vec2 radius=uTexel*(uMaxRadiusPixels*coc);
        vec2 offsets[8];
        offsets[0]=vec2(1.0,0.0); offsets[1]=vec2(-1.0,0.0);
        offsets[2]=vec2(0.0,1.0); offsets[3]=vec2(0.0,-1.0);
        offsets[4]=vec2(.707,.707); offsets[5]=vec2(-.707,.707);
        offsets[6]=vec2(.707,-.707); offsets[7]=vec2(-.707,-.707);
        vec3 sum=center.rgb*.2;float total=.2;
        for(int i=0;i<8;i++){
          vec2 uv=clamp(vUv+offsets[i]*radius,vec2(0.001),vec2(.999));
          vec3 sampleColor=texture2D(tColor,uv).rgb;
          float sampleDepth=linearDistance(texture2D(tDepth,uv).x);
          float edge=1.0-.65*smoothstep(uFocusRange*.35,uFocusRange,abs(sampleDepth-centerDepth));
          float weight=.1*edge;
          sum+=sampleColor*weight;total+=weight;
        }
        gl_FragColor=vec4(sum/max(.001,total),center.a);
      }`
  });
  const dofQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),dofMaterial);
  dofQuad.frustumCulled=false;dofScene.add(dofQuad);
  const focusPoint=new THREE.Vector3(0,.08,0);
  const world=new THREE.Scene();
  world.background=null;
  world.fog=new THREE.Fog(baseBackground,7,21);
  const camera=new THREE.PerspectiveCamera(W>H?40:46,W/H,.1,60);
  const ambient=new THREE.AmbientLight(0xffffff,.55);world.add(ambient);
  const key=new THREE.SpotLight(0xffffff,96,30,Math.PI/3,.45,1.3);
  key.position.set(-4.4,6,6);world.add(key);
  const rim=new THREE.DirectionalLight(0x87aeff,2.9);
  rim.position.set(4.8,2,-5);world.add(rim);
  const accentLight=new THREE.PointLight(0xff4c85,68,15,2);
  accentLight.position.set(-1,-.9,3.8);world.add(accentLight);
  // One lightweight procedural aurora surface, driven by time and scene presets.
  // No postprocessing passes, network resources or canvas readback.
  const glowMat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,
    uniforms:{uColor:{value:new THREE.Color("#ffffff")},uIntensity:{value:0},
      uTime:{value:0},uSpeed:{value:0},uPosition:{value:new THREE.Vector2(0,0)},
      uAspect:{value:W/H}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision mediump float;
      varying vec2 vUv;uniform vec3 uColor;uniform float uIntensity;
      uniform float uTime;uniform float uSpeed;uniform vec2 uPosition;uniform float uAspect;
      void main(){
        vec2 uv=(vUv-.5)*vec2(uAspect,1.);
        vec2 pos=uPosition*.33;
        float t=uTime*uSpeed;
        vec2 p=uv-pos+vec2(.08*sin(t*.39),.09*cos(t*.3));
        float blob=exp(-dot(p,p)*7.);
        vec2 q=uv-pos-vec2(.31*sin(t*.31+1.),.26*cos(t*.21+2.));
        float blob2=exp(-dot(q,q)*12.);
        float wave=.5+.5*sin(uv.x*8.+t*.7+2.*sin(uv.y*7.+t*.15));
        float alpha=clamp((blob+blob2*.5)*(.8+.2*wave)*uIntensity,0.,.8);
        gl_FragColor=vec4(uColor*1.35,alpha);
      }`
  });
  const glowQuad=new THREE.Mesh(new THREE.PlaneGeometry(32,36),glowMat);
  glowQuad.renderOrder=-30;glowQuad.frustumCulled=false;world.add(glowQuad);
  const assetLoader=new THREE.TextureLoader(),texturePromises=[],textureCache=new Map();
  function textureFor(url){
    if(!textureCache.has(url))textureCache.set(url,assetLoader.loadAsync(url).then(tex=>{
      tex.colorSpace=THREE.SRGBColorSpace;return tex;
    }));
    return textureCache.get(url);
  }
  function roundedGeometry(width,height,radius){
    const s=new THREE.Shape(),x=-width/2,y=-height/2,r=Math.min(radius,width/2,height/2);
    s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);
    s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
    s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);
    s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
    const geo=new THREE.ShapeGeometry(s,8),a=geo.attributes.uv;
    for(let i=0;i<a.count;i++)a.setXY(i,(a.getX(i)+width/2)/width,(a.getY(i)+height/2)/height);
    return geo;
  }
  function makeScreen(width,height,url){
    const group=new THREE.Group();
    const shade=new THREE.Mesh(roundedGeometry(width*1.06,height*1.12,.25),
      new THREE.MeshBasicMaterial({color:0x010106,transparent:true,opacity:.68,side:THREE.DoubleSide}));
    shade.position.set(.12,-.16,-.2);group.add(shade);
    const chassis=new THREE.Mesh(roundedGeometry(width*1.035,height*1.08,.22),
      new THREE.MeshPhysicalMaterial({color:0x232734,metalness:.56,roughness:.25,side:THREE.DoubleSide}));
    chassis.position.z=-.09;group.add(chassis);
    const face=new THREE.Mesh(roundedGeometry(width,height,.18),
      new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));
    face.position.z=.02;group.add(face);
    texturePromises.push(textureFor(url).then(tex=>{
      face.material.map=tex;face.material.needsUpdate=true;
    }));
    return group;
  }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x080c16,roughness:.38,metalness:.64}));
  if(baseBackground==="#e9f0ed")floor.material.color.set("#cfd9d6");
  floor.rotation.x=-Math.PI/2;floor.position.y=-2.6;world.add(floor);
  const grid=new THREE.GridHelper(36,32,0x374963,0x202941);grid.position.y=-2.58;
  grid.material.transparent=true;grid.material.opacity=.35;world.add(grid);
  function geometry(shape){
    if(shape==="icosahedron")return new THREE.IcosahedronGeometry(1.55,2);
    if(shape==="sphere")return new THREE.SphereGeometry(1.6,70,48);
    if(shape==="torus")return new THREE.TorusGeometry(1.5,.38,26,128);
    if(shape==="cube")return new THREE.BoxGeometry(2.75,2.75,2.75,4,4,4);
    if(shape==="cone")return new THREE.ConeGeometry(1.7,3.35,6);
    if(shape==="rings")return new THREE.TorusKnotGeometry(1.1,.17,160,20,3,5);
    return new THREE.TorusKnotGeometry(1.12,.29,180,20,2,3);
  }
  const objects=shots.map((s,i)=>{
    const group=new THREE.Group();world.add(group);
    const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color(s.accent),metalness:.69,roughness:.22,clearcoat:.82,clearcoatRoughness:.12});
    const hero=new THREE.Mesh(geometry(s.shape),material);group.add(hero);
    let visualGroup=null;
    if(s.visual){
      const v=s.visual,url=assets[v.assetId];
      if(!url)throw new Error("EDITOR_ASSET_NOT_FOUND: "+v.assetId);
      visualGroup=new THREE.Group();group.add(visualGroup);
      visualGroup.position.set(...v.position);visualGroup.position.z+=(v.depth-.5)*1.4;
      visualGroup.rotation.set(...v.rotation.map(n=>n*Math.PI/180));

      visualGroup.scale.setScalar(v.scale);
      if(v.type==="screen"){visualGroup.add(makeScreen(3.6,2.3,url));}
      else {
        const count=v.columns*v.rows,w=2.15,h=1.35;
        for(let j=0;j<count;j++){
          const panelUrl=assets[v.assetIds?.[j%(v.assetIds.length||1)]??v.assetId]??url;
          const panel=makeScreen(w,h,panelUrl);
          const col=j%v.columns,row=Math.floor(j/v.columns);
          panel.position.set((col-(v.columns-1)/2)*2.32,(row-(v.rows-1)/2)*1.52,
            (-row*.12-col*.09)*(.25+v.depth));
          panel.rotation.y=-.1+.12*col;visualGroup.add(panel);
        }
      }
      hero.visible=false;
    }
    const orbit1=new THREE.Mesh(new THREE.TorusGeometry(2.1,.025,8,140),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.32}));
    orbit1.rotation.x=.53;group.add(orbit1);
    const orbit2=new THREE.Mesh(new THREE.TorusGeometry(2.38,.016,8,140),new THREE.MeshBasicMaterial({color:new THREE.Color(s.accent),transparent:true,opacity:.5}));
    orbit2.rotation.y=.43;group.add(orbit2);
    const particles=[];
    for(let j=0;j<12;j++){
      const p=new THREE.Mesh(new THREE.OctahedronGeometry(.07+j%3*.014),new THREE.MeshBasicMaterial({color:j%4?0xe8f2ff:s.accent}));
      group.add(p);particles.push(p);
    }
    if(s.visual){
      orbit1.visible=false;orbit2.visible=false;
      for(const particle of particles)particle.visible=false;
    }
    return {group,hero,orbit1,orbit2,particles,visualGroup};
  });
  const labels=shots.map((s,i)=>document.getElementById("caption-"+i));
  const titles=labels.map(label=>label.querySelector(".hero-title"));
  const unitLists=titles.map(title=>Array.from(title.querySelectorAll(".kinetic-unit")));
  const pendingVideoSeeks=[];
  const clamp01=value=>Math.max(0,Math.min(1,value));
  function easingValue(value,easing){
    const t=clamp01(value);
    if(easing==="ease-in")return t*t;
    if(easing==="ease-out")return 1-(1-t)*(1-t);
    if(easing==="ease-in-out")return t*t*(3-2*t);
    if(easing==="spring"){const raw=1-Math.exp(-7*t)*Math.cos(11*t);const end=1-Math.exp(-7)*Math.cos(11);return raw/end;}
    return t;
  }
  function timelineValue(item,frame,key){
    const keys=(item.keyframes??[]).filter(k=>Number.isFinite(k[key]));
    if(!keys.length)return Number(item[key]??0);
    if(frame<=keys[0].frame)return keys[0][key];
    if(frame>=keys.at(-1).frame)return keys.at(-1)[key];
    for(let i=1;i<keys.length;i++)if(frame<=keys[i].frame){
      const before=keys[i-1],after=keys[i],progress=(frame-before.frame)/(after.frame-before.frame);
      const amount=easingValue(progress,after.easing??"linear");
      return before[key]+(after[key]-before[key])*amount;
    }
    return Number(item[key]??0);
  }
  function updateEditorOverlays(time){
    const frame=FRAME_OFFSET+Math.round(time*FPS);
    if(motionBackground){
      const bg=motionEngine.background(frame);
      if(bg){
        const style=motionBackground.style;
        if(bg.pattern==="solid")style.background=bg.color;
        else if(bg.pattern==="grid")style.background=
          "linear-gradient("+bg.color+"cc 1px, transparent 1px),linear-gradient(90deg,"+bg.color+"cc 1px,transparent 1px),"+
          "radial-gradient(circle at 70% 26%,"+bg.accent+","+bg.color+" 62%)";
        else if(bg.pattern==="rings")style.background=
          "repeating-radial-gradient(circle at 62% 42%,transparent 0px,transparent 105px,"+bg.accent+"55 107px,"+bg.accent+"55 109px),"+
          "linear-gradient(130deg,"+bg.color+","+bg.accent+")";
        else style.background=
          "radial-gradient(ellipse at 32% 26%,"+bg.accent+" 0%,transparent 58%),"+
          "linear-gradient(145deg,"+bg.color+","+bg.accent+")";
        style.backgroundSize=bg.pattern==="grid"?"100px 100px,100px 100px,100% 100%":"cover";
        style.transform="translate3d("+bg.panX+"%,"+bg.panY+"%,0) scale("+bg.zoom+")";
      }
    }
    for(const layer of editorLayers){
      const element=document.getElementById("layer-"+layer.id);if(!element)continue;
      const active=frame>=layer.startFrame&&frame<layer.endFrame;
      element.style.visibility=active?"visible":"hidden";
      if(!active){if(layer.type==="video")element.pause();continue;}
      const value=key=>timelineValue(layer,frame,key);
      const motion=motionEngine.layer(layer,frame);
      element.style.transform="translate3d("+(value("x")+(motion?.x??0))+"px,"+(value("y")+(motion?.y??0))+"px,"+value("z")+"px) rotateX("+value("rotationX")+"deg) rotateY("+value("rotationY")+"deg) rotateZ("+value("rotationZ")+"deg) scale("+value("scale")+")";
      element.style.clipPath=motion?.clipPath??"none";
      element.style.width=value("width")+"px";element.style.height=value("height")+"px";
      element.style.opacity=String(value("opacity")*(motion?.opacity??1));
      if(layer.type==="video"){
        const video=element,duration=Number.isFinite(video.duration)?video.duration:0;
        const local=Math.max(0,(frame-layer.startFrame)/FPS*(layer.speed??1)+(layer.trimStartSeconds??0));
        const target=duration>0?(layer.loop?local%duration:Math.min(duration-.04,local)):local;
        video.playbackRate=layer.speed??1;
        if(video.readyState>=1&&Math.abs(video.currentTime-target)>.08){
          let settled=false;
          const done=()=>{if(settled)return;settled=true;video.removeEventListener("seeked",done);clearTimeout(timer);resolveSeek();};
          let resolveSeek=()=>{};
          const promise=new Promise(resolve=>{resolveSeek=resolve;});
          const timer=setTimeout(done,1400);
          video.addEventListener("seeked",done,{once:true});
          try{video.currentTime=Math.max(0,target);pendingVideoSeeks.push(promise);}catch{done();}
        }
        if(playing&&video.paused)video.play().catch(()=>{});else if(!playing&&!video.paused)video.pause();
      }
    }
    for(const caption of editorCaptions){
      const element=document.getElementById("caption-layer-"+caption.id);if(!element)continue;
      const active=frame>=caption.startFrame&&frame<caption.endFrame;
      element.style.visibility=active?"visible":"hidden";if(!active)continue;
      const local=frame-caption.startFrame,duration=caption.endFrame-caption.startFrame;
      const words=caption.text.trim().split(/\s+/),spans=element.querySelectorAll(".editor-caption-word");
      const timings=caption.wordTimings?.length===words.length?caption.wordTimings:words.map((_,index)=>{
        const start=caption.startFrame+Math.floor(duration*index/words.length);
        const end=caption.startFrame+Math.floor(duration*(index+1)/words.length);
        return {startFrame:start,endFrame:Math.max(start+1,end)};
      });
      const animation=caption.animation??"none";
      const intro=animation==="none"?1:clamp01(local/Math.max(1,FPS*.18));
      const outro=animation==="none"?1:clamp01((duration-local)/Math.max(1,FPS*.12));
      element.style.opacity=String(intro*outro);
      element.style.transform=animation==="rise"?"translate3d(0,"+((1-intro)*34)+"px,0) scale("+(0.97+.03*intro)+")":"translate3d(0,0,0)";
      spans.forEach((span,index)=>{
        const timing=timings[index]??{startFrame:caption.startFrame,endFrame:caption.endFrame};
        const shown=frame>=timing.startFrame;
        const highlighted=frame>=timing.startFrame&&frame<timing.endFrame;
        span.style.opacity=animation==="typewriter"&&!shown?"0":"1";
        span.style.color=caption.style==="karaoke"&&highlighted?caption.highlightColor:caption.color;
        span.style.textShadow=caption.style==="karaoke"&&highlighted?"0 0 18px "+caption.highlightColor:"none";
      });
    }
  }
  function updateTypography(index,local){
    const s=shots[index],typ=s.typography;
    if(!typ)return;
    const title=titles[index],units=unitLists[index];
    const power=Math.max(0,Math.min(1,typ.bloom));
    if(power>0){
      const n=Math.round(6+power*28),large=Math.round(12+power*65);
      title.style.textShadow="0 0 "+n+"px "+typ.bloomColor+
        ",0 0 "+large+"px "+typ.bloomColor+",0 0 "+Math.round(large*1.6)+"px "+typ.bloomColor;
    }else title.style.textShadow="none";
    if(!units.length){title.style.fontWeight=String(typ.weightTo);return;}
    for(let i=0;i<units.length;i++){
      const delay=units.length>1?(i/(units.length-1))*(typ.stagger*.49):0;
      const progress=Math.max(0,Math.min(1,(local-delay)/.25));
      const e=progress*progress*(3-2*progress),unit=units[i];
      unit.style.opacity=String(e);
      unit.style.transform="translate3d(0,"+((1-e)*52).toFixed(2)+"px,0) rotateX("+((1-e)*-25).toFixed(2)+"deg) scale("+(.88+.12*e).toFixed(3)+")";
      unit.style.filter="blur("+((1-e)*4).toFixed(2)+"px)";
      unit.style.fontWeight=String(Math.round(typ.weightFrom+(typ.weightTo-typ.weightFrom)*e));
    }
  }
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  function drawAt(time,target=null){
    const t=clamp(Number(time)/D)*D;
    let chosen=shots.findIndex(s=>t>=s.startFrame/FPS&&t<s.endFrame/FPS);
    if(chosen===-1)chosen=shots.length-1;
    const s=shots[chosen],o=objects[chosen],len=(s.endFrame-s.startFrame)/FPS;
    const local=clamp((t-s.startFrame/FPS)/len),glide=ease(local);
    updateEditorOverlays(t);
    objects.forEach((obj,i)=>{obj.group.visible=i===chosen;});
    glowQuad.visible=!!s.glow&&s.glow.intensity>0;
    if(glowQuad.visible){
      glowMat.uniforms.uColor.value.set(s.glow.color);
      glowMat.uniforms.uIntensity.value=s.glow.intensity;
      glowMat.uniforms.uSpeed.value=s.glow.speed;
      glowMat.uniforms.uTime.value=t;
      glowMat.uniforms.uPosition.value.set(s.glow.x,s.glow.y);
    }
    const tint=new THREE.Color(s.accent);
    accentLight.color.copy(tint);
    accentLight.intensity=50+20*Math.sin(local*Math.PI);
    key.position.x=-4.4+2.5*glide;
    const speed=.7+s.energy*1.7;
    o.group.rotation.set(.15+.07*Math.sin(t),local*Math.PI*speed+.2,.13*Math.sin(t*1.7));
    o.group.position.set(.12*Math.sin(t*.6),.15+.28*Math.sin(Math.PI*local),0);
    o.group.scale.setScalar(.96+s.depth*.12+.07*Math.sin(local*Math.PI));
    if(o.visualGroup&&s.visual.type==="card-grid"){
      const scroll=s.visual.scroll*glide;
      o.visualGroup.position.x=s.visual.position[0]+scroll;
      o.visualGroup.position.y=s.visual.position[1]+scroll*.34;
    }
    o.orbit1.rotation.set(.28+local*.37,.3+local*.94,.12);
    o.orbit2.rotation.set(local*.52,.4+local*1.24,.3+local*.32);
    o.particles.forEach((obj,j)=>{
      const a=local*Math.PI*1.9+j*.6;
      obj.position.set(Math.cos(a)*(2.5+.08*j),Math.sin(a+j*.3)*1.3,Math.sin(a)*1.28);
    });
    let angle=-.42+glide*.87,distance=7.6-.9*glide;
    if(s.camera==="dolly"){angle=-.13+glide*.29;distance=8.4-1.7*glide;}
    if(s.camera==="reveal"){angle=-.46+glide*.6;distance=6.9+1.15*glide;}
    if(s.camera==="truck-left"){angle=-.45;distance=7.6;}
    if(s.camera==="truck-right"){angle=.43;distance=7.6;}
    if(s.camera==="arc"){angle=-.69+glide*1.35;distance=7.6;}
    const shift=s.camera==="truck-left"?.8-1.55*glide:s.camera==="truck-right"?-.8+1.55*glide:0;
    camera.position.set(Math.sin(angle)*distance+shift,.62+.33*Math.sin(Math.PI*local),Math.cos(angle)*distance);
    camera.lookAt(0,.08,0);
    camera.updateMatrixWorld();
    const ahead=new THREE.Vector3();camera.getWorldDirection(ahead);
    glowQuad.position.copy(camera.position).addScaledVector(ahead,16);
    glowQuad.quaternion.copy(camera.quaternion);
    labels.forEach((label,i)=>{
      const on=i===chosen;const intro=on?ease(local*8):0,outro=on?ease((1-local)*12):0,show=intro*outro;
      label.style.opacity=String(show);
      label.style.visibility=show>.001?"visible":"hidden";
      label.style.transform="translate3d("+(35*(1-intro)-22*(1-outro)).toFixed(1)+"px,"+
        (72*(1-intro)+32*(1-outro)).toFixed(1)+"px,0) rotateY("+(-7*(1-intro)).toFixed(2)+"deg) scale("+
        ((.93+.07*intro)*s.textScale).toFixed(3)+")";
      if(on)updateTypography(i,local);
    });
    renderer.setRenderTarget(target);
    renderer.render(world,camera);
    renderer.setRenderTarget(null);
  }
  function draw(time){
    const t=Math.max(0,Math.min(D,Number(time)||0));
    let chosen=shots.findIndex(s=>t>=s.startFrame/FPS&&t<s.endFrame/FPS);
    if(chosen<0)chosen=shots.length-1;
    const samples=temporalShutterSamples(shots[chosen],t,FPS,preview);
    const dofStrength=Math.max(0,Math.min(1,Number(shots[chosen].depthOfField??0)));
    if(samples.length===1&&dofStrength<=0){drawAt(t);return;}
    if(samples.length===1){
      drawAt(t,accumulationTarget);
    }else{
      const priorAutoClear=renderer.autoClear;
      const clearColor=renderer.getClearColor(new THREE.Color()).clone();
      const clearAlpha=renderer.getClearAlpha();
      renderer.autoClear=false;
      try{
        renderer.setRenderTarget(accumulationTarget);
        renderer.setClearColor(0x000000,0);
        renderer.clear(true,true,true);
        for(const moment of samples){
          renderer.setRenderTarget(colorTarget);
          renderer.clear(true,true,true);
          drawAt(moment,colorTarget);
          blurPass.uniforms.weight.value=1/samples.length;
          renderer.setRenderTarget(accumulationTarget);
          renderer.render(passScene,passCam);
        }
      }finally{
        renderer.setRenderTarget(null);
        renderer.setClearColor(clearColor,clearAlpha);
        renderer.autoClear=priorAutoClear;
      }
    }
    // Re-render the requested timestamp into the depth target. This keeps the
    // focus plane frame-accurate even when color is accumulated across subframes.
    drawAt(t,colorTarget);
    if(dofStrength>0){
      dofMaterial.uniforms.uDof.value=dofStrength;
      dofMaterial.uniforms.uFocusDistance.value=camera.position.distanceTo(focusPoint);
      renderer.render(dofScene,passCam);
    }else{
      renderer.render(resolveScene,passCam);
    }
  }
  // Browser playback is driven by GSAP ticker; HyperFrames capture is seek-only.
  let time=0,playing=false;
  function stopPlayback(){if(playing)gsap.ticker.remove(tick);playing=false;}
  function tick(_,deltaMs){
    if(!playing)return;
    time=Math.min(D,time+Math.max(0,Number(deltaMs)||0)/1000);draw(time);
    if(time>=D){stopPlayback();window.parent.postMessage({mediaforge:"ended"},"*");}
  }
  window.addEventListener("message",e=>{
    if(e.origin!==location.origin)return;
    const d=e.data||{};
    if(d.mediaforge==="seek"){stopPlayback();time=Math.min(D,Math.max(0,Number(d.time)||0));draw(time);}
    if(d.mediaforge==="play"&&!playing){playing=true;gsap.ticker.add(tick);}
    if(d.mediaforge==="pause")stopPlayback();
  });
  window.addEventListener("hf-seek",event=>{
    const t=Number(event.detail.time??0);
    const videoReady=[...document.querySelectorAll(".editor-layer video")].map(video=>video.readyState>=1?Promise.resolve():new Promise(resolve=>{
      const done=()=>{video.removeEventListener("loadedmetadata",done);resolve();};
      video.addEventListener("loadedmetadata",done,{once:true});setTimeout(done,5000);
    }));
    event.detail.waitUntil(Promise.all([...texturePromises,...videoReady]).then(()=>{draw(t);return Promise.all(pendingVideoSeeks.splice(0));}));
  });
  window.__hf=window.__hf||{};
  window.__hf.buildReady=window.__hf.buildReady||{};
  window.__timelines=window.__timelines||{};
  window.__timelines.main=window.__timelines.main||gsap.timeline({paused:true});
  const ready=Promise.all(texturePromises).then(()=>draw(0));
  window.__hf.buildReady["editor-cinema"]=ready;
  ready.then(()=>window.parent.postMessage({mediaforge:"ready",duration:D},"*"))
    .catch(error=>window.parent.postMessage({mediaforge:"error",reason:String(error)},"*"));
}
export function buildEditorSceneModule(p,{sceneIndex,preview=false}={}){
  if(p.mode==="timeline-free"){validateEditorProject(p);return buildEditorFreeTimelineModule(p);}
  const shots=selectScenes(p,sceneIndex),[w,h]=dims(p.aspectRatio),d=shots.at(-1).endFrame/p.fps;
  const baseBackground=getEditorStylePreset(p.stylePreset)?.background??"#060810";
  const assets=Object.fromEntries((p.assets??[]).map(a=>[a.id,preview
    ?"/api/editor/projects/"+p.id+"/assets/"+a.id
    :"./assets/images/"+a.id+"."+a.extension]));
  const offset=sceneIndex===undefined?0:p.scenes[sceneIndex].startFrame;
  const layers=p.layers??[],captions=p.captions??[];
  return 'import * as THREE from "three";\nconst shots='+JSON.stringify(shots)+';\n'+
    'const assets='+JSON.stringify(assets)+';\n'+
    'const editorLayers='+JSON.stringify(layers)+';\nconst editorCaptions='+JSON.stringify(captions)+';\nconst FRAME_OFFSET='+offset+';\n'+
    'const motionV2='+JSON.stringify(p.motionV2??null)+';\n'+
    'const motionV2Runtime='+motionV2Runtime.toString()+';\n'+
    'const baseBackground='+JSON.stringify(baseBackground)+';\n'+
    'const temporalShutterSamples='+temporalShutterSamples.toString()+';\n'+
    'const W='+w+',H='+h+',FPS='+p.fps+',D='+d+',preview='+Boolean(preview)+',renderScale='+ (p.preset==="cinematic-3d-editor-homologation-v1"?.5:1)+';\n('+
    editorRuntime.toString()+')();\n';
}
export async function buildEditorRenderFiles(p,{sceneIndex}={}){
  validateEditorProject(p);
  const files=[
    {path:"index.html",content:buildEditorIndex(p,{sceneIndex})},
    {path:"assets/scene.mjs",content:buildEditorSceneModule(p,{sceneIndex})},
    {path:"assets/gsap.min.js",content:await readFile(new URL("../assets/gsap.min.js",import.meta.url),"utf8")},
    {path:"assets/style-dna.json",content:JSON.stringify(buildEditorStyleDna(p),null,2)}
  ];
  files.push(...await buildEditorVisualAssets(p,{sceneIndex}));
  files.push(...await buildEditorLayerAssets(p,{sceneIndex}));
  if(p.mode!=="timeline-free")for(const [path,source] of [
    ["assets/three/build/three.core.js","../node_modules/three/build/three.core.js"],
    ["assets/three/build/three.module.js","../node_modules/three/build/three.module.js"],
    ["assets/three/LICENSE","../node_modules/three/LICENSE"]
  ])files.push({path,content:await readFile(new URL(source,import.meta.url),"utf8")});
  return files;
}
