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
