export function makeCinematicV2Fixture(){
 const lengths=[150,150,120,210,180,210,120,210];
 const types=["footage","footage","photo","footage","product","footage","photo","footage"];
 const transitions=["cut","whip","cut","dip","match-cut","whip","cut","dip"];
 const sizes=["wide","medium","close-up","extreme-close-up","over-shoulder","low-angle","top-down","detail"];
 let start=0;
 const scenes=lengths.map((length,i)=>{
  const type=types[i],sceneStart=start;start+=length;
  const id="scene-"+(i+1);
  const scene={
   id,type,startFrame:sceneStart,endFrame:start,
   voiceStartFrame:sceneStart,voiceEndFrame:start,
   headline:"Cena "+(i+1),detail:"Uma ação causa uma consequência",
   media:"assets/shot-"+(i+1)+(type==="footage"?".mp4":".jpg"),
   mediaDescription:"Plano real de ação narrativa "+(i+1),
   mediaProvenance:"Acervo de teste licenciado — fixture sintético apenas para CI",
   mediaRights:"licensed",
   shotSize:sizes[i],pace:i%2?"medium":"fast",
   hook:i===0,
   continuity:{subjectId:"person-main",propIds:["phone","door"],screenDirection:"left-to-right"},
   camera:["dolly-in","truck-left","pull-back","arc-reveal","truck-right","dolly-in","pull-back","truck-left"][i],
   transition:transitions[i],
   transitionReason:i===0?"Abertura imediata": "Corte motivado pela ação anterior "+i,
   narrativeAction:{
    voiceCue:"A fala "+(i+1)+" descreve o gesto "+(i+1),
    subject:"Pessoa principal",
    action:"Executa uma ação concreta "+(i+1),
    visibleChange:"O estado da cena muda de forma visível "+(i+1),
    stateBefore:"Antes da ação "+(i+1),stateAfter:"Depois da ação "+(i+1)
   },
   effects:{colorGrade:.52,bloom:i%2?.38:.22,shadow:true,motionBlur:i%2?.48:.62,
    microEffect:i===0?"impact":i===3?"light-sweep":undefined},
   events:[
    {id:"enter-"+(i+1),action:"enter",startFrame:0,peakFrame:12,endFrame:20},
    {id:"camera-"+(i+1),action:"camera",startFrame:25,peakFrame:45,endFrame:Math.min(120,length-5)}
   ],
   soundDesign:{intent:"Ambiência discreta que situa a ação "+(i+1),cueIds:["ambience-"+(i+1)]}
  };
  if(i===0)scene.reframe={from:{scale:1,xPercent:0,yPercent:0},to:{scale:1.12,xPercent:-2,yPercent:1}};
  if(i===2)scene.depthLayers=[
   {id:"back",role:"background",src:scene.media,depth:0,parallax:.15,blurPx:3,focus:false},
   {id:"mid",role:"midground",src:"assets/shot-3-mid.png",depth:.5,parallax:.55,blurPx:0,focus:true},
   {id:"front",role:"foreground",src:"assets/shot-3-front.png",depth:1,parallax:1,blurPx:1.5,focus:false}
  ];
  return scene;
 });
 const captions=scenes.map((scene,i)=>{
  const start=scene.startFrame+5,end=scene.endFrame-5,span=end-start;
  const words=["Fala","sincronizada","ação"];
  return {startFrame:start,endFrame:end,text:"Fala sincronizada ação "+(i+1),emphasis:"ação",
   words:words.map((word,j)=>({text:word,startFrame:start+Math.floor(span*j/3),endFrame:start+Math.floor(span*(j+1)/3)}))};
 });
 const cues=[
  {id:"narration",role:"voice",src:"assets/voice.mp3",startFrame:0,endFrame:1350,volume:1,provenance:"Narração original de teste"},
  {id:"score",role:"music",src:"assets/music.wav",startFrame:0,endFrame:1350,volume:.16,provenance:"Trilha original licenciada",narrativeIntent:"Começa contida, cresce com a decisão e resolve no payoff"},
  {id:"caption-pop",role:"sfx",src:"assets/pop.wav",startFrame:captions[0].words[0].startFrame,endFrame:captions[0].words[0].startFrame+12,volume:.35,provenance:"SFX original",syncTarget:"caption",captionIndex:0,wordIndex:0,sceneId:"scene-1"},
  {id:"camera-whoosh",role:"sfx",src:"assets/whoosh.wav",startFrame:465,endFrame:480,volume:.38,provenance:"SFX original",syncTarget:"motion",eventId:"camera-4",sceneId:"scene-4"},
  {id:"transition-hit",role:"sfx",src:"assets/transition.wav",startFrame:150,endFrame:168,volume:.42,provenance:"SFX original",syncTarget:"transition",sceneId:"scene-2"},
  ...scenes.map((scene,i)=>({id:"ambience-"+(i+1),role:"ambience",src:"assets/ambience-"+(i+1)+".wav",
   startFrame:scene.startFrame,endFrame:scene.endFrame,volume:.08,provenance:"Ambiência original",sceneId:scene.id}))
 ];
 return {
  format:"mediaforge-motion-v1",productionMode:"cinematic",cinematicPolicyVersion:"v2",visualMode:"media-first",
  title:"Filme de teste — narrativa em ação",width:1080,height:1920,fps:30,totalFrames:1350,audioMode:"voice-led",
  storyArc:{hook:"Uma decisão muda a situação",conflict:"O conflito impede o avanço",escalation:"A tensão cresce com as ações",resolution:"A pessoa escolhe agir",payoff:"A imagem final revela a consequência"},
  soundtrackArc:{opening:"Tensão contida",build:"Percussão e harmonia crescem",payoff:"Resolução emocional curta"},
  audioMix:{voiceDucking:true,targetIntegratedLUFS:-15,maxTruePeakDbtp:-1},
  captionStyle:{safeZone:{left:.09,right:.09,bottom:.18},maxLines:2,minFontSize:40},
  scenes,captions,audioCues:cues
 };
}
export function cinematicV2FilesFor(plan){
 const paths=new Set([
  ...plan.scenes.map(s=>s.media),
  ...plan.scenes.flatMap(s=>(s.depthLayers||[]).map(x=>x.src)),
  ...plan.audioCues.map(c=>c.src)
 ]);
 return [...paths].map(path=>{
  const ext=path.split(".").pop().toLowerCase();
  const header=ext==="mp4"?Buffer.from([0,0,0,24,102,116,121,112])
   :ext==="jpg"?Buffer.from([255,216,255,224])
   :ext==="png"?Buffer.from([137,80,78,71,13,10,26,10])
   :ext==="mp3"?Buffer.from("ID3")
   :ext==="wav"?Buffer.from("RIFF1234WAVE"):Buffer.from("NOT_MEDIA");
  return {path,contentBase64:Buffer.concat([header,Buffer.from(path),Buffer.alloc(128)]).toString("base64")};
 });
}
