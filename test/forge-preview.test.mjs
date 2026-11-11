import test from "node:test";
import assert from "node:assert/strict";
import { handleStudio } from "../src/studio.mjs";
import { handleStudioApi } from "../src/studio-api.mjs";

function response() {
  return {
    status: null, headers: {}, body: "",
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = body; }
  };
}

test("staging permits only read-only Forge Midjourney preview on its exact hostname", async () => {
  const old = process.env.MEDIAFORGE_STAGING_PREVIEW;
  process.env.MEDIAFORGE_STAGING_PREVIEW = "true";
  try {
    const preview = response();
    await handleStudio({
      request: { method: "GET", url: "/studio", headers: { host: "forge-preview.salevo.site" } },
      response: preview, isAdminSession: async () => false
    });
    assert.equal(preview.status, 200);
    assert.match(String(preview.body), /PRÉVIA ISOLADA DO FORGE MIDJOURNEY/);
    assert.match(String(preview.body), /id="build-composition" disabled/);
    assert.match(preview.headers["content-security-policy"], /default-src 'none'/);

    const asset = response();
    await handleStudio({
      request: { method: "GET", url: "/studio/app.js", headers: { host: "forge-preview.salevo.site" } },
      response: asset, isAdminSession: async () => false
    });
    assert.equal(asset.status, 200);

    const prod = response();
    await handleStudio({
      request: { method: "GET", url: "/studio", headers: { host: "mediaforge.salevo.site" } },
      response: prod, isAdminSession: async () => false
    });
    assert.equal(prod.status, 303);

    const unexpected = response();
    await handleStudio({
      request: { method: "GET", url: "/studio/secret.txt", headers: { host: "forge-preview.salevo.site" } },
      response: unexpected, isAdminSession: async () => false
    });
    assert.equal(unexpected.status, 404);

    let bodyParsed = false;
    const compose = response();
    const intercepted = await handleStudioApi({
      request: {
        method: "POST", url: "/api/studio/compose",
        headers: { host: "forge-preview.salevo.site", "content-type": "application/json" }
      },
      response: compose,
      parseBody: async () => { bodyParsed = true; return {}; },
      isAdminSession: async () => false
    });
    assert.equal(intercepted, true);
    assert.equal(compose.status, 401);
    assert.equal(bodyParsed, false);
  } finally {
    if (old === undefined) delete process.env.MEDIAFORGE_STAGING_PREVIEW;
    else process.env.MEDIAFORGE_STAGING_PREVIEW = old;
  }
});
