(()=>{"use strict";
  const $=(selector,root=document)=>root.querySelector(selector);
  const main=$(".mainpanel"),left=$(".leftpanel"),inspector=$("#inspectorFields");
  const monitor=$(".player-shell"),header=$(".mainpanel>.preview-head"),oldRemotion=$(".remotion-stage1");
  const panel=$("#remotionLayerPanel"),remotionButton=$("#remotionOpen");
  if(!main||!monitor||!header)return;

  // Convert long lists to independent accordion groups without cloning the
  // inputs. Every original ID/listener/form state stays attached to its node.
  function groupByHeadings(container,{defaultOpen=1,untitled="Essenciais"}={}){
    if(!container||container.dataset.workspaceGrouped==="yes")return;
    container.dataset.workspaceGrouped="yes";
    const source=[...container.children];
    let group=null,body=null,index=0;
    const makeGroup=(title)=>{
      group=document.createElement("details");
      group.className="editor-tab-group";
      group.open=index++<defaultOpen;
      const summary=document.createElement("summary");
      summary.textContent=title;
      body=document.createElement("div");
      body.className="editor-tab-body";
      group.append(summary,body);
      container.append(group);
    };
    for(const node of source){
      if(node.matches(".panel-heading")){
        makeGroup(node.textContent.trim().replace(/\s+/g," "));
        node.remove(); // The summary replaces this heading; do not duplicate it.
      }else if(node.matches(".thin-divider")){node.remove();}
      else{
        if(!group)makeGroup(untitled);
        body.append(node);
      }
    }
  }
  groupByHeadings(left,{defaultOpen:2});
  groupByHeadings(inspector,{defaultOpen:1,untitled:"Essenciais / Cena"});

  const textTitle=$(".mainpanel>.preview-head h1");
  if(textTitle){textTitle.textContent="Monitor de vídeo";}
  if(textTitle?.parentElement){
    const kicker=document.createElement("span");
    kicker.className="workspace-title-kicker";
    kicker.textContent="EDITOR / MEDIAFORGE";
    textTitle.parentElement.prepend(kicker);
  }

  // No second preview panel: the same viewport hosts either Three.js or Remotion.
  const tools=document.createElement("div");
  tools.className="workspace-header-tools";
  const tabs=document.createElement("div");
  tabs.className="preview-mode-switch";
  tabs.setAttribute("role","group");
  tabs.setAttribute("aria-label","Motor de prévia");
  const three=document.createElement("button");
  three.type="button";
  three.textContent="Prévia 3D";
  three.setAttribute("aria-pressed","true");
  three.className="active";
  const remotion=remotionButton;
  if(remotion){
    remotion.textContent="Camadas Remotion";
    remotion.className="";
    remotion.setAttribute("aria-pressed","false");
    tabs.append(three,remotion);
    // The existing remotion-toggle.js continues to control panel.hidden;
    // the new layout only synchronizes the visual tab and monitor.
    function syncMode(){
      const enabled=!panel.hidden;
      main.classList.toggle("remotion-active",enabled);
      monitor.classList.toggle("remotion-active",enabled);
      three.classList.toggle("active",!enabled);
      remotion.classList.toggle("active",enabled);
      three.setAttribute("aria-pressed",String(!enabled));
      remotion.setAttribute("aria-pressed",String(enabled));
      remotion.textContent="Camadas Remotion";
    }
    remotion.addEventListener("click",()=>queueMicrotask(syncMode));
    three.addEventListener("click",()=>{
      panel.hidden=true;
      syncMode();
    });
    if(panel){panel.hidden=true;monitor.append(panel);syncMode();}
  }else tabs.append(three);

  const actions=document.createElement("div");
  actions.className="workspace-toolbar-actions";
  const timelineButton=document.createElement("button");
  timelineButton.type="button";
  timelineButton.className="timeline-size-button";
  timelineButton.textContent="Expandir timeline";
  timelineButton.setAttribute("aria-pressed","false");
  timelineButton.title="Alternar a altura da timeline";
  const storageKey="mediaforge:editor:timeline-expanded";
  try{
    if(sessionStorage.getItem(storageKey)==="yes"){
      main.classList.add("timeline-expanded");
      timelineButton.setAttribute("aria-pressed","true");
      timelineButton.textContent="Reduzir timeline";
    }
  }catch{}
  timelineButton.addEventListener("click",()=>{
    const expanded=main.classList.toggle("timeline-expanded");
    timelineButton.setAttribute("aria-pressed",String(expanded));
    timelineButton.textContent=expanded?"Reduzir timeline":"Expandir timeline";
    try{sessionStorage.setItem(storageKey,expanded?"yes":"no");}catch{}
  });
  actions.append(timelineButton);
  tools.append(tabs,actions);
  header.insertBefore(tools,$(".preview-tags",header));
  oldRemotion?.setAttribute("aria-hidden","true");
})();



/* MediaForge Pro Timeline — editable multi-lane tracks, keyframes and scrubbing.
 * Additive to the existing editor; never triggers a render or edits project
 * contents until a user explicitly moves, trims, splits or duplicates a clip.
 */
(()=>{
"use strict";
const doc=document;
const panel=doc.querySelector(".timeline-panel"),tracks=doc.querySelector(".tracks"),ruler=doc.querySelector(".timeline-panel .ruler");
if(!panel||!tracks||!ruler||doc.querySelector(".pro-timeline-toolbar"))return;
const api=()=>window.MediaForgeTimelineAPI;
const getProject=()=>api()?.getProject();
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const toPercent=(n,total)=>total?100*n/total:0;
const state={zoom:1,snap:true};
const toolbar=doc.createElement("div");toolbar.className="pro-timeline-toolbar";toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","Ferramentas da timeline avançada");
const label=doc.createElement("span");label.className="pro-timeline-title";label.textContent="MULTITRACK PRO";
const hint=doc.createElement("span");hint.className="pro-timeline-hint";hint.textContent="Arraste clipes · bordas redimensionam · losangos = keyframes";
const status=doc.createElement("output");status.className="pro-timeline-status";status.setAttribute("aria-live","polite");
function button(name,description,callback){
 const b=doc.createElement("button");b.type="button";b.className="pro-action";b.textContent=name;b.title=description;
 b.setAttribute("aria-label",description);b.addEventListener("click",callback);return b;
}
function notify(message){api()?.notify(message);}
function zoomTo(value){
 const prev=state.zoom;state.zoom=clamp(value,1,4);
 tracks.style.width=(state.zoom*100)+"%";
 ruler.style.width=(state.zoom*100)+"%";
 panel.scrollLeft=panel.scrollLeft*state.zoom/prev;
 zoomLabel.textContent=Math.round(state.zoom*100)+"%";
}
const minus=button("−","Reduzir zoom da timeline",()=>zoomTo(state.zoom-.5));
const zoomLabel=doc.createElement("strong");zoomLabel.className="pro-zoom-label";zoomLabel.textContent="100%";
const plus=button("+","Ampliar zoom da timeline",()=>zoomTo(state.zoom+.5));
const fit=button("Encaixar","Mostrar a duração completa",()=>{zoomTo(1);panel.scrollLeft=0;});
const snap=button("Encaixe ON","Ativar ou desativar encaixe em cenas",()=>{
 state.snap=!state.snap;snap.textContent=state.snap?"Encaixe ON":"Encaixe OFF";
 snap.setAttribute("aria-pressed",String(state.snap));
});
snap.setAttribute("aria-pressed","true");
const split=button("✂ Cortar","Dividir a camada ou legenda selecionada no cursor",splitSelection);
const duplicate=button("Duplicar","Duplicar a camada ou legenda selecionada",duplicateSelection);
const remove=button("Remover","Remover a camada ou legenda selecionada",removeSelection);
const exportMap=button("↓ JSON","Exportar mapa de cenas e trilhas para editar com IA",exportTimelineMap);
const freeRow=doc.createElement("div");freeRow.className="pro-free-tools";freeRow.hidden=true;
const durationLabel=doc.createElement("label");durationLabel.textContent="Duração (s) ";
const durationInput=doc.createElement("input");durationInput.type="number";durationInput.min="1";durationInput.max="600";durationInput.step="1";durationInput.value="30";
durationLabel.append(durationInput);freeRow.append(durationLabel);
durationInput.addEventListener("change",()=>{if(!api()?.setDuration(durationInput.value))durationInput.value=String(Math.round((getProject()?.totalFrames??900)/(getProject()?.fps??30)));});
const bgLabel=doc.createElement("label");bgLabel.textContent="Tela ";
const bgInput=doc.createElement("input");bgInput.type="color";bgInput.value="#0b1018";bgInput.title="Cor da tela — objetos e fundos ficam em camadas opcionais";
bgInput.addEventListener("change",()=>api()?.setCanvasColor(bgInput.value));
bgLabel.append(bgInput);freeRow.append(bgLabel);
for(const [name,desc,fn] of [
 ["T Texto","Criar clipe de texto na posição do cursor",()=>api()?.addLayer("text")],
 ["▣ Forma","Adicionar forma ou cartão",()=>api()?.addLayer("shape")],
 ["CC Legenda","Criar legenda independente",()=>api()?.addCaption()],
 ["▧ Imagem","Importar imagem para uma camada",()=>api()?.importAsset("image")],
 ["▶ Vídeo","Importar vídeo para uma camada",()=>api()?.importAsset("video")],
 ["♫ Áudio","Importar música, voz ou efeito sonoro",()=>api()?.importAsset("audio")]
])freeRow.append(button(name,desc,fn));
const audioNotice=doc.createElement("span");audioNotice.className="pro-audio-notice";freeRow.append(audioNotice);
for(const el of [label,hint,minus,zoomLabel,plus,fit,snap,split,duplicate,remove,exportMap,status])toolbar.append(el);
toolbar.append(freeRow);
panel.querySelector(".timeline-header").after(toolbar);
ruler.classList.add("pro-ruler");
ruler.title="Clique na régua para posicionar o cursor de reprodução";
ruler.addEventListener("click",event=>{
 const p=getProject();if(!p)return;
 const rect=doc.getElementById(p.mode==="timeline-free"?"layerTrack":"sceneTrack").getBoundingClientRect();
 api().seekFrame(Math.round(clamp((event.clientX-rect.left)/rect.width,0,1)*(p.totalFrames-1)));
});
function selection(){
 const p=getProject(),selected=api()?.getSelection();
 if(!p||!selected?.kind)return null;
 const collection=selected.kind==="layer"?p.layers:p.captions;
 const index=(collection||[]).findIndex(item=>item.id===selected.id);
 return index<0?null:{p,kind:selected.kind,index,item:collection[index],collection};
}
function newId(){return crypto.randomUUID().replaceAll("-","");}
function splitSelection(){
 const sel=selection();if(!sel)return notify("Selecione uma camada ou legenda antes de cortar.");
 const {p,item,index,collection,kind}=sel,at=api().currentFrame();
 if(at<=item.startFrame||at>=item.endFrame)return notify("Posicione o cursor dentro do clipe para dividi-lo.");
 const right=JSON.parse(JSON.stringify(item));right.id=newId();
 if(kind==="layer"){
  right.name=item.name+" · parte 2";
  if(item.type==="video")right.trimStartSeconds=(item.trimStartSeconds||0)+(at-item.startFrame)/p.fps*(item.speed||1);
  const keys=(item.keyframes||[]).slice().sort((a,b)=>a.frame-b.frame);
  const leftKeys=keys.filter(k=>k.frame<at),rightKeys=keys.filter(k=>k.frame>=at);
  if(keys.length){
   const before=keys.filter(k=>k.frame<=at).at(-1),after=keys.find(k=>k.frame>=at);
   const boundary={frame:at,easing:after?.easing||before?.easing||"linear"};
   const dims=["x","y","z","scale","rotationX","rotationY","rotationZ","opacity"];
   const t=before&&after&&after.frame>before.frame?(at-before.frame)/(after.frame-before.frame):0;
   for(const d of dims)boundary[d]=before&&after&&Number.isFinite(before[d])&&Number.isFinite(after[d])?before[d]+(after[d]-before[d])*t:before?.[d]??after?.[d]??item[d];
   leftKeys.push(boundary);
   rightKeys.unshift({...boundary});
  }
  item.keyframes=leftKeys;right.keyframes=rightKeys;
 }
 item.endFrame=at;right.startFrame=at;collection.splice(index+1,0,right);
 api().commit();api().selectItem(kind,right.id);
 notify("Clipe dividido no quadro "+at+". Ajuste cada parte separadamente.");
}
function duplicateSelection(){
 const sel=selection();if(!sel)return notify("Selecione uma camada ou legenda para duplicar.");
 const {p,item,index,collection,kind}=sel,length=item.endFrame-item.startFrame;
 if(length>=p.totalFrames)return notify("A camada ocupa todo o vídeo. Reduza sua duração antes de duplicar.");
 const start=clamp(item.startFrame+p.fps,0,p.totalFrames-length),shift=start-item.startFrame;
 const copy=JSON.parse(JSON.stringify(item));copy.id=newId();copy.startFrame+=shift;copy.endFrame+=shift;
 if(kind==="layer"){copy.name=item.name+" · cópia";copy.keyframes=(copy.keyframes||[]).map(k=>({...k,frame:k.frame+shift}));}
 collection.splice(index+1,0,copy);api().commit();api().selectItem(kind,copy.id);
 notify("Cópia criada como elemento independente.");
}
function removeSelection(){
 const sel=selection();if(!sel)return notify("Selecione uma camada ou legenda antes de remover.");
 if(!window.confirm("Remover este elemento da timeline? O vídeo original e outros projetos não serão alterados."))return;
 sel.collection.splice(sel.index,1);api().selectItem(sel.kind,null);api().commit();
 notify("Elemento removido desta timeline.");
}
function exportTimelineMap(){
 const p=getProject();if(!p)return notify("Abra um projeto antes de exportar a timeline.");
 const data={format:"mediaforge-timeline-pro-v1",projectId:p.id,revision:p.revision,title:p.title,fps:p.fps,aspectRatio:p.aspectRatio,totalFrames:p.totalFrames,scenes:p.scenes,layers:p.layers||[],captions:p.captions||[],audio:(p.audio||[]).map(a=>({id:a.id,role:a.role,name:a.name,startFrame:a.startFrame,endFrame:a.endFrame,volume:a.volume}))};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=doc.createElement("a");
 link.href=url;link.download="mediaforge-timeline-"+p.id.slice(0,8)+".json";
 doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 notify("Mapa JSON exportado para continuar a edição com IA.");
}
function magnet(frame,p){
 let result=Math.round(frame);
 if(!state.snap)return result;
 let distance=Math.max(3,Math.round(p.fps*.12));
 const anchors=[0,p.totalFrames,...p.scenes.flatMap(s=>[s.startFrame,s.endFrame]),
  ...(p.layers??[]).flatMap(l=>[l.startFrame,l.endFrame]),
  ...(p.captions??[]).flatMap(c=>[c.startFrame,c.endFrame]),
  ...(p.audio??[]).flatMap(a=>[a.startFrame,a.endFrame])];
 for(const target of anchors)if(Math.abs(target-frame)<distance){distance=Math.abs(target-frame);result=target;}
 return result;
}
function seekMark(localFrame,clipDuration,globalFrame){
 const mark=doc.createElement("span");mark.className="pro-keyframe";mark.title="Keyframe · quadro "+globalFrame+" · clicar para visualizar";
 mark.style.left=toPercent(localFrame,clipDuration)+"%";mark.setAttribute("role","button");mark.setAttribute("tabindex","0");
 const seek=event=>{event.stopPropagation();api()?.seekFrame(globalFrame);};
 mark.addEventListener("click",seek);
 mark.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();seek(event);}});
 mark.addEventListener("pointerdown",event=>event.stopPropagation());
 return mark;
}
function attachDrag(clip,item,kind,rail){
 clip.addEventListener("pointerdown",event=>{
  if(event.button!==0||event.target.closest(".pro-keyframe"))return;
  event.preventDefault();event.stopPropagation();
  const p=getProject();if(!p)return;
  const oldStart=item.startFrame,oldEnd=item.endFrame,length=oldEnd-oldStart;
  const handle=event.target.closest(".pro-trim-start")?"start":event.target.closest(".pro-trim-end")?"end":"move";
  const initialX=event.clientX;let lastStart=oldStart,lastEnd=oldEnd,moved=false;
  function move(e){
   const frames=Math.round((e.clientX-initialX)/Math.max(1,rail.getBoundingClientRect().width)*p.totalFrames);
   if(Math.abs(e.clientX-initialX)<3)return;
   moved=true;
   if(handle==="move"){
    lastStart=clamp(magnet(oldStart+frames,p),0,p.totalFrames-length);lastEnd=lastStart+length;
   }else if(handle==="start"){
    lastStart=clamp(magnet(oldStart+frames,p),0,oldEnd-1);lastEnd=oldEnd;
   }else{
    lastEnd=clamp(magnet(oldEnd+frames,p),oldStart+1,p.totalFrames);lastStart=oldStart;
   }
   clip.style.left=toPercent(lastStart,p.totalFrames)+"%";
   clip.style.width=toPercent(lastEnd-lastStart,p.totalFrames)+"%";
  }
  function end(){
   window.removeEventListener("pointermove",move);
   window.removeEventListener("pointerup",end);
   window.removeEventListener("pointercancel",end);
   if(moved&&(lastStart!==oldStart||lastEnd!==oldEnd)){
    item.startFrame=lastStart;item.endFrame=lastEnd;
    if(kind==="layer"){
     const delta=lastStart-oldStart;
     if(handle==="move")item.keyframes=(item.keyframes||[]).map(k=>({...k,frame:k.frame+delta}));
     else item.keyframes=(item.keyframes||[]).filter(k=>k.frame>=lastStart&&k.frame<=lastEnd);
     if(item.type==="video"&&handle==="start")item.trimStartSeconds=(item.trimStartSeconds||0)+(lastStart-oldStart)/p.fps*(item.speed||1);
    }
    if(kind==="layer")for(const key of ["transitionIn","transitionOut"]){
      if(item[key])item[key].frames=Math.min(item[key].frames,item.endFrame-item.startFrame);
    }
    if(kind==="audio"&&item.role==="music")delete p.beatSync;
    api().commit();notify("Posição ou duração atualizada com precisão de quadro.");
   }
   if(kind!=="audio")api().selectItem(kind,item.id);
  }
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",end,{once:true});
  window.addEventListener("pointercancel",end,{once:true});
 });
 clip.addEventListener("keydown",event=>{
  if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();if(kind!=="audio")api()?.selectItem(kind,item.id);}
 });
}
function createClip(rail,item,index,kind,p,selected){
 const clip=doc.createElement("div");clip.className="small-clip pro-clip pro-"+kind+"-clip";
 if(item.id===selected?.id&&kind===selected?.kind)clip.classList.add("selected");
 clip.style.top=(4+index*38)+"px";clip.style.left=toPercent(item.startFrame,p.totalFrames)+"%";
 clip.style.width=toPercent(item.endFrame-item.startFrame,p.totalFrames)+"%";
 clip.title=(item.name||item.text||item.role)+" · "+(item.startFrame/p.fps).toFixed(2)+"–"+(item.endFrame/p.fps).toFixed(2)+" s";
 clip.setAttribute("role","button");clip.setAttribute("tabindex","0");
 const title=doc.createElement("span");title.className="pro-clip-title";
 title.textContent=kind==="caption"?"CC "+item.text:kind==="audio"?(item.role==="music"?"♫ ":item.role==="voice"?"● ":"✦ ")+item.name:(item.type==="text"?"T ":item.type==="video"?"▶ ":item.type==="image"?"▧ ":"◇ ")+item.name;
 clip.append(title);
 if(kind==="layer"){
  for(const k of item.keyframes||[]){if(k.frame<item.startFrame||k.frame>item.endFrame)continue;
   clip.append(seekMark(k.frame-item.startFrame,item.endFrame-item.startFrame,k.frame));
  }
 }
 const start=doc.createElement("span"),end=doc.createElement("span");
 start.className="pro-trim-start";end.className="pro-trim-end";
 start.title="Arrastar para ajustar o início";end.title="Arrastar para ajustar o fim";
 clip.append(start,end);
 attachDrag(clip,item,kind,rail);
 return clip;
}
function renderRail(id,items,kind,p,selected){
 const rail=doc.getElementById(id);if(!rail)return;
 rail.classList.add("pro-lane");
 rail.replaceChildren();
 rail.style.height=Math.max(42,(items||[]).length*38+6)+"px";
 if(!items?.length){
  const empty=doc.createElement("span");empty.className="pro-lane-empty";
  empty.textContent=kind==="layer"?"+ Adicione texto, imagem ou vídeo em Camadas independentes":kind==="caption"?"+ Adicione legendas na biblioteca":"+ Importe música ou efeitos";
  rail.append(empty);
 }else{
  items.forEach((item,i)=>rail.append(createClip(rail,item,i,kind,p,selected)));
 }
}
function ensurePlayhead(rail,frame,p){
 if(!rail||!p)return;
 let marker=rail.querySelector(":scope > .pro-playhead");
 if(!marker){marker=doc.createElement("span");marker.className="pro-playhead";rail.append(marker);}
 marker.style.left=toPercent(frame,p.totalFrames)+"%";
}
function updatePlayheads(){
 const p=getProject();if(!p)return;
 const frame=api().currentFrame();
 for(const id of ["sceneTrack","textTrack","motionTrack","layerTrack","captionTrack","audioTrack"]){
  ensurePlayhead(doc.getElementById(id),frame,p);
 }
 status.textContent=(frame/p.fps).toFixed(2)+"s · quadro "+frame+" / "+p.totalFrames;
}
function refresh(){
 const p=getProject();
 for(const b of [minus,plus,fit,snap,split,duplicate,remove,exportMap])b.disabled=!p;
 if(!p){status.textContent="Abra um projeto para editar";return;}
 const free=p.mode==="timeline-free";
 freeRow.hidden=!free;
 if(free){
   durationInput.value=String(Math.round(p.totalFrames/p.fps));
   bgInput.value=p.canvasColor??"#0b1018";
   audioNotice.textContent=p.audio.length?"Áudio: "+p.audio.length+" faixa(s)":"Sem áudio — adicione música, voz ou efeitos.";
 }
 const selected=api().getSelection();
 for(const b of [split,duplicate,remove])b.disabled=!selected?.kind;
 renderRail("layerTrack",p.layers||[],"layer",p,selected);
 renderRail("captionTrack",p.captions||[],"caption",p,selected);
 renderRail("audioTrack",p.audio||[],"audio",p,selected);
 updatePlayheads();
}
window.MediaForgeProTimeline=Object.freeze({refresh});
doc.addEventListener("keydown",event=>{
 if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey)return;
 if(event.target?.closest("input,textarea,select,button,[contenteditable]"))return;
 if(event.code==="Space"&&getProject()){
  event.preventDefault();doc.getElementById("playButton")?.click();
 }else if(event.key==="ArrowRight"&&getProject()){
  event.preventDefault();api().seekFrame(api().currentFrame()+1);
 }else if(event.key==="ArrowLeft"&&getProject()){
  event.preventDefault();api().seekFrame(api().currentFrame()-1);
 }
});
setInterval(updatePlayheads,100);
refresh();
})();
