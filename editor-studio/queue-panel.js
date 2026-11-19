(()=>{"use strict";
const toolbar=document.querySelector(".top-actions");
if(!toolbar||typeof HTMLDialogElement==="undefined")return;
const button=document.createElement("button");
button.type="button";button.className="ghost queue-manager-button";
button.textContent="Fila de renders";
button.title="Consultar e cancelar trabalhos na fila";
const before=document.getElementById("renderButton");
toolbar.insertBefore(button,before);

const modal=document.createElement("dialog");
modal.className="render-queue-dialog";
modal.setAttribute("aria-label","Gerenciar renderizações do MediaForge");
const heading=document.createElement("header");heading.className="render-queue-header";
const title=document.createElement("div");
const h2=document.createElement("h2");h2.textContent="Fila de renderizações";
const hint=document.createElement("p");hint.textContent="Cancelar preserva o projeto e seus arquivos; jobs ativos aguardam confirmação do Windows.";
title.append(h2,hint);
const close=document.createElement("button");close.type="button";close.className="ghost";close.textContent="Fechar";
close.addEventListener("click",()=>modal.close());
heading.append(title,close);
const message=document.createElement("p");message.className="render-queue-message";message.setAttribute("role","status");
const list=document.createElement("div");list.className="render-queue-list";
modal.append(heading,message,list);document.body.append(modal);

let timer=null,fetching=false;
const activeStatuses=new Set(["queued","processing"]);
const statusLabels={queued:"Na fila",processing:"Renderizando",cancelled:"Cancelado",failed:"Falhou",completed:"Concluído"};
async function request(path,options={}){
  const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw new Error(data.message||data.error||"Falha na consulta");
  return data;
}
function cell(className,text){
  const el=document.createElement("div");el.className=className;el.textContent=String(text);return el;
}
function renderJob(j){
  const row=document.createElement("article");row.className="render-queue-job";
  const main=cell("render-queue-job-main",j.title||"Sem título");
  const sub=cell("render-queue-job-sub",[
    statusLabels[j.status]||j.status,
    (j.framesCompleted!=null&&j.totalFrames)?"Quadros "+j.framesCompleted+"/"+j.totalFrames:"",
    (j.resolution||"padrão")+" · "+(j.fps||30)+" FPS"
  ].filter(Boolean).join(" · "));
  const id=cell("render-queue-job-id",j.id.slice(0,8));
  const actions=document.createElement("div");actions.className="render-queue-job-actions";
  if(activeStatuses.has(j.status)){
    const cancel=document.createElement("button");
    cancel.type="button";
    cancel.className="render-queue-cancel";
    const requested=Boolean(j.cancelRequestedAt);
    cancel.textContent=requested?"Cancelando…":(j.status==="queued"?"Cancelar da fila":"Cancelar render");
    cancel.disabled=requested;
    cancel.addEventListener("click",async()=>{
      if(!window.confirm("Cancelar \""+j.title+"\"? O projeto e os arquivos serão preservados."))return;
      cancel.disabled=true;message.textContent="Solicitando cancelamento de "+j.id.slice(0,8)+"…";
      try{
        const result=await request("/api/editor/queue/"+j.id+"/cancel",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
        message.textContent=result.status==="cancelled"?"Job cancelado. Projeto preservado.":"Cancelamento solicitado ao Windows; aguardando confirmação.";
        await refresh();
      }catch(e){message.textContent="Falha ao cancelar: "+e.message;cancel.disabled=false;}
    });
    actions.append(cancel);
  }
  row.append(main,sub,id,actions);
  return row;
}
async function refresh(){
  if(fetching||!modal.open)return;
  fetching=true;
  try{
    const data=await request("/api/editor/queue");
    list.replaceChildren();
    const items=data.jobs||[];
    const sorted=[...items].sort((a,b)=>{
      const score=x=>x.status==="processing"?0:x.status==="queued"?1:2;
      return score(a)-score(b)||Date.parse(a.createdAt)-Date.parse(b.createdAt);
    });
    if(sorted.length===0)list.append(cell("render-queue-empty","Nenhum job registrado."));
    for(const j of sorted.slice(0,30))list.append(renderJob(j));
    const total=items.filter(x=>activeStatuses.has(x.status)).length;
    button.textContent=total>0?"Fila · "+total:"Fila de renders";
    if(!message.textContent)message.textContent="Atualização automática a cada 6 segundos.";
  }catch(e){message.textContent="Fila indisponível: "+e.message;}
  finally{fetching=false;}
}
button.addEventListener("click",()=>{
  modal.showModal();message.textContent="Carregando trabalhos…";
  refresh();timer=setInterval(refresh,6000);
});
modal.addEventListener("close",()=>{clearInterval(timer);timer=null;});
})();
