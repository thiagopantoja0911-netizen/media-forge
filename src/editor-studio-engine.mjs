
import { readFile } from "node:fs/promises";
import { validateEditorProject } from "./editor-studio-core.mjs";
import { buildEditorVisualAssets } from "./editor-visual-assets.mjs";
import { buildEditorStyleDna, getEditorStylePreset } from "./editor-style-presets.mjs";
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dims=ratio=>ratio==="16:9"?[1920,1080]:ratio==="1:1"?[1080,1080]:[1080,1920];
function selectScenes(p,index){
  validateEditorProject(p);
  const items=index===undefined?p.scenes:[p.scenes[index]];
  if(items.some(v=>!v))throw Object.assign(new Error("Cena inválida."),{status:404});
  const offset=items[0].startFrame;
  return items.map(s=>({...s,startFrame:s.startFrame-offset,endFrame:s.endFrame-offset}));
}
export function buildEditorIndex(p,{sceneIndex,preview=false,projectId}={}){
  const shots=selectScenes(p,sceneIndex),[w,h]=dims(p.aspectRatio);
  const duration=shots.at(-1).endFrame/p.fps;
  const labels=shots.map((s,i)=>
    '<div id="caption-'+i+'" class="caption clip" data-layout-ignore data-start="'+s.startFrame/p.fps+'" data-duration="'+(s.endFrame-s.startFrame)/p.fps+'" data-track-index="'+(i+2)+'">'+
    '<span class="eyebrow">'+esc(s.kicker)+'</span>'+
    '<h1 class="hero-title">'+esc(s.headline)+'</h1>'+
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
    "#root{position:relative;width:"+w+"px;height:"+h+"px;overflow:hidden;background:#070912;font-family:Arial,Helvetica,sans-serif;color:"+ink+";isolation:isolate}",
    "#world{position:absolute;inset:0;width:100%;height:100%;z-index:0;display:block}",
    ".caption{position:absolute;top:14%;left:10%;width:80%;z-index:3;pointer-events:none;transform-origin:15% 50%;will-change:transform,opacity}",
    ".eyebrow{display:inline-block;padding:13px 25px;border:2px solid #ffffff66;border-radius:100px;letter-spacing:.19em;font-size:28px;font-weight:800;background:#03030688}",
    ".hero-title{margin:47px 0 0;font-size:"+titleSize+"px;line-height:1.02;letter-spacing:-.06em;font-weight:900;overflow-wrap:anywhere;text-shadow:0 14px 34px #000c}",
    ".detail{margin:33px 0 0;max-width:88%;font-size:"+detailSize+"px;font-weight:600;line-height:1.35;color:"+supporting+";text-shadow:0 8px 22px #0005}",
    ".chapter{display:block;margin-top:32px;font-size:20px;letter-spacing:.2em;color:#a5afca;font-weight:800}"
  ].join("");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(p.title)+' — Editor MediaForge</title><style>'+style+'</style>'+
    '<script type="importmap">{"imports":{"three":"'+vendor+'"}}<\/script></head>'+
    '<body><div id="root" data-composition-id="main" data-width="'+w+'" data-height="'+h+
    '" data-fps="'+p.fps+'" data-duration="'+duration+'" data-motion-blur="on" data-motion-blur-shutter="180">'+
    '<canvas id="world" class="clip" data-start="0" data-duration="'+duration+
    '" data-track-index="1" data-layout-allow-overlap aria-label="Cena 3D"></canvas>'+labels+audio+'</div>'+
    '<script src="'+gsap+'"><\/script><script type="module" src="'+script+'"><\/script></body></html>';
}
function editorRuntime(){
  const canvas=document.getElementById("world");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance",preserveDrawingBuffer:true});
  const scale=preview?.58:1;
  renderer.setSize(Math.round(W*scale),Math.round(H*scale),false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  const world=new THREE.Scene();
  world.background=new THREE.Color(baseBackground);
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
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  function draw(time){
    const t=clamp(Number(time)/D)*D;
    let chosen=shots.findIndex(s=>t>=s.startFrame/FPS&&t<s.endFrame/FPS);
    if(chosen===-1)chosen=shots.length-1;
    const s=shots[chosen],o=objects[chosen],len=(s.endFrame-s.startFrame)/FPS;
    const local=clamp((t-s.startFrame/FPS)/len),glide=ease(local);
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
    });
    renderer.render(world,camera);
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
    event.detail.waitUntil(Promise.all(texturePromises).then(()=>draw(t)));
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
  const shots=selectScenes(p,sceneIndex),[w,h]=dims(p.aspectRatio),d=shots.at(-1).endFrame/p.fps;
  const baseBackground=getEditorStylePreset(p.stylePreset)?.background??"#060810";
  const assets=Object.fromEntries((p.assets??[]).map(a=>[a.id,preview
    ?"/api/editor/projects/"+p.id+"/assets/"+a.id
    :"./assets/images/"+a.id+"."+a.extension]));
  return 'import * as THREE from "three";\nconst shots='+JSON.stringify(shots)+';\n'+
    'const assets='+JSON.stringify(assets)+';\n'+
    'const baseBackground='+JSON.stringify(baseBackground)+';\n'+
    'const W='+w+',H='+h+',FPS='+p.fps+',D='+d+',preview='+Boolean(preview)+';\n('+
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
  for(const [path,source] of [
    ["assets/three/build/three.core.js","../node_modules/three/build/three.core.js"],
    ["assets/three/build/three.module.js","../node_modules/three/build/three.module.js"],
    ["assets/three/LICENSE","../node_modules/three/LICENSE"]
  ])files.push({path,content:await readFile(new URL(source,import.meta.url),"utf8")});
  return files;
}
