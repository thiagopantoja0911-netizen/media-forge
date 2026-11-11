import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function jsonRequest(base, path, method = "GET", body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { response, data: await response.json().catch(() => ({})) };
}

test("setup-token password reset changes only admin password and invalidates old sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "mediaforge-admin-reset-"));
  const port = await unusedPort();
  const base = "http://127.0.0.1:" + port;
  const setupToken = "setup-" + "s".repeat(48);
  const workerToken = "worker-" + "w".repeat(48);
  const mcpToken = "mcp-" + "m".repeat(48);
  const server = spawn(process.execPath, ["src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      MEDIAFORGE_HOST: "127.0.0.1",
      MEDIAFORGE_PORT: String(port),
      MEDIAFORGE_DATA_DIR: root,
      MEDIAFORGE_PROJECTS_DIR: join(root, "projects"),
      MEDIAFORGE_REQUIRE_AUTH: "true",
      MEDIAFORGE_SETUP_TOKEN: setupToken,
      MEDIAFORGE_WORKER_TOKEN: workerToken,
      MEDIAFORGE_MCP_TOKEN: mcpToken
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  server.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  try {
    let started = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Server terminated: " + logs);
      try {
        const response = await fetch(base + "/health");
        if (response.ok) { started = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(started, true, "server started: " + logs);

    const page = await fetch(base + "/admin-reset");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /MEDIAFORGE_SETUP_TOKEN/);

    const setup = await jsonRequest(base, "/api/setup", "POST", {
      setup_token: setupToken,
      password: "Initial-Admin-Password-2026!"
    });
    assert.equal(setup.response.status, 200, JSON.stringify(setup.data));

    const denied = await jsonRequest(base, "/api/admin/reset-password", "POST", {
      setup_token: "wrong-token",
      password: "New-Admin-Password-2026!"
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.data.error, "INVALID_RESET_TOKEN");

    const tooShort = await jsonRequest(base, "/api/admin/reset-password", "POST", {
      setup_token: setupToken,
      password: "short"
    });
    assert.equal(tooShort.response.status, 400);
    assert.equal(tooShort.data.error, "PASSWORD_TOO_SHORT");

    const reset = await jsonRequest(base, "/api/admin/reset-password", "POST", {
      setup_token: setupToken,
      password: "New-Admin-Password-2026!"
    });
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.authenticated, true);
    const cookie = reset.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "new admin session cookie is returned");

    const oldLogin = await jsonRequest(base, "/api/login", "POST", {
      password: "Initial-Admin-Password-2026!"
    });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await jsonRequest(base, "/api/login", "POST", {
      password: "New-Admin-Password-2026!"
    });
    assert.equal(newLogin.response.status, 200);
    assert.equal(newLogin.data.authenticated, true);

    const adminStatus = await jsonRequest(base, "/api/pairing/status", "GET", undefined, {
      cookie
    });
    assert.equal(adminStatus.response.status, 200);

    const mcpStatus = await jsonRequest(base, "/v1/jobs", "GET", undefined, {
      authorization: "Bearer " + mcpToken
    });
    assert.equal(mcpStatus.response.status, 200);

    const workerClaim = await jsonRequest(base, "/v1/worker/claim", "POST", {
      workerId: "reset-test-worker"
    }, {
      authorization: "Bearer " + workerToken
    });
    assert.equal(workerClaim.response.status, 200);
  } finally {
    server.kill("SIGTERM");
    await rm(root, { recursive: true, force: true });
  }
});
