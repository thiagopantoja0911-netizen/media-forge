/* Motion Engine V2 — pure, deterministic per-frame animation shared by preview/HyperFrames.
 * No browser APIs in the math core. Old projects with no motionV2 stay unchanged.
 * Keep motionV2Runtime self-contained: it is serialized inside the browser scene module.
 */
const err=(code,message)=>Object.assign(new Error(message),{code});
const number=(v,a,b)=>typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b;
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const color=v=>typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v);
const dirs=new Set(["none","left","right","top","bottom"]);
const patterns=new Set(["solid","gradient","grid","rings"]);
const easingNames=new Set(["linear","ease-in","ease-out","ease-in-out","cubic-out","cubic-in","spring"]);
function checkEase(e){
 if(e===undefined)return true;
 if(typeof e==="string")return easingNames.has(e);
 return Array.isArray(e)&&e.length===4&&e.every((n,i)=>number(n,i%2===0?0:-1,i%2===0?1:2));
}
function checkPhase(phase,direction){
 if(phase===undefined)return;
 if(!phase||typeof phase!=="object"||!dirs.has(phase[direction])||!int(phase.frames,1,180)||!checkEase(phase.ease)||
    (phase.mask!==undefined&&!["none","wipe"].includes(phase.mask)))
  throw err("MOTION_PHASE_INVALID","Entrada/saída de camada deve indicar direção, duração e easing válidos.");
}
export function validateMotionV2(project){
 const m=project.motionV2;
 if(m===undefined)return project;
 if(!m||typeof m!=="object"||m.version!==1||typeof m.enabled!=="boolean")
   throw err("MOTION_V2_INVALID","Motion V2 precisa de version:1 e enabled boolean.");
 if(m.frameLabProjectId!==undefined&&!(typeof m.frameLabProjectId==="string"&&/^[a-f0-9]{32}$/.test(m.frameLabProjectId)))
   throw err("MOTION_FRAME_LAB_INVALID","ID da referência Frame Lab precisa de 32 dígitos hexadecimais.");
 if(m.hideSceneTitles!==undefined&&typeof m.hideSceneTitles!=="boolean")
   throw err("MOTION_TITLES_INVALID","hideSceneTitles precisa ser boolean.");
 if(m.background!==undefined){
   const k=m.background?.keyframes;
   if(!Array.isArray(k)||k.length<1||k.length>120)throw err("MOTION_BACKGROUND_INVALID","Informe de 1 a 120 keyframes de fundo.");
   let last=-1;
   for(const f of k){
     if(!f||!int(f.frame,0,project.totalFrames)||f.frame<=last||!color(f.color)||!color(f.accent)||
        !patterns.has(f.pattern)||!number(f.panX??0,-30,30)||!number(f.panY??0,-30,30)||
        !number(f.zoom??1,1,1.6)||!checkEase(f.ease))
       throw err("MOTION_BACKGROUND_INVALID","Keyframe de fundo inválido: use frame, color, accent, pattern e pan/zoom opcionais.");
     last=f.frame;
   }
 }
 if(m.moves!==undefined){
   if(!m.moves||typeof m.moves!=="object"||Array.isArray(m.moves)||Object.keys(m.moves).length>160)
     throw err("MOTION_MOVES_INVALID","Movimentos por camada inválidos.");
   const layers=new Map((project.layers??[]).map(x=>[x.id,x]));
   for(const [id,move] of Object.entries(m.moves)){
     const l=layers.get(id);
     if(!l||!move||typeof move!=="object")throw err("MOTION_LAYER_NOT_FOUND","Movimento aponta para camada inexistente.");
     checkPhase(move.enter,"from");checkPhase(move.exit,"to");
     if(move.path!==undefined){
       if(!Array.isArray(move.path)||move.path.length<2||move.path.length>120)
         throw err("MOTION_PATH_INVALID","Trajetória Bézier precisa de 2 a 120 pontos.");
       let last=-1;
       for(const p of move.path){
         if(!p||!int(p.frame,l.startFrame,l.endFrame)||p.frame<=last||!number(p.x,-4320,4320)||
            !number(p.y,-4320,4320)||!checkEase(p.ease)||(
              ["in","out"].some(k=>p[k]!==undefined&&(!Array.isArray(p[k])||p[k].length!==2||!p[k].every(n=>number(n,-4320,4320)))))
           )throw err("MOTION_PATH_INVALID","Pontos/controles de Bézier fora da duração da camada.");
         last=p.frame;
       }
     }
   }
 }
 return project;
}
export function motionV2Runtime(m,screenW,screenH,fps){
 const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
 const L=(a,b,t)=>a+(b-a)*t;
 const bezier=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;};
 function curve(p,ease="cubic-out"){
   const t=clamp(p);
   if(Array.isArray(ease)&&ease.length===4){
     const [x1,y1,x2,y2]=ease;
     let lo=0,hi=1,s=t;
     for(let i=0;i<22;i++){
       s=(lo+hi)/2;
       if(bezier(0,x1,x2,1,s)<t)lo=s;else hi=s;
     }
     return bezier(0,y1,y2,1,s);
   }
   if(ease==="linear")return t;
   if(ease==="ease-in"||ease==="cubic-in")return t*t*t;
   if(ease==="ease-out"||ease==="cubic-out")return 1-Math.pow(1-t,3);
   if(ease==="spring")return (1-Math.exp(-7*t)*Math.cos(10*t))/(1-Math.exp(-7)*Math.cos(10));
   return t*t*(3-2*t);
 }
 const hexRgb=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));
 const rgbHex=(a,b,t)=>"#"+a.map((n,i)=>Math.round(clamp(L(n,b[i],t),0,255)).toString(16).padStart(2,"0")).join("");
 function background(frame){
   const k=m?.background?.keyframes;
   if(!m?.enabled||!k?.length)return null;
   let a=k[0],b=k.at(-1);
   for(let i=0;i<k.length-1;i++)if(frame>=k[i].frame&&frame<=k[i+1].frame){a=k[i];b=k[i+1];break;}
   if(frame<=k[0].frame){a=b=k[0];}
   if(frame>=k.at(-1).frame){a=b=k.at(-1);}
   const t=a===b?0:curve((frame-a.frame)/(b.frame-a.frame),b.ease||"ease-in-out");
   return {
     color:rgbHex(hexRgb(a.color),hexRgb(b.color),t),
     accent:rgbHex(hexRgb(a.accent),hexRgb(b.accent),t),
     pattern:t>.5?b.pattern:a.pattern,
     panX:L(a.panX??0,b.panX??0,t),
     panY:L(a.panY??0,b.panY??0,t),
     zoom:L(a.zoom??1,b.zoom??1,t)
   };
 }
 function path(move,frame){
   const keys=move?.path;
   if(!keys?.length)return {x:0,y:0};
   if(frame<=keys[0].frame)return {x:keys[0].x,y:keys[0].y};
   if(frame>=keys.at(-1).frame)return {x:keys.at(-1).x,y:keys.at(-1).y};
   for(let i=1;i<keys.length;i++)if(frame<=keys[i].frame){
     const a=keys[i-1],b=keys[i],t=curve((frame-a.frame)/(b.frame-a.frame),b.ease||"linear");
     return {
       x:bezier(a.x,a.x+(a.out?.[0]??0),b.x+(b.in?.[0]??0),b.x,t),
       y:bezier(a.y,a.y+(a.out?.[1]??0),b.y+(b.in?.[1]??0),b.y,t)
     };
   }
   return {x:0,y:0};
 }
 function slide(direction,layer){
   const horizontal=screenW+(layer.width||0)+100;
   const vertical=screenH+(layer.height||0)+100;
   return {left:[-horizontal,0],right:[horizontal,0],top:[0,-vertical],bottom:[0,vertical],none:[0,0]}[direction]||[0,0];
 }
 function layer(layer,frame){
   if(!m?.enabled)return null;
   const move=m.moves?.[layer.id];
   if(!move)return null;
   const p=path(move,frame);
   let opacity=1,clipPath="none";
   if(move.enter){
     const {from,frames,mask}=move.enter;
     const progress=clamp((frame-layer.startFrame)/frames);
     const e=curve(progress,move.enter.ease);
     const v=slide(from,layer);p.x+=v[0]*(1-e);p.y+=v[1]*(1-e);
     if(mask==="wipe"&&progress<1){
       const pct=100*(1-e);
       clipPath=from==="left"?"inset(0 0 0 "+pct+"%)":from==="right"?"inset(0 "+pct+"% 0 0)":from==="top"?"inset("+pct+"% 0 0 0)":"inset(0 0 "+pct+"% 0)";
     }
   }
   if(move.exit){
     const {to,frames}=move.exit;
     const progress=clamp((frame-(layer.endFrame-frames))/frames);
     const e=curve(progress,move.exit.ease||"cubic-in");
     const v=slide(to,layer);p.x+=v[0]*e;p.y+=v[1]*e;
     if(move.exit.mask==="wipe"&&progress>0)clipPath=to==="left"?"inset(0 "+(100*e)+"% 0 0)":
       to==="right"?"inset(0 0 0 "+(100*e)+"%)":to==="top"?"inset(0 0 "+(100*e)+"% 0)":"inset("+(100*e)+"% 0 0 0)";
   }
   return {x:p.x,y:p.y,opacity,clipPath};
 }
 return {background,layer,curve,path};
}
export function auditMotionV2(project){
 const report={engine:"motion-v2-preflight",version:1,projectId:project.id,
   frameCount:project.totalFrames,fps:project.fps,passed:true,issues:[],samples:[],summary:{}};
 validateMotionV2(project);
 const m=project.motionV2;
 if(!m?.enabled){
   report.issues.push({severity:"info",code:"MOTION_V2_DISABLED",message:"Projeto legado: Motion V2 desativado."});
   report.summary={backgroundChanges:0,animatedLayers:0,offscreenEntrances:0};
   return report;
 }
 const layers=project.layers??[],moves=m.moves??{},runtime=motionV2Runtime(m,...(project.aspectRatio==="16:9"?[1920,1080]:project.aspectRatio==="1:1"?[1080,1080]:[1080,1920]),project.fps);
 const colors=new Set((m.background?.keyframes??[]).map(x=>x.color.toLowerCase()));
 if(colors.size<2){
   report.issues.push({severity:"warning",code:"STATIC_BACKGROUND",message:"Fundo não muda de cor ao longo da composição."});
 }
 let entrances=0,exits=0,abrupt=0;
 for(const l of layers){
   const mv=moves[l.id];
   if(!mv)continue;
   if(mv.enter&&mv.enter.from!=="none")entrances++;
   else report.issues.push({severity:"warning",code:"ABRUPT_ENTRY",layerId:l.id,message:"Camada sem entrada espacial configurada."});
   if(mv.exit&&mv.exit.to!=="none")exits++;
   const step=Math.max(1,Math.floor(project.fps/5));let last=null;
   for(let f=l.startFrame;f<l.endFrame;f+=step){
      const p=runtime.layer(l,f);
      if(last){
        const speed=Math.hypot(p.x-last.x,p.y-last.y)/(f-last.f);
        if(speed>280){abrupt++;report.issues.push({severity:"warning",code:"MOTION_SPIKE",layerId:l.id,frame:f,
          message:"Deslocamento excessivo entre quadros; revise easing/duração."});break;}
      }
      last={x:p.x,y:p.y,f};
   }
 }
 if(layers.length>0&&Object.keys(moves).length===0)report.issues.push({severity:"warning",code:"MOTION_MISSING",message:"Nenhuma camada usa o motor de trajetórias."});
 report.summary={backgroundChanges:Math.max(0,colors.size-1),animatedLayers:Object.keys(moves).length,offscreenEntrances:entrances,offscreenExits:exits,motionSpikes:abrupt,layerCount:layers.length};
 const cuts=project.scenes.slice(1).map(s=>s.startFrame);
 report.samples=cuts.map(frame=>({frame,before:runtime.background(frame-1),after:runtime.background(frame)}));
 report.passed=!report.issues.some(i=>i.severity==="error");
 return report;
}
