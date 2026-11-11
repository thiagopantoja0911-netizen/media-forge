import test from "node:test";
import assert from "node:assert/strict";
import { validateProjectFiles } from "../src/job-schema.mjs";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";
import { buildCreatorComposition } from "../src/creator-composer.mjs";

const source = {
  version: 1,
  title: "Reel de teste",
  topic: "Uma história em cinco cenas",
  duration: "30",
  intent: "curiosidade",
  tone: "investigativo",
  hookA: "O detalhe começa aqui",
  hookB: "Você sabia?",
  hookC: "Parece impossível",
  selectedHook: "hookA",
  scenes: [
    { spoken: "Abertura narrada", onscreen: "O detalhe começa aqui", action: "Objeto entra em cena", sound: "Impacto" },
    { spoken: "Contexto narrado", onscreen: "O contexto", action: "Câmera aproxima", sound: "Ambiente" },
    { spoken: "Prova narrada", onscreen: "A prova visual", action: "Transformação", sound: "Micro som" },
    { spoken: "Revelação narrada", onscreen: "A revelação", action: "Mudar perspectiva", sound: "Riser" },
    { spoken: "Fechamento narrado", onscreen: "O que você acha?", action: "Payoff", sound: "Fade" }
  ]
};

test("builds a five-scene editable HyperFrames package without creating a render job", async () => {
  const imported = importSalevoStudioDraft(source);
  const built = await buildCreatorComposition(imported.manifest);
  assert.equal(built.project.durationSeconds, 30);
  assert.equal(built.project.aspectRatio, "9:16");
  assert.equal(built.project.resolution, "portrait-4k");
  assert.equal(built.project.fps, 60);
  assert.equal(built.readiness.renderReady, false);
  assert.equal(built.projectFiles.length, 8);
  assert.equal(validateProjectFiles(built.projectFiles).ok, true);
  assert.equal(built.projectFiles[0].path, "index.html");
  assert.match(built.projectFiles[0].content, /data-duration="30"/);
  assert.match(built.projectFiles[0].content, /data-width="2160"/);
  assert.match(built.projectFiles[0].content, /data-height="3840"/);
  for (let i = 1; i <= 5; i += 1) {
    const file = built.projectFiles.find(item => item.path === `compositions/scene-0${i}.html`);
    assert.ok(file);
    assert.match(file.content, /<template>/);
    assert.match(file.content, /class="clip" data-start="0" data-duration=/);
    assert.match(file.content, /window\.__timelines\["scene-0/);
  }
  assert.equal(built.projectFiles.some(item => item.path.endsWith(".mp3") || item.path.endsWith(".wav")), false);
});

test("escapes user text and does not execute injected HTML or script", async () => {
  const malicious = {
    ...source,
    scenes: source.scenes.map((scene, i) => ({
      ...scene,
      onscreen: i === 0 ? '</h1><script>alert("x")</script>' : scene.onscreen
    }))
  };
  const built = await buildCreatorComposition(importSalevoStudioDraft(malicious).manifest);
  const firstScene = built.projectFiles.find(item => item.path === "compositions/scene-01.html").content;
  assert.doesNotMatch(firstScene, /<script>alert/);
  assert.match(firstScene, /&lt;script&gt;alert/);
});

test("rejects malformed timelines and incomplete manifests", async () => {
  const manifest = importSalevoStudioDraft(source).manifest;
  const broken = structuredClone(manifest);
  broken.brief.scenes[2].start += 1;
  await assert.rejects(() => buildCreatorComposition(broken), /Timeline inválida/);
  await assert.rejects(() => buildCreatorComposition({ format: "wrong" }), /manifesto MediaForge/);
});
