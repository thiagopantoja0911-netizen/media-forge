import { validateDynamicMotionPlan } from "./motion/dynamic-motion-gate.mjs";
// Artistic direction for MediaForge. This creates an authored brief and review contract;
// it does not generate media, verify a brand, or claim that a rendered film is approved.
const clean = (value, max = 180) => String(value ?? "").trim()
  .replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, max);
const colorPattern = /^#[0-9a-f]{6}$/i;
const conceptIds = new Set(["result-first", "object-journey", "before-after"]);

const concepts = [
  {
    id: "result-first",
    title: "Resultado em primeiro plano",
    premise: "Abrir com o resultado visual real e revelar depois o mecanismo.",
    world: "Um ambiente de produto com escala, textura e profundidade; o objeto real domina o primeiro plano.",
    palette: "Neutros controlados com um único acento extraído da identidade verificada.",
    lighting: "Luz principal recortada, preenchimento suave e highlights seletivos no objeto.",
    materials: "Materiais reais do produto; superfícies e reflexos sem brilho decorativo gratuito.",
    lens: "Macro para detalhe, depois lente normal para revelar contexto.",
    camera: ["macro push-in", "rack focus + reveal", "motivated match cut", "tracking close-up", "controlled dolly-out"],
    actions: ["revelar um detalhe real", "mostrar escala e contexto", "demonstrar uma ação", "mostrar o resultado observável", "resolver em assinatura/CTA"],
    transitions: ["mudança de foco", "objeto cruza a lente", "match cut por forma/posição", "movimento termina no produto", "câmera assenta para leitura"],
    signature: "Impacto imediato, prova visual e final limpo.",
    primitives: ["neon-product", "screen-punch-in", "motif-match-cut", "pill-cta", "brand-end-card"]
  },
  {
    id: "object-journey",
    title: "Objeto atravessa os mundos",
    premise: "Um objeto ou gesto reconhecível conduz a câmera e causa as mudanças de cenário.",
    world: "Uma jornada espacial contínua com primeiro plano, plano médio e fundo independentes.",
    palette: "Paleta editorial de alto contraste, com acento de marca aplicado com moderação.",
    lighting: "Luz direcional coerente entre ambientes; sombras e highlights preservam continuidade.",
    materials: "Materiais táteis e superfícies com escala física consistente.",
    lens: "Lente 35 mm equivalente para tracking e planos de contexto.",
    camera: ["low tracking", "orbit follow", "camera pass", "parallax reveal", "hero settle"],
    actions: ["objeto entra no quadro", "câmera acompanha a trajetória", "objeto encobre a lente", "novo ambiente revela o benefício", "objeto termina como assinatura visual"],
    transitions: ["entrada motivada", "tracking contínuo", "object wipe físico", "match cut de movimento", "settle com follow-through"],
    signature: "Continuidade espacial e surpresa causada por uma ação.",
    primitives: ["parallax-collage", "ui-orbit", "motif-match-cut", "beat-cut-sequence"]
  },
  {
    id: "before-after",
    title: "Problema, ação e transformação",
    premise: "Tornar o conflito visível, mostrar a ação que o altera e provar a diferença.",
    world: "Dois estados visuais contrastantes conectados pela mesma câmera e pelo mesmo elemento central.",
    palette: "Estado inicial mais contido; estado final ganha cor e contraste sem alterar a identidade da marca.",
    lighting: "Estado inicial com luz mais plana; transformação introduz recorte e separação de planos.",
    materials: "Elementos concretos do contexto do público, sem interfaces ou resultados inventados.",
    lens: "24–35 mm equivalente para contexto, close-up para a ação decisiva.",
    camera: ["locked wide", "push-in to interaction", "camera whip on cause", "match cut to result", "quiet dolly-out"],
    actions: ["estabelecer o problema real", "isolar a causa", "mostrar a interação decisiva", "revelar o estado posterior", "fechar com convite legível"],
    transitions: ["corte por gesto", "movimento de aproximação", "whip motivado pela ação", "match cut antes/depois", "dolly-out de resolução"],
    signature: "Transformação compreensível sem depender apenas da locução.",
    primitives: ["stateful-ui-widget", "voice-anchored-kinetic", "micro-sfx-cue-track", "brand-end-card"]
  }
];

const goalConcept = { sales: "before-after", likes: "result-first", shares: "object-journey", awareness: "object-journey" };
const defaultCta = { sales: "Conheça a solução", likes: "Qual detalhe você percebeu?", shares: "Compartilhe com quem pode aproveitar", awareness: "Descubra mais" };
const beatNames = ["Gancho", "Contexto", "Mecanismo", "Payoff", "Assinatura"];
const beatPurpose = [
  "Capturar atenção com um acontecimento visual verificável.",
  "Situar o objeto, a necessidade ou o contexto sem interromper o ritmo.",
  "Mostrar a ação ou o mecanismo que conduz a mudança.",
  "Entregar a consequência visual que a narrativa preparou.",
  "Deixar marca e CTA legíveis, sem competir com a transição."
];
const voiceTemplates = [
  "Antes de explicar, olha isso.",
  "O contexto é: [situação real do público].",
  "A mudança acontece quando [mecanismo confirmado].",
  "Veja o resultado real em funcionamento.",
  "Se isso faz sentido para você, [CTA]."
];

function platformFor(input, aspectRatio) {
  const supplied = clean(input.platform, 50);
  if (supplied) return supplied;
  if (aspectRatio === "9:16") return "Reels / TikTok / YouTube Shorts";
  if (aspectRatio === "1:1") return "Feed social";
  return "YouTube / site / apresentação";
}

function buildMotionPlanDraft(basePlan, chosen) {
  const duration = basePlan.brief.durationSeconds;
  const beats = basePlan.storyboard.map((shot, index) => ({
    id: shot.id,
    start: shot.start,
    end: shot.end,
    action: chosen.actions[index],
    stateBefore: shot.stateBefore || ["atenção dispersa", "contexto não situado", "mecanismo não demonstrado", "payoff não revelado", "CTA ainda não apresentado"][index],
    stateAfter: shot.stateAfter || ["foco no elemento principal", "contexto compreendido", "ação visível", "resultado compreendido", "CTA legível"][index]
  }));
  const layers = [
    { id: "background", role: "background", depth: 0, movement: "parallax ambiental discreto, subordinado à ação principal" },
    { id: "midground", role: "midground", depth: 1, movement: "reflow ou deslocamento ligado ao estado da cena" },
    { id: "foreground", role: "foreground", depth: 2, movement: "hero object e elementos de interação com continuidade física" }
  ];
  const events = [];
  for (let index = 0; index < beats.length; index++) {
    const beat = beats[index];
    const beatLength = beat.end - beat.start;
    const activeDuration = Math.max(0.5, beatLength - 0.45);
    events.push({
      id: "hero-action-" + (index + 1), start: beat.start, duration: activeDuration,
      scope: "foreground", target: "#hero-object", kind: "hero-object-action"
    });
    events.push({
      id: "state-change-" + (index + 1), start: beat.start + 0.05,
      duration: Math.max(0.4, activeDuration - 0.05),
      scope: "midground", target: "#midground", kind: "stateful-scene-change"
    });
  }
  const cameraCount = Math.max(5, Math.ceil(2 * duration / 10));
  for (let index = 0; index < cameraCount; index++) {
    const start = duration * (index + 0.15) / cameraCount;
    events.push({
      id: "camera-move-" + (index + 1),
      start: Math.min(duration - 0.25, start),
      duration: Math.min(1.1, duration / cameraCount * 0.72),
      scope: "camera", target: "#camera-rig",
      kind: chosen.camera[index % chosen.camera.length].toLowerCase().replace(/[^a-z0-9]+/g, "-")
    });
  }
  const transitionCount = Math.max(4, Math.ceil(2 * duration / 10));
  const transitionKinds = chosen.id === "result-first"
    ? ["match-cut", "object-wipe", "camera-pass", "carry"]
    : chosen.id === "object-journey"
      ? ["carry", "camera-pass", "object-wipe", "match-cut"]
      : ["whip", "match-cut", "morph", "carry"];
  const transitions = [];
  for (let index = 0; index < transitionCount; index++) {
    const at = duration * (index + 1) / (transitionCount + 1) - 0.15;
    const beatIndex = Math.max(0, beats.findIndex(beat => at >= beat.start && at < beat.end));
    const beat = beats[beatIndex] || beats[beats.length - 1];
    transitions.push({
      id: "causal-transition-" + (index + 1),
      at: Math.max(0.05, at),
      duration: 0.3,
      kind: transitionKinds[index % transitionKinds.length],
      carrier: "#hero-object",
      cause: chosen.transitions[beatIndex],
      fromState: beat.stateBefore,
      toState: beat.stateAfter
    });
  }
  const plan = {
    profile: "dynamic-motion-v1",
    intent: basePlan.brief.goal,
    durationSeconds: duration,
    fps: basePlan.brief.fps,
    layers,
    beats,
    events,
    transitions,
    holds: [{ start: duration - 1.2, end: duration, reason: "Leitura do CTA final e assinatura" }]
  };
  const validation = validateDynamicMotionPlan(plan);
  return {
    status: validation.ok ? "structural-contract-passes-targets-unbound" : "structural-contract-needs-fix",
    plan,
    validation,
    targetBinding: "not-verified-against-project-html",
    note: "A validação cobre apenas o plano declarado; os seletores precisam existir na composição real e o MP4 ainda exige inspeção."
  };
}

function hooksFor(goal) {
  const common = [
    { id: "hook-result", angle: "Resultado primeiro", firstFrame: "Close-up de um resultado real já em movimento.", onScreen: "OLHE O QUE MUDA", voice: "Antes de explicar, olha isso.", proof: "O resultado mostrado precisa existir no material-fonte." },
    { id: "hook-conflict", angle: "Conflito reconhecível", firstFrame: "Um detalhe do problema ocupa o quadro e recebe foco.", onScreen: "O PONTO É ESTE", voice: "Se isso faz parte da sua rotina, presta atenção.", proof: "O problema precisa ser confirmado pelo briefing ou pelo cliente." },
    { id: "hook-mechanism", angle: "Mecanismo em ação", firstFrame: "Uma ação concreta começa no primeiro segundo.", onScreen: "VEJA COMO ACONTECE", voice: "O detalhe está na ação.", proof: "Não prometer resultado que o asset não demonstra." }
  ];
  if (goal === "shares") common[1] = { ...common[1], angle: "Insight útil", onScreen: "UM DETALHE QUE VALE VER", voice: "Tem um detalhe aqui que vale compartilhar." };
  if (goal === "likes") common[2] = { ...common[2], angle: "Surpresa visual", onScreen: "VOCÊ PERCEBEU?", voice: "Repara no que acontece em seguida." };
  if (goal === "awareness") common[0] = { ...common[0], angle: "Objeto memorável", onScreen: "OLHE DE NOVO", voice: "Existe uma história neste detalhe." };
  return common;
}

export function buildArtisticDirection(input = {}, basePlan = {}, options = {}) {
  if (!basePlan?.brief || !Array.isArray(basePlan.storyboard) || basePlan.storyboard.length !== 5) {
    throw new Error("ART_DIRECTION_REQUIRES_FIVE_BEAT_STORYBOARD");
  }
  const goal = basePlan.brief.goal;
  const duration = basePlan.brief.durationSeconds;
  const requested = clean(input.concept_id, 40);
  if (requested && !conceptIds.has(requested)) throw new Error("CONCEPT_UNSUPPORTED");
  const chosenId = requested || goalConcept[goal] || "result-first";
  const chosen = concepts.find(item => item.id === chosenId);
  const brandColors = Array.isArray(input.brand_colors)
    ? input.brand_colors.filter(value => typeof value === "string" && colorPattern.test(value)).slice(0, 6)
    : [];
  const referenceUrls = Array.isArray(input.reference_urls)
    ? input.reference_urls.filter(value => typeof value === "string" && /^https:\/\//i.test(value.trim())).slice(0, 5)
    : [];
  const cta = clean(input.cta, 120) || defaultCta[goal];
  const voiceMode = options.voiceMode ?? "off";
  const shots = basePlan.storyboard.map((shot, index) => {
    const seconds = Math.max(0.5, shot.end - shot.start);
    const voice = voiceMode === "off" ? null : voiceTemplates[index].replace("[CTA]", cta);
    return {
      ...shot,
      beat: beatNames[index],
      purpose: beatPurpose[index],
      visualAction: chosen.actions[index],
      stateBefore: ["atenção dispersa", "objeto/contexto ainda não situado", "mecanismo ainda não demonstrado", "payoff ainda não revelado", "narrativa ainda sem resolução"][index],
      stateAfter: ["olhar fixado no elemento principal", "contexto compreendido", "ação decisiva visível", "consequência visual compreendida", "marca/CTA legíveis"][index],
      transitionCause: chosen.transitions[index],
      camera: chosen.camera[index],
      lighting: chosen.lighting,
      framing: ["extreme close-up com espaço para texto", "plano médio com camadas separadas", "close-up da ação com foco claro", "plano de payoff sem elementos concorrentes", "composição estável com safe area"][index],
      onScreenText: shot.copy,
      voiceLineTemplate: voice,
      wordAnchor: ["olha", "contexto", "mudança", "resultado", "convite"][index],
      soundCue: ["impacto curto no reveal", "trilha sustenta a passagem", "SFX sincronizado à ação real", "trilha cresce e resolve", "queda de densidade para CTA"][index],
      assetBrief: {
        required: true,
        type: index === 4 ? "logo/identidade oficial ou assinatura explicitamente ilustrativa" : "asset real específico desta cena",
        path: null,
        provenanceRequired: true,
        rightsVerified: false
      },
      readingTimeSeconds: Number((Math.max(seconds, shot.copy.split(/\s+/).length * 0.22)).toFixed(2)),
      continuity: index < 4 ? "Preservar direção, escala e elemento-carreador até a próxima cena." : "Não cobrir CTA com câmera, texto ou efeitos."
    };
  });
  const motionPlanDraft = buildMotionPlanDraft(basePlan, chosen);
  const styleOverride = clean(input.visual_style, 90);
  const restrictions = Array.isArray(input.restrictions)
    ? input.restrictions.map(value => clean(value, 120)).filter(Boolean).slice(0, 10)
    : [];
  const platform = platformFor(input, basePlan.brief.aspectRatio);
  const emotionalEffect = {
    sales: "clareza, confiança e vontade de dar o próximo passo",
    likes: "identificação, surpresa e recompensa visual",
    shares: "utilidade, descoberta e valor social",
    awareness: "curiosidade e lembrança de marca"
  }[goal];
  const rubric = [
    ["intent-audience", "Adequação à intenção, proposta e público", 25, "A narrativa corresponde ao objetivo, ao público e à ação final, sem alegar dados de conta não fornecidos."],
    ["visual-direction", "Direção visual, materiais e transformações tangíveis", 25, "Assets hero, materiais, luz, profundidade e transições demonstram a ideia em vez de descrevê-la."],
    ["audio-sync", "Sincronismo de áudio, microeventos e música", 20, "Locução definitiva, word anchors medidos, micro-SFX causais e música com resolução deliberada."],
    ["rhythm-legibility", "Ritmo, gancho, retenção editorial e legibilidade", 20, "Hook no primeiro frame, progressão por beat, safe areas e tempo de leitura adequados."],
    ["integrity-export", "Integridade e exportação técnica", 10, "Identidade, claims, direitos, codecs, duração, aspecto, FPS e arquivo final verificados."]
  ].map(([id, criterion, weight, evidence]) => ({ id, criterion, weight, evidence, status: "not_assessed" }));
  return {
    version: "mediaforge-art-direction-v1",
    status: "direction-ready-assets-and-render-pending",
    brief: {
      intent: goal, audience: basePlan.brief.audience, platform,
      aspectRatio: basePlan.brief.aspectRatio, durationSeconds: duration, fps: basePlan.brief.fps,
      valueProposition: basePlan.brief.idea, emotionalEffect, cta,
      tone: clean(input.tone, 80) || "natural, preciso e visualmente confiante",
      restrictions
    },
    hooks: hooksFor(goal),
    concepts: concepts.map(item => ({
      id: item.id, title: item.title, premise: item.premise, world: item.world,
      signature: item.signature
    })),
    selectedConcept: { ...chosen, visualStyleOverride: styleOverride || null },
    artDirection: {
      world: chosen.world,
      palette: brandColors.length ? { source: "user-supplied brand colors", colors: brandColors } : {
        source: "derive from verified brand assets; no official palette inferred",
        colors: ["neutral-base", "neutral-shadow", "single-brand-accent"]
      },
      lighting: chosen.lighting, materials: chosen.materials, lens: chosen.lens,
      cameraLanguage: chosen.camera, composition: chosen.world,
      typography: {
        hierarchy: "uma mensagem principal por plano; no máximo duas famílias tipográficas",
        display: "display face com peso forte e espaçamento controlado",
        body: "sans-serif legível em tela pequena",
        safeAreas: "manter texto/CTA dentro das áreas seguras da plataforma"
      },
      colorGrade: "consistência entre planos; preservar cor real do produto e tons de pele",
      depth: ["background", "midground", "foreground"],
      visualStyleOverride: styleOverride || null,
      references: referenceUrls,
      presetFamilies: [
        { id: "editorial-ui", primitives: ["soft-card", "dark-card", "stateful-ui-widget", "ui-orbit", "screen-punch-in", "pill-cta"] },
        { id: "kinetic-editorial", primitives: ["kinetic-copy", "voice-anchored-kinetic", "parallax-collage", "brand-end-card"] },
        { id: "neon-product", primitives: ["neon-product", "motif-match-cut", "pill-cta", "brand-end-card"] },
        { id: "scrap-warp", primitives: ["parallax-collage", "beat-cut-sequence"] },
        { id: "tutorial-capture", primitives: ["screen-punch-in", "kinetic-copy", "brand-end-card"] }
      ],
      avoid: ["cartões genéricos em sequência", "glow/pulsação como substituto de ação", "transições sem causa", "assets repetidos sem motivo", "texto cobrindo o produto ou CTA"]
    },
    storyboard: shots,
    motionPlanDraft,
    audioDirection: {
      voiceMode,
      voiceStyle: voiceMode === "off" ? null : "PT-BR natural, articulação clara, pausas humanas e sem locução publicitária gritante",
      recommendedProviders: {
        voice: voiceMode === "off" ? null : "ElevenLabs Speech / voz PT-BR selecionada no momento da produção",
        music: "ElevenLabs Music ou faixa original/licenciada",
        soundEffects: "ElevenLabs Sound Effects ou gravações originais/licenciadas"
      },
      musicArc: ["entrada curta no gancho", "base rítmica sob contexto", "crescimento na ação", "resolução no payoff", "redução para leitura do CTA"],
      sfxPolicy: "Somente quando existe uma ação visível correspondente; não adicionar whoosh em todo corte.",
      voiceSelectionPolicy: "Consultar o catálogo ElevenLabs em tempo de produção por idioma, sotaque, gênero e uso; registrar voice_id e modelo escolhidos no manifesto, nunca inferir um ID.",
      voiceAnchorPolicy: "Gerar a locução definitiva primeiro; alinhar palavra/ênfase a timestamps reais. Sem ASR ou ledger manual, marcar sincronismo como não verificado.",
      microInteractionTimingDefaults: {
        buttonContactSeconds: [0.1, 0.22],
        cardSettleSeconds: [0.22, 0.55],
        valueChangeSeconds: [0.5, 1.3],
        productHeroSeconds: [0.65, 1.3],
        matchCutSeconds: [0.15, 0.45],
        ctaHoldSeconds: [1.5, 2.5]
      },
      mixTargets: { integratedLufs: [-16, -14], truePeakMaxDbtp: -1, wordSyncToleranceMs: 100 },
      localPackagingRequired: true,
      rightsAndProvenanceRequired: true
    },
    qualityRubric: { totalWeight: 100, criteria: rubric, automaticScore: false, humanApprovalRequired: true },
    productionGates: {
      profile: "dynamic-motion-v1",
      meaningfulMotionCoverageMin: 0.60,
      maxUnmotivatedIdleSeconds: 0.8,
      maxExplicitHoldFraction: 0.20,
      minimumDepthLayers: 3,
      structuralPreflight: motionPlanDraft.validation,
      requirements: ["movimento de câmera com alvo", "transições causadas por ação/objeto", "assets locais", "preflight HyperFrames", "QA técnico e sonoro", "Frame Lab após render", "revisão artística humana"]
    },
    assetPlan: shots.map((shot, index) => ({
      id: "scene-" + (index + 1), scene: shot.id, type: "visual",
      description: shot.assetBrief.type, localPath: null, rightsVerified: false,
      provenance: null, required: true
    })).concat([
      { id: "music-bed", type: "music", description: "trilha com arco completo", localPath: null, rightsVerified: false, provenance: null, required: true },
      ...(voiceMode === "off" ? [] : [{ id: "narration", type: "voice", description: "locução com timestamps por palavra", localPath: null, rightsVerified: false, provenance: null, required: true }]),
      { id: "sfx-causal", type: "sfx", description: "efeitos pontuais sincronizados a ações visíveis", localPath: null, rightsVerified: false, provenance: null, required: true }
    ]),
    reviewSequence: ["prévia de 3 segundos", "revisão do primeiro frame e conceito", "preflight do projeto local", "render de prova", "análise de todos os frames no Frame Lab", "QA de áudio", "revisão da narrativa, arte e legibilidade", "aprovação humana"],
    blockers: [
      ...(basePlan.blockers || []),
      ...(brandColors.length ? [] : ["Paleta oficial não fornecida; derivar somente de assets reais."]),
      ...(referenceUrls.length ? [] : ["Nenhuma referência visual externa foi fornecida; conceito é original, sem imitação de marca/obra."])
    ],
    readiness: {
      creativeBrief: true, storyboard: true, assets: false, voiceMusicSfx: false,
      hyperframesProject: false, preview3s: false, frameAnalysis: false,
      technicalQA: false, audioQA: false, artisticReview: "not_assessed", humanApproval: "pending"
    },
    approval: "not_automatically_approved"
  };
}
