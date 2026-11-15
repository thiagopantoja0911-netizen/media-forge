import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));

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

test("health reports the effective renderer and ignores stale worker heartbeats", { timeout: 20_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mediaforge-health-renderer-"));
  const dataDirectory = join(workspace, "state");
  await mkdir(dataDirectory, { recursive: true });
  const statusFile = join(dataDirectory, "worker-status.json");
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
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
      MEDIAFORGE_REQUIRE_AUTH: "false",
      MEDIAFORGE_ALLOW_LOCAL_SETUP: "true"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk).slice(0, 1000); });
  child.stderr.on("data", (chunk) => { output += String(chunk).slice(0, 1000); });
  const exited = new Promise((resolve) => child.once("exit", resolve));

  async function health() {
    const response = await fetch(base + "/health", {
      signal: AbortSignal.timeout(3000),
      cache: "no-store"
    });
    assert.equal(response.status, 200);
    return response.json();
  }

  try {
    let initial;
    for (let i = 0; i < 100; i += 1) {
      if (child.exitCode !== null) break;
      try {
        initial = await health();
        break;
      } catch {
        await sleep(100);
      }
    }
    assert.ok(initial, "server did not start: " + output.slice(-1200));
    assert.equal(initial.renderer, "dry-run");
    assert.equal(initial.worker.online, false);

    await writeFile(statusFile, JSON.stringify({
      lastSeen: new Date().toISOString(),
      renderer: "hyperframes"
    }));

    const online = await health();
    assert.equal(online.worker.online, true);
    assert.equal(online.worker.renderer, "hyperframes");
    assert.equal(online.renderer, "hyperframes");

    await writeFile(statusFile, JSON.stringify({
      lastSeen: new Date(Date.now() - 10 * 60_000).toISOString(),
      renderer: "hyperframes"
    }));

    const stale = await health();
    assert.equal(stale.worker.online, false);
    assert.equal(stale.renderer, "dry-run");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
