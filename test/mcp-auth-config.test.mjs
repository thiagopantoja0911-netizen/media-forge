import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));

async function unusedPort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test("MCP without a legacy static token returns an OAuth 401 challenge, not a 500", { timeout: 20_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mediaforge-mcp-auth-"));
  const port = await unusedPort();
  const base = "http://127.0.0.1:" + port;
  const issuer = "https://unificmedia.salevo.site";
  const env = {
    ...process.env,
    NODE_ENV: "test",
    MEDIAFORGE_HOST: "127.0.0.1",
    MEDIAFORGE_PORT: String(port),
    MEDIAFORGE_DATA_DIR: join(workspace, "state"),
    MEDIAFORGE_PROJECTS_DIR: join(workspace, "projects"),
    MEDIAFORGE_REQUIRE_AUTH: "true",
    MEDIAFORGE_MCP_TOKEN: "",
    MEDIAFORGE_OAUTH_ISSUER: issuer
  };
  delete env.MEDIAFORGE_PLUGIN_TOKEN;
  const child = spawn(process.execPath, [executable], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { logs += chunk.toString(); });
  }

  try {
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const health = await fetch(base + "/health", { signal: AbortSignal.timeout(1500) });
        if (health.status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "server did not start: " + logs.slice(-1200));

    for (const authorization of [undefined, "Bearer invalid-token"]) {
      const response = await fetch(base + "/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          ...(authorization ? { authorization } : {})
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: { name: "auth-config-test", version: "1.0.0" },
            capabilities: {}
          }
        }),
        signal: AbortSignal.timeout(3000)
      });
      assert.equal(response.status, 401);
      assert.match(
        response.headers.get("www-authenticate") || "",
        new RegExp(issuer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/.well-known/oauth-protected-resource/mcp")
      );
      const body = await response.json();
      assert.equal(body.error.message, "MCP authentication required");
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve)).catch(() => {});
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
