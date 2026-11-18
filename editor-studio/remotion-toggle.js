(()=>{"use strict";
const button=document.getElementById("remotionOpen"),panel=document.getElementById("remotionLayerPanel");
const render=document.getElementById("remotionRender"),status=document.getElementById("remotionJobStatus");
if(!button||!panel)return;
button.addEventListener("click",()=>{panel.hidden=!panel.hidden;
 button.textContent=panel.hidden?"Abrir compositor Remotion · 12s":"Ocultar compositor Remotion";});
if(render)render.addEventListener("click",async()=>{
 if(!window.confirm("Enviar a composição de 12 segundos ao PC Windows para renderizar em MP4?"))return;
 render.disabled=true;status.textContent="Enviando ao HyperFrames CLI no PC Windows...";
 try{
  const res=await fetch("/api/editor/hyperframes/render",{method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json"},body:JSON.stringify({confirm:true})});
  const data=await res.json();
  if(!res.ok||!data.ok)throw new Error(data.message||data.error||"Erro HTTP "+res.status);
  const id=data.jobId;status.textContent="Na fila · "+id.slice(0,8);
  let checks=0;
  const interval=setInterval(async()=>{
   try{
    checks++;const q=await fetch("/api/editor/jobs/"+id,{credentials:"same-origin",cache:"no-store"});
    const job=await q.json();
    if(!q.ok)throw new Error(job.error||"Falha ao consultar o job");
    status.textContent="HyperFrames: "+job.status+" · "+(job.progress||0)+"%";
    if(job.status==="completed"||job.status==="failed"||checks>300){
      clearInterval(interval);render.disabled=false;
      if(job.artifact&&job.artifact.url){
       const link=document.createElement("a");link.href=job.artifact.url;link.textContent="Baixar MP4";
       link.style.marginLeft="10px";link.target="_blank";link.rel="noopener";status.append(link);
      }else if(job.error)status.textContent+=" · "+String(job.error.message||job.error);
    }
   }catch(e){clearInterval(interval);render.disabled=false;status.textContent=e.message;}
  },3500);
 }catch(e){status.textContent=e.message;render.disabled=false;}
});
})();