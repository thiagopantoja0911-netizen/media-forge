import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeEditorProject, saveEditorProject, editorStoreDir, validateEditorProject } from "./editor-studio-core.mjs";
import { storeEditorVisualAsset } from "./editor-visual-assets.mjs";
import { analyzePcmForBeats } from "./editor-beat-sync.mjs";

const SAMPLE_RATE=22050,DURATION=24,BPM=120;
const TYPOGRAPHY={mode:"letters",family:"sans",weightFrom:300,weightTo:900,bloom:.38,bloomColor:"#e8f4ff",stagger:.72};

function wavFromPcm(samples,sampleRate){
  const dataBytes=samples.length*2,buffer=Buffer.alloc(44+dataBytes);
  buffer.write("RIFF",0);buffer.writeUInt32LE(36+dataBytes,4);buffer.write("WAVE",8);
  buffer.write("fmt ",12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);
  buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);
  buffer.writeUInt32LE(sampleRate*2,28);buffer.writeUInt16LE(2,32);
  buffer.writeUInt16LE(16,34);buffer.write("data",36);buffer.writeUInt32LE(dataBytes,40);
  for(let i=0;i<samples.length;i++)buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return buffer;
}

export function buildHomologationAudio({durationSeconds=DURATION,bpm=BPM,sampleRate=SAMPLE_RATE}={}){
  if(durationSeconds!==24||bpm!==120||sampleRate!==SAMPLE_RATE)
    throw Object.assign(new Error("A trilha de homologação usa 24s, 120 BPM e 22,05 kHz."),{code:"HOMOLOGATION_AUDIO_CONFIG_INVALID"});
  const samples=new Float32Array(durationSeconds*sampleRate);
  let seed=0x51f15e;
  for(let i=0;i<samples.length;i++){
    const t=i/sampleRate,beatIndex=Math.floor(t/(60/bpm)),beatAge=t-beatIndex*(60/bpm);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/4294967296*2-1;
    let value=0;
    if(beatAge<.17){
      const frequency=92-48*(beatAge/.17);
      value+=.82*Math.exp(-beatAge*24)*Math.sin(2*Math.PI*frequency*beatAge);
    }
    if(beatIndex%2===1&&beatAge<.13){
      value+=.22*Math.exp(-beatAge*25)*(noise*.72+Math.sin(2*Math.PI*185*beatAge)*.28);
    }
    const hatAge=t-Math.floor(t/.25)*.25;
    if(hatAge<.022)value+=.11*Math.exp(-hatAge*150)*noise;
    const chord=Math.floor(t/2)%4;
    const bass=[55,65.4,73.4,49][chord];
    value+=.09*Math.sin(2*Math.PI*bass*t)+.035*Math.sin(2*Math.PI*(bass*2)*t);
    value+=.024*Math.sin(2*Math.PI*220*t)+.018*Math.sin(2*Math.PI*329.63*t);
    samples[i]=value;
  }
  let peak=0;
  for(const v of samples)peak=Math.max(peak,Math.abs(v));
  const gain=peak>.001?.86/peak:1;
  for(let i=0;i<samples.length;i++)samples[i]*=gain;
  return {samples,buffer:wavFromPcm(samples,sampleRate),sampleRate,durationSeconds,bpm};
}

function cardSvg({title,subtitle,accent,number}){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
<rect width="480" height="320" rx="28" fill="#0b1424"/>
<rect x="26" y="26" width="428" height="268" rx="22" fill="#111f35" stroke="#2a3e59" stroke-width="2"/>
<rect x="48" y="50" width="70" height="8" rx="4" fill="${accent}"/>
<text x="48" y="126" fill="#f2f6ff" font-family="Arial" font-size="34" font-weight="700">${title}</text>
<text x="48" y="166" fill="#9fb2c9" font-family="Arial" font-size="19">${subtitle}</text>
<circle cx="394" cy="236" r="34" fill="${accent}" opacity=".9"/>
<text x="394" y="246" text-anchor="middle" fill="#07101c" font-family="Arial" font-size="24" font-weight="700">${number}</text>
</svg>`;
}

export async function createEditorHomologationProject(){
  const music=buildHomologationAudio();
  const expected=analyzePcmForBeats(music.samples,music.sampleRate);
  if(Math.abs(expected.bpm-BPM)>3)
    throw Object.assign(new Error("A trilha sintética não passou na pré-validação de BPM: "+expected.bpm),{code:"HOMOLOGATION_BPM_PRECHECK_FAILED"});
  let project=await saveEditorProject(makeEditorProject({
    title:"MediaForge · Homologação completa 24s",
    brand:"MediaForge",
    idea:"Homologação ponta a ponta do editor cinematográfico: motion blur real, tipografia letra por letra, foco de profundidade, grid de cards e trilha original sincronizada a 120 BPM.",
    duration_seconds:DURATION,fps:30,aspect_ratio:"9:16",
    scenes:[
      {kicker:"MOVIMENTO REAL",headline:"IDEIAS EM MOVIMENTO",detail:"Uma composição tridimensional com movimento e exposição temporal.",shape:"torus-knot",camera:"reveal",transition:"cut",accent:"#75d8ff",energy:.78,depth:.86,textScale:1,motionBlur:.72,depthOfField:.32,typography:{...TYPOGRAPHY,bloom:.42,bloomColor:"#75d8ff"}},
      {kicker:"GRID DE CARDS",headline:"CADA DETALHE CONTA",detail:"Quatro cartões em profundidade, com câmera e foco seletivo.",shape:"icosahedron",camera:"arc",transition:"whip",accent:"#a58bff",energy:.86,depth:.9,textScale:1.02,motionBlur:.62,depthOfField:.72,typography:{...TYPOGRAPHY,bloom:.28,bloomColor:"#a58bff"}},
      {kicker:"RITMO AUTOMÁTICO",headline:"NO TEMPO CERTO",detail:"Cortes preparados para acompanhar os ataques da trilha.",shape:"sphere",camera:"dolly",transition:"match-cut",accent:"#55e0b0",energy:.74,depth:.82,textScale:.98,motionBlur:.78,depthOfField:.46,typography:{...TYPOGRAPHY,bloom:.36,bloomColor:"#55e0b0"}},
      {kicker:"FOCO CINEMATOGRÁFICO",headline:"FOCO NO ESSENCIAL",detail:"Profundidade de campo por cena e assunto central em destaque.",shape:"rings",camera:"truck-left",transition:"push",accent:"#ffbf73",energy:.68,depth:.78,textScale:1,motionBlur:.58,depthOfField:.84,typography:{...TYPOGRAPHY,bloom:.3,bloomColor:"#ffbf73"}},
      {kicker:"ENTREGA FINAL",headline:"PRONTO PARA CRIAR",detail:"Pipeline completo validado com áudio, 3D e tipografia cinética.",shape:"cube",camera:"dolly",transition:"dip",accent:"#f28fae",energy:.72,depth:.86,textScale:1.04,motionBlur:.7,depthOfField:.38,typography:{...TYPOGRAPHY,bloom:.4,bloomColor:"#f28fae"}}
    ]
  }));
  const cardData=[
    {filename:"homologacao-card-01.svg",title:"MOVIMENTO",subtitle:"Motion blur temporal",accent:"#75d8ff",number:"01"},
    {filename:"homologacao-card-02.svg",title:"TIPOGRAFIA",subtitle:"Letras em sequência",accent:"#a58bff",number:"02"},
    {filename:"homologacao-card-03.svg",title:"RITMO",subtitle:"120 BPM detectados",accent:"#55e0b0",number:"03"},
    {filename:"homologacao-card-04.svg",title:"PROFUNDIDADE",subtitle:"Foco cinematográfico",accent:"#ffbf73",number:"04"}
  ];
  const assets=[];
  for(const card of cardData){
    const result=await storeEditorVisualAsset(project,{filename:card.filename,base64:Buffer.from(cardSvg(card)).toString("base64")});
    project=result.project;assets.push(result.asset);
  }
  project.scenes[1].visual={
    type:"card-grid",assetId:assets[0].id,assetIds:assets.map(a=>a.id),
    position:[0,.05,0],rotation:[0,14,0],scale:.68,depth:.86,columns:2,rows:2,scroll:.42
  };
  const audioId=randomUUID().replaceAll("-","");
  const track={id:audioId,assetId:audioId,role:"music",extension:"wav",
    name:"MediaForge Original Beat 120 BPM.wav",startFrame:0,endFrame:project.totalFrames,volume:.28};
  await mkdir(editorStoreDir(),{recursive:true});
  const audioFile=join(editorStoreDir(),project.id+"-audio-"+audioId+".wav");
  await writeFile(audioFile,music.buffer,{flag:"wx"});
  project={...project,audio:[track]};
  try{
    validateEditorProject(project);
    project=await saveEditorProject(project,{expectedRevision:project.revision});
  }catch(error){throw error;}
  return {
    project,audioTrack:track,visualAssets:assets,
    audio:{durationSeconds:music.durationSeconds,sampleRate:music.sampleRate,sizeBytes:music.buffer.length,
      expectedBpm:expected.bpm,confidence:expected.confidence},
    editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
    nextSteps:[
      "Chame sync_editor_beats com project_id para decodificar a faixa WAV via FFmpeg e alinhar os cortes.",
      "Abra editorUrl e inspecione pelo menos dois instantes de cada cena, incluindo o grid de cards.",
      "Registre review_editor_preview somente após a inspeção visual real de todas as cenas.",
      "Depois da aprovação, chame render_editor_project com confirm_render=true."
    ]
  };
}
