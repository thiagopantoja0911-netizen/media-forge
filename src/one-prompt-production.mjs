// Converts a short request into a reproducible creative-production contract.
// This does not fabricate logos, testimonials, media bytes, or conversion measurements.
import { planFromShortBrief } from "./creative-director.mjs";
import { buildArtisticDirection } from "./artistic-director.mjs";

const GOALS = {
  sales: { mechanics: ["relevant pain", "observable mechanism", "measurable consequence only if verified", "risk reduction", "clear invitation"], cta: "Conheça a solução", hook: "Show the observable problem and what changes" },
  likes: { mechanics: ["familiar moment", "surprise", "visual transformation", "reward", "authentic question"], cta: "Qual detalhe você percebeu?", hook: "Show a surprising result immediately" },
  shares: { mechanics: ["useful insight", "clarity", "real demonstration", "social utility", "natural invitation"], cta: "Compartilhe com quem pode aproveitar", hook: "Make the useful result visible before explanation" },
  awareness: { mechanics: ["recognizable object", "visual identity", "brand association", "recall", "invitation"], cta: "Descubra mais", hook: "Make the brand subject distinctive" }
};
function optionalVoice(value, goal) {
  if (value === undefined || value === "auto") return goal === "sales" || goal === "shares" ? "pt-BR-natural" : "off";
  if (["off", "pt-BR-female", "pt-BR-male"].includes(value)) return value;
  throw Error("VOICE_MODE_UNSUPPORTED");
}
function sourceId(input) {
  const validLogo = typeof input.logo_asset_path === "string" && /^assets\/[a-z0-9/_-]+\.(png|jpg|webp)$/i.test(input.logo_asset_path);
  const validUrl = typeof input.brand_url === "string" && /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(input.brand_url);
  return { logo: validLogo ? input.logo_asset_path : null, url: validUrl ? input.brand_url : null };
}
export function buildOnePromptBlueprint(input = {}) {
  const original = planFromShortBrief(input);
  const goal = original.brief.goal;
  const goalSpec = GOALS[goal];
  const verified = sourceId(input);
  const voice = optionalVoice(input.voice_mode, goal);
  const artisticDirection = buildArtisticDirection(input, original, { voiceMode: voice });
  const verifiedClaims = original.claims.filter(claim => claim.eligible);
  const unverifiedClaims = original.claims.filter(claim => !claim.eligible);
  const shots = artisticDirection.storyboard.map((shot, index) => ({
    ...shot,
    creativeGoal: goalSpec.mechanics[index],
    hero: {
      id: "hero-" + String(index + 1),
      asset: "not-generated",
      kind: index === 4 ? "real brand logo or clearly labeled illustrative" : "real product/screen or original shot-specific visual",
      required: true,
      realCompanyProofRequired: index === 3 || index === 4
    },
    cameraTarget: "hero-" + String(index + 1),
    soundtrack: {
      kind: shot.soundCue,
      startsAtSeconds: shot.start,
      generated: false
    },
    narration: voice === "off" ? null : shot.voiceLineTemplate,
    continuation: shot.continuity,
    checklist: { assetPresent: false, audioPresent: false, reviewed: false }
  }));
  const assets = shots.map(shot => ({
    id: shot.hero.id, kind: "visual", purpose: shot.hero.kind,
    path: null, generated: false, rightsVerified: false, provenance: null
  }));
  assets.push({ id: "music-bed", kind: "music", purpose: "licensed or original music for the full film", path: null, generated: false, rightsVerified: false, provenance: null });
  if (voice !== "off") assets.push({ id: "narration", kind: "voice", purpose: "word-timestamped intelligible narration", path: null, generated: false, rightsVerified: false, provenance: null });
  for (let index = 0; index < 4; index++) assets.push({
    id: "sfx-" + String(index + 1), kind: "sfx",
    purpose: "effect caused by a visible action; validate timing and sound with QA",
    path: null, generated: false, rightsVerified: false, provenance: null
  });
  if (!verified.logo) assets.push({
    id: "brand-logo", kind: "identity",
    purpose: "verified brand identity; never fabricate an official logo",
    path: null, generated: false, rightsVerified: false, provenance: null
  });

  return {
    version: "mediaforge-chat-one-prompt-v2",
    status: "production-plan-ready-not-rendered",
    brief: original.brief,
    creative: {
      goal, hook: goalSpec.hook, chosenApproach: original.decision.chosen,
      selectedConcept: artisticDirection.selectedConcept.id,
      psychology: goalSpec.mechanics, cta: artisticDirection.brief.cta,
      conversionOrEngagementIsNotGuaranteed: true
    },
    alternatives: original.alternatives,
    hooks: artisticDirection.hooks,
    storyboard: shots,
    artisticDirection,
    assets,
    claims: {
      allowed: verifiedClaims,
      withheld: unverifiedClaims.map(claim => ({ text: claim.text, reason: "Unverified source" }))
    },
    identity: { brandUrl: verified.url, logoPath: verified.logo, verified: false },
    audio: {
      voice, wordTimestampsRequired: voice !== "off", music: true, causalSfx: true,
      recommendedProviders: artisticDirection.audioDirection.recommendedProviders,
      targets: {
        integratedLufs: artisticDirection.audioDirection.mixTargets.integratedLufs,
        truePeakDbtp: artisticDirection.audioDirection.mixTargets.truePeakMaxDbtp,
        wordSyncMs: artisticDirection.audioDirection.mixTargets.wordSyncToleranceMs
      },
      localPackagingRequired: true,
      rightsAndProvenanceRequired: true
    },
    direction: {
      motionProfile: artisticDirection.productionGates.profile,
      previewSeconds: 3,
      depthLayers: 3,
      fullFilmAfterPreview: true,
      requirements: [
        "camera with a clear target",
        "three depth layers with independent movement",
        "object-caused scene transitions",
        "no generic cards or placeholders",
        "no long static holds without narrative reason",
        "CTA unobstructed",
        "no invented statistics, testimonials, pricing or scarcity",
        "assets packaged locally with rights/provenance",
        "Frame Lab evidence followed by human artistic review"
      ]
    },
    readiness: {
      storyboard: true, artisticDirection: true, mediaAssetsReady: false,
      soundAssetsReady: false, hyperframesProjectReady: false,
      preview3s: false, technicalQA: false, audioQA: false,
      frameAnalysis: false, artisticQA: false,
      verifiedCompanyAssets: !!verified.url && !!verified.logo,
      humanApproval: "pending"
    },
    delivery: { expected: ["MP4", "editable project", "media manifest", "technical/audio/artistic QA report"], performed: false },
    nextActions: [
      "verify brand identity and factual claims",
      "source/generate real scene-specific visual and audio files",
      "package all assets locally with rights/provenance",
      "build editable HyperFrames composition",
      "render and review the 3-second prototype",
      "run technical and audio QA",
      "analyze every frame in Frame Lab",
      "complete the artistic rubric and obtain user approval",
      "deliver only after approval"
    ]
  };
}
