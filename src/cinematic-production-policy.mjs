/**
 * MediaForge cinematic V2 — executable production contract.
 * Plan checks are deterministic; rendered-media checks require FFmpeg evidence;
 * artistic approval remains a human decision. No status is inferred from a label.
 */
export const CINEMATIC_POLICY_VERSION="cinematic-v2";
const controls=[
["narrative","written-story-arc","Roteiro com progressão narrativa"],
["narrative","voice-anchored-storyboard","Storyboard ligado a trechos da narração"],
["narrative","semantic-visual-direction","Cada fala gera uma ação visível"],
["narrative","shot-variety","Variação de planos e enquadramentos"],
["narrative","continuity","Continuidade visual entre cenas"],
["narrative","rhythm","Ritmo acompanhado pela progressão dramática"],
["narrative","visual-hook","Gancho audiovisual nos primeiros segundos"],
["image","media-first","Imagens ou footage reais como base das cenas"],
["image","asset-diversity","Diversidade de mídias específicas da narrativa"],
["image","asset-repetition-limit","Limitar repetição de mídia-base"],
["image","color-grade","Tratamento de cor cinematográfico"],
["image","lighting-shadows","Luz e sombras com profundidade"],
["image","depth-of-field","Profundidade de campo contextual"],
["image","motion-blur","Desfoque de movimento nas ações rápidas"],
["image","bloom-glow","Bloom e glow controlados"],
["image","parallax-depth","Camadas e profundidade 2.5D/3D"],
["image","motivated-camera","Câmera com alvo e movimento motivados"],
["image","motivated-transitions","Transições motivadas por ação"],
["editing","timed-captions","Legendas sincronizadas"],
["editing","kinetic-typography","Tipografia cinética usada como apoio"],
["editing","contextual-graphics","Grafismos contextualizados, sem substituir o plano"],
["editing","dynamic-reframing","Reenquadramentos e zooms motivados"],
["editing","visual-events","Efeitos ligados a eventos narrativos"],
["editing","pacing-variation","Alternância de ritmo e velocidade"],
["editing","composited-layers","Camadas e máscaras de composição"],
["audio","narrative-score","Trilha original/licenciada aderente à história"],
["audio","scene-sound-design","Sound design por cena"],
["audio","motion-micro-sfx","Efeitos sonoros nos movimentos"],
["audio","sonic-transitions","Transições sonoras motivadas"],
["audio","voice-priority-mix","Mixagem: voz prioritária sobre música e SFX"],
["audio","loudness-control","Loudness integrado e pico verdadeiro"],
["audio","silence-clipping-check","Checagem de silêncios e distorções"],
["quality","duplicate-shot-check","Verificar cenas repetidas"],
["quality","static-shot-check","Identificar planos estáticos prolongados"],
["quality","word-picture-sync","Verificar sincronismo audiovisual"],
["quality","caption-legibility","Legendas legíveis em área segura"],
["quality","render-frame-inspection","Inspeção do vídeo renderizado"],
["quality","technical-probe","Validar resolução/FPS/codec/duração"],
["quality","artistic-review","Avaliar narrativa, ritmo e estética"],
["quality","delivery-review-gate","Não aprovar só com QA técnico"],
].map(([group,id,label],index)=>Object.freeze({number:index+1,group,id,label}));
export const CINEMATIC_PRODUCTION_POLICY=Object.freeze({
 version:CINEMATIC_POLICY_VERSION,mode:"cinematic",controls:Object.freeze(controls),
 limits:Object.freeze({minRealMediaShare:.70,minMovingFootageShare:.50,maxPureGraphicsShare:.15,
  maxSingleMediaShare:.25,maxUnmotivatedStaticSeconds:5,maxCaptionGapSeconds:3,
  maxSfxSyncOffsetMs:80,maxVoiceToImageSyncMs:100,targetIntegratedLUFS:Object.freeze([-16,-14]),
  maxTruePeakDbtp:-1}),
 assetRules:Object.freeze({mainVisualKind:"photo-footage-or-realistic-cgi",flatVectorAsPrimaryScene:false,
  requirePackagedAssets:true,requireOriginalOrLicensedAudio:true,allowManualGraphicProjects:true,
  allowTechnicalStudyOnlyWhenExplicit:true}),
 review:Object.freeze({preflight:true,technicalQA:true,audioQA:true,renderedFrameReview:true,
  artisticQA:"human-required",markFinalBeforeArtisticApproval:false})
});
const say=v=>typeof v==="string"?v.trim():"";
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const graphicTypes=new Set(["kinetic","widget","end-card"]);
const realTypes=new Set(["footage","photo","product","collage"]);
const shotSizes=new Set(["extreme-wide","wide","medium","close-up","extreme-close-up","over-shoulder","low-angle","top-down","detail"]);
const paceTypes=new Set(["fast","medium","hold"]);
const rightsTypes=new Set(["owned","licensed","ai-generated","public-domain","stock-licensed"]);
const microTypes=new Set(["flash","light-sweep","impact","dust","light-leak"]);
const asFrame=(seconds,fps)=>Math.round(seconds*fps);
function isAsset(path){return typeof path==="string"&&/^assets\/[A-Za-z0-9_./-]+$/.test(path)&&!path.split("/").includes("..");}
function setStatus(map,id,status,evidence){
 const rank={blocked:7,review_required:6,pending_render:5,pending:4,warning:3,passed:1};
 const current=map.get(id);
 if(current&&(rank[current.status]??0)>(rank[status]??0))return;
 map.set(id,{status,evidence});
}
export function reviewCinematicPolicyV2(plan,evidence={}) {
 const enabled=plan?.productionMode==="cinematic"&&plan?.cinematicPolicyVersion==="v2";
 const errors=[],warnings=[],results=new Map();
 if(!enabled)return {enabled:false,ok:true,errors,warnings,metrics:{version:CINEMATIC_POLICY_VERSION},controls:[]};
 const fps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
 const scenes=Array.isArray(plan.scenes)?plan.scenes:[];
 const total=Number(plan.totalFrames);
 const fail=(id,msg)=>{errors.push(msg);setStatus(results,id,"blocked",msg);};
 const warn=(id,msg)=>{warnings.push(msg);if(!results.has(id))setStatus(results,id,"warning",msg);};
 const pass=(id,detail)=>setStatus(results,id,"passed",detail);
 const pending=(id,detail)=>setStatus(results,id,"pending_render",detail);
 const human=(id,detail)=>setStatus(results,id,evidence.artisticQA==="approved"?"passed":"review_required",detail);
 if(!finite(fps)||fps<=0||!Number.isInteger(total)||total<=0)
  return {enabled,ok:false,errors:["Política V2: FPS/duração inválidos"],warnings,metrics:{version:CINEMATIC_POLICY_VERSION},controls:[]};
 const limits=CINEMATIC_PRODUCTION_POLICY.limits,duration=total/fps;
 const story=plan.storyArc||{};
 const arcFields=["hook","conflict","escalation","resolution","payoff"];
 if(arcFields.every(k=>say(story[k])))pass("written-story-arc","5 beats de história definidos");
 else fail("written-story-arc","Política V2: storyArc precisa definir hook, conflict, escalation, resolution e payoff");
 const ids=new Set(),mediaUsage=new Map(),shotSizes=new Set(),cameras=new Set(),transitions=new Set(),paces=new Set();
 const continuity=new Map(),effects={motionBlur:0,bloom:0,shadow:0,colorGrade:0,depthOfField:0,parallax:0,microEffect:0};
 let realFrames=0,movingFrames=0,graphicFrames=0,captionAnchors=0,motionEvents=0,transitionEvents=0;
 let validVoiceAnchors=true,validSceneSound=true,validReframes=0,validEvents=0,validNarrative=true,validContinuity=true;
 for(const [index,scene] of scenes.entries()){
  const length=Number(scene.endFrame)-Number(scene.startFrame);
  if(!finite(length)||length<=0){fail("semantic-visual-direction","Cena "+(index+1)+": duração inválida");continue;}
  const n=scene.narrativeAction||{};
  if(!say(n.voiceCue)||!say(n.subject)||!say(n.action)||!say(n.visibleChange)||!say(n.stateBefore)||!say(n.stateAfter)||
     n.stateBefore===n.stateAfter||n.visibleChange===scene.headline){
   validNarrative=false;fail("semantic-visual-direction",scene.id+": descreva fala, ação física, mudança visível e estados antes/depois");
  }
  if(!Number.isInteger(scene.voiceStartFrame)||!Number.isInteger(scene.voiceEndFrame)||
     scene.voiceStartFrame<scene.startFrame||scene.voiceEndFrame<=scene.voiceStartFrame||scene.voiceEndFrame>scene.endFrame||
     !say(n.voiceCue))validVoiceAnchors=false;
  if(scene.shotSize)shotSizes.add(scene.shotSize);
  if(scene.camera)cameras.add(scene.camera);
  if(scene.transition)transitions.add(scene.transition);
  if(scene.pace)paces.add(scene.pace);
  if(!scene.continuity||!say(scene.continuity.subjectId)||!["left-to-right","right-to-left","static"].includes(scene.continuity.screenDirection)||
     !Array.isArray(scene.continuity.propIds)){validContinuity=false;fail("continuity",scene.id+": continuity precisa de subjectId, propIds e screenDirection");}
  else{
   const prev=continuity.get(scene.continuity.subjectId);
   if(prev&&prev!==scene.continuity.screenDirection){validContinuity=false;fail("continuity",scene.id+": direção de tela inconsistente para o mesmo sujeito");}
   continuity.set(scene.continuity.subjectId,scene.continuity.screenDirection);
  }
  if(!paceTypes.has(scene.pace))fail("rhythm",scene.id+": pace deve ser fast, medium ou hold");
  if(scene.type==="footage"||scene.type==="photo"||scene.type==="product"||scene.type==="collage")realFrames+=length;
  if(scene.type==="footage")movingFrames+=length;
  if(graphicTypes.has(scene.type)){
   graphicFrames+=length;
   if(!say(scene.graphicPurpose))fail("contextual-graphics",scene.id+": grafismo precisa explicar sua função narrativa");
  }
  if(!isAsset(scene.media))fail("media-first",scene.id+": mídia deve ser arquivo local em assets/");
  else mediaUsage.set(scene.media,(mediaUsage.get(scene.media)||0)+length);
  if(!say(scene.mediaDescription)||!say(scene.mediaProvenance)||!rightsTypes.has(scene.mediaRights))
   fail("asset-diversity",scene.id+": informe descrição, procedência e direitos do asset visual");
  if(scene.hook!==true&&index===0)fail("visual-hook","A primeira cena precisa declarar hook=true");
  if(!shotSizes.has(scene.shotSize))fail("shot-variety",scene.id+": shotSize inválido ou ausente");
  if(!scene.camera||scene.camera==="locked")fail("motivated-camera",scene.id+": cada plano precisa de movimento de câmera motivado");
  if(!say(scene.transitionReason)&&index>0)fail("motivated-transitions",scene.id+": explique a motivação do corte/transição");
  if(!Array.isArray(scene.events)||!scene.events.some(e=>e?.action==="enter")||
     !scene.events.some(e=>["camera","focus","state"].includes(e?.action)))fail("visual-events",scene.id+": precisa de evento de entrada e ação visual/câmera");
  else validEvents++;
  if(scene.reframe){
   const r=scene.reframe,okPoint=p=>p&&finite(p.scale)&&p.scale>=1&&p.scale<=1.6&&finite(p.xPercent)&&Math.abs(p.xPercent)<=12&&finite(p.yPercent)&&Math.abs(p.yPercent)<=12;
   if(!okPoint(r.from)||!okPoint(r.to)||JSON.stringify(r.from)===JSON.stringify(r.to))fail("dynamic-reframing",scene.id+": reframe from/to inválido ou sem mudança");
   else validReframes++;
  }
  const fx=scene.effects||{};
  if(finite(fx.motionBlur)&&fx.motionBlur>0&&fx.motionBlur<=1)effects.motionBlur++;
  if(finite(fx.bloom)&&fx.bloom>0&&fx.bloom<=1)effects.bloom++;
  if(fx.shadow===true)effects.shadow++;
  if(finite(fx.colorGrade)&&fx.colorGrade>0&&fx.colorGrade<=1)effects.colorGrade++;
  if(microTypes.has(fx.microEffect))effects.microEffect++;
  const depth=Array.isArray(scene.depthLayers)?scene.depthLayers:[];
  if(depth.length){
   const roles=new Set(depth.map(x=>x?.role)),focus=depth.filter(x=>x?.focus===true);
   const valid=depth.length===3&&["background","midground","foreground"].every(x=>roles.has(x))&&focus.length===1&&
    depth.every(x=>isAsset(x.src)&&finite(x.parallax)&&x.parallax>=0&&x.parallax<=1&&finite(x.blurPx)&&x.blurPx>=0&&x.blurPx<=16);
   if(!valid)fail("depth-of-field",scene.id+": depthLayers exige 3 layers background/midground/foreground, 1 foco e assets locais");
   else{
    effects.depthOfField++;
    if(new Set(depth.map(x=>x.parallax)).size>=3&&depth.some(x=>x.parallax>0))effects.parallax++;
   }
  }
  if(scene.type==="photo"&&length/fps>5&&!scene.intentionalHold)fail("static-shot-check",scene.id+": fotografia estática acima de 5s sem hold deliberado");
  if(!scene.soundDesign||!say(scene.soundDesign.intent)||!Array.isArray(scene.soundDesign.cueIds)||!scene.soundDesign.cueIds.length)
   validSceneSound=false;
  else if(!scene.soundDesign.cueIds.every(id=>(plan.audioCues||[]).some(c=>c.id===id&&c.sceneId===scene.id&&["sfx","ambience"].includes(c.role))))validSceneSound=false;
  if(scene!==scenes[0])transitions.add(scene.transition||"cut");
 }
 if(!validVoiceAnchors)fail("voice-anchored-storyboard","Cada cena precisa de voiceStartFrame/voiceEndFrame alinhados à fala");
 else pass("voice-anchored-storyboard","Todas as cenas possuem âncoras de narração");
 if(validNarrative)pass("semantic-visual-direction","Cada cena contém fala, ação e transformação visual");
 if(validContinuity)pass("continuity","Sujeitos e direções de tela consistentes");
 if(shotSizes.size<3)fail("shot-variety","Use ao menos três tamanhos de plano distintos");
 else pass("shot-variety",[...shotSizes]);
 if(cameras.size<2)fail("motivated-camera","Use pelo menos dois movimentos de câmera distintos");
 else if(scenes.every(s=>s.camera&&s.camera!=="locked"))pass("motivated-camera",[...cameras]);
 if(transitions.size<2)fail("motivated-transitions","Use pelo menos duas transições diferentes e motivadas");
 else if(scenes.slice(1).every(s=>say(s.transitionReason)))pass("motivated-transitions",[...transitions]);
 if(paces.size<2)fail("rhythm","Alterne ao menos dois ritmos: fast, medium ou hold");
 else {pass("rhythm",[...paces]);pass("pacing-variation",[...paces]);}
 if(!scenes.length||scenes.length<5)fail("shot-variety","Cinematográfico V2 exige pelo menos cinco planos narrativos");
 if(!scenes.length||scenes[0]?.startFrame>fps*1.5||scenes[0]?.hook!==true)fail("visual-hook","O gancho precisa começar nos primeiros 1,5s e declarar hook=true");
 else pass("visual-hook","Gancho visual marcado no primeiro plano");
 const pct=n=>Math.round(100*n/total);
 const realPct=pct(realFrames),movingPct=pct(movingFrames),graphicsPct=pct(graphicFrames);
 if(realFrames/total<limits.minRealMediaShare||movingFrames/total<limits.minMovingFootageShare||plan.visualMode!=="media-first")
  fail("media-first","Política V2 exige >=70% mídia real, >=50% footage em movimento e visualMode=media-first");
 else pass("media-first",{realMediaPct:realPct,movingFootagePct:movingPct});
 if(new Set(scenes.map(s=>s.media).filter(Boolean)).size<4)fail("asset-diversity","Use pelo menos quatro assets visuais distintos");
 else pass("asset-diversity",new Set(scenes.map(s=>s.media)).size+" assets distintos");
 if(graphicsPct>limits.maxPureGraphicsShare*100)fail("contextual-graphics","Grafismos puros excedem 15% da duração");
 else pass("contextual-graphics",{pureGraphicsPct:graphicsPct});
 for(const [path,frames] of mediaUsage)if(frames/total>limits.maxSingleMediaShare+.0001)
  fail("asset-repetition-limit","Asset repetido por mais de 25%: "+path);
 if(!results.has("asset-repetition-limit"))pass("asset-repetition-limit","Nenhum asset domina mais de 25%");
 if(effects.colorGrade<Math.ceil(scenes.length*.5))fail("color-grade","Tratamento de cor deve alcançar ao menos metade das cenas");
 else pass("color-grade",{scenes:effects.colorGrade});
 if(effects.shadow<Math.ceil(scenes.length*.5))fail("lighting-shadows","Sombras/profundidade devem alcançar ao menos metade das cenas");
 else pass("lighting-shadows",{scenes:effects.shadow});
 if(!effects.depthOfField)fail("depth-of-field","Inclua ao menos uma cena em camadas com foco seletivo real");
 else pass("depth-of-field",{scenes:effects.depthOfField});
 if(!effects.depthOfField)fail("composited-layers","Inclua camadas foreground/midground/background");
 else pass("composited-layers",{scenes:effects.depthOfField});
 if(!effects.motionBlur)fail("motion-blur","Motion blur temporal precisa ser declarado em pelo menos uma cena");
 else pass("motion-blur",{scenes:effects.motionBlur,renderer:"HyperFrames cinematic shutter"});
 if(!effects.bloom)fail("bloom-glow","Inclua bloom/glow em ao menos uma cena");
 else pass("bloom-glow",{scenes:effects.bloom});
 if(!effects.parallax)fail("parallax-depth","Inclua parallax em camadas com profundidades distintas");
 else pass("parallax-depth",{scenes:effects.parallax});
 if(effects.microEffect<2)fail("visual-events","Inclua pelo menos dois microefeitos visuais motivados");
 else pass("visual-events",{microEffects:effects.microEffect});
 if(!validReframes)fail("dynamic-reframing","Inclua ao menos um reenquadramento dinâmico com keyframes");
 else pass("dynamic-reframing",{scenes:validReframes});
 if(validEvents!==scenes.length)fail("visual-events","Todas as cenas precisam de eventos visuais concretos");
 else pass("visual-events",{scenes:validEvents});
 if(!validSceneSound)fail("scene-sound-design","Cada cena precisa de soundDesign e ao menos um cue real vinculado");
 else pass("scene-sound-design","Cada cena tem intenção e áudio vinculado");
 const captions=Array.isArray(plan.captions)?plan.captions:[];
 let allWordTimed=captions.length>0,wordCount=0,lastCaption=0,wordSyncOk=true;
 for(const [i,c] of captions.entries()){
  if(!Number.isInteger(c.startFrame)||!Number.isInteger(c.endFrame)||c.startFrame<0||c.endFrame<=c.startFrame||c.endFrame>total||
    !say(c.text)||c.text.length>80){fail("timed-captions","Legenda "+(i+1)+": texto/tempo inválido");continue;}
  if(c.startFrame-lastCaption>limits.maxCaptionGapSeconds*fps)warn("timed-captions","Intervalo sem legenda superior a 3s");
  lastCaption=c.endFrame;
  if(!Array.isArray(c.words)||!c.words.length){allWordTimed=false;continue;}
  let previous=c.startFrame;
  for(const [j,w] of c.words.entries()){
   if(!say(w.text)||!Number.isInteger(w.startFrame)||!Number.isInteger(w.endFrame)||w.startFrame<previous||
     w.endFrame<=w.startFrame||w.startFrame<c.startFrame||w.endFrame>c.endFrame){wordSyncOk=false;fail("word-picture-sync","Legenda "+(i+1)+" palavra "+(j+1)+": timestamp fora de ordem");}
   previous=w.endFrame;wordCount++;
  }
 }
 if(plan.audioMode!=="voice-led"||captions.length<3)fail("timed-captions","Produção narrada exige ao menos três legendas sincronizadas");
 else pass("timed-captions",{segments:captions.length});
 if(!allWordTimed)fail("kinetic-typography","Todas as legendas precisam de palavras com timestamps reais para animação cinética");
 else pass("kinetic-typography",{words:wordCount});
 const voiceSegments=scenes.map(s=>[s.voiceStartFrame,s.voiceEndFrame]);
 for(const c of captions)for(const w of c.words||[]){
  const covered=voiceSegments.some(([a,b])=>Number.isInteger(a)&&Number.isInteger(b)&&w.startFrame>=a-asFrame(.1,fps)&&w.endFrame<=b+asFrame(.1,fps));
  if(!covered)wordSyncOk=false;
 }
 if(wordSyncOk)pass("word-picture-sync","Timestamps de palavras dentro das âncoras de narração");
 const captionStyle=plan.captionStyle||{};
 const safe=captionStyle.safeZone||{};
 if(captions.some(c=>c.text.length>48)||captionStyle.maxLines!==2||
   !finite(safe.left)||safe.left<.05||safe.left>.2||!finite(safe.right)||safe.right<.05||safe.right>.2||
   !finite(safe.bottom)||safe.bottom<.12||safe.bottom>.3||!finite(captionStyle.minFontSize)||captionStyle.minFontSize<36)
  fail("caption-legibility","CaptionStyle precisa de zona segura, até 48 caracteres, 2 linhas e fonte mínima de 36px");
 else pass("caption-legibility",captionStyle);
 const cues=Array.isArray(plan.audioCues)?plan.audioCues:[];
 const music=cues.filter(c=>c.role==="music"),voice=cues.filter(c=>c.role==="voice"),sfx=cues.filter(c=>c.role==="sfx");
 const ambience=cues.filter(c=>c.role==="ambience");
 const soundtrack=plan.soundtrackArc||{};
 if(!music.some(c=>c.startFrame===0&&c.endFrame>=total-1&&say(c.narrativeIntent))||
   !["opening","build","payoff"].every(k=>say(soundtrack[k])))fail("narrative-score","Trilha deve cobrir o vídeo e declarar abertura, crescimento e payoff");
 else pass("narrative-score","Score cobre a timeline e tem arco dramático");
 const byId=new Map(cues.map(c=>[c.id,c]));
 if(!voice.length)fail("voice-anchored-storyboard","Falta asset de voz local");
 let captionSfx=0,motionSfx=0,transitionSfx=0;
 for(const cue of sfx){
  let anchor;
  if(cue.syncTarget==="caption"){
   const cap=captions[cue.captionIndex],word=cap?.words?.[cue.wordIndex];
   anchor=word?.startFrame;if(anchor!==undefined)captionSfx++;
  }else if(cue.syncTarget==="motion"){
   const event=scenes.flatMap(s=>s.events||[]).find(e=>e.id===cue.eventId);
   const scene=scenes.find(s=>(s.events||[]).some(e=>e.id===cue.eventId));
   if(event&&scene){anchor=scene.startFrame+event.peakFrame;motionSfx++;}
  }else if(cue.syncTarget==="transition"){
   const scene=scenes.find(s=>s.id===cue.sceneId);
   if(scene&&scene!==scenes[0]){anchor=scene.startFrame;transitionSfx++;}
  }
  if(anchor===undefined)fail("motion-micro-sfx","SFX "+cue.id+": defina syncTarget/cue de sincronização válido");
  else if(Math.abs(cue.startFrame-anchor)>Math.ceil(fps*limits.maxSfxSyncOffsetMs/1000))
   fail(cue.syncTarget==="caption"?"kinetic-typography":"motion-micro-sfx","SFX "+cue.id+": precisa sincronizar em até 80ms");
 }
 if(!captionSfx)fail("kinetic-typography","Falta SFX sincronizado à entrada/destaque de palavra");
 else pass("kinetic-typography",{captionSfx});
 if(!motionSfx)fail("motion-micro-sfx","Falta SFX sincronizado a movimento de câmera/objeto");
 else pass("motion-micro-sfx",{motionSfx});
 if(!transitionSfx)fail("sonic-transitions","Falta SFX sincronizado a transição visual");
 else pass("sonic-transitions",{transitionSfx});
 const mix=plan.audioMix||{};
 if(mix.voiceDucking!==true||!finite(mix.targetIntegratedLUFS)||mix.targetIntegratedLUFS< -16||mix.targetIntegratedLUFS> -14||
   !finite(mix.maxTruePeakDbtp)||mix.maxTruePeakDbtp> -1)fail("voice-priority-mix","Exija sidechain ducking, alvo -16 a -14 LUFS e pico <= -1 dBTP");
 else pass("voice-priority-mix","Sidechain compression configurado");
 if(!scenes.every(s=>s.soundDesign?.cueIds?.some(id=>byId.has(id))))
  fail("scene-sound-design","Cada cena precisa referenciar cue de áudio existente");
 if(ambience.length===0)warn("scene-sound-design","Nenhuma camada de ambiência; use somente quando fizer sentido para a cena");
 if(realPct<70||movingPct<50)warn("media-first","Cobertura de mídia abaixo do padrão");
 const assetEvidence=evidence.assetValidation||{};
 if(assetEvidence.duplicateAssets?.length)fail("duplicate-shot-check","Assets visualmente idênticos: "+assetEvidence.duplicateAssets.join(", "));
 else if(assetEvidence.checked)pass("duplicate-shot-check","Hashes de assets distintos");
 else pending("duplicate-shot-check","A validação de assets ocorre no preflight do compositor");
 const frameQA=evidence.frameQA;
 if(frameQA?.status==="passed")pass("render-frame-inspection",frameQA);
 else if(frameQA?.status==="failed")fail("render-frame-inspection","Frame QA falhou: "+(frameQA.issues||[]).join("; "));
 else pending("render-frame-inspection","Inspeção do MP4 após o render é obrigatória");
 if(frameQA){
  const unmotivated=(frameQA.freezeSegments||[]).filter(freeze=>freeze.durationSeconds>limits.maxUnmotivatedStaticSeconds&&
   !scenes.some(scene=>scene.intentionalHold===true&&scene.pace==="hold"&&
    scene.startFrame/fps<=freeze.endSeconds&&scene.endFrame/fps>=freeze.startSeconds));
  if(unmotivated.length)fail("static-shot-check","Foram detectados congelamentos não planejados acima de 5s: "+unmotivated.length);
  else pass("static-shot-check",frameQA.freezeSegments||[]);
 }else pending("static-shot-check","Detecção de freezes no MP4 após render");
 if(frameQA?.duplicateScenePairs?.length)fail("duplicate-shot-check","Cenas renderizadas repetidas: "+frameQA.duplicateScenePairs.length);
 const audioQA=evidence.audioQA;
 if(audioQA?.status==="passed"){
  pass("loudness-control",{integratedLufs:audioQA.integratedLufs,truePeakDb:audioQA.truePeakDb});
  if((audioQA.silenceSegments||[]).some(s=>s.durationSeconds>2))warn("silence-clipping-check","Silêncios >2s encontrados; revisão de intenção necessária");
  else pass("silence-clipping-check","Sem silêncio não planejado >2s");
 }else{pending("loudness-control","Medição FFmpeg pós-render");pending("silence-clipping-check","Detecção FFmpeg de silêncio/clipping pós-render");}
 const tech=evidence.technicalQA;
 if(tech?.status==="passed")pass("technical-probe",tech);
 else if(tech?.status==="failed")fail("technical-probe","Probe técnico falhou: "+(tech.issues||[]).join("; "));
 else pending("technical-probe","FFprobe do MP4 é obrigatório");
 human("artistic-review","Aprovação humana do vídeo completo ainda é obrigatória");
 human("delivery-review-gate","A entrega final só é aprovada após revisão artística humana");
 const controlsReport=controls.map(c=>({number:c.number,group:c.group,id:c.id,label:c.label,...(results.get(c.id)||{status:"pending",evidence:"Sem evidência"})}));
 const summary=controlsReport.reduce((o,c)=>(o[c.status]=(o[c.status]||0)+1,o),{});
 const metrics={version:CINEMATIC_POLICY_VERSION,durationSeconds:duration,realMediaPct:realPct,movingFootagePct:movingPct,
  pureGraphicsPct:graphicsPct,uniqueAssets:new Set(scenes.map(s=>s.media).filter(Boolean)).size,
  shotCount:scenes.length,shotSizes:[...shotSizes],cameraMoves:[...cameras],transitions:[...transitions],paces:[...paces],
  effects,captionCount:captions.length,wordCount,captionSfx,motionSfx,transitionSfx};
 return {enabled,ok:errors.length===0,errors,warnings,metrics,controls:controlsReport,controlSummary:summary,
  artisticReview:evidence.artisticQA==="approved"?"approved":"human-required",
  finalDeliveryApproved:controlsReport.every(c=>c.status==="passed")};
}
export function validateStudyUsage(args){
 if(args?.production_profile!=="study")return {ok:true,errors:[]};
 return ["smoke-test","visual-prototype","intentionally-silent-study"].includes(args.study_purpose)
  ?{ok:true,errors:[],previewOnly:true}
  :{ok:false,errors:["Modo study exige study_purpose explícito; não é permitido como atalho para vídeo final."]};
}
