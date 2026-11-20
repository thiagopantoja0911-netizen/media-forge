/**
 * MediaForge global cinematic production policy v2.
 *
 * Structural acceptance contracts, not automatic aesthetic certification.
 * Media is supplied by an authorized producer; no provider or render is invented here.
 * The 40 requirements are organized for deterministic preflight and human review.
 */
export const CINEMATIC_POLICY_VERSION = "cinematic-v2";

const controls = [
  ["narrative", "written-story-arc", "Roteiro com progressão narrativa"],
  ["narrative", "voice-anchored-storyboard", "Storyboard ligado a trechos da narração"],
  ["narrative", "semantic-visual-direction", "Cada fala gera uma ação visível"],
  ["narrative", "shot-variety", "Variação de planos e enquadramentos"],
  ["narrative", "continuity", "Continuidade visual entre cenas"],
  ["narrative", "rhythm", "Ritmo acompanhado pela progressão dramática"],
  ["narrative", "visual-hook", "Gancho audiovisual nos primeiros segundos"],
  ["image", "media-first", "Imagens ou footage reais como base das cenas"],
  ["image", "asset-diversity", "Diversidade de mídias específicas da narrativa"],
  ["image", "asset-repetition-limit", "Limitar repetição de mídia-base"],
  ["image", "color-grade", "Tratamento de cor cinematográfico"],
  ["image", "lighting-shadows", "Luz e sombras com profundidade"],
  ["image", "depth-of-field", "Profundidade de campo contextual"],
  ["image", "motion-blur", "Desfoque de movimento nas ações rápidas"],
  ["image", "bloom-glow", "Bloom e glow controlados"],
  ["image", "parallax-depth", "Camadas e profundidade 2.5D/3D"],
  ["image", "motivated-camera", "Câmera com alvo e movimento motivados"],
  ["image", "motivated-transitions", "Transições motivadas por ação"],
  ["editing", "timed-captions", "Legendas sincronizadas"],
  ["editing", "kinetic-typography", "Tipografia cinética usada como apoio"],
  ["editing", "contextual-graphics", "Grafismos contextualizados, sem substituir o plano"],
  ["editing", "dynamic-reframing", "Reenquadramentos e zooms motivados"],
  ["editing", "visual-events", "Efeitos ligados a eventos narrativos"],
  ["editing", "pacing-variation", "Alternância de ritmo e velocidade"],
  ["editing", "composited-layers", "Camadas e máscaras de composição"],
  ["audio", "narrative-score", "Trilha original/licenciada aderente à história"],
  ["audio", "scene-sound-design", "Sound design por cena"],
  ["audio", "motion-micro-sfx", "Efeitos sonoros nos movimentos"],
  ["audio", "sonic-transitions", "Transições sonoras motivadas"],
  ["audio", "voice-priority-mix", "Mixagem: voz prioritária sobre música e SFX"],
  ["audio", "loudness-control", "Loudness integrado e pico verdadeiro"],
  ["audio", "silence-clipping-check", "Checagem de silêncios e distorções"],
  ["quality", "duplicate-shot-check", "Verificar cenas repetidas"],
  ["quality", "static-shot-check", "Identificar planos estáticos prolongados"],
  ["quality", "word-picture-sync", "Verificar sincronismo audiovisual"],
  ["quality", "caption-legibility", "Legendas legíveis em área segura"],
  ["quality", "render-frame-inspection", "Inspeção do vídeo renderizado"],
  ["quality", "technical-probe", "Validar resolução/FPS/codec/duração"],
  ["quality", "artistic-review", "Avaliar narrativa, ritmo e estética"],
  ["quality", "delivery-review-gate", "Não aprovar só com QA técnico"],
].map(([group,id,label],index)=>Object.freeze({number:index+1,group,id,label}));

export const CINEMATIC_PRODUCTION_POLICY = Object.freeze({
  version:CINEMATIC_POLICY_VERSION,
  mode:"cinematic",
  controls:Object.freeze(controls),
  limits:Object.freeze({
    minRealMediaShare:.70,
    minMovingFootageShare:.50,
    maxPureGraphicsShare:.15,
    maxSingleMediaShare:.25,
    maxUnmotivatedStaticSeconds:5,
    maxCaptionGapSeconds:3,
    maxSfxSyncOffsetMs:80,
    targetIntegratedLUFS:Object.freeze([-16,-14]),
    maxTruePeakDbtp:-1,
    maxVoiceToImageSyncMs:100,
  }),
  assetRules:Object.freeze({
    mainVisualKind:"photo-footage-or-realistic-cgi",
    flatVectorAsPrimaryScene:false,
    requirePackagedAssets:true,
    requireOriginalOrLicensedAudio:true,
    allowManualGraphicProjects:true,
    allowTechnicalStudyOnlyWhenExplicit:true,
  }),
  review:Object.freeze({
    preflight:true,technicalQA:true,audioQA:true,
    renderedFrameReview:true,artisticQA:"human-required",
    markFinalBeforeArtisticApproval:false,
  }),
});

const say=v=>typeof v==="string"?v.trim():"";
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const captionLimit=80;

export function reviewCinematicPolicyV2(plan) {
  const enabled=plan?.productionMode==="cinematic"&&plan?.cinematicPolicyVersion==="v2";
  const errors=[],warnings=[],metrics={version:CINEMATIC_POLICY_VERSION};
  if(!enabled)return {enabled:false,ok:true,errors,warnings,metrics};
  const fps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
  const scenes=Array.isArray(plan.scenes)?plan.scenes:[];
  const total=Number(plan.totalFrames);
  if(!finite(fps)||fps<=0||!Number.isInteger(total)||total<=0)return {enabled,ok:false,errors:["Política V2: FPS/duração inválidos"],warnings,metrics};
  const l=CINEMATIC_PRODUCTION_POLICY.limits;
  let moving=0,real=0,graphic=0;
  const used=new Map(),effects={motionBlur:0,bloom:0,shadow:0,microEffect:0,colorGrade:0};
  const imageTypes=new Set(["footage","photo","product","collage"]);
  const graphicTypes=new Set(["kinetic","widget","end-card"]);
  for(const scene of scenes){
    const length=Number(scene.endFrame)-Number(scene.startFrame);
    if(!finite(length)||length<=0)continue;
    if(scene.type==="footage")moving+=length;
    if(imageTypes.has(scene.type))real+=length;
    if(graphicTypes.has(scene.type))graphic+=length;
    if(scene.media)used.set(scene.media,(used.get(scene.media)||0)+length);
    const n=scene.narrativeAction;
    if(!n||!say(n.voiceCue)||!say(n.subject)||!say(n.action)||!say(n.visibleChange)||!say(n.stateBefore)||!say(n.stateAfter))
      errors.push(scene.id+": descreva a fala, ação real, mudança visível e estados antes/depois");
    else if(n.stateBefore===n.stateAfter||n.visibleChange===scene.headline)
      errors.push(scene.id+": a ação visual precisa transformar a cena, não repetir o título");
    const fx=scene.effects;
    if(fx&&typeof fx==="object"){
      for(const k of ["motionBlur","bloom","colorGrade"])if(finite(fx[k])&&fx[k]>0&&fx[k]<=1)effects[k]++;
      if(fx.shadow===true)effects.shadow++;
      if(["flash","light-sweep","impact","dust","light-leak"].includes(fx.microEffect))effects.microEffect++;
    }
  }
  const toPct=n=>Math.round(100*n/total);
  Object.assign(metrics,{realMediaPct:toPct(real),movingFootagePct:toPct(moving),pureGraphicsPct:toPct(graphic),
    maxSingleMediaPct:used.size?Math.max(...used.values())/total*100:0,effectCoverage:effects,shots:scenes.length});
  if(plan.visualMode!=="media-first")errors.push("Política V2 exige visualMode=media-first com filmagens/fotografias verificáveis");
  if(real/total<l.minRealMediaShare)errors.push("Política V2: pelo menos 70% de cenas com mídia real/CGI rasterizado");
  if(moving/total<l.minMovingFootageShare)errors.push("Política V2: pelo menos 50% de footage realmente em movimento");
  if(graphic/total>l.maxPureGraphicsShare+.0001)errors.push("Política V2: grafismos vetoriais/tipográficos não podem dominar mais que 15%");
  for(const [path,frames] of used)if(frames/total>l.maxSingleMediaShare+.0001)
    errors.push("Política V2: mídia repetida por mais de 25%: "+path);
  if(!effects.motionBlur)warnings.push("Nenhuma cena declara motion blur; aplicar onde houver câmera/objeto rápidos");
  if(!effects.bloom)warnings.push("Nenhuma cena declara bloom/glow; avaliar pontos luminosos");
  if(!effects.shadow)errors.push("Política V2: defina sombras/profundidade em pelo menos uma cena");
  if(!effects.colorGrade)warnings.push("Não há tratamento de cor declarado");
  if(effects.microEffect<2)errors.push("Política V2: inclua pelo menos dois microefeitos narrativamente motivados");

  const captions=Array.isArray(plan.captions)?plan.captions:[];
  if(plan.audioMode==="voice-led"){
    if(captions.length<3)errors.push("Política V2: legendas sincronizadas precisam estar na timeline (ao menos 3 trechos)");
    let last=0;
    for(const [index,c] of captions.entries()){
      if(!Number.isInteger(c.startFrame)||!Number.isInteger(c.endFrame)||c.startFrame<0||c.endFrame<=c.startFrame||c.endFrame>total||
          !say(c.text)||c.text.length>captionLimit)
        errors.push("Legenda "+(index+1)+": tempo ou texto inválido");
      if(c.startFrame<last)errors.push("Legenda "+(index+1)+": trechos fora de ordem/sobrepostos");
      if(c.words!==undefined){
        if(!Array.isArray(c.words)||!c.words.length||c.words.length>30)errors.push("Legenda "+(index+1)+": palavras temporizadas inválidas");
        else {
          let previousWordFrame=c.startFrame;
          for(const [j,w] of c.words.entries()){
            if(!say(w?.text)||!Number.isInteger(w.startFrame)||!Number.isInteger(w.endFrame)||w.startFrame<previousWordFrame||
                w.endFrame<=w.startFrame||w.endFrame>c.endFrame)
              errors.push("Legenda "+(index+1)+" palavra "+(j+1)+": timestamps inválidos");
            if(Number.isInteger(w.endFrame))previousWordFrame=w.endFrame;
          }
        }
      }
      if(c.startFrame-last>l.maxCaptionGapSeconds*fps)warnings.push("Legenda "+(index+1)+": intervalo sem fala/legenda superior a 3s; revise");
      if(Number.isInteger(c.endFrame))last=c.endFrame;
    }
    if(total-last>l.maxCaptionGapSeconds*fps)warnings.push("Intervalo final longo sem legenda; conferir a pausa da narração");
  }
  const eventAction=new Map();
  for(const sc of scenes)for(const e of sc.events||[])eventAction.set(e.id,e.action);
  let captionSfx=0,motionSfx=0;
  for(const cue of plan.audioCues||[])if(cue.role==="sfx"){
    const kind=eventAction.get(cue.eventId);
    if(kind==="enter")captionSfx++;
    if(kind==="camera"||kind==="focus"||kind==="exit")motionSfx++;
  }
  metrics.captionSfx=captionSfx;metrics.motionSfx=motionSfx;
  if(!captionSfx)errors.push("Política V2: falta efeito sonoro ligado a entrada de legenda/tipografia");
  if(!motionSfx)errors.push("Política V2: falta efeito sonoro ligado a movimento de cena/câmera");
  return {enabled,ok:errors.length===0,errors,warnings,metrics,artisticReview:"human-required"};
}

export function validateStudyUsage(args){
  if(args?.production_profile!=="study")return {ok:true,errors:[]};
  const purpose=args.study_purpose;
  return ["smoke-test","visual-prototype","intentionally-silent-study"].includes(purpose)
    ?{ok:true,errors:[],previewOnly:true}
    :{ok:false,errors:["Modo study exige study_purpose explícito; não é permitido como atalho para vídeo final. Use smoke-test, visual-prototype ou intentionally-silent-study."]};
}
