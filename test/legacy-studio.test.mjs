import test from "node:test";
import assert from "node:assert/strict";
import { validateJob } from "../src/job-schema.mjs";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";

const scene = { spoken: "Narração", onscreen: "Texto", action: "Movimento", sound: "SFX" };
const base = {
  version: 1, title: "Reel educativo", topic: "Exemplo de tema",
  duration: "30", intent: "demonstracao", tone: "direto",
  hookA: "A", hookB: "B", hookC: "C", selectedHook: "hookB",
  scenes: Array.from({ length: 5 }, () => ({ ...scene }))
};

test("mapeia briefing e cenas para manifesto de planejamento não renderizável", () => {
  const { manifest, warnings } = importSalevoStudioDraft(base);
  assert.equal(manifest.format, "mediaforge-planning-v1");
  assert.equal(manifest.renderReady, false);
  assert.equal(manifest.project.title, "Reel educativo");
  assert.equal(manifest.project.durationSeconds, 30);
  assert.equal(manifest.project.aspectRatio, "9:16");
  assert.equal(manifest.brief.selectedHook, "hookB");
  assert.equal(manifest.brief.chosenHook, "B");
  assert.equal(manifest.brief.scenes.length, 5);
  assert.deepEqual(manifest.brief.scenes.map(s => [s.start, s.end]),
    [[0, 3], [3, 9], [9, 17], [17, 25], [25, 30]]);
  // Não oferecer um job que seria entregue ao worker remoto sem uma composição.
  assert.equal(manifest.prompt, undefined);
  assert.equal(manifest.project.renderer, undefined);
  assert.equal(validateJob(manifest).ok, false);
  assert.ok(warnings.some(message => message.includes("não foram gerados arquivos")));
});

test("aceita rascunho sem cenas e usa padrões compatíveis", () => {
  const { manifest, warnings } = importSalevoStudioDraft({
    version: 1, title: "", topic: "Tema", duration: "999", scenes: []
  });
  assert.equal(manifest.project.durationSeconds, 45);
  assert.equal(manifest.project.title, "Tema");
  assert.equal(manifest.brief.selectedHook, "hookA");
  assert.equal(manifest.brief.intent, "curiosidade");
  assert.deepEqual(manifest.brief.scenes, []);
  assert.ok(warnings.some(message => message.includes("cinco cenas")));
});

test("rejeita versões desconhecidas, cenas incompletas ou inválidas", () => {
  assert.throws(() => importSalevoStudioDraft({ ...base, version: 2 }), /JSON v1/);
  assert.throws(() => importSalevoStudioDraft({ ...base, scenes: [scene] }), /zero ou cinco/);
  assert.throws(() => importSalevoStudioDraft({ ...base, scenes: [scene, scene, null, scene, scene] }), /cena 3/);
});

test("descarta campos desconhecidos e limita textos grandes", () => {
  const { manifest } = importSalevoStudioDraft({
    ...base, title: "x".repeat(2500), token: "não importar",
    scenes: Array.from({ length: 5 }, () => ({
      ...scene, spoken: "y".repeat(10000), extra: "ignorar"
    }))
  });
  assert.equal(manifest.brief.title.length, 1100);
  assert.equal(manifest.brief.scenes[0].spoken.length, 2000);
  assert.equal(manifest.brief.scenes[0].extra, undefined);
  assert.equal(manifest.token, undefined);
  assert.equal(manifest.renderReady, false);
});
