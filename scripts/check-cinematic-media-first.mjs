#!/usr/bin/env node
// Production-readiness gate for cinematic, media-first videos.
// Accepts an independently authored manifest, not render metadata guessed by a model.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const visualKinds = new Set(["footage", "photo", "cgi_photoreal"]);
const vectorKinds = new Set(["vector", "svg", "infographic", "procedural"]);
const EPS = 0.05;
export function inspectCinematicManifest(doc) {
  const errors = [], warnings = [];
  const d = Number(doc?.duration_seconds);
  if (!Number.isFinite(d) || d < 5 || d > 1800) errors.push("Duração inválida.");
  const scenes = Array.isArray(doc?.scenes) ? [...doc.scenes] : [];
  if (!scenes.length) errors.push("Nenhum plano informado.");
  scenes.sort((a,b) => Number(a.start) - Number(b.start));
  let cursor = 0, realistic = 0, vector = 0;
  const usage = new Map(), unique = new Set();
  scenes.forEach((s,i) => {
    const start = Number(s.start), end = Number(s.end), sec = end-start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || sec <= 0) {
      errors.push("Plano "+(i+1)+": start/end inválidos."); return;
    }
    if (Math.abs(start-cursor) > EPS) errors.push("Plano "+(i+1)+": lacuna ou sobreposição na timeline.");
    cursor = end;
    if (sec > 6) warnings.push("Plano "+(i+1)+": duração superior a 6 s; revisar retenção.");
    if (!s.kind) errors.push("Plano "+(i+1)+": fonte visual sem classificação.");
    if (visualKinds.has(s.kind)) realistic += sec;
    if (vectorKinds.has(s.kind)) vector += sec;
    const asset = String(s.asset || "").trim();
    if (visualKinds.has(s.kind) && !asset) errors.push("Plano "+(i+1)+": falta arquivo de mídia real/CGI.");
    if (asset && /^(?:https?:|file:|data:)/i.test(asset)) errors.push("Plano "+(i+1)+": asset remoto/inseguro em vez de arquivo empacotado.");
    if (asset) { unique.add(asset); usage.set(asset,(usage.get(asset)||0)+sec); }
    if (s.kind === "cgi_photoreal" && !s.rendered_materials) warnings.push("Plano "+(i+1)+": CGI sem materiais/iluminação documentados.");
    if (s.kind === "photo" || s.kind === "footage") {
      if (!s.source) warnings.push("Plano "+(i+1)+": falta crédito/proveniência do arquivo.");
    }
    if (s.generated_ai && !s.labeled_illustrative) errors.push("Plano "+(i+1)+": IA sem declaração de caráter ilustrativo.");
  });
  if (Number.isFinite(d) && Math.abs(cursor-d)>EPS) errors.push("Planos não cobrem toda a duração.");
  if (Number.isFinite(d) && d>0) {
    if (realistic/d < .7) errors.push("Apenas "+Math.round(100*realistic/d)+"% da montagem tem mídia fotográfica/CGI realista (mínimo 70%).");
    if (vector/d > .15) errors.push("Visual vetorial ocupa "+Math.round(100*vector/d)+"% da duração (máximo 15%).");
    for (const [asset,seconds] of usage) if (seconds/d > .25) errors.push("Asset visual repetido por "+Math.round(100*seconds/d)+"% do vídeo: "+asset);
  }
  if (d>=30 && unique.size<8) errors.push("Montagem com menos de oito fontes visuais distintas ("+unique.size+").");
  const a=doc?.audio || {};
  if (doc?.narrated !== false) {
    if (!a.voiceover?.file) errors.push("Narração solicitada, mas arquivo de voz não foi anexado.");
    if (a.voiceover?.file && /^(?:https?:|file:|data:)/i.test(a.voiceover.file)) errors.push("Voz deve ser asset local empacotado, não link externo.");
    if (a.voiceover?.duration_seconds && Number.isFinite(d) && Math.abs(Number(a.voiceover.duration_seconds)-d)>10) warnings.push("Voz difere da duração; confirmar pausas/sincronização.");
  }
  if (!a.music?.file && !a.intentional_silence_reason) warnings.push("Sem trilha e sem justificativa de silêncio.");
  const qa=doc?.qa || {};
  for (const flag of ["first_frame_reviewed","safe_zone_reviewed","motion_reviewed","audio_listened","artistic_reviewed"]) {
    if (qa[flag] !== true) errors.push("Gate de revisão pendente: "+flag);
  }
  return {ready:errors.length===0,realistic_percent:d>0?Math.round(100*realistic/d):0,vector_percent:d>0?Math.round(100*vector/d):0,unique_media:unique.size,errors,warnings};
}
if (process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const path=process.argv[2];
  if (!path) { console.error("Use: node scripts/check-cinematic-media-first.mjs manifest.json"); process.exit(2); }
  let data;
  try { data=JSON.parse(readFileSync(path,"utf8")); }
  catch(e) { console.error("Manifest inválido: "+e.message);process.exit(2); }
  const result=inspectCinematicManifest(data);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if (!result.ready) process.exitCode=1;
}
