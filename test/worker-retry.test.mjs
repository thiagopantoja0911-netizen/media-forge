import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceHtml = "<!doctype html><html><body><main>Retry test asset</main></body></html>";

async function unusedPort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test("worker can safely requeue only recoverable failed jobs and preserve project files", { timeout: 25_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mediaforge-worker-retry-"));
  const port = await unusedPort();
  const base = "http://127.0.0.1:" + port;
  const dataDir = join(workspace, "state");
  const projectsDir = join(dataDir, "projects");
  const mcpToken = "mcp-test-" + "x".repeat(40);
  const workerToken = "worker-test-" + "y".repeat(40);
  const child = spawn(process.execPath, [executable], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MEDIAFORGE_HOST: "127.0.0.1",
      MEDIAFORGE_PORT: String(port),
      MEDIAFORGE_DATA_DIR: dataDir,
      MEDIAFORGE_PROJECTS_DIR: projectsDir,
      MEDIAFORGE_REQUIRE_AUTH: "true",
      MEDIAFORGE_MCP_TOKEN: mcpToken,
      MEDIAFORGE_WORKER_TOKEN: workerToken,
      MEDIAFORGE_RENDERER: "hyperframes"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { logs += chunk.toString(); });
  }

  const createFailedJob = async (failureMessage) => {
    const response = await fetch(base + "/v1/jobs", {
      method: "POST",
      headers: {
        authorization: "Bearer " + mcpToken,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        prompt: "Test safe retry of an existing HyperFrames render",
        project: {
          title: "Retryable job",
          durationSeconds: 10,
          aspectRatio: "16:9",
          outputs: ["video"],
          renderer: "hyperframes",
          resolution: "landscape-4k",
          fps: 60,
          quality: "high",
          preflight: false
        },
        projectFiles: [{ path: "index.html", content: sourceHtml }],
        metadata: { kind: "retry-test" }
      })
    });
    assert.equal(response.status, 202, await response.text());
    const body = await response.json();
    const job = body.job;
    const jobPath = join(dataDir, "jobs", job.id + ".json");
    const stored = JSON.parse(await readFile(jobPath, "utf8"));
    stored.status = "failed";
    stored.error = { code: "REMOTE_RENDER_FAILED", message: failureMessage };
    await writeFile(jobPath, JSON.stringify(stored, null, 2) + "\n");
    return job;
  };

  try {
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(base + "/health", { signal: AbortSignal.timeout(1500) });
        if (response.status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "server did not start: " + logs.slice(-1200));

    const retryable = await createFailedJob(
      "[Render] Sequential screenshot capture stalled: no frame progress for 60000ms. Chrome stopped answering."
    );
    const retryResponse = await fetch(base + "/v1/worker/jobs/" + retryable.id + "/retry", {
      method: "POST",
      headers: { authorization: "Bearer " + workerToken, "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(retryResponse.status, 202, await retryResponse.text());
    const retryBody = await retryResponse.json();
    assert.equal(retryBody.ok, true);
    assert.equal(retryBody.alreadyRetried, false);
    assert.equal(retryBody.originalJobId, retryable.id);
    assert.equal(retryBody.job.status, "queued");
    assert.notEqual(retryBody.job.id, retryable.id);

    const cloned = JSON.parse(await readFile(join(dataDir, "jobs", retryBody.job.id + ".json"), "utf8"));
    assert.equal(cloned.metadata.retryOf, retryable.id);
    assert.equal(cloned.project.sourceDir, retryBody.job.id);
    assert.equal(cloned.attempts, 0);
    assert.equal(await readFile(join(projectsDir, retryBody.job.id, "index.html"), "utf8"), sourceHtml);

    const duplicate = await fetch(base + "/v1/worker/jobs/" + retryable.id + "/retry", {
      method: "POST",
      headers: { authorization: "Bearer " + workerToken, "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.alreadyRetried, true);
    assert.equal(duplicateBody.job.id, retryBody.job.id);

    const claim = await fetch(base + "/v1/worker/claim", {
      method: "POST",
      headers: { authorization: "Bearer " + workerToken, "content-type": "application/json" },
      body: JSON.stringify({ workerId: "retry-test-worker" })
    });
    assert.equal(claim.status, 200);
    const claimed = await claim.json();
    assert.equal(claimed.job.id, retryBody.job.id);

    const invalid = await createFailedJob(
      "missing_timeline_registry: Missing window.__timelines registration; gsap_css_transform_conflict."
    );
    const denied = await fetch(base + "/v1/worker/jobs/" + invalid.id + "/retry", {
      method: "POST",
      headers: { authorization: "Bearer " + workerToken, "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(denied.status, 422);
    assert.equal((await denied.json()).error, "JOB_FAILURE_NOT_RETRYABLE");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve)).catch(() => {});
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
