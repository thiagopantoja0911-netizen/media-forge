/* Native scene-free MediaForge runtime.
 * Same source powers editor iframe and HyperFrames per-frame MP4 captures.
 * No procedural 3D object, permanent floor, scene labels, or synthetic video fallback.
 */
export function freeTimelineRuntime(){
  const p=timelineProject,FPS=p.fps,D=p.totalFrames/FPS,W=p.width;
  const layers=p.layers||[],captions=p.captions||[];
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const easing=(t,type)=>{
    t=clamp(t);
    if(type==="ease-in")return t*t;
    if(type==="ease-out")return 1-(1-t)*(1-t);
    if(type==="ease-in-out")return t*t*(3-2*t);
    if(type==="spring")return clamp((1-Math.exp(-7*t)*Math.cos(11*t))/(1-Math.exp(-7)*Math.cos(11)));
    return t;
  };
  function value(layer,key,frame){
    const keys=(layer.keyframes||[]).filter(k=>Number.isFinite(k[key])).sort((a,b)=>a.frame-b.frame);
    if(!keys.length)return Number(layer[key]??0);
    if(frame<=keys[0].frame)return keys[0][key];
    if(frame>=keys[keys.length-1].frame)return keys[keys.length-1][key];
    for(let i=1;i<keys.length;i++)if(frame<=keys[i].frame){
      const a=keys[i-1],b=keys[i],mix=easing((frame-a.frame)/(b.frame-a.frame),b.easing??"linear");
      return a[key]+(b[key]-a[key])*mix;
    }
    return Number(layer[key]??0);
  }
  function transitionAt(layer,frame){
    let opacity=1,dx=0,clip="none";
    for(const [key,enter] of [["transitionIn",true],["transitionOut",false]]){
      const conf=layer[key];if(!conf)continue;
      const local=enter?(frame-layer.startFrame):(layer.endFrame-1-frame);
      const k=clamp(local/Math.max(1,conf.frames));
      const mix=k*k*(3-2*k);
      if(conf.type==="fade")opacity*=mix;
      if(conf.type==="slide-left")dx-=W*(1-mix);
      if(conf.type==="slide-right")dx+=W*(1-mix);
      if(conf.type==="wipe")clip="inset(0 "+((1-mix)*100).toFixed(3)+"% 0 0)";
    }
    return {opacity,dx,clip};
  }
  const pending=[];
  function setVideoFrame(layer,video,frame,playing){
    if(video.readyState<1)return;
    const local=(frame-layer.startFrame)/FPS*(layer.speed??1)+(layer.trimStartSeconds??0);
    const length=Number.isFinite(video.duration)?video.duration:0;
    const target=length>0?(layer.loop?local%length:Math.min(Math.max(0,length-.04),local)):Math.max(0,local);
    video.playbackRate=layer.speed??1;
    if(Math.abs(video.currentTime-target)>.075){
      let resolve=()=>{},settled=false;
      const promise=new Promise(ok=>{resolve=ok});
      const done=()=>{if(settled)return;settled=true;video.removeEventListener("seeked",done);clearTimeout(timer);resolve();};
      const timer=setTimeout(done,1600);
      video.addEventListener("seeked",done,{once:true});
      try{video.currentTime=target;pending.push(promise)}catch{done()}
    }
    if(playing&&video.paused)video.play().catch(()=>{});
    if(!playing&&!video.paused)video.pause();
  }
  function draw(time,playing=false){
    const frame=clamp(Math.round((Number(time)||0)*FPS),0,p.totalFrames);
    for(const layer of layers){
      const el=document.getElementById("layer-"+layer.id);if(!el)continue;
      const active=frame>=layer.startFrame&&frame<layer.endFrame;
      el.style.visibility=active?"visible":"hidden";
      if(!active){if(layer.type==="video")el.pause();continue;}
      const t=transitionAt(layer,frame),x=value(layer,"x",frame)+t.dx;
      el.style.transform="translate3d("+x+"px,"+value(layer,"y",frame)+"px,"+value(layer,"z",frame)+"px) rotateX("+value(layer,"rotationX",frame)+"deg) rotateY("+value(layer,"rotationY",frame)+"deg) rotateZ("+value(layer,"rotationZ",frame)+"deg) scale("+value(layer,"scale",frame)+")";
      el.style.width=value(layer,"width",frame)+"px";
      el.style.height=value(layer,"height",frame)+"px";
      el.style.opacity=String(clamp(value(layer,"opacity",frame)*t.opacity));
      el.style.clipPath=t.clip;
      if(layer.type==="video")setVideoFrame(layer,el,frame,playing);
    }
    for(const caption of captions){
      const el=document.getElementById("caption-layer-"+caption.id);if(!el)continue;
      const active=frame>=caption.startFrame&&frame<caption.endFrame;
      el.style.visibility=active?"visible":"hidden";if(!active)continue;
      const local=frame-caption.startFrame,length=caption.endFrame-caption.startFrame;
      const intro=caption.animation==="none"?1:clamp(local/Math.max(1,FPS*.18));
      const outro=caption.animation==="none"?1:clamp((length-local)/Math.max(1,FPS*.12));
      const smooth=t=>t*t*(3-2*t),enter=smooth(intro),exit=smooth(outro);
      el.style.opacity=String(enter*exit);
      el.style.transform=caption.animation==="rise"?"translateY("+((1-enter)*36)+"px)":"translateY(0)";
      const spans=el.querySelectorAll(".editor-caption-word"),words=caption.text.trim().split(/\s+/);
      const timings=caption.wordTimings?.length===words.length?caption.wordTimings:words.map((_,i)=>({
        startFrame:caption.startFrame+Math.floor(length*i/words.length),
        endFrame:caption.startFrame+Math.floor(length*(i+1)/words.length)
      }));
      spans.forEach((span,i)=>{
        const timing=timings[i],shown=frame>=timing.startFrame,highlighted=shown&&frame<timing.endFrame;
        span.style.opacity=caption.animation==="typewriter"&&!shown?"0":"1";
        span.style.color=caption.style==="karaoke"&&highlighted?caption.highlightColor:caption.color;
        span.style.textShadow=caption.style==="karaoke"&&highlighted?"0 0 12px "+caption.highlightColor:"none";
      });
    }
  }
  let current=0,playing=false,last=0;
  function step(now){
    if(!playing)return;
    current=Math.min(D,current+Math.max(0,now-last)/1000);last=now;draw(current,true);
    if(current>=D){playing=false;window.parent.postMessage({mediaforge:"ended"},"*");return;}
    requestAnimationFrame(step);
  }
  window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    const d=event.data||{};
    if(d.mediaforge==="seek"){playing=false;current=clamp(Number(d.time)||0,0,D);draw(current);}
    if(d.mediaforge==="play"&&!playing){playing=true;last=performance.now();requestAnimationFrame(step);}
    if(d.mediaforge==="pause"){playing=false;draw(current);}
  });
  window.addEventListener("hf-seek",event=>{
    playing=false;
    const t=clamp(Number(event.detail.time)||0,0,D);
    const ready=layers.filter(l=>l.type==="video").map(l=>{
      const video=document.getElementById("layer-"+l.id);
      if(!video||video.readyState>=1)return Promise.resolve();
      return new Promise(ok=>{const done=()=>{video.removeEventListener("loadedmetadata",done);ok();};
        video.addEventListener("loadedmetadata",done,{once:true});setTimeout(done,5000);});
    });
    event.detail.waitUntil(Promise.all(ready).then(()=>{draw(t);return Promise.all(pending.splice(0));}));
  });
  window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
  window.__timelines=window.__timelines||{};
  if(typeof gsap!=="undefined")window.__timelines.main=window.__timelines.main||gsap.timeline({paused:true});
  const ready=Promise.resolve().then(()=>draw(0));
  window.__hf.buildReady["editor-free-timeline"]=ready;
  ready.then(()=>window.parent.postMessage({mediaforge:"ready",duration:D},"*"))
    .catch(error=>window.parent.postMessage({mediaforge:"error",reason:String(error)},"*"));
}
export function buildEditorFreeTimelineModule(project){
 const dimensions=project.aspectRatio==="16:9"?[1920,1080]:project.aspectRatio==="1:1"?[1080,1080]:[1080,1920];
 const data={fps:project.fps,totalFrames:project.totalFrames,width:dimensions[0],height:dimensions[1],
   layers:project.layers??[],captions:project.captions??[]};
 return "const timelineProject="+JSON.stringify(data)+";\n("+freeTimelineRuntime.toString()+")();\n";
}
