import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { handleStudio } from "../src/studio.mjs";

const script = await readFile(new URL("../studio/app.js", import.meta.url), "utf8");
const page = await readFile(new URL("../studio/index.html", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/panel.mjs", import.meta.url), "utf8");

function harness() {
  const nodes = new Map(), storage = new Map(), downloads = [];
  let ready;
  function makeNode() {
    return {
      textContent: "", value: "", style: {}, hidden: false, children: [], listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      append(...parts) { this.children.push(...parts); },
      appendChild(part) { this.children.push(part); },
      replaceChildren(...parts) { this.children = [...parts]; },
      setAttribute() {},
      click() { downloads.push(this.download || "click"); },
      remove() {}
    };
  }
  const document = {
    addEventListener(type, fn) { if (type === "DOMContentLoaded") ready = fn; },
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); },
    createElement() { return makeNode(); },
    querySelector() { return { value: "hookA", checked: true }; },
    querySelectorAll() { return []; },
    body: makeNode()
  };
  const fakeUrl = { createObjectURL() { return "blob:unit-test"; }, revokeObjectURL() {} };
  runInNewContext(script, {
    document,
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    URL: fakeUrl, Blob, Date, navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true, setTimeout: () => {}, console
  });
  assert.ok(ready, "DOMContentLoaded registered");
  ready();
  return { nodes, storage, downloads, get(id) { return document.getElementById(id); } };
}

function responseHarness() {
  return {
    status: null, headers: {}, body: null,
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; }
  };
}

test("Creator Studio is self-contained and isolated from external services", () => {
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /MediaForge Creator Studio/);
  assert.match(page, /Nenhum job será enviado à fila nesta etapa/);
  assert.match(script, /mediaforge_creator_studio_v1/);
  assert.doesNotMatch(script, /(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\()/);
  assert.doesNotMatch(page, /salevo\.site|plugins_6af35b6c46648191924c063620fe6e91/i);
  assert.match(dashboard, /href="\/studio"/);
});

test("builds five timed storyboard scenes and exports a JSON draft locally", () => {
  const h = harness();
  h.get("title").value = "Ilhas Diomedes";
  h.get("topic").value = "Uma curiosidade sobre as Ilhas Diomedes";
  h.get("duration").value = "60";
  h.get("brief-form").listeners.input();
  h.get("suggest-hooks").listeners.click();
  assert.match(h.get("hookA").value, /Ilhas Diomedes/);
  h.get("generate-scenes").listeners.click();
  const raw = h.storage.get("mediaforge_creator_studio_v1");
  assert.ok(raw, "draft saved locally");
  const doc = JSON.parse(raw);
  assert.equal(doc.scenes.length, 5);
  assert.equal(doc.scenes[0].start, 0);
  assert.equal(doc.scenes[0].end, 3);
  assert.equal(doc.scenes.at(-1).end, 60);
  assert.equal(h.get("scene-list").children.length, 5);
  h.get("download-json").listeners.click();
  assert.deepEqual(h.downloads, ["ilhas-diomedes.json"]);
});

test("requires an authenticated MediaForge session for studio and assets", async () => {
  const unauth = responseHarness();
  await handleStudio({
    request: { method: "GET", url: "/studio", headers: {} },
    response: unauth,
    isAdminSession: async () => false
  });
  assert.equal(unauth.status, 303);
  assert.equal(unauth.headers.location, "/dashboard");

  const auth = responseHarness();
  await handleStudio({
    request: { method: "GET", url: "/studio/app.js", headers: {} },
    response: auth,
    isAdminSession: async () => true
  });
  assert.equal(auth.status, 200);
  assert.match(auth.headers["content-type"], /javascript/);
  assert.match(auth.headers["content-security-policy"], /connect-src 'none'/);
  assert.match(String(auth.body), /mediaforge_creator_studio_v1/);
});

test("unknown paths and methods are rejected", async () => {
  const missing = responseHarness();
  await handleStudio({
    request: { method: "GET", url: "/studio/secret.txt", headers: {} },
    response: missing,
    isAdminSession: async () => true
  });
  assert.equal(missing.status, 404);
  const method = responseHarness();
  await handleStudio({
    request: { method: "POST", url: "/studio", headers: {} },
    response: method,
    isAdminSession: async () => true
  });
  assert.equal(method.status, 405);
});
