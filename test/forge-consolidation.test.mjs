import test from "node:test";
import assert from "node:assert/strict";
import { handleStudio } from "../src/studio.mjs";

function response() {
  return { status: null, headers: {}, body: "",
    writeHead(code, headers = {}) { this.status = code; this.headers = headers; },
    end(body = "") { this.body = body; }
  };
}

async function call(url, authenticated = false, method = "GET") {
  const out = response();
  await handleStudio({
    request: { method, url, headers: { host: "mediaforge.salevo.site" } },
    response: out, isAdminSession: async () => authenticated
  });
  return out;
}

test("the single MediaForge domain exposes read-only preview without admin login", async () => {
  const preview = await call("/studio/preview");
  assert.equal(preview.status, 200);
  assert.match(String(preview.body), /PRÉVIA DO FORGE MIDJOURNEY/);
  assert.match(String(preview.body), /id="build-composition" disabled/);
  assert.match(String(preview.body), /id="render-controlled" disabled/);
  assert.match(String(preview.body), /href="\/studio\/preview\/studio.css"/);
  assert.match(String(preview.body), /src="\/studio\/preview\/app.js"/);
  assert.match(preview.headers["x-robots-tag"], /noindex/);
  assert.match(preview.headers["content-security-policy"], /connect-src 'self'/);

  const script = await call("/studio/preview/app.js");
  assert.equal(script.status, 200);
  assert.match(String(script.body), /mediaforge_creator_preview_v1/);
  const style = await call("/studio/preview/studio.css");
  assert.equal(style.status, 200);
});

test("production Studio and its original static assets remain protected", async () => {
  for (const path of ["/studio", "/studio/app.js", "/studio/studio.css"]) {
    const result = await call(path);
    assert.equal(result.status, 303);
    assert.equal(result.headers.location, "/dashboard");
  }
  assert.equal((await call("/studio", true)).status, 200);
  const missing = await call("/studio/preview/not-found");
  assert.equal(missing.status, 303);
  const post = await call("/studio/preview", false, "POST");
  assert.equal(post.status, 405);
});
