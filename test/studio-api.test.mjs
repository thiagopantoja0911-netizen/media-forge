import test from "node:test";
import assert from "node:assert/strict";
import { handleStudioApi } from "../src/studio-api.mjs";

const draft = {
  version: 1, title: "Teste Creator Studio", topic: "Uma história",
  duration: "30", intent: "curiosidade", tone: "investigativo",
  hookA: "O começo", hookB: "Uma pergunta", hookC: "Um contraste",
  selectedHook: "hookA",
  scenes: [
    { spoken: "Abertura", onscreen: "O começo", action: "Ação 1", sound: "Som 1" },
    { spoken: "Contexto", onscreen: "Contexto", action: "Ação 2", sound: "Som 2" },
    { spoken: "Prova", onscreen: "Prova", action: "Ação 3", sound: "Som 3" },
    { spoken: "Revelação", onscreen: "Revelação", action: "Ação 4", sound: "Som 4" },
    { spoken: "Fechamento", onscreen: "Fechamento", action: "Ação 5", sound: "Som 5" }
  ]
};

function responseHarness() {
  return {
    status: null, headers: {}, body: null,
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; }
  };
}

test("authenticated compose endpoint returns a package but never creates a render job", async () => {
  const response = responseHarness();
  const handled = await handleStudioApi({
    request: { method: "POST", url: "/api/studio/compose", headers: {} },
    response, parseBody: async () => draft, isAdminSession: async () => true
  });
  const body = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.readiness.renderReady, false);
  assert.equal(body.projectFiles.length, 23);
  assert.equal(body.projectFiles[0].path, "index.html");
  assert.equal(body.projectFiles.some(file => file.path.endsWith(".mp3")), false);
  assert.equal(body.job, undefined);
  assert.equal(body.jobId, undefined);
});

test("compose endpoint rejects unauthenticated requests before reading the body", async () => {
  const response = responseHarness();
  let parsed = false;
  await handleStudioApi({
    request: { method: "POST", url: "/api/studio/compose", headers: {} },
    response, parseBody: async () => { parsed = true; return draft; },
    isAdminSession: async () => false
  });
  assert.equal(response.status, 401);
  assert.equal(parsed, false);
});

test("compose endpoint rejects empty or malformed storyboards", async () => {
  const response = responseHarness();
  await handleStudioApi({
    request: { method: "POST", url: "/api/studio/compose", headers: {} },
    response, parseBody: async () => ({ version: 1, title: "Sem cenas", scenes: [] }),
    isAdminSession: async () => true
  });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).ok, false);
});

test("unknown routes are left to the main router and methods are rejected", async () => {
  const unknown = responseHarness();
  const result = await handleStudioApi({
    request: { method: "POST", url: "/api/studio/other", headers: {} },
    response: unknown, parseBody: async () => ({}), isAdminSession: async () => true
  });
  assert.equal(result, false);
  const method = responseHarness();
  await handleStudioApi({
    request: { method: "GET", url: "/api/studio/compose", headers: {} },
    response: method, parseBody: async () => draft, isAdminSession: async () => true
  });
  assert.equal(method.status, 405);
});
