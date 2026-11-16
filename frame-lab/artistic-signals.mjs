// Frame-level objective signals for the creative review.
// Optical flow is evidence of pixel motion, not a measure of taste or story quality.
const round = (value, places = 3) => Number.isFinite(value)
  ? Number(value.toFixed(places)) : null;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function isLowMotion(frame) {
  const flow = Number(frame?.flow_mean_px) || 0;
  const changed = Number(frame?.changed_pixel_fraction) || 0;
  const camera = Math.hypot(Number(frame?.camera_dx_px) || 0, Number(frame?.camera_dy_px) || 0);
  return flow < 0.12 && changed < 0.001 && camera < 0.12;
}

export function evaluateArtisticSignals(report) {
  const reference = report?.reference;
  const frames = Array.isArray(reference?.frames) ? reference.frames : [];
  if (!frames.length) {
    return {
      status: "frame-evidence-unavailable",
      source: report?.schemaVersion || null,
      metrics: null,
      findings: ["Nenhum quadro analisado; não é possível avaliar sinais visuais."],
      humanReview: "required",
      automaticApproval: false
    };
  }

  const fps = Number(reference.fps) > 0 ? Number(reference.fps) : 0;
  const measured = frames.slice(1);
  const motionValues = measured.map(frame => Number(frame.flow_mean_px) || 0);
  const changedValues = measured.map(frame => Number(frame.changed_pixel_fraction) || 0);
  const cameraValues = measured.map(frame => Math.hypot(
    Number(frame.camera_dx_px) || 0, Number(frame.camera_dy_px) || 0
  ));
  const motionEvidenceFrames = measured.filter((frame, index) =>
    motionValues[index] >= 0.25 || changedValues[index] >= 0.002 || cameraValues[index] >= 0.2
  ).length;
  const cameraMotionFrames = cameraValues.filter(value => value >= 0.2).length;

  let longestLowMotionFrames = 0;
  let currentLowMotionFrames = 0;
  for (const frame of measured) {
    if (isLowMotion(frame)) {
      currentLowMotionFrames++;
      longestLowMotionFrames = Math.max(longestLowMotionFrames, currentLowMotionFrames);
    } else {
      currentLowMotionFrames = 0;
    }
  }

  const comparison = Array.isArray(report.comparison) ? report.comparison : [];
  const offsets = comparison.map(row => Math.abs(Number(row.timeDeltaMs)))
    .filter(Number.isFinite);
  const longestLowMotionSeconds = fps ? longestLowMotionFrames / fps : null;
  const motionEvidenceRatio = measured.length ? motionEvidenceFrames / measured.length : 0;
  const findings = [];
  if (longestLowMotionSeconds !== null && longestLowMotionSeconds > 0.8) {
    findings.push("Trecho com baixo movimento de pixels superior a 0,8 s; conferir se a pausa é narrativa e intencional.");
  }
  if (motionEvidenceRatio < 0.25) {
    findings.push("Baixa evidência de movimento entre quadros; conferir se o vídeo estático corresponde ao perfil solicitado.");
  }
  if (!comparison.length) findings.push("Sem comparação referência/render; fidelidade de movimento não foi avaliada.");
  findings.push("Composição, originalidade, narrativa, tipografia e qualidade estética exigem revisão visual humana.");
  findings.push("Áudio exige análise separada; fluxo óptico não mede mixagem nem sincronismo de locução.");

  return {
    status: "evidence-ready-human-review-required",
    source: report.schemaVersion || "frame-lab",
    analysisMode: report.analysisMode || "unknown",
    metrics: {
      frameCount: frames.length,
      fps: fps || null,
      durationSeconds: round(Number(reference.duration_s)),
      pixelMotionEvidenceRatio: round(motionEvidenceRatio),
      lowMotionLongestRunSeconds: round(longestLowMotionSeconds),
      cameraMotionFrameRatio: round(measured.length ? cameraMotionFrames / measured.length : 0),
      meanOpticalFlowPx: round(mean(motionValues)),
      meanChangedPixelFraction: round(mean(changedValues)),
      comparedFrames: comparison.length,
      maxFrameMatchOffsetMs: offsets.length ? round(Math.max(...offsets), 2) : null
    },
    findings,
    reviewChecklist: [
      { area: "narrative", status: "human-review-required" },
      { area: "originality", status: "human-review-required" },
      { area: "composition-and-hierarchy", status: "human-review-required" },
      { area: "typography-and-safe-areas", status: "human-review-required" },
      { area: "camera-and-continuity", status: "evidence-plus-human-review" },
      { area: "sound-and-sync", status: "separate-audio-qa-required" },
      { area: "brand-and-claims", status: "source-verification-required" }
    ],
    humanReview: "required",
    automaticApproval: false,
    limitations: [
      "Pixel motion is not the same as meaningful or beautiful motion.",
      "Optical flow cannot judge narrative, composition, originality, readability or emotional impact.",
      "No automated result replaces listening to the audio and watching the complete film."
    ]
  };
}
