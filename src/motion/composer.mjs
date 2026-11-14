import { readFile } from "node:fs/promises";
import { requireMotionPlan, frameSeconds } from "./plan.mjs";
import { validateProjectFiles } from "../job-schema.mjs";
import { validateCinematicMediaAssets } from "./assets-validation.mjs";

const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const js = value => JSON.stringify(value).replace(/</g, "\\u003c");
const css = `#root{position:absolute;inset:0;overflow:hidden;color:var(--ink);font-family:Arial,sans-serif}#root *{box-sizing:border-box}
.stage{position:absolute;inset:0;overflow:hidden;background:var(--ground)}.eyebrow{position:absolute;left:11%;top:12%;font-size:2.2cqh;letter-spacing:.18em;text-transform:uppercase}.headline{position:absolute;left:11%;top:22%;width:78%;margin:0;font-size:7.6cqh;letter-spacing:-.055em;line-height:.99;font-weight:800;text-wrap:balance;overflow-wrap:anywhere}.detail{position:absolute;left:11%;bottom:13%;width:76%;font-size:2.7cqh;line-height:1.3}.word{display:inline-block}.accent{color:var(--accent)}
.motif{position:absolute;left:58%;top:60%;width:26cqw;height:26cqw;border-radius:50%;background:var(--accent)}
.dashboard{position:absolute;left:11%;top:43%;width:78%;height:35%;display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:2cqw;perspective:1200px}.card{border-radius:4cqw;padding:4cqw;background:var(--paper);color:var(--ink);box-shadow:0 2cqw 4cqw #00000012;overflow:hidden}.card-label{font-size:2cqh;letter-spacing:.02em}.number{display:block;font-size:7cqh;line-height:1.2;letter-spacing:-.06em}.meter{height:1.1cqh;background:#00000015;border-radius:2cqw;margin-top:2cqh;overflow:hidden}.fill{height:100%;background:var(--accent);transform-origin:left}.dark{background:var(--ink);color:var(--paper)}.days{display:grid;grid-template-columns:repeat(4,1fr);gap:1cqw;margin-top:2cqh}.day{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:1.6cqh;background:#ffffff16}.day.active{background:var(--accent);color:var(--ink)}.wide{grid-column:1/3;display:flex;align-items:center;justify-content:space-between}.toggle{width:17cqw;height:8cqw;border-radius:9cqw;background:var(--accent);padding:1cqw}.knob{width:6cqw;height:6cqw;background:var(--paper);border-radius:50%}
.product-stage{position:absolute;left:12%;top:42%;width:76%;height:36%;perspective:1400px}.product{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2cqw 4cqw #00000030)}.halo{position:absolute;left:20%;top:48%;width:60%;height:28%;border-radius:50%;background:radial-gradient(ellipse,var(--accent),transparent 70%);opacity:.35}.collage{position:absolute;left:11%;top:44%;width:78%;height:32%;perspective:1000px}.tile{position:absolute;width:62%;height:88%;border-radius:2cqw;overflow:hidden;border:1cqw solid var(--paper);box-shadow:0 2cqw 5cqw #00000026;background:var(--paper)}.tile img{width:100%;height:100%;object-fit:cover}.tile:nth-child(1){left:0;top:0}.tile:nth-child(2){left:19%;top:10%}.tile:nth-child(3){left:38%;top:0}.end-title{top:36%;font-size:9cqh}.pill{position:absolute;left:11%;top:64%;max-width:78%;border:2px solid currentColor;padding:2cqh 5cqw;border-radius:10cqw;font-size:2.5cqh}.rule{position:absolute;left:11%;top:31%;width:13%;height:.5cqh;background:var(--accent);transform-origin:left}
.stage.media-first{background:#030710}.media-stage{position:absolute;inset:0;z-index:0;overflow:hidden}.media-rig{position:absolute;inset:-6%;width:112%;height:112%;transform-origin:50% 50%;will-change:transform}.media-rig video,.media-rig img{width:100%;height:100%;object-fit:cover;display:block}.media-stage .veil{position:absolute;inset:0;background:linear-gradient(180deg,#0009 0%,transparent 25%,transparent 48%,#000e 90%);pointer-events:none}.media-first .eyebrow{top:12%;color:#d9e2eb;font-size:2.1cqh;z-index:3;text-shadow:0 2px 8px #000}.media-first .headline{top:57%;color:white;font-size:7.1cqh;z-index:4;line-height:1.12;text-shadow:0 4px 18px #000;max-height:32%;overflow:visible;padding-bottom:.03em}.media-first .detail{bottom:17%;color:#e8eef2;z-index:4;text-shadow:0 3px 12px #000}.media-first .accent{color:#ffb36d}`;

function sceneDuration(plan, scene, index) {
  const next=plan.scenes[index+1];
  const overlap=next && next.transition && next.transition!=="cut" ? .5 : 0;
  return frameSeconds(scene.endFrame-scene.startFrame,plan.fps)+overlap;
}

function sceneFile(plan, scene, index) {
  const seconds = f => frameSeconds(f, plan.fps);
  const duration = sceneDuration(plan,scene,index);
  const p = { ground: "#efeee8", ink: "#191b1a", accent: "#91cc35", paper: "#ffffff", ...plan.palette };
  const sid = scene.id;
  const q = suffix => `#${sid}-${suffix}`;
  const headline = scene.headline.split(/\s+/).map((word, i, list) => `<span class="word ${i === list.length - 1 ? "accent" : ""}" data-var-text="word${i}">${html(word)}</span>`).join(" ");
  let visual = `<div id="${sid}-motif" class="motif"></div>`;
  if (scene.type === "widget") visual = `<div id="${sid}-visual" class="dashboard">
    <div id="${sid}-metric" class="card"><span class="card-label">${html(scene.metricLabel ?? "Progresso")}</span><strong id="${sid}-number" class="number">0%</strong><div class="meter"><div id="${sid}-fill" class="fill"></div></div></div>
    <div id="${sid}-calendar" class="card dark"><span class="card-label">Atividade</span><div class="days">${Array.from({length:8},(_,i)=>`<span id="${sid}-day-${i}" class="day">${i+1}</span>`).join("")}</div></div>
    <div id="${sid}-control" class="card wide"><span class="card-label">${html(scene.controlLabel ?? "Modo foco")}</span><div class="toggle"><div id="${sid}-knob" class="knob"></div></div></div>
  </div>`;
  if (scene.type === "product") visual = `<div class="halo"></div><div id="${sid}-visual" class="product-stage"><img id="${sid}-product" class="product" data-var-src="productImage" src="${html(scene.media)}" alt="${html(scene.headline)}"></div>`;
  if (scene.type === "collage") visual = `<div id="${sid}-visual" class="collage">${[0,1,2].map(i=>`<div id="${sid}-tile-${i}" class="tile"><img src="${html(scene.media)}" alt=""></div>`).join("")}</div>`;
  if (scene.type === "footage" || scene.type === "photo") {
    const mediaElement = scene.type === "footage"
      ? `<video id="${sid}-source" class="clip" data-start="0" data-duration="${duration}" data-track-index="0" src="${html(scene.media)}" muted playsinline preload="auto"></video>`
      : `<img id="${sid}-source" src="${html(scene.media)}" alt="${html(scene.headline)}" loading="eager">`;
    visual = `<div id="${sid}-visual" class="media-stage" data-layout-allow-overflow><div id="${sid}-camera-rig" class="media-rig" data-layout-allow-overflow>${mediaElement}</div><div class="veil"></div></div>`;
  }
  if (scene.type === "end-card") visual = `<div id="${sid}-rule" class="rule"></div><div id="${sid}-pill" class="pill" data-var-text="detail">${html(scene.detail ?? "Crie o próximo movimento.")}</div>`;
  const tweens = [];
  const cameraMotion = {
    "dolly-in": [{scale:1.06,xPercent:0,yPercent:0},{scale:1.16,xPercent:0,yPercent:-2}],
    "pull-back": [{scale:1.17,xPercent:1,yPercent:-2},{scale:1.06,xPercent:0,yPercent:0}],
    "truck-left": [{scale:1.10,xPercent:3,yPercent:0},{scale:1.10,xPercent:-3,yPercent:0}],
    "truck-right": [{scale:1.10,xPercent:-3,yPercent:0},{scale:1.10,xPercent:3,yPercent:0}],
    "arc-reveal": [{scale:1.13,xPercent:-3,yPercent:2,rotation:-.8},{scale:1.08,xPercent:2,yPercent:-1,rotation:0}],
    "locked": [{scale:1,xPercent:0,yPercent:0},{scale:1,xPercent:0,yPercent:0}]
  };
  let previousValue = 0, firstState = true;
  for (const event of scene.events) {
    const start = seconds(event.startFrame), arrive = seconds(event.peakFrame - event.startFrame), settle = seconds(event.endFrame - event.peakFrame);
    if (event.action === "enter") {
      // The opening headline is visible on frame zero. Later scenes reveal by words.
      if (index > 0 && !["photo","footage"].includes(scene.type)) tweens.push(`tl.fromTo(${js(q("headline") + " .word")},{y:24,opacity:0},{y:0,opacity:1,duration:${arrive},stagger:${Math.min(.06,arrive/8)},ease:"power4.out"},${start});`);
      if (scene.type === "widget") tweens.push(`tl.fromTo(${js(q("visual") + " .card")},{y:45,scale:.94},{y:0,scale:1,duration:${arrive},stagger:.055,ease:"expo.out"},${start});`);
      if (scene.type === "product") tweens.push(`tl.fromTo(${js(q("product"))},{rotationY:-20,rotation:-8,scale:.82},{rotationY:0,rotation:0,scale:1,duration:${arrive},ease:"power4.out"},${start});`);
      if (scene.type === "collage") [0,1,2].forEach(i=>tweens.push(`tl.fromTo(${js(q("tile-"+i))},{x:${(i-1)*100},rotation:${(i-1)*16},scale:.75},{x:0,rotation:${(i-1)*7},scale:1,duration:${arrive},ease:"expo.out"},${start+i*.04});`));
      if (index > 0 && ["photo","footage"].includes(scene.type)) tweens.push(`tl.fromTo(${js(q("headline") + " .word")},{opacity:0,filter:"blur(6px)"},{opacity:1,filter:"blur(0px)",duration:.2,stagger:.08,ease:"power4.out"},${start});`);
      if (scene.type === "kinetic") tweens.push(`tl.fromTo(${js(q("motif"))},{scale:.35,x:80},{scale:1,x:0,duration:${arrive},ease:"expo.out"},${start});`);
      if (scene.type === "end-card") tweens.push(`tl.fromTo(${js(q("rule"))},{scaleX:0},{scaleX:1,duration:${arrive},ease:"power3.out"},${start});`);
    }
    if (event.action === "state") {
      const value = event.value ?? 75;
      tweens.push(`tl.fromTo(${js(q("fill"))},{scaleX:${previousValue/100}},{scaleX:${value/100},duration:${arrive},immediateRender:${firstState},ease:"power2.inOut"},${start});`);
      // The counter is driven only by timeline state and supports reverse seeking.
      tweens.push(`tl.to(counter,{value:${value},duration:${arrive},ease:"power2.inOut",onUpdate:()=>{document.querySelector(${js(q("number"))}).textContent=Math.round(counter.value)+"%";}},${start});`);
      tweens.push(`tl.to(${js(q("knob"))},{xPercent:${value >= 50 ? 140 : 0},duration:${arrive},ease:"power3.inOut"},${start});`);
      tweens.push(`tl.to(${js(q("day-"+Math.min(7,Math.floor(value/13))))},{backgroundColor:${js(p.accent)},color:${js(p.ink)},duration:.12},${seconds(event.peakFrame)});`);
      if (settle > 0) tweens.push(`tl.fromTo(${js(q("metric"))},{scale:1.025},{scale:1,duration:${settle},immediateRender:false,ease:"power2.out"},${seconds(event.peakFrame)});`);
      previousValue = value; firstState = false;
    }
    if (event.action === "focus") {
      const target = ["footage","photo"].includes(scene.type) ? q("camera-rig") : ["widget","product","collage"].includes(scene.type) ? q("visual") : scene.type === "kinetic" ? q("motif") : q("pill");
      tweens.push(`tl.to(${js(target)},{scale:1.07,y:-12,duration:${arrive},ease:"power2.inOut"},${start});`);
      if (settle > 0) tweens.push(`tl.to(${js(target)},{scale:1,y:0,duration:${settle},ease:"power3.out"},${seconds(event.peakFrame)});`);
    }
    if (event.action === "camera") {
      const motion = cameraMotion[scene.camera || "dolly-in"];
      if (motion && ["photo","footage"].includes(scene.type)) tweens.push(`tl.fromTo(${js(q("camera-rig"))},${js(motion[0])},{...${js(motion[1])},duration:${Math.max(.3,arrive+settle).toFixed(3)},ease:"power2.inOut",immediateRender:false},${start});`);
      else if (motion && ["product","collage"].includes(scene.type)) tweens.push(`tl.fromTo(${js(q("visual"))},{x:0,scale:1},{x:${scene.camera==="truck-left"?-64:scene.camera==="truck-right"?64:0},scale:${scene.camera==="pull-back"?.94:1.07},duration:${Math.max(.3,arrive+settle).toFixed(3)},ease:"power2.inOut",immediateRender:false},${start});`);
    }
    if (event.action === "exit") tweens.push(`tl.to(${js(q("stage"))},{xPercent:-105,duration:${arrive},ease:"power3.in"},${start});`);
  }
  if (index > 0 && scene.transition === "push") tweens.unshift(`tl.fromTo(${js(q("stage"))},{xPercent:100},{xPercent:0,duration:.45,ease:"power3.out"},0);`);
  if (index > 0 && scene.transition === "whip") tweens.unshift(`tl.fromTo(${js(q("stage"))},{xPercent:36,filter:"blur(14px)"},{xPercent:0,filter:"blur(0px)",duration:.28,ease:"power4.out"},0);`);
  if (index > 0 && scene.transition === "dip") tweens.unshift(`tl.fromTo(${js(q("stage"))},{filter:"brightness(.48)"},{filter:"brightness(1)",duration:.18,ease:"power3.out"},0);`);
  if (index > 0 && scene.transition === "match-cut") tweens.unshift(`tl.fromTo(${js(q("stage"))},{scale:1.055},{scale:1,duration:.22,ease:"power4.out"},0);`);
  if (index > 0 && scene.transition === "iris") tweens.unshift(`tl.fromTo(${js(q("stage"))},{clipPath:"circle(0% at 65% 65%)"},{clipPath:"circle(150% at 65% 65%)",duration:.5,ease:"power3.inOut"},0);`);
  const variables = [...scene.headline.split(/\s+/).map((word,i)=>({id:"word"+i,type:"string",label:"Palavra "+(i+1),default:word})),{id:"detail",type:"string",label:"Detalhe",default:scene.detail??""}];
  if(scene.media) variables.push({id:"productImage",type:"image",label:"Imagem",default:scene.media});
  return `<template><style>${css}</style>
<div id="root" data-composition-id="${sid}" data-width="${plan.width}" data-height="${plan.height}" data-duration="${duration}" data-composition-variables='${html(JSON.stringify(variables))}' style="container-type:size;--ground:${p.ground};--ink:${p.ink};--accent:${p.accent};--paper:${p.paper}">
<div id="${sid}-clip" ${["photo","footage"].includes(scene.type) ? 'class="media-wrapper" data-layout-allow-overflow' : `class="clip" data-start="0" data-duration="${duration}" data-track-index="1"`}><div id="${sid}-stage" class="stage ${["photo","footage"].includes(scene.type) ? "media-first" : ""}" data-layout-allow-overlap>
<div class="eyebrow">${html(scene.eyebrow ?? plan.title)}</div><h1 id="${sid}-headline" class="headline ${scene.type === "end-card" ? "end-title" : ""}">${headline}</h1>${visual}
${scene.type !== "end-card" ? `<div class="detail" data-var-text="detail">${html(scene.detail ?? "")}</div>` : ""}
</div></div></div>
<script>{const counter={value:0};const tl=gsap.timeline({paused:true});${tweens.join("\n")}
window.__timelines=window.__timelines||{};window.__timelines[${js(sid)}]=tl;}</script></template>`;
}

export async function buildMotionComposition(plan, suppliedFiles = []) {
  if(plan.visualMode==="procedural-motion") throw new Error("Procedural cinema requires a real authored index.html, GSAP source and assets via create_video; this scene-template composer cannot manufacture it.");
  const review = requireMotionPlan(plan);
  const duration = frameSeconds(plan.totalFrames, plan.fps);
  const files = suppliedFiles.map(f => ({...f}));
  if (files.some(f => !/^assets\//.test(f.path ?? "") || f.path === "assets/gsap.min.js")) throw new Error("Supplied files must be assets/ files; gsap is provided by MediaForge");
  const paths = new Set(files.map(f => f.path));
  for (const source of [...plan.scenes.map(s=>s.media),...(plan.audioCues??[]).map(c=>c.src)].filter(Boolean)) if (!paths.has(source)) throw new Error("Missing asset: " + source);
  validateCinematicMediaAssets(plan,files);
  files.push({path:"assets/gsap.min.js",content:await readFile(new URL("../../assets/gsap.min.js",import.meta.url),"utf8")});
  files.push({path:"motion-plan.json",content:JSON.stringify(plan,null,2)+"\n"});
  files.push({path:"index.motion.json",content:JSON.stringify({assertions:plan.scenes.map(s=>({kind:"appearsBy",selector:`#${s.id}-headline`,bySec:frameSeconds(s.startFrame,plan.fps)+(s.startFrame===0?.05:.85)}))},null,2)});
  plan.scenes.forEach((scene,index)=>files.push({path:`compositions/${scene.id}.html`,content:sceneFile(plan,scene,index)}));
  const hosts=plan.scenes.map((s,i)=>`<div id="host-${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${frameSeconds(s.startFrame,plan.fps)}" data-duration="${sceneDuration(plan,s,i)}" data-width="${plan.width}" data-height="${plan.height}" data-track-index="${i+1}" data-track-kind="graphics" data-layout-allow-overlap style="position:absolute;inset:0;z-index:${i+1}"></div>`);
  // Audio is packaged in the project; remote URLs and missing stems are blocked by the plan and asset gate.
  // Preserve requested levels in standard mode, and cap beds/transients under speech for cinematic narration.
  const voiced=plan.audioMode==="voice-led";
  const audio=(plan.audioCues??[]).map((c,i)=>{
    const volume=plan.productionMode==="cinematic" ? Math.min(c.volume,c.role==="music"?(voiced ? 0.16 : 0.7):c.role==="sfx" ? 0.65 : 1) : c.volume;
    const fade=c.role==="music" ? ' data-fade-in="0.35" data-fade-out="0.8"' : "";
    return `<audio id="audio-${c.id}" class="clip" src="${html(c.src)}" data-start="${frameSeconds(c.startFrame,plan.fps)}" data-duration="${frameSeconds(c.endFrame-c.startFrame,plan.fps)}" data-track-index="${30+i}" data-volume="${volume}"${fade}></audio>`;
  });
  files.push({path:"index.html",content:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(plan.title)}</title><style>html,body{margin:0}#root{position:relative;overflow:hidden;width:${plan.width}px;height:${plan.height}px;background:${plan.palette?.ground??"#efeee8"}}</style></head><body><div id="root" data-composition-id="main" data-width="${plan.width}" data-height="${plan.height}" data-fps="${plan.fps}" data-duration="${duration}">${hosts.join("\n")}${audio.join("\n")}</div><script src="assets/gsap.min.js"></script><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`});
  const valid=validateProjectFiles(files);
  if(!valid.ok) throw new Error(valid.errors.join("; "));
  return {project:{title:plan.title,durationSeconds:duration,aspectRatio:plan.width===plan.height?"1:1":plan.width>plan.height?"16:9":"9:16",renderer:"hyperframes",outputs:["video","project"],fps:plan.fps,quality:"high",preflight:true},projectFiles:files,metadata:{source:"reference-motion",productionMode:plan.productionMode??"standard",expectsAudio:plan.audioMode!=="silent-study",motionPlan:true,cinematicCraft:review.cinematicCraft},readiness:{testRenderReady:true,renderReady:false,artisticReview:"pending",warnings:review.warnings,cinematicCraft:review.cinematicCraft}};
}
