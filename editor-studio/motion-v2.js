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
'<label class="motion-v2-toggle"><input id="motionV2Enabled" type="checkbox"> Usar composição Motion V2</label>'+
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
'<div class="motion-v2-actions">'+
'<button type="button" id="motionV2ApplyBackground">＋ Keyframe de fundo no cursor</button>'+
'<button type="button" id="motionV2ApplyLayer">Aplicar à camada selecionada</button>'+
'<button type="button" id="motionV2Bezier">＋ Trajetória Bézier em arco</button>'+
'<button type="button" id="motionV2AutoCompose">Preparar todas as camadas</button>'+
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
 const colors=[["#f9fafb","#bdd2f4"],["#eef4fa","#f9d6e2"],["#161d2c","#596aa2"],["#fbf2ea","#f1a3be"],["#f0f6f2","#8dd9bd"],["#101826","#53648e"]];
 m.background.keyframes=p.scenes.slice(0,60).map((s,i)=>({frame:s.startFrame,
  color:colors[i%colors.length][0],accent:colors[i%colors.length][1],
  pattern:i%4===2?"rings":i%4===3?"grid":"gradient",
  panX:i%2===0?-6:6,panY:i%3===0?-4:4,zoom:1.04,
  ease:[.22,1,.36,1]}));
 for(const [i,l] of (p.layers||[]).entries()){
   const len=l.endFrame-l.startFrame,fr=Math.max(1,Math.min(Math.round(p.fps*.45),Math.floor(len*.4),120));
   m.moves[l.id]??={};
   m.moves[l.id].enter={from:i%2?"right":"left",frames:fr,ease:[.22,1,.36,1],mask:"none"};
   m.moves[l.id].exit={to:i%2?"left":"right",frames:fr,ease:"cubic-in",mask:"none"};
 }
 $("motionV2Enabled").checked=true;
 commit("Composição V2 preparada: "+m.background.keyframes.length+" fundos e "+Object.keys(m.moves).length+" camadas com trajetória.");
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
