import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODERN = "2026-07-28";
const LEGACY = "2025-06-18";

async function unusedPort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test("OAuth-protected MCP discovers tools in both 2026 stateless and legacy protocols", async () => {
  const root = await mkdtemp(join(tmpdir(), "mediaforge-mcp-"));
  const port = await unusedPort();
  const base = "http://127.0.0.1:" + port;
  const token = "mcp-" + "x".repeat(48);
  const server = spawn(process.execPath, ["src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MEDIAFORGE_HOST: "127.0.0.1",
      MEDIAFORGE_PORT: String(port),
      MEDIAFORGE_DATA_DIR: root,
      MEDIAFORGE_PROJECTS_DIR: join(root, "projects"),
      MEDIAFORGE_RENDERER: "dry-run",
      MEDIAFORGE_REQUIRE_AUTH: "true",
      MEDIAFORGE_MCP_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", chunk => logs += chunk.toString());
  }
  const call = async (method, version, options = {}) => {
    const { authorized = true, id = method, params } = options;
    const modern = version === MODERN;
    const response = await fetch(base + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": version,
        ...(authorized ? { authorization: "Bearer " + token } : {}),
        ...(modern ? { "mcp-method": method } : {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: modern ? {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": MODERN,
            "io.modelcontextprotocol/clientInfo": { name: "ChatGPT", version: "1.0.0" },
            "io.modelcontextprotocol/clientCapabilities": {}
          }
        } : params
      })
    });
    const raw = await response.text();
    return { status: response.status, headers: response.headers, data: JSON.parse(raw) };
  };

  try {
    let started = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error("Server exited: " + logs);
      try {
        const response = await fetch(base + "/health");
        if (response.ok) { started = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(started, "Server did not start: " + logs);

    const denied = await call("server/discover", MODERN, { authorized: false });
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("www-authenticate") || "", /oauth-protected-resource\/mcp/);

    const discover = await call("server/discover", MODERN);
    assert.equal(discover.status, 200, JSON.stringify(discover.data));
    assert.equal(discover.data.id, "server/discover");
    assert.equal(discover.headers.get("mcp-protocol-version"), MODERN);
    const discovered = discover.data.result;
    assert.equal(discovered.resultType, "complete");
    assert.ok(discovered.supportedVersions.includes(MODERN));
    assert.deepEqual(discovered.capabilities.tools, { listChanged: false });
    assert.equal(discovered.cacheScope, "private");
    assert.equal(discovered.ttlMs, 0);
    assert.equal(discovered._meta["io.modelcontextprotocol/serverInfo"].name, "mediaforge");

    const modernList = await call("tools/list", MODERN);
    assert.equal(modernList.status, 200, JSON.stringify(modernList.data));
    assert.equal(modernList.data.result.resultType, "complete");
    assert.equal(modernList.data.result.cacheScope, "private");
    assert.equal(modernList.data.result.ttlMs, 0);
    assert.deepEqual(modernList.data.result.tools.map(tool => tool.name), [
      "create_video", "create_motion_video", "create_cinematic_3d", "renderer_status", "list_videos", "get_video"
    ]);
    for (const tool of modernList.data.result.tools) {
      assert.equal(tool.inputSchema.type, "object");
    }

    const modernCall = await call("tools/call", MODERN, {
      params: { name: "renderer_status", arguments: {} }
    });
    assert.equal(modernCall.status, 200, JSON.stringify(modernCall.data));
    assert.equal(modernCall.data.result.resultType, "complete");
    assert.equal(modernCall.data.result.content[0].type, "text");
    assert.equal(typeof JSON.parse(modernCall.data.result.content[0].text).online, "boolean");

    const legacyInit = await call("initialize", LEGACY, {
      params: {
        protocolVersion: LEGACY,
        clientInfo: { name: "legacy-test", version: "1.0.0" },
        capabilities: {}
      }
    });
    assert.equal(legacyInit.status, 200, JSON.stringify(legacyInit.data));
    assert.equal(legacyInit.data.result.protocolVersion, LEGACY);
    assert.equal(legacyInit.data.result.serverInfo.name, "mediaforge");

    const legacyList = await call("tools/list", LEGACY);
    assert.equal(legacyList.status, 200, JSON.stringify(legacyList.data));
    assert.equal(legacyList.data.result.tools.length, 5);
    assert.equal(legacyList.data.result.resultType, undefined);
  } finally {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve)).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
