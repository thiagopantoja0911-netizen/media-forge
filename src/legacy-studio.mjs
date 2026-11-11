// Compatibilidade com o JSON v1 exportado pelo planejador de video.salevo.site/studio/.
// Este módulo não executa mídia, não faz chamadas de rede e não manipula credenciais.
const FIELD_LIMITS = {
  title: 1100, topic: 1500, intent: 1100, duration: 1100,
  audience: 1100, tone: 1100, style: 1100, cta: 1100,
  hookA: 1100, hookB: 1100, hookC: 1100
};
const SCENE_NAMES = ["Gancho", "Contexto", "Prova visual", "Revelação", "Fechamento"];
const SCENE_FIELDS = ["spoken", "onscreen", "action", "sound"];
const DURATIONS = new Set(["15", "30", "45", "60"]);
const INTENTS = new Set(["curiosidade", "demonstracao", "produto", "engajamento", "venda-indireta"]);
const TONES = new Set(["investigativo", "cinematografico", "direto", "leve", "educativo"]);
const HOOKS = new Set(["hookA", "hookB", "hookC"]);

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

// Mesma distribuição de cenas do planejador antigo. Não presume timestamps externos.
function sceneBounds(duration) {
  const remaining = duration - 3;
  return [0, 3, Math.round(3 + remaining * .22), Math.round(3 + remaining * .5),
    Math.round(3 + remaining * .8), duration];
}

/**
 * Normaliza um rascunho Salevo Studio v1 em um job MediaForge SOMENTE de planejamento.
 * Nenhum MP4 será solicitado: o JSON não contém uma composição HyperFrames renderizável.
 */
export function importSalevoStudioDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || raw.version !== 1 || typeof raw.title !== "string" || !Array.isArray(raw.scenes)) {
    throw new TypeError("Arquivo inválido: esperado projeto Salevo Studio JSON v1");
  }
  if (raw.scenes.length !== 0 && raw.scenes.length !== 5) {
    throw new TypeError("Arquivo inválido: storyboard deve ter zero ou cinco cenas");
  }

  const brief = {};
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    brief[key] = text(raw[key], limit);
  }
  if (!DURATIONS.has(brief.duration)) brief.duration = "45";
  if (!INTENTS.has(brief.intent)) brief.intent = "curiosidade";
  if (!TONES.has(brief.tone)) brief.tone = "investigativo";
  const selectedHook = HOOKS.has(raw.selectedHook) ? raw.selectedHook : "hookA";
  const duration = Number(brief.duration);
  const bounds = sceneBounds(duration);

  const scenes = raw.scenes.map((scene, i) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      throw new TypeError("Arquivo inválido: cena " + (i + 1));
    }
    const item = { name: SCENE_NAMES[i], start: bounds[i], end: bounds[i + 1] };
    for (const field of SCENE_FIELDS) item[field] = text(scene[field], 2000);
    return item;
  });

  const title = brief.title.trim() || brief.topic.trim().slice(0, 100) || "Projeto importado Salevo";
  const chosenHook = brief[selectedHook].trim() || brief.topic.trim();
  const warnings = [
    "Importação de planejamento: não foram gerados arquivos HyperFrames nem áudio.",
    "Revise o storyboard antes de criar uma composição e solicitar uma renderização."
  ];
  if (!scenes.length) warnings.push("O rascunho não contém as cinco cenas.");

  // Manifesto intencionalmente NÃO é um payload POST /v1/jobs.
  // O worker remoto de produção só aceita composições HyperFrames renderizáveis.
  return {
    manifest: {
      format: "mediaforge-planning-v1",
      renderReady: false,
      source: { system: "salevo-video/studio", version: 1 },
      project: { title, durationSeconds: duration, aspectRatio: "9:16" },
      brief: { ...brief, selectedHook, chosenHook, scenes }
    },
    warnings
  };
}
