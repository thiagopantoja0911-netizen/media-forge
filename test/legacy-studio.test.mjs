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

test("importa briefing, gancho e cinco cenas para job válido de planejamento", () => {
  const { jobRequest, warnings } = importSalevoStudioDraft(base);
  assert.equal(validateJob(jobRequest).ok, true);
  assert.equal(jobRequest.project.title, "Reel educativo");
  assert.equal(jobRequest.project.durationSeconds, 30);
  assert.equal(jobRequest.project.aspectRatio, "9:16");
  assert.deepEqual(jobRequest.project.outputs, ["project"]);
  assert.equal(jobRequest.project.renderer, "dry-run");
  assert.equal(jobRequest.metadata.brief.selectedHook, "hookB");
  assert.equal(jobRequest.metadata.brief.chosenHook, "B");
  assert.equal(jobRequest.metadata.brief.scenes.length, 5);
  assert.deepEqual(jobRequest.metadata.brief.scenes.map(s => [s.start, s.end]),
    [[0, 3], [3, 9], [9, 17], [17, 25], [25, 30]]);
  assert.equal(jobRequest.projectFiles, undefined);
  assert.ok(warnings.some(message => message.includes("não foram gerados arquivos")));
});

test("aceita rascunho sem cenas, usando duração e campos padrão seguros", () => {
  const { jobRequest, warnings } = importSalevoStudioDraft({
    version: 1, title: "", topic: "Tema", duration: "999", scenes: []
  });
  assert.equal(jobRequest.project.durationSeconds, 45);
  assert.equal(jobRequest.project.title, "Tema");
  assert.equal(jobRequest.metadata.brief.selectedHook, "hookA");
  assert.equal(jobRequest.metadata.brief.intent, "curiosidade");
  assert.equal(jobRequest.metadata.brief.scenes.length, 0);
  assert.ok(warnings.some(message => message.includes("cinco cenas")));
});

test("rejeita versões desconhecidas e storyboard incompleto", () => {
  assert.throws(() => importSalevoStudioDraft({ ...base, version: 2 }), /JSON v1/);
  assert.throws(() => importSalevoStudioDraft({ ...base, scenes: [scene] }), /zero ou cinco/);
  assert.throws(() => importSalevoStudioDraft({ ...base, scenes: [scene, scene, null, scene, scene] }), /cena 3/);
});

test("descarta propriedades desconhecidas e limita tamanho de texto", () => {
  const { jobRequest } = importSalevoStudioDraft({
    ...base, title: "x".repeat(2500), token: "não importar",
    scenes: Array.from({ length: 5 }, () => ({ ...scene, spoken: "y".repeat(10000), extra: "ignorar" }))
  });
  assert.equal(jobRequest.metadata.brief.title.length, 1100);
  assert.equal(jobRequest.metadata.brief.scenes[0].spoken.length, 2000);
  assert.equal(jobRequest.metadata.brief.scenes[0].extra, undefined);
  assert.equal(jobRequest.metadata.token, undefined);
  assert.equal(jobRequest.project.renderer, "dry-run");
});
