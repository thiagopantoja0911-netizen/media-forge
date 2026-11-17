(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={project:null,selected:0,ready:false,playing:false,dragFrom:null,saveTimer:null,saveQueue:Promise.resolve(),lastPreviewUrl:"",frame:0};
const pad=n=>String(n).padStart(2,"0");
const fmt=t=>pad(Math.floor(t/60))+":"+pad(Math.floor(t%60));
const longFmt=t=>fmt(t)+"."+(Math.floor(t*10)%10);
const sec=frames=>state.project?frames/state.project.fps:0;
const request=async(path,options={})=>{
  const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||"HTTP "+response.status);
  return data;
};
const post=(path,obj,method="POST")=>request(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(obj)});
const toast=msg=>{
  const node=$("toast");node.textContent=msg;node.classList.add("show");
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),4100);
};
const out=(id,value)=>{$(id).textContent=String(value)};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const clone=x=>JSON.parse(JSON.stringify(x));
const src=(id)=>"/api/editor/projects/"+state.project.id+"/"+id;
const sceneLength=i=>sec(state.project.scenes[i].endFrame-state.project.scenes[i].startFrame);
function configureViewport(){
  const view=$("playerViewport"),iframe=$("scenePreview");
  if(!state.project)return;
  const ratio=state.project.aspectRatio;
  view.className="player-viewport "+(ratio==="16:9"?"landscape":ratio==="1:1"?"square":"vertical");
  const dim=ratio==="16:9"?[1920,1080]:ratio==="1:1"?[1080,1080]:[1080,1920];
  iframe.style.width=dim[0]+"px";iframe.style.height=dim[1]+"px";
  const scale=Math.min(view.clientWidth/dim[0],view.clientHeight/dim[1]);
  iframe.style.transform="scale("+Math.max(.01,scale)+")";
}
function openScene(i,{seek=0}={}){
  if(!state.project)return;
  if(!Number.isInteger(i)||i<0||i>=state.project.scenes.length)return;
  state.selected=i;state.ready=false;state.playing=false;state.frame=seek;
  $("playButton").textContent="▶";
  $("previewNotice").hidden=false;
  $("previewNotice").textContent="Carregando prévia 3D da cena "+(i+1)+"…";
  out("previewState","Carregando");
  const s=state.project.scenes[i];
  out("sceneDescription",(i+1).toString().padStart(2,"0")+" / "+state.project.scenes.length+" · "+s.kicker+" · "+longFmt(sceneLength(i))+" s");
  $("sceneSeek").value=String(clamp(Math.round(seek/sceneLength(i)*1000),0,1000));
  out("timeTotal",longFmt(sceneLength(i)));out("timeCurrent",longFmt(seek));
  configureViewport();
  $("scenePreview").src=src("preview")+"?scene="+i+"&v="+state.project.revision;
  buildTracks();fillInspector();
}
function playbackMessage(message){const f=$("scenePreview").contentWindow;if(f)f.postMessage(message,location.origin);}
function playScene(){
  if(!state.project||!state.ready)return toast("A prévia ainda está inicializando.");
  if(state.playing){pauseScene();return;}
  state.playing=true;$("playButton").textContent="Ⅱ";
  playbackMessage({mediaforge:"play"});
  previewAudio(true);
  let old=performance.now();
  function advance(now){
    if(!state.playing)return;
    state.frame=Math.min(sceneLength(state.selected),state.frame+(now-old)/1000);old=now;
    const range=$("sceneSeek");range.value=String(clamp(Math.floor(state.frame/sceneLength(state.selected)*1000),0,1000));
    out("timeCurrent",longFmt(state.frame));
    if(state.frame>=sceneLength(state.selected))pauseScene();
    else requestAnimationFrame(advance);
  }
  requestAnimationFrame(advance);
}
function pauseScene(){
  state.playing=false;$("playButton").textContent="▶";playbackMessage({mediaforge:"pause"});previewAudio(false);
}
function previewAudio(play){
  if(!state.project)return;
  for(const [id,element] of (previewAudio.players||new Map())){
    if(!play){element.pause();continue;}
    const a=state.project.audio.find(x=>x.id===id);
    if(!a)continue;
    const global=state.project.scenes[state.selected].startFrame/state.project.fps+state.frame;
    const relative=global-a.startFrame/state.project.fps;
    const duration=(a.endFrame-a.startFrame)/state.project.fps;
    if(relative>=0&&relative<duration){
      try{element.currentTime=relative;element.volume=a.volume;element.play().catch(()=>{});}catch{}
    }
  }
}
function refreshAudioPlayers(){
  if(!previewAudio.players)previewAudio.players=new Map();
  for(const audio of previewAudio.players.values())audio.pause();
  previewAudio.players.clear();
  if(!state.project)return;
  for(const a of state.project.audio){
    const el=new Audio(src("audio/"+a.assetId));el.preload="metadata";el.volume=a.volume;previewAudio.players.set(a.id,el);
  }
}
function editSceneDuration(index,newFrames){
  const p=state.project,one=p.scenes[index],two=p.scenes[index+1];
  if(!two)return toast("A última cena fecha a duração total. Ajuste as cenas anteriores.");
  const budget=two.endFrame-one.startFrame;
  const amount=clamp(Math.round(newFrames),p.fps,budget-p.fps);
  one.endFrame=one.startFrame+amount;
  two.startFrame=one.endFrame;
  afterChange(true);
}
function updateMetadata(){
 const p=state.project;
 out("projectName",p.title);out("infoRatio",p.aspectRatio+(p.aspectRatio==="9:16"?" · Reels":""));
 out("infoFps",p.fps+" FPS");out("infoDuration",fmt(p.totalFrames/p.fps));
 out("infoScenes",p.scenes.length);out("lastRuler",fmt(p.totalFrames/p.fps));
 out("timelineMeta",p.scenes.length+" cenas · "+fmt(p.totalFrames/p.fps)+" · "+p.mode);
 const ticks=$("rulerTicks");ticks.replaceChildren();
 for(let i=0;i<=10;i++)ticks.append(document.createElement("i"));
}
function trackBlock(kind,s,width){
 const d=document.createElement("div");d.className="small-clip "+kind+"-clip";
 d.style.width=width+"%";d.textContent=kind==="text"?s.headline:(s.shape+" · "+s.camera);
 d.title=d.textContent;return d;
}
function buildTracks(){
 const p=state.project;if(!p)return;
 const scenes=$("sceneTrack"),texts=$("textTrack"),motions=$("motionTrack"),audios=$("audioTrack");
 scenes.replaceChildren();texts.replaceChildren();motions.replaceChildren();audios.replaceChildren();
 p.scenes.forEach((s,i)=>{
   const width=(s.endFrame-s.startFrame)/p.totalFrames*100;
   const item=document.createElement("div");
   item.className="clip-block"+(state.selected===i?" active":"");
   item.style.width=width+"%";item.draggable=true;item.dataset.index=i;
   const name=document.createElement("span");name.className="clip-title";name.textContent=pad(i+1)+" · "+s.kicker;
   const length=document.createElement("small");length.className="clip-time";length.textContent=longFmt(sceneLength(i))+"s / "+s.shape;
   item.append(name,length);item.title=s.headline;
   item.addEventListener("click",()=>openScene(i));
   item.addEventListener("dragstart",ev=>{state.dragFrom=i;ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain",String(i));});
   item.addEventListener("dragover",ev=>{ev.preventDefault();ev.dataTransfer.dropEffect="move";});
   item.addEventListener("drop",ev=>{
     ev.preventDefault();const from=state.dragFrom;state.dragFrom=null;
     if(from===null||from===i)return;
     const arr=p.scenes,entry=arr.splice(from,1)[0];arr.splice(i,0,entry);
     let cursor=0;arr.forEach((shot,j)=>{const len=shot.endFrame-shot.startFrame;shot.id="scene-"+(j+1);shot.startFrame=cursor;shot.endFrame=cursor+len;cursor+=len;});
     state.selected=i;afterChange(true);
   });
   if(i<p.scenes.length-1){
     const handle=document.createElement("span");handle.className="clip-handle";handle.title="Arraste para ajustar duração";
     handle.addEventListener("pointerdown",ev=>{
       ev.stopPropagation();ev.preventDefault();handle.setPointerCapture(ev.pointerId);
       const startX=ev.clientX,initial=p.scenes[i].endFrame-p.scenes[i].startFrame;
       const px=scenes.clientWidth;
       const move=e=>{
         const delta=Math.round((e.clientX-startX)/Math.max(1,px)*p.totalFrames);
         const total=p.scenes[i+1].endFrame-p.scenes[i].startFrame;
         const value=clamp(initial+delta,p.fps,total-p.fps);
         p.scenes[i].endFrame=p.scenes[i].startFrame+value;
         p.scenes[i+1].startFrame=p.scenes[i].endFrame;
         item.style.width=(value/p.totalFrames*100)+"%";
         if(item.nextSibling)item.nextSibling.style.width=((total-value)/p.totalFrames*100)+"%";
       };
       const up=()=>{handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",up);afterChange(true);};
       handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",up,{once:true});
     });item.append(handle);
   }
   scenes.append(item);
   texts.append(trackBlock("text",s,width));
   motions.append(trackBlock("motion",s,width));
 });
 for(const a of p.audio){
   const el=document.createElement("div");el.className="audio-clip";
   el.style.left=(a.startFrame/p.totalFrames*100)+"%";el.style.width=((a.endFrame-a.startFrame)/p.totalFrames*100)+"%";
   el.textContent=(a.role==="voice"?"● ":a.role==="music"?"♫ ":"✦ ")+a.name;
   el.title=a.role+" · "+a.name;audios.append(el);
 }
}
function fillInspector(){
 const p=state.project;if(!p)return;
 $("inspectorEmpty").hidden=true;$("inspectorFields").hidden=false;
 const s=p.scenes[state.selected];out("inspectorIndex",pad(state.selected+1)+" / "+pad(p.scenes.length));
 const fields={editKicker:s.kicker,editHeadline:s.headline,editDetail:s.detail,editShape:s.shape,editCamera:s.camera,
  editTransition:s.transition,editAccent:s.accent,editDuration:sceneLength(state.selected).toFixed(1),
  editEnergy:Math.round(s.energy*100),editDepth:Math.round(s.depth*100),editTextScale:Math.round(s.textScale*100)};
 for(const [id,value] of Object.entries(fields))$(id).value=value;
 out("energyNumber",fields.editEnergy+"%");out("depthNumber",fields.editDepth+"%");out("textScaleNumber",fields.editTextScale+"%");
 $("editDuration").disabled=state.selected===p.scenes.length-1;
}
function renderAudioList(){
 const container=$("audioList");container.replaceChildren();
 const p=state.project;
 if(!p?.audio.length){const el=document.createElement("span");el.className="muted";el.textContent="Nenhum áudio anexado.";container.append(el);return;}
 for(const a of p.audio){
   const box=document.createElement("div");box.className="audio-row";
   const row=document.createElement("div"),label=document.createElement("b"),remove=document.createElement("button");
   label.textContent=a.name;label.title=a.role;remove.textContent="×";remove.title="Retirar faixa";
   remove.addEventListener("click",()=>{p.audio=p.audio.filter(x=>x.id!==a.id);refreshAudioPlayers();renderAudioList();afterChange();});
   row.append(label,remove);
   const volume=document.createElement("input");volume.type="range";volume.min="0";volume.max="1";volume.step=".01";volume.value=a.volume;
   volume.title="Volume da faixa";volume.addEventListener("input",()=>{a.volume=Number(volume.value);afterChange();});
   const starts=document.createElement("div"),start=document.createElement("input"),end=document.createElement("input");
   start.type="number";start.min="0";start.max=sec(p.totalFrames-1);start.step=".1";start.value=sec(a.startFrame).toFixed(1);start.title="Início (s)";
   end.type="number";end.min="0.1";end.max=sec(p.totalFrames);end.step=".1";end.value=sec(a.endFrame).toFixed(1);end.title="Fim (s)";
   start.addEventListener("change",()=>{a.startFrame=clamp(Math.round(Number(start.value)*p.fps),0,a.endFrame-1);afterChange();});
   end.addEventListener("change",()=>{a.endFrame=clamp(Math.round(Number(end.value)*p.fps),a.startFrame+1,p.totalFrames);afterChange();});
   starts.append(start,end);box.append(row,volume,starts);container.append(box);
 }
}
function afterChange(reselect=false){
 if(!state.project)return;
 updateMetadata();buildTracks();if(reselect)fillInspector();
 clearTimeout(state.saveTimer);
 out("saveStatus","Alterações pendentes");
 state.saveTimer=setTimeout(()=>saveProject(true),500);
}
function saveProject(refreshPreview=false){
 if(!state.project)return Promise.resolve();
 clearTimeout(state.saveTimer);
 state.saveQueue=state.saveQueue.then(async()=>{
   const snapshot=clone(state.project);
   out("saveStatus","Salvando…");
   const result=await post("/api/editor/projects/"+snapshot.id,{project:snapshot},"PUT");
   if(state.project?.id!==snapshot.id)return;
   state.project.revision=result.project.revision;
   out("saveStatus","Salvo");refreshAudioPlayers();
   if(refreshPreview)openScene(state.selected);
 }).catch(error=>{out("saveStatus","Erro ao salvar");toast("Erro: "+error.message);});
 return state.saveQueue;
}
async function loadProject(id){
 const r=await request(id?"/api/editor/projects/"+id:"/api/editor/latest");
 if(!r.project){$("newModal").hidden=false;return;}
 state.project=r.project;state.selected=0;
 history.replaceState(null,"","/editor?project="+r.project.id);
 $("previewNotice").hidden=false;
 updateMetadata();renderAudioList();refreshAudioPlayers();openScene(0);
}
function presentModal(){pauseScene();$("newModal").hidden=false;$("newIdea").focus();}
function closeModal(){if(state.project)$("newModal").hidden=true;}
async function createFromIdea(event){
 event.preventDefault();
 const submit=$("submitIdea");submit.disabled=true;submit.textContent="Criando…";
 try{
   const fields={idea:$("newIdea").value.trim(),brand:$("newBrand").value.trim(),duration_seconds:Number($("newDuration").value),
     aspect_ratio:$("newRatio").value,fps:Number($("newFps").value)};
   const r=await post("/api/editor/projects",fields);
   $("newModal").hidden=true;
   await loadProject(r.project.id);
   toast("Storyboard 3D criado. Ajuste cada cena na timeline.");
 }catch(e){toast(e.message);}
 finally{submit.disabled=false;submit.textContent="Criar storyboard 3D";}
}
function connectProperties(){
 const entries={editKicker:"kicker",editHeadline:"headline",editDetail:"detail",editShape:"shape",
   editCamera:"camera",editTransition:"transition",editAccent:"accent",editEnergy:"energy",editDepth:"depth",editTextScale:"textScale"};
 for(const [id,key] of Object.entries(entries)){
  const el=$(id),evt=["editKicker","editHeadline","editDetail"].includes(id)?"input":"change";
  el.addEventListener(evt,()=>{
   if(!state.project)return;
   const s=state.project.scenes[state.selected];
   if(["energy","depth"].includes(key))s[key]=Number(el.value)/100;
   else if(key==="textScale")s[key]=Number(el.value)/100;
   else s[key]=el.value;
   if(key==="headline"&&!s[key].trim())return;
   if(key==="energy")out("energyNumber",el.value+"%");
   if(key==="depth")out("depthNumber",el.value+"%");
   if(key==="textScale")out("textScaleNumber",el.value+"%");
   afterChange();
  });
 }
 $("editDuration").addEventListener("change",()=>editSceneDuration(state.selected,Number($("editDuration").value)*state.project.fps));
}
function awaitStatus(jobId){
 let count=0;const timer=setInterval(async()=>{
  try{
   const r=await request("/api/editor/jobs/"+jobId);
   if(r.status==="completed"){clearInterval(timer);toast("Render concluído. Abrindo MP4.");if(r.artifact?.url)window.open(r.artifact.url,"_blank","noopener");return;}
   if(r.status==="failed"){clearInterval(timer);toast("Render falhou: "+(r.error?.message||"verifique o diagnóstico"));return;}
   out("previewState","Render "+(r.progress||0)+"%");
   if(++count>300){clearInterval(timer);toast("O render permanece na fila; consulte o painel.");}
  }catch(error){clearInterval(timer);toast("Status do render: "+error.message);}
 },3500);
}
async function render(selectedOnly){
 if(!state.project)return toast("Abra um projeto antes de renderizar.");
 await saveProject(false);
 const desc=selectedOnly?"somente a cena "+(state.selected+1):"o vídeo inteiro";
 // The clearly labelled render button is the explicit user action. Avoid blocking native dialogs in background tabs.
 toast("Enviando "+desc+" ao HyperFrames…");
 try{
  const payload={confirm:true};
  if(selectedOnly)payload.sceneIndex=state.selected;
  const r=await post(src("render"),payload);
  toast("Render "+r.jobId.slice(0,9)+" enviado ao HyperFrames.");
  awaitStatus(r.jobId);
 }catch(e){toast("Não foi possível renderizar: "+e.message);}
}
async function uploadAudio(file){
 if(!file||!state.project)return;
 if(file.size>10*1024*1024)return toast("Limite de 10 MB por faixa.");
 await saveProject(false);
 out("saveStatus","Enviando áudio…");
 const base64=await new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);
  reader.onerror=()=>reject(new Error("Falha ao ler o arquivo."));reader.readAsDataURL(file);
 });
 let duration=0;
 const url=URL.createObjectURL(file);
 try{
  duration=await new Promise(resolve=>{
   const audio=new Audio();audio.preload="metadata";audio.onloadedmetadata=()=>resolve(audio.duration||0);
   audio.onerror=()=>resolve(0);audio.src=url;setTimeout(()=>resolve(0),1800);
  });
 }finally{URL.revokeObjectURL(url);}
 try{
  const r=await post(src("audio"),{filename:file.name,base64,role:$("audioRole").value,duration_seconds:duration,volume:$("audioRole").value==="music"?.24:1});
  state.project=r.project;renderAudioList();buildTracks();refreshAudioPlayers();
  out("saveStatus","Salvo");toast("Faixa de áudio adicionada à timeline.");
 }catch(e){out("saveStatus","Erro no áudio");toast(e.message);}
}
async function workerHealth(){
 try{const r=await request("/health");const worker=r.worker;
  out("workerState",worker?.online?"HyperFrames online":"HyperFrames offline");
 }catch{out("workerState","Status do worker indisponível");}
}
window.addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==$("scenePreview").contentWindow)return;
 if(event.data?.mediaforge==="ready"){
   state.ready=true;out("previewState","Pronta");
   $("previewNotice").hidden=true;configureViewport();
 }
 if(event.data?.mediaforge==="ended")pauseScene();
});
window.addEventListener("resize",configureViewport);
$("newProject").addEventListener("click",presentModal);
$("cancelModal").addEventListener("click",closeModal);
$("cancelModal2").addEventListener("click",closeModal);
$("ideaForm").addEventListener("submit",createFromIdea);
$("saveButton").addEventListener("click",()=>saveProject(true));
$("renderButton").addEventListener("click",()=>render(false));
$("renderSceneButton").addEventListener("click",()=>render(true));
$("playButton").addEventListener("click",playScene);
$("stopButton").addEventListener("click",()=>{pauseScene();state.frame=0;$("sceneSeek").value="0";out("timeCurrent","00:00.0");playbackMessage({mediaforge:"seek",time:0});});
$("sceneSeek").addEventListener("input",event=>{
 if(!state.project)return;
 pauseScene();state.frame=sceneLength(state.selected)*Number(event.target.value)/1000;
 out("timeCurrent",longFmt(state.frame));playbackMessage({mediaforge:"seek",time:state.frame});
 previewAudio(false);
});
$("audioUpload").addEventListener("change",async event=>{
 const file=event.target.files?.[0];if(file)await uploadAudio(file);event.target.value="";
});
connectProperties();
workerHealth();setInterval(workerHealth,12000);
const param=new URLSearchParams(location.search).get("project");
loadProject(/^[a-f0-9]{32}$/.test(param||"")?param:null).catch(e=>toast("Falha ao abrir: "+e.message));
})();
