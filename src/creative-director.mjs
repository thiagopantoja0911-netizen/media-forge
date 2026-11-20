/**
 * Short-brief creative direction, with transparent limits and evidence.
 * Generates a reproducible storyboard, NOT media bytes or measured conversions.
 */
import { getEditingStylePreset, applyEditingStyleToStoryboard } from "./editing-style-presets.mjs";
import { CINEMATIC_POLICY_VERSION, CINEMATIC_PRODUCTION_POLICY } from "./cinematic-production-policy.mjs";
const goals=new Set(["sales","likes","shares","awareness"]);
const cleaned=(v,n)=>String(v??"").trim().replace(/[\u0000-\u001f]/g," ").slice(0,n);
const messages={
 sales:["Veja a transformação","O que impede o próximo passo?","Uma ação muda o resultado","Observe a solução em funcionamento","Conheça a solução"],
 likes:["Um detalhe muda tudo","Você viu a diferença?","Veja a transformação acontecer","O resultado aparece na tela","Curtiu a transformação?"],
 shares:["Um detalhe para compartilhar","Você também já viu isso?","Experimente olhar de outro jeito","Aqui está a explicação visual","Envie para quem precisa ver"],
 awareness:["Uma ideia toma forma","E se o comum mudasse?","O objeto conduz a cena","O novo universo se revela","Descubra mais"]
};
const forms=[
 {id:"result-first",title:"Resultado primeiro",device:"Mostrar o resultado visual antes da explicação",movement:["hero-reveal","close-up","match-cut","product-action","end-card"]},
 {id:"object-journey",title:"Objeto atravessa os mundos",device:"Um único objeto causa as mudanças de cenário",movement:["object-enter","camera-track","carry-transition","environment-reveal","hero-payoff"]},
 {id:"before-after",title:"Problema → ação → transformação",device:"Uma interação real resolve um conflito reconhecível",movement:["problem-world","object-touch","camera-pass","visible-resolution","quiet-brand-signoff"]}
];
export function inferGoal(idea,goal){
 if(goal!==undefined){if(!goals.has(goal))throw Error("GOAL_UNSUPPORTED");return goal;}
 const text=String(idea||"");
 if(/vender|comprar|compra|pedido|orçamento|agendamento|conversão|loja|produto/i.test(text))return "sales";
 if(/compartilh|repost|marque|envie|dica|mito|verdade/i.test(text))return "shares";
 if(/curtid|like|coment|engajamento/i.test(text))return "likes";
 return "awareness";
}
function safeClaims(claims){
 if(claims===undefined)return [];
 if(!Array.isArray(claims)||claims.length>12)throw Error("CLAIMS_INVALID");
 return claims.map((v,i)=>{
  if(!v||typeof v!=="object"||typeof v.text!=="string"||!v.text.trim())throw Error("CLAIM_INVALID");
  const source=cleaned(v.source,300);
  return {id:"claim-"+(i+1),text:cleaned(v.text,160),source:source||null,eligible:!!source};
 });
}
export function planFromShortBrief(input={}){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_BRIEF");
 const brand=cleaned(input.brand,90),idea=cleaned(input.idea,400);
 if(brand.length<2)throw Error("BRAND_REQUIRED");
 if(idea.length<8)throw Error("IDEA_REQUIRED");
 const goal=inferGoal(idea,input.goal);
 const duration=Number.isInteger(input.duration_seconds)&&input.duration_seconds>=10&&input.duration_seconds<=40?input.duration_seconds:20;
 const fps=[24,25,30,50,60].includes(input.fps)?input.fps:60;
 const aspect=["9:16","16:9","1:1"].includes(input.aspect_ratio)?input.aspect_ratio:"9:16";
 const claimList=safeClaims(input.claims);
 const editingStyle=getEditingStylePreset(input.editing_style??"cinematic-media-first-v2");
 const concepts=forms.map(form=>({
  id:form.id,title:form.title,device:form.device,
  shots:form.movement.map((movement,i)=>{
   const weights=[0,.16,.39,.62,.82,1];
   const start=+(duration*weights[i]).toFixed(2),end=+(duration*weights[i+1]).toFixed(2);
   return {id:"shot-"+(i+1),start,end,movement,copy:i===3?idea.slice(0,80):messages[goal][i],
    camera:["macro → reveal","tracking, independent depth layers","motivated match cut","close-up of observable change","settle, readable CTA"][i],
    sound:i===0?"music-enter":i===2?"causal-effect":i===4?"music-resolve":"music-bed",
    visualSource:"Exigir footage, fotografia real ou CGI material; nunca substituir a ação por figura vetorial.",
    visualConstruction:{voiceCue:i===3?idea.slice(0,80):messages[goal][i],
      action:"Representar fisicamente: "+form.movement[i],stateBefore:"Situação antes do evento "+(i+1),
      stateAfter:"Consequência perceptível do evento "+(i+1),
      realSceneAssetRequired:true,captionIsSupportingOnly:true},
    shotSound:{captionSfx:i===0?"short-pop":"on-keyword-only",movementSfx:i===2?"motivated-whoosh":"when-motion-occurs",music:"story-arc"} };
  })
 }));
 const chosen=goal==="sales"?concepts[2]:goal==="shares"?concepts[1]:concepts[0];
 const storyArc={
  hook:"Mostrar imediatamente o conflito ou transformação ligada a: "+idea.slice(0,100),
  conflict:"Tornar visível o obstáculo que impede o público de alcançar: "+idea.slice(0,100),
  escalation:"Aumentar a consequência por meio de uma ação concreta, sem criar prova ou resultado fictício.",
  resolution:"Mostrar uma ação real que responde ao conflito, sem prometer resultado não comprovado.",
  payoff:"Encerrar com a consequência visual verificável e uma chamada coerente com o objetivo."
 };
 const assetManifest=chosen.shots.map((shot,i)=>({
  sceneId:shot.id,assetKind:"live-action-video-or-photorealistic-cgi",
  targetDurationSeconds:+(shot.end-shot.start).toFixed(2),aspectRatio:aspect,
  prompt:"Footage cinematográfico realista, ação física clara, sujeito identificável, continuidade com o mesmo universo visual. "+
   "Contexto: "+idea+". Beat: "+shot.visualConstruction.action+". Estado antes: "+shot.visualConstruction.stateBefore+
   ". Mudança visível: "+shot.visualConstruction.stateAfter+". Câmera: "+shot.camera+
   ". Sem cartões vetoriais, sem texto incorporado, sem logos inventados.",
  shotSize:["wide","medium","close-up","detail","over-shoulder"][i],
  movement:shot.movement,camera:shot.camera,
  continuity:{subjectId:"main-subject",screenDirection:"left-to-right",preserveWardrobeAndProps:true},
  rightsRequired:["owned","licensed","ai-generated"],localAssetRequired:true
 }));
 const cinematicPolicy={
  version:CINEMATIC_POLICY_VERSION,controlCount:CINEMATIC_PRODUCTION_POLICY.controls.length,
  controls:CINEMATIC_PRODUCTION_POLICY.controls.map(x=>({number:x.number,group:x.group,id:x.id,label:x.label})),
  limits:CINEMATIC_PRODUCTION_POLICY.limits,
  finalDeliveryRequiresHumanApproval:true
 };

 const brandUrl=typeof input.brand_url==="string"&&/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(input.brand_url)?input.brand_url:null;
 const logo=typeof input.logo_asset_path==="string"&&/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpg|webp)$/i.test(input.logo_asset_path)?input.logo_asset_path:null;
 const blockers=[];
 if(!brandUrl)blockers.push("Identidade, produto e promessas da empresa ainda não foram verificados em fonte oficial.");
 if(!logo)blockers.push("Logo real não fornecido; não fingir que uma marca ilustrativa é oficial.");
 if(!claimList.some(x=>x.eligible))blockers.push("Sem prova verificada; não inserir depoimentos, métricas nem garantias fictícias.");
 blockers.push("Pré-produção: anexar cenas reais/CGI e stems de narração, música, ambiências e SFX antes de renderizar o filme final.");
 blockers.push("Transcrever a locução e anexar timestamps por palavra; o MediaForge não inventará sincronização.");
 blockers.push("Fornecer assets locais com procedência/licença e ao menos uma composição de profundidade com três layers.");
 return {
  version:"chat-creative-director-v1",
  brief:{brand,idea,goal,audience:cleaned(input.audience,140)||"Público relevante, não segmentado nesta etapa",
    durationSeconds:duration,aspectRatio:aspect,fps,brandUrl,logo},
  decision:{chosen:chosen.id,reason:goal==="sales"?"problema observável → ação → solução verificável":goal==="shares"?"objeto memorável e valor social":"transformação mostrada no primeiro segundo"},
  alternatives:concepts.map(v=>({id:v.id,title:v.title,device:v.device})),
  storyboard:applyEditingStyleToStoryboard(chosen.shots,editingStyle),
  storyArc,assetManifest,cinematicPolicy,
  ...(editingStyle?{editingStyle:{id:editingStyle.id,name:editingStyle.name,version:editingStyle.version,identity:editingStyle.identity,editorial:editingStyle.editorial,audio:editingStyle.audio,qualityChecklist:editingStyle.qualityChecklist}}:{}),
  claims:claimList,
  persuasion:{goal,desireOrProblem:idea,motivation:goal==="sales"?"clareza de benefício, confiança e redução de risco":goal==="shares"?"valor social, surpresa e utilidade":goal==="likes"?"identificação e recompensa visual":"curiosidade relevante e lembrança de marca",
   integrity:["não inventar prova social","não usar métricas não verificadas","não criar urgência/escassez falsas","não imitar logo como se fosse verdadeiro"]},
  production:{threeSecondPrototype:true,motionProfile:"dynamic-motion-v1",cinematicProfile:"cinematic-media-first-v2",cinematicPolicyVersion:CINEMATIC_POLICY_VERSION,
   requirePackagedRealMedia:true,assetManifestRequired:true,wordTimestampCaptions:true,voiceDucking:true,
   trueMotionBlurRequiresValidatedHyperFramesFork:true,frameInspectionRequired:true,
   mediaFirst:true,flatVectorsAsPrimaryShots:false,requiredMediaCoverage:.70,requiredFootageCoverage:.50,
   requireNarrationAnchors:true,requireCaptionAndMovementSfx:true,
   reviewGate:"technical-and-artistic-review",
   ...(editingStyle?{editingStylePreset:editingStyle.id,editableGraphics:true,animationEngine:editingStyle.production.animationEngine,
     referenceReusePolicy:editingStyle.production.reusePolicy}:{}),
   depthLayers:["background","midground","foreground"],noStaticCardSequence:true,
   voice:"gerar somente quando requisitado ou necessário à clareza",
   music:"usar arquivo licenciado/original, não gerar tom sintético como trilha",
   sfx:"efeito somente para ação visível, com sincronismo a conferir",
   musicAudioQa:{integratedLUFS:[-16,-14],truePeakMaxDbtp:-1,syncTargetMs:100},
   review:["prévia 3s", "verificar identidade/claims", "preflight com assets locais",
    "frames e transições completos", "áudio ouvido e medido", "aprovado pelo usuário"]},
  blockers, status:"storyboard-only-not-rendered"
 };
}
