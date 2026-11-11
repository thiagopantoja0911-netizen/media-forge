import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const draft = {
  version: 1,
  title: "Forge Midjourney HTTP smoke",
  topic: "Teste integrado de uma história curta",
  duration: "30",
  intent: "curiosidade",
  tone: "investigativo",
  selectedHook: "hookA",
  hookA: "O detalhe já começa agora",
  hookB: "Você já viu isso?",
  hookC: "Parece simples, mas não é",
  scenes: [
    ["Abertura", "O começo", "O gancho aparece", "Impacto"],
    ["Contexto", "O contexto", "A câmera aproxima", "Ambiente"],
    ["Prova", "A prova", "Uma transformação", "Tique"],
    ["Revelação", "A revelação", "Mudança de perspectiva", "Riser"],
    ["Fechamento", "O final", "Payoff", "Fade"]
  ].map(([spoken, onscreen, action, sound]) => ({ spoken, onscreen, action, sound }))
};

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("Forge Midjourney flows through real HTTP, session, composition export and no render jobs", { timeout: 40_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "forge-midjourney-http-"));
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const dataDirectory = join(workspace, "state");
  const child = spawn(process.execPath, [executable], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MEDIAFORGE_HOST: "127.0.0.1",
      MEDIAFORGE_PORT: String(port),
      MEDIAFORGE_DATA_DIR: dataDirectory,
      MEDIAFORGE_PROJECTS_DIR: join(dataDirectory, "projects"),
      MEDIAFORGE_RENDERER: "dry-run",
      MEDIAFORGE_ALLOW_LOCAL_SETUP: "true",
      MEDIAFORGE_REQUIRE_AUTH: "false",
      MEDIAFORGE_SETUP_TOKEN: "forge-midjourney-ci-local-only"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let serverOutput = "";
  child.stdout.on("data", (chunk) => { serverOutput += String(chunk).slice(0, 1500); });
  child.stderr.on("data", (chunk) => { serverOutput += String(chunk).slice(0, 1500); });
  const exited = new Promise((resolve) => child.once("exit", resolve));

  async function call(path, options = {}) {
    return fetch(base + path, { signal: AbortSignal.timeout(3500), redirect: "manual", ...options });
  }

  try {
    let ready = false;
    for (let i = 0; i < 90; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await call("/health");
        if (response.status === 200) {
          const health = await response.json();
          assert.equal(health.ok, true);
          assert.equal(health.worker.queued_jobs, 0);
          assert.equal(health.worker.processing_jobs, 0);
          ready = true;
          break;
        }
      } catch {
        // Startup is asynchronous; the next attempt uses the same isolated port.
      }
      await sleep(100);
    }
    assert.equal(ready, true, "local HTTP service did not start: " + serverOutput.slice(-1200));

    const before = await call("/studio");
    assert.equal(before.status, 303);
    assert.equal(before.headers.get("location"), "/dashboard");

    const unauthorized = await call("/api/studio/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft)
    });
    assert.equal(unauthorized.status, 401);

    const setup = await call("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup_token: "forge-midjourney-ci-local-only",
        password: "forge-ci-password-only-123"
      })
    });
    assert.equal(setup.status, 200, "setup HTTP code");
    const sessionCookie = setup.headers.get("set-cookie")?.split(";")[0];
    assert.match(sessionCookie ?? "", /^mf_session=/);

    const authHeaders = { cookie: sessionCookie };
    const session = await call("/api/session", { headers: authHeaders });
    assert.equal((await session.json()).authenticated, true);

    const page = await call("/studio", { headers: authHeaders });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Forge Midjourney/);

    const stylesheet = await call("/studio/studio.css", { headers: authHeaders });
    assert.equal(stylesheet.status, 200, "CSS must load from the authenticated studio route");
    assert.ok((stylesheet.headers.get("content-type") ?? "").includes("text/css"));
    const cssText = await stylesheet.text();
    assert.match(cssText, /--bg:#07090e/);
    assert.ok(cssText.includes(".workflow-bar"));

    const script = await call("/studio/app.js", { headers: authHeaders });
    assert.equal(script.status, 200);
    assert.match(await script.text(), /build-composition/);

    const foreign = await call("/api/studio/compose", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify(draft)
    });
    assert.equal(foreign.status, 403);

    const assembled = await call("/api/studio/compose", {
      method: "POST",
      headers: {
        ...authHeaders,
        host: "127.0.0.1:" + port,
        origin: base,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify(draft)
    });
    assert.equal(assembled.status, 200, "compose HTTP code");
    const pkg = await assembled.json();
    assert.equal(pkg.ok, true);
    assert.equal(pkg.project.renderer, "hyperframes");
    assert.equal(pkg.project.resolution, "portrait-4k");
    assert.equal(pkg.project.fps, 60);
    assert.equal(pkg.readiness.renderReady, false);
    assert.ok(pkg.projectFiles.find((file) => file.path === "index.html"));
    assert.ok(pkg.projectFiles.find((file) => file.path === "compositions/scene-01.html"));
    assert.ok(pkg.projectFiles.find((file) => file.path === "index.motion.json"));
    assert.ok(pkg.readiness.blockers.length > 0);
    assert.equal(pkg.job, undefined);
    assert.equal(pkg.jobId, undefined);
    assert.deepEqual(await readdir(join(dataDirectory, "jobs")), []);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
