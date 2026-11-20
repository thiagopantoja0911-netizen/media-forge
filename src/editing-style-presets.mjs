/**
 * Reusable editorial styles used by the MediaForge short-brief planner.
 *
 * A style is production direction, not an imported clip, music license,
 * proprietary font or promise that an MP4 will look like the reference.
 * The source file is deliberately NOT bundled into the application.
 */
export const EDITING_STYLE_PRESETS = Object.freeze({
  "cinematic-media-first-v2": Object.freeze({
    id:"cinematic-media-first-v2",name:"Cinematográfico — narrativa em ação | V2",version:2,
    category:"cinematic-media-first",
    source:{kind:"official-mediaforge-production-policy",policyVersion:"cinematic-v2"},
    identity:{palette:["#101821","#e2be94","#eee8df"],background:"authentic footage, realistic photography or physically lit CGI",
      composition:"action-first, depth and motivated camera",illustration:"never flat vector as the main shot",
      treatments:["light motivated by scene","controlled bloom","contact shadows","photographic color grade"],
      avoid:["vector-only slideshow","floating symbols as actors","repeated title card","slow zoom-only"]},
    editorial:{purpose:"build the event described by narration on screen",
      hook:"concrete visible action and sound cue in first 2s",progression:["observed problem","person or object acts","visible consequence","decision","emotionally satisfying resolution"],
      beatSeconds:{min:1.2,preferred:3.1,max:5},
      visualEventsPerBeat:{min:1,max:4},continuity:"objects, action and gaze motivate every cut",
      temporalRule:"reveal real event when spoken; captions support scene, never replace it",
      safeZone:"portrait video captions remain above platform buttons"},
    audio:{narration:"use real word-timestamped voice asset",music:"original/licensed score, narrative arc",
      microSfx:["caption pop on entrance","camera whoosh on movement","impact on causal action"],
      synchronization:"SFX on visual peaks within 80ms",voicePriority:true,
      qa:{integratedLufsRange:[-16,-14],maxTruePeakDbtp:-1}},
    production:{defaultAspectRatio:"9:16",alternateAspectRatio:"16:9 with native recomposition",
      defaultFps:30,editableGraphics:true,animationEngine:"HyperFrames/GSAP seekable",
      reusePolicy:"use original/licensed assets, never copy a reference movie",
      minimumRealMediaShare:.7,minimumMovingFootageShare:.5,maximumGraphicsShare:.15},
    shotDirections:[
      {visual:"real person or object starts a meaningful action immediately",movement:"match-action dolly and quick visual hook",sound:"short impact tied to the hook"},
      {visual:"show the scene's obstacle through a physical, filmed event",movement:"motivated handheld/tracking, layered depth",sound:"scene ambience and light transition whoosh"},
      {visual:"let an object or decision cause a visible before-and-after",movement:"causal match cut with fast blur accent",sound:"precise movement SFX at action peak"},
      {visual:"show the consequence unfolding, not a graph or label",movement:"reveal through focus pull or scene change",sound:"emotional music lift, restrained cue"},
      {visual:"end on a real payoff image and readable final question",movement:"settle after decisive physical action",sound:"musical resolve with room for voice"}
    ],
    qualityChecklist:["Real media assets attached per plan","Spoken beat has a real on-screen action",
      "No vector-only scene stands in for missing media","Bloom, blur, shadows and impacts are motivated",
      "Voice, music and SFX stems attached with provenance","Rendered frames and audio inspected",
      "Technical QA is not artistic approval"],
  }),
  "minimal-outline-explainer-v1": Object.freeze({
    id: "minimal-outline-explainer-v1",
    name: "Motion Minimalista P&B | Explicador 10K",
    version: 1,
    category: "kinetic-infographic",
    source: {
      kind: "user-provided-reference",
      referenceDate: "2026-11-17",
      durationSeconds: 64.9,
      width: 1920,
      height: 1080,
      fps: 30,
      sha256: "4d2c2392fab2ce4e364af3837ba077d60668f3c87f480bf151fac2e537e95541",
      analysisMethod: "manual review of 26 evenly spaced frames and audio metadata; no frame-perfect reconstruction",
    },
    identity: {
      palette: ["#080808", "#ffffff", "#9b9b9b"],
      background: "near-black with extremely subtle grid/dotted texture",
      contrast: "high; white vector outlines and limited gray fills",
      typography: "bold white geometric sans-serif for numbers/headings; small uppercase pill labels; compact supporting copy",
      illustration: "simple line icons: clock, smartphone, person, money, checklist, boxes, gauges",
      composition: "centered or split-screen geometric layouts with pronounced negative space and a subtle dotted baseline",
      treatments: ["thin bright outline", "soft edge glow (restrained)", "monochrome", "pill labels", "animated diagram"],
      avoid: ["random stock photos", "generic full-screen gradient", "heavy 3D", "confetti particles", "unmotivated camera shakes", "emoji decoration"],
    },
    editorial: {
      purpose: "teach or contrast a concrete idea visually, one step per beat",
      hook: "lead with a big number, claim or question in the first 2 seconds",
      progression: ["single visual claim", "contrasting quantities", "problem", "causal explanation", "action and payoff"],
      beatSeconds: { min: 1.3, preferred: 2.4, max: 4.0 },
      visualEventsPerBeat: { min: 1, max: 3 },
      complexity: "low information per frame; reuse motif with meaningful state changes instead of changing layouts every second",
      transitions: ["match-cut", "stroke-draw", "scale-and-settle", "short dip", "slide-to-new-state"],
      motion: ["draw-on-stroke", "counter-change", "icon-morph", "short scale-pop", "chart/build", "horizontal compare"],
      easing: ["power3.out", "power4.out", "power2.inOut"],
      temporalRule: "each graphic appears as the narrator introduces the concept; reveal, explain, settle; avoid silent static cards",
      continuity: "reuse baseline and monochrome grid, maintain visual position across diagrams",
      safeZone: "keep critical text/graphics clear of platform UI when adapting to 9:16",
    },
    audio: {
      narration: "voice-led explanation when available; avoid invented voice transcription",
      music: "licensed/original low-level rhythmic underscore; do not copy the reference track",
      microSfx: ["small pop on label emergence", "soft tick on numeric increment", "subtle whoosh on motivated transfer", "short chime on outcome"],
      synchronization: "visual event peak within 80 ms of its assigned SFX cue",
      voicePriority: true,
      qa: { integratedLufsRange: [-16, -14], maxTruePeakDbtp: -1.0, verifyAudibility: true },
      referenceInputLufs: -21.39,
      referenceInputTruePeakDbtp: -4.52,
      referenceAudioNote: "reference loudness measured; exact sound effects and voice content not verified",
    },
    production: {
      defaultAspectRatio: "16:9",
      alternateAspectRatio: "9:16 (recompose; do not crop 16:9 text blindly)",
      defaultFps: 60,
      editableGraphics: true,
      animationEngine: "GSAP seekable timeline / HyperFrames",
      fontConstraint: "package available licensed fonts; use accessible substitutes otherwise",
      proofConstraint: "no unsupported revenue, conversion, time-to-result or testimonial claims",
      reusePolicy: "abstract visual grammar only; do not ship, embed, trace or copy original copyrighted video/audio",
    },
    shotDirections: [
      { visual: "single large white claim/number over black; outlined marker builds below", movement: "letter/number stagger and short settle", sound: "single quiet pop" },
      { visual: "two data points with simple clock or progress icons, then side-by-side compare", movement: "icons draw, second value slides into frame", sound: "restrained tick" },
      { visual: "person/icon meets clear obstacle as phone/card/box outline", movement: "element tracks to the same visual anchor", sound: "short transfer whoosh" },
      { visual: "checklist or diagram changes state as explanation progresses", movement: "checkmarks and outline morph in sync with concrete facts", sound: "precise clicks" },
      { visual: "resolved concept returns as clean diagram/number plus a single CTA", movement: "quiet build, then 0.6s settle/readable hold", sound: "soft resolution" },
    ],
    qualityChecklist: [
      "Hook visible on frame 1 and understood in <= 2s",
      "No simultaneous accumulation of more than 3 new concepts",
      "Text remains readable on a phone",
      "At least one meaningful change per narrative beat",
      "Every SFX maps to a visible action, narration stays intelligible",
      "Real licensed music/sfx assets bundled for final delivery",
      "Check opening, midpoint and closing in frame-by-frame review",
      "No invented evidence or borrowed reference audio/video",
    ],
  }),
});

export function listEditingStyles() {
  return Object.values(EDITING_STYLE_PRESETS).map(p => ({
    id: p.id, name: p.name, category: p.category, version: p.version,
    summary: p.editorial.purpose, defaultAspectRatio: p.production.defaultAspectRatio,
    exampleUse: "Explainer visual sobre negócio, processo, marketing, educação e comparativos numéricos",
  }));
}

export function getEditingStylePreset(id) {
  if (id === undefined || id === null || id === "") return null;
  if (typeof id !== "string" || !Object.hasOwn(EDITING_STYLE_PRESETS, id))
    throw new Error("EDITING_STYLE_UNSUPPORTED");
  return EDITING_STYLE_PRESETS[id];
}

export function applyEditingStyleToStoryboard(storyboard, preset) {
  if (!preset) return storyboard;
  return storyboard.map((shot, index) => {
    const direction = preset.shotDirections[Math.min(index, preset.shotDirections.length - 1)];
    return {
      ...shot,
      visualTreatment: direction.visual,
      motionDirection: direction.movement,
      sound: direction.sound,
      graphicRules: {
        palette: preset.identity.palette,
        background: preset.identity.background,
        composition: preset.identity.composition,
        illustration: preset.identity.illustration,
      },
    };
  });
}
