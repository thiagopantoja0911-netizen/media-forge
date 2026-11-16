import test from "node:test";
import assert from "node:assert/strict";
import { planFromShortBrief } from "../src/creative-director.mjs";
import { buildArtisticDirection } from "../src/artistic-director.mjs";

test("artistic direction returns three distinct concepts, hooks and a detailed storyboard", () => {
  const brief = { brand: "Marca Exemplo", idea: "Criar um anúncio para apresentar um serviço de organização", goal: "sales" };
  const plan = planFromShortBrief(brief);
  const art = buildArtisticDirection(brief, plan, { voiceMode: "pt-BR-female" });
  assert.equal(art.version, "mediaforge-art-direction-v1");
  assert.equal(art.concepts.length, 3);
  assert.equal(art.hooks.length, 3);
  assert.equal(art.selectedConcept.id, "before-after");
  assert.equal(art.storyboard.length, 5);
  assert.equal(art.storyboard[0].beat, "Gancho");
  assert.ok(art.storyboard.every(shot => shot.visualAction && shot.transitionCause && shot.assetBrief.required));
  assert.equal(art.audioDirection.voiceMode, "pt-BR-female");
  assert.equal(art.qualityRubric.totalWeight, 100);
  assert.equal(art.qualityRubric.automaticScore, false);
  assert.equal(art.approval, "not_automatically_approved");
  assert.equal(art.motionPlanDraft.validation.ok, true, JSON.stringify(art.motionPlanDraft.validation.issues));
  assert.equal(art.motionPlanDraft.plan.profile, "dynamic-motion-v1");
  assert.equal(art.productionGates.structuralPreflight.ok, true);
  assert.equal(art.motionPlanDraft.targetBinding, "not-verified-against-project-html");
  assert.equal(art.artDirection.presetFamilies.length, 5);
  assert.equal(art.audioDirection.voiceAnchorPolicy.includes("timestamps reais"), true);
});

test("caller can choose a concept, style, platform, CTA and brand colors", () => {
  const input = {
    brand: "Marca Exemplo",
    idea: "Apresentar uma nova coleção de produtos",
    goal: "awareness",
    concept_id: "result-first",
    visual_style: "macro editorial com luz natural",
    platform: "Instagram Reels",
    cta: "Veja a coleção",
    brand_colors: ["#112233", "#DDAA55", "not-a-color"],
    reference_urls: ["https://example.com/reference"]
  };
  const art = buildArtisticDirection(input, planFromShortBrief(input), { voiceMode: "off" });
  assert.equal(art.selectedConcept.id, "result-first");
  assert.equal(art.artDirection.visualStyleOverride, "macro editorial com luz natural");
  assert.deepEqual(art.artDirection.palette.colors, ["#112233", "#DDAA55"]);
  assert.equal(art.brief.platform, "Instagram Reels");
  assert.equal(art.brief.cta, "Veja a coleção");
  assert.equal(art.audioDirection.voiceStyle, null);
});

test("invalid concept choices fail and unverified identity stays explicitly unresolved", () => {
  const input = { brand: "Empresa X", idea: "Mostrar uma ideia visual para a empresa", concept_id: "fake-concept" };
  assert.throws(() => buildArtisticDirection(input, planFromShortBrief(input)), /CONCEPT_UNSUPPORTED/);
  const safe = { brand: "Empresa X", idea: "Mostrar uma ideia visual para a empresa" };
  const art = buildArtisticDirection(safe, planFromShortBrief(safe));
  assert.ok(art.blockers.some(item => /identidade|logo/i.test(item)));
  assert.equal(art.readiness.assets, false);
  assert.equal(art.readiness.humanApproval, "pending");
});

test("structural motion draft meets the dynamic gate at supported durations", () => {
  for (const duration_seconds of [10, 20, 30, 40]) {
    const input = {
      brand: "Marca Exemplo",
      idea: "Mostrar uma transformação visual de produto",
      goal: "sales",
      duration_seconds
    };
    const art = buildArtisticDirection(input, planFromShortBrief(input));
    assert.equal(art.motionPlanDraft.validation.ok, true,
      duration_seconds + "s: " + JSON.stringify(art.motionPlanDraft.validation.issues));
    assert.ok(art.motionPlanDraft.plan.events.length >= 10);
    assert.ok(art.motionPlanDraft.plan.transitions.length >= Math.ceil(2 * duration_seconds / 10));
  }
});
