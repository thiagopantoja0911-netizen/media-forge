/* Motion Engine V2 native authoring panel. Runs after app.js + workspace-layout.js.
 * Uses the same MediaForge project model saved by the official timeline.
 */
(()=>{
"use strict";
const api=()=>window.MediaForgeTimelineAPI;
const P=()=>api()?.getProject();
const left=document.querySelector(".leftpanel");
const tracks=document.querySelector(".timeline-panel .tracks");
if(!left||!tracks)return;
const panel=document.createElement("details");
panel.className="editor-tab-group motion-v2-panel";
panel.innerHTML='<summary>Motion Engine V2 · 2D/2.5D</summary>'+
'<div class="editor-tab-body">'+
'<p class="aside-help">Movimentos espaciais reais, fundo por keyframe e curvas Bézier. A prévia e o MP4 usam os mesmos dados.</p>'+
'<label class="motion-v2-toggle"><input id="motionV2Enabled" type="checkbox"> Usar composição Motion V2</label><label class="motion-v2-toggle"><input id="motionV2HideTitles" type="checkbox"> Ocultar títulos 3D antigos</label>'+
'<div class="motion-v2-grid"><label>Fundo<select id="motionV2Pattern">'+
'<option value="gradient">Gradiente vivo</option><option value="solid">Cor sólida</option>'+
'<option value="rings">Anéis</option><option value="grid">Grid</option></select></label>'+
'<label>Cor base<input id="motionV2Color" type="color" value="#fafafa"></label>'+
'<label>Cor de destaque<input id="motionV2Accent" type="color" value="#d9e9ff"></label>'+
'<label>Entrada<select id="motionV2Entry"><option value="left">Da esquerda</option><option value="right">Da direita</option><option value="top">De cima</option><option value="bottom">De baixo</option></select></label>'+
'<label>Saída<select id="motionV2Exit"><option value="right">Pela direita</option><option value="left">Pela esquerda</option><option value="top">Por cima</option><option value="bottom">Por baixo</option></select></label>'+
'<label>Easing<select id="motionV2Ease"><option value="cubic-out">Cubic out</option><option value="ease-in-out">Ease in-out</option><option value="spring">Spring</option><option value="bezier">Bézier (0.22,1,0.36,1)</option></select></label>'+
'<label>Entrada (frames)<input id="motionV2InFrames" type="number" min="1" max="120" value="16"></label>'+
'<label>Saída (frames)<input id="motionV2OutFrames" type="number" min="1" max="120" value="13"></label></div>'+
'<label class="motion-v2-reference">Frame Lab · ID da referência<input id="motionV2FrameLabReference" maxlength="32" placeholder="ID de 32 caracteres" type="text"></label>'+
'<div class="motion-v2-actions">'+
'<button type="button" id="motionV2ApplyBackground">＋ Keyframe de fundo no cursor</button>'+
'<button type="button" id="motionV2ApplyLayer">Aplicar à camada selecionada</button>'+
'<button type="button" id="motionV2Bezier">＋ Trajetória Bézier em arco</button>'+
'<button type="button" id="motionV2AutoCompose">Preparar todas as camadas</button>'+
'<button type="button" id="motionV2AttachReference">Vincular referência Frame Lab</button>'+
'<button type="button" id="motionV2QA">Executar QA de movimento</button></div>'+
'<div id="motionV2Status" class="motion-v2-result" role="status" aria-live="polite">Selecione um projeto para editar.</div>'+
'</div>';
left.append(panel);
const $=id=>document.getElementById(id);
const bgName=document.createElement("div");bgName.className="track-name";bgName.textContent="◨ FUNDO V2";
const bgRail=document.createElement("div");bgRail.className="track-content motion-v2-track";bgRail.id="motionV2Track";
tracks.append(bgName,bgRail);
function init(project){
 project.motionV2??={version:1,enabled:true,background:{keyframes:[]},moves:{}};
 project.motionV2.version=1;
 project.motionV2.moves??={};
 project.motionV2.background??={keyframes:[]};
 if(!project.motionV2.background.keyframes.length)project.motionV2.background.keyframes.push({frame:0,color:"#f9fafb",accent:"#bed3ef",pattern:"gradient",panX:0,panY:0,zoom:1,ease:"ease-in-out"});
 return project.motionV2;
}
function notify(msg){$("motionV2Status").textContent=msg;api()?.notify(msg);}
function commit(message){api().commit();notify(message);}
function selectedLayer(){
 const p=P(),s=api()?.getSelection();return p&&s?.kind==="layer"?p.layers?.find(x=>x.id===s.id):null;
}
function frame(){return Math.round(api().currentFrame());}
function ease(){return $("motionV2Ease").value==="bezier"?[.22,1,.36,1]:$("motionV2Ease").value;}
function keysFor(p){return p.motionV2?.background?.keyframes||[];}
function updateBackground(){
 const p=P();if(!p)return notify("Abra um projeto primeiro.");
 const m=init(p);m.enabled=true;$("motionV2Enabled").checked=true;
 const f=Math.max(0,Math.min(p.totalFrames,frame()));
 const next={frame:f,color:$("motionV2Color").value,accent:$("motionV2Accent").value,
   pattern:$("motionV2Pattern").value,panX:0,panY:0,zoom:1,ease:"ease-in-out"};
 const keys=m.background.keyframes;
 const prev=keys.findIndex(x=>x.frame===f);
 if(prev>=0)keys[prev]=next;else keys.push(next);
 keys.sort((a,b)=>a.frame-b.frame);
 commit("Fundo animado atualizado no quadro "+f+".");
}
function layerMove(){
 const p=P(),layer=selectedLayer();if(!p||!layer)return notify("Selecione uma camada no track CAMADAS para animar.");
 const m=init(p);m.enabled=true;$("motionV2Enabled").checked=true;
 const available=layer.endFrame-layer.startFrame;
 const entry=Math.max(1,Math.min(available-1,Number($("motionV2InFrames").value)||16,120));
 const exit=Math.max(1,Math.min(available-1,Number($("motionV2OutFrames").value)||13,120));
 m.moves[layer.id]={...(m.moves[layer.id]||{}),
  enter:{from:$("motionV2Entry").value,frames:entry,ease:ease(),mask:"none"},
  exit:{to:$("motionV2Exit").value,frames:exit,ease:"cubic-in",mask:"none"}};
 commit("Entrada e saída espacial aplicadas à camada "+layer.name+".");
}
function addArc(){
 const p=P(),layer=selectedLayer();if(!p||!layer)return notify("Selecione uma camada para criar uma trajetória.");
 const m=init(p);m.enabled=true;
 const len=layer.endFrame-layer.startFrame;
 if(len<3)return notify("Camada curta demais para uma curva.");
 const middle=layer.startFrame+Math.round(len*.5);
 m.moves[layer.id]??={};
 m.moves[layer.id].path=[
  {frame:layer.startFrame,x:0,y:80,out:[100,-120]},
  {frame:middle,x:140,y:-50,in:[-80,25],out:[75,-130],ease:[.19,.92,.31,1]},
  {frame:layer.endFrame,x:0,y:0,in:[-110,45],ease:"ease-in-out"}
 ];
 commit("Trajetória Bézier de três pontos adicionada à camada.");
}
function autoCompose(){
 const p=P();if(!p)return notify("Abra um projeto para preparar o motion.");
 const m=init(p);m.enabled=true;
 const palette=[
  ["#0B1220","#38D6C8","gradient"],["#0E1B2E","#F05AA6","rings"],
  ["#12182C","#8A6CFF","grid"],["#F4F7FB","#F4A340","gradient"],
  ["#0B1824","#36A9FF","rings"],["#1D1820","#FF6C50","grid"],
  ["#F8F7FC","#C78BFF","gradient"],["#071B18","#48D1A0","rings"],
  ["#1B1020","#F15C91","grid"],["#101A36","#6E8BFF","gradient"],
  ["#1A1B1D","#F0B45B","rings"],["#071B22","#38D6C8","grid"]
 ];
 const canvas=p.aspectRatio==="16:9"?[1920,1080]:p.aspectRatio==="1:1"?[1080,1080]:[1080,1920];
 const existing=p.layers??[];
 const titleLayers=existing.filter(l=>l.type==="text"&&/^Título editável \d+$/.test(l.name))
   .sort((a,b)=>Number(a.name.match(/\d+/)?.[0]||0)-Number(b.name.match(/\d+/)?.[0]||0));
 const makeLayer=(name,text,start,end,kind,index)=>{
   const title=kind==="title",kicker=kind==="kicker";
   const width=title?Math.round(canvas[0]*.87):Math.round(canvas[0]*.80);
   const height=title?Math.round(canvas[1]*.22):Math.round(canvas[1]*(kicker?.075:.12));
   const light=index===3||index===6;
   return {
    id:crypto.randomUUID().replaceAll("-",""),name,type:"text",text,startFrame:start,endFrame:end,
    x:Math.round((canvas[0]-width)/2),
    y:title?Math.round(canvas[1]*.39):kicker?Math.round(canvas[1]*.29):Math.round(canvas[1]*.62),
    z:0,width,height,rotationX:0,rotationY:0,rotationZ:0,scale:1,opacity:1,
    color:title?(light?"#111827":"#F9FAFB"):kicker?palette[index%palette.length][1]:(light?"#334155":"#DCE7F4"),
    fontFamily:"sans",fontSize:title?Math.max(58,Math.min(112,Math.floor(canvas[0]*.55/Math.max(5,text.length)))):kicker?30:40,
    fontWeight:title?900:kicker?800:500,textAlign:"center",zIndex:title?30:kicker?32:28,
    blendMode:"normal",keyframes:[]
   };
 };
 const validMotionIds=new Set();
 const mainFrames=Math.max(1,Math.min(Math.round(p.fps*.9),120));
 const auxFrames=Math.max(1,Math.min(Math.round(p.fps*.9),120));
 p.scenes.forEach((scene,i)=>{
   const start=scene.startFrame,end=scene.endFrame,len=end-start;
   let title=titleLayers[i];
   if(!title){
     title=makeLayer("Título editável "+(i+1),scene.headline,start,end,"title",i);
     p.layers.push(title);titleLayers[i]=title;
   }
   title.text=scene.headline;title.startFrame=start;title.endFrame=end;
   title.fontSize=Math.max(58,Math.min(112,Math.floor(canvas[0]*.55/Math.max(5,scene.headline.length))));
   title.color=(i===3||i===6)?"#111827":"#F9FAFB";
   const kickerName="Kicker editável "+(i+1);
   let kicker=p.layers.find(l=>l.type==="text"&&l.name===kickerName);
   if(!kicker){kicker=makeLayer(kickerName,scene.kicker||"PARK CRIATIVO",start+3,end-2,"kicker",i);p.layers.push(kicker);}
   kicker.text=scene.kicker||"PARK CRIATIVO";kicker.startFrame=start+3;kicker.endFrame=end-2;
   const detailName="Apoio editável "+(i+1);
   let detail=p.layers.find(l=>l.type==="text"&&l.name===detailName);
   if(!detail){detail=makeLayer(detailName,scene.detail||"",start+7,end-4,"detail",i);p.layers.push(detail);}
   detail.text=scene.detail||"";detail.startFrame=start+7;detail.endFrame=end-4;
   const direction=i%2?"right":"left";
   const opposite=i%2?"left":"right";
   const mask=i%3===0?"wipe":"none";
   const mid=start+Math.round(len*.5);
   const configure=(layer,from,to,frames,arc)=>{
     const fr=Math.max(1,Math.min(frames,Math.floor((layer.endFrame-layer.startFrame)*.38),120));
     const move={enter:{from,frames:fr,ease:"cubic-out",mask},
       exit:{to,frames:fr,ease:"cubic-in",mask}};
     if(arc){
       move.path=[
        {frame:layer.startFrame,x:0,y:0,out:[18,-14]},
        {frame:layer.startFrame+Math.round((layer.endFrame-layer.startFrame)*.5),
         x:i%2?-28:28,y:-18,in:[-16,10],out:[16,-8],ease:[.42,0,.58,1]},
        {frame:layer.endFrame,x:0,y:0,in:[-18,12],ease:"ease-in-out"}
       ];
     }
     m.moves[layer.id]=move;validMotionIds.add(layer.id);
   };
   configure(title,direction,opposite,mainFrames,true);
   configure(kicker,"top","top",auxFrames,false);
   configure(detail,"bottom","bottom",auxFrames,false);
 });
 for(const id of Object.keys(m.moves))if(!validMotionIds.has(id)&&!p.layers.some(l=>l.id===id))delete m.moves[id];
 m.hideSceneTitles=true;
 m.background.keyframes=p.scenes.slice(0,60).map((scene,i)=>{
   const c=palette[i%palette.length];
   return {frame:scene.startFrame,color:c[0],accent:c[1],pattern:c[2],
    panX:i%2===0?-8:8,panY:i%3===0?-5:5,zoom:1.06,ease:[.22,1,.36,1]};
 });
 $("motionV2Enabled").checked=true;
 $("motionV2HideTitles").checked=true;
 commit("Motion V2 nativo preparado: "+p.layers.length+" camadas (título, kicker e apoio), entradas suaves, curvas Bézier e "+m.background.keyframes.length+" fundos.");
}
async function audit(){
 const p=P();if(!p)return notify("Abra um projeto para executar QA.");
 try{
   const r=await fetch("/api/editor/projects/"+p.id+"/motion-qa",{credentials:"same-origin",cache:"no-store"});
   if(!r.ok)throw new Error("HTTP "+r.status);
   const data=await r.json(),a=data.qa;
   const warnings=a.issues.filter(x=>x.severity==="warning");
   $("motionV2Status").textContent="QA preflight: "+a.summary.animatedLayers+" camadas animadas · "+
      a.summary.backgroundChanges+" mudanças de fundo · "+warnings.length+" alertas. "+
      warnings.slice(0,3).map(x=>x.code+": "+x.message).join(" | ")+
      " | Compare o MP4 final no Frame Lab para QA óptico.";
 }catch(error){notify("Salve o projeto antes do QA: "+error.message);}
}
function refresh(){
 const p=P(),m=p?.motionV2;
 $("motionV2Enabled").disabled=!p;
 $("motionV2Enabled").checked=Boolean(m?.enabled);
 $("motionV2HideTitles").checked=Boolean(m?.hideSceneTitles);
 $("motionV2HideTitles").disabled=!p;
 $("motionV2AttachReference").disabled=!p;
 if(document.activeElement!==$("motionV2FrameLabReference"))$("motionV2FrameLabReference").value=m?.frameLabProjectId||"";
 for(const id of ["motionV2ApplyBackground","motionV2AutoCompose","motionV2QA"]){$(id).disabled=!p;}
 for(const id of ["motionV2ApplyLayer","motionV2Bezier"]){$(id).disabled=!selectedLayer();}
 bgRail.replaceChildren();
 if(!p)return;
 const keys=keysFor(p),last=p.totalFrames;
 for(let i=0;i<keys.length;i++){
   const k=keys[i],stop=keys[i+1]?.frame??last;
   if(stop<=k.frame)continue;
   const clip=document.createElement("span");clip.className="motion-v2-bg-clip";
   clip.style.left=k.frame/last*100+"%";clip.style.width=(stop-k.frame)/last*100+"%";
   clip.style.background="linear-gradient(135deg,"+k.color+","+k.accent+")";
   clip.textContent="BG "+(k.frame/p.fps).toFixed(1)+"s";
   clip.title="Fundo: "+k.pattern+" · quadro "+k.frame;
   clip.addEventListener("click",()=>api().seekFrame(k.frame));
   bgRail.append(clip);
 }
}
$("motionV2Enabled").addEventListener("change",e=>{
 const p=P();if(!p)return;
 const m=init(p);m.enabled=e.target.checked;
 commit("Motion V2 "+(m.enabled?"ativado":"desativado")+".");
});
$("motionV2HideTitles").addEventListener("change",e=>{
 const p=P();if(!p)return;
 const m=init(p);m.hideSceneTitles=e.target.checked;
 commit("Títulos 3D "+(m.hideSceneTitles?"ocultados":"visíveis")+".");
});
$("motionV2AttachReference").addEventListener("click",()=>{
 const p=P();if(!p)return notify("Abra um projeto primeiro.");
 const value=$("motionV2FrameLabReference").value.trim();
 if(value&&!/^[a-f0-9]{32}$/.test(value))return notify("Informe um ID Frame Lab válido de 32 caracteres.");
 const m=init(p);
 if(value)m.frameLabProjectId=value;else delete m.frameLabProjectId;
 commit(value?"Referência vinculada; próximos renders gerarão comparação no Frame Lab.":"Referência desvinculada.");
});
$("motionV2ApplyBackground").addEventListener("click",updateBackground);
$("motionV2ApplyLayer").addEventListener("click",layerMove);
$("motionV2Bezier").addEventListener("click",addArc);
$("motionV2AutoCompose").addEventListener("click",autoCompose);
$("motionV2QA").addEventListener("click",audit);
window.MediaForgeMotionV2={refresh};
setInterval(()=>{const p=P(),s=api()?.getSelection(),k=(p?.id||"")+":"+(p?.revision||"")+":"+(s?.id||"");
 if(k!==refresh.last){refresh.last=k;refresh();}
},1200);
refresh();
})();
