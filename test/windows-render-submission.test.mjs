import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateWindowsRenderSubmission} from "../src/motion/submission-gate.mjs";

const study=JSON.parse(await readFile(new URL("../examples/motion/widget-study.json",import.meta.url),"utf8"));
const sound=name=>({path:"assets/"+name+".wav",content:"RIFF"});
function good(){
 const plan=structuredClone(study);
 Object.assign(plan,{
  productionMode:"standard",profile:"dynamic-motion-v1",durationSeconds:12,
  intent:"Mostrar progresso real com etapas perceptíveis",
  audioMode:"sound-design",
  layers:[{id:"background",role:"background",depth:0,movement:"travelling"},
   {id:"midground",role:"midground",depth:1,movement:"cards avançando"},
   {id:"foreground",role:"foreground",depth:2,movement:"contador em movimento"}],
  beats:[
   {start:0,end:4,action:"Apresentar conflito",stateBefore:"Sem foco",stateAfter:"Problema visível"},
   {start:4,end:8,action:"Mostrar processo",stateBefore:"Bloqueio",stateAfter:"Progresso avançando"},
   {start:8,end:12,action:"Resolver",stateBefore:"Progresso",stateAfter:"Próximo passo visível"}],
  events:[
   {id:"camera-one",start:0,duration:4,scope:"camera",target:"shot-1",kind:"dolly-in"},
   {id:"camera-two",start:4,duration:4,scope:"camera",target:"shot-2",kind:"truck-right"},
   {id:"camera-three",start:8,duration:4,scope:"camera",target:"shot-3",kind:"pull-back"},
   {id:"text-one",start:0,duration:4,scope:"foreground",target:"headline",kind:"kinetic-reveal"},
   {id:"metric",start:4,duration:4,scope:"ui",target:"widget",kind:"state-change"},
   {id:"cta",start:8,duration:4,scope:"foreground",target:"end-card",kind:"object-reveal"}],
  transitions:[
   {at:3.8,duration:.2,kind:"whip",carrier:"headline",cause:"action",fromState:"Problem",toState:"Action"},
   {at:7.8,duration:.2,kind:"object-wipe",carrier:"progress",cause:"completion",fromState:"Working",toState:"Done"},
   {at:10.8,duration:.2,kind:"camera-pass",carrier:"end-title",cause:"final",fromState:"Reveal",toState:"Hold"}],
  holds:[],
  audioCues:[
   {id:"music",role:"music",src:"assets/music.wav",startFrame:0,endFrame:720,volume:.65,provenance:"Trilha original"},
   {id:"whoosh",role:"sfx",src:"assets/whoosh.wav",startFrame:90,endFrame:120,volume:.45,provenance:"Efeito original",eventId:"opening-focus"},
   {id:"tap",role:"sfx",src:"assets/tap.wav",startFrame:245,endFrame:260,volume:.35,provenance:"Efeito original",eventId:"progress-one"}]});
 const html=['<!doctype html><html><head><script src="assets/gsap.min.js"></script></head><body>',
 '<main data-composition-id="main" data-duration="12">',
 '<div class="clip" data-start="0" data-duration="3"></div>',
 '<div class="clip" data-start="3" data-duration="3"></div>',
 '<div class="clip" data-start="6" data-duration="3"></div>',
 '<div class="clip" data-start="9" data-duration="3"></div>',
 '<audio id="bed" src="assets/music.wav" data-start="0" data-duration="12"></audio>',
 '<audio id="whoosh" src="assets/whoosh.wav" data-start="1.5" data-duration=".5"></audio>',
 '<audio id="tap" src="assets/tap.wav" data-start="4" data-duration=".5"></audio>',
 '</main><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>'].join('');
 return {title:"Teste de pipeline",duration_seconds:12,aspect_ratio:"9:16",fps:60,quality:"high",preflight:true,
 project_files:[{path:"index.html",content:html},{path:"motion-plan.json",content:JSON.stringify(plan)},
  {path:"assets/gsap.min.js",content:"/* gsap supplied */"},sound("music"),sound("whoosh"),sound("tap")]};
}
test("golden storyboard with movement and audio accepted before worker",()=>{
 const result=validateWindowsRenderSubmission(good());
 assert.equal(result.ok,true,result.errors.join("\n"));
});
test("missing manifest refused before consuming Windows render",()=>{
 const args=good();args.project_files=args.project_files.filter(x=>x.path!=="motion-plan.json");
 assert.match(validateWindowsRenderSubmission(args).errors.join(" "),/Falta motion-plan/);
});
test("static fake camera events rejected before rendering",()=>{
 const args=good(),f=args.project_files.find(x=>x.path==="motion-plan.json"),p=JSON.parse(f.content);
 p.events=[{id:"pause",start:1,duration:.2,scope:"foreground",target:"headline",kind:"static-card"}];
 f.content=JSON.stringify(p);
 assert.match(validateWindowsRenderSubmission(args).errors.join(" "),/Movimento dinâmico/);
});
test("missing audio and mismatched duration rejected",()=>{
 const args=good();args.project_files=args.project_files.filter(x=>x.path!=="assets/tap.wav");args.duration_seconds=11;
 const errors=validateWindowsRenderSubmission(args).errors.join(" ");
 assert.match(errors,/Asset declarado/);assert.match(errors,/Duração declarada/);
});
test("fonts and missing local GSAP rejected before expensive HyperFrames",()=>{
 const args=good(),index=args.project_files.find(x=>x.path==="index.html");
 index.content=index.content.replace('<script src="assets/gsap.min.js"></script>',"");
 index.content=index.content.replace("</head>",'<style>h1{font-family:Impact,sans-serif}</style></head>');
 const errors=validateWindowsRenderSubmission(args).errors.join(" ");
 assert.match(errors,/GSAP timeline/);assert.match(errors,/Fonte Impact/);
});
test("remote media URL rejected before queue",()=>{
 const args=good(),index=args.project_files.find(x=>x.path==="index.html");
 index.content=index.content.replace("assets/music.wav","https://media.example/music.wav");
 assert.match(validateWindowsRenderSubmission(args).errors.join(" "),/Mídia HTML ausente ou externa/);
});
