import assert from "node:assert/strict";

const origin = "https://forge-preview.salevo.site";
async function request(path, options = {}) {
  return fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(6500), ...options });
}
async function waitForHealth() {
  let lastError = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const res = await request("/health");
      const body = await res.json();
      if (res.status === 200 && body.ok === true && body.service === "mediaforge-orchestrator") {
        console.log("Live health OK", { attempt, service: body.service, workerOnline: body.worker?.online });
        return;
      }
      lastError = "status=" + res.status + " body=" + JSON.stringify(body).slice(0, 180);
    } catch (error) {
      lastError = error.name + ": " + error.message;
    }
    console.log("Staging HTTPS not yet ready (" + attempt + "/18): " + lastError);
    if (attempt < 18) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error("Staging DNS/TLS/health probe failed: " + lastError);
}

await waitForHealth();
const studio = await request("/studio");
assert.equal(studio.status, 200, "public staging preview must be available");
const html = await studio.text();
assert.match(html, /Forge Midjourney/);
assert.match(html, /PRÉVIA ISOLADA DO FORGE MIDJOURNEY/);
assert.match(html, /id="build-composition" disabled/);
assert.match(studio.headers.get("content-security-policy") ?? "", /default-src 'none'/);

const js = await request("/studio/app.js");
assert.equal(js.status, 200);
assert.match(await js.text(), /mediaforge_creator_studio_v1/);

const session = await request("/api/session");
assert.equal(session.status, 200);
assert.equal((await session.json()).authenticated, false);

const unauthorized = await request("/api/studio/compose", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ version: 1, title: "No auth", scenes: [] })
});
assert.equal(unauthorized.status, 401);
assert.match(JSON.stringify(await unauthorized.json()), /AUTH_REQUIRED/);

const wrongMethod = await request("/studio", { method: "POST" });
assert.equal(wrongMethod.status, 405);
console.log("PASS: staging live Forge Midjourney preview, assets, session and compose security verified.");
