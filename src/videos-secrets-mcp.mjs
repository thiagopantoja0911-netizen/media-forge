import { timingSafeEqual } from "node:crypto";

const SUPPORTED_PROTOCOLS = new Set(["2025-03-26", "2025-06-18", "2025-11-25"]);
const DEFAULT_PROTOCOL = "2025-06-18";

export const VIDEOS_SECRETS_TOOLS = [
  {
    name: "create_video",
    description: "Cria um job de vídeo no MediaForge usando o contrato compatível com Vídeos Secrets.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 160 },
        prompt: { type: "string", minLength: 8, maxLength: 5000 },
        duration_seconds: { type: "integer", minimum: 10, maximum: 3600 },
        aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
        resolution: { type: "string", description: "HyperFrames preset, e.g. portrait-4k" },
        fps: { type: "integer", minimum: 1, maximum: 240 },
        quality: { type: "string", enum: ["draft", "looks", "standard", "high", "delivery"] },
        workers: { type: "integer", minimum: 1, maximum: 64 },
        preflight: { type: "boolean" },
        project_files: {
          type: "array",
          minItems: 1,
          maxItems: 80,
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              encoding: { type: "string", enum: ["utf8", "base64"] }
            },
            required: ["path", "content"]
          }
        }
      },
      required: ["title", "prompt", "duration_seconds", "aspect_ratio", "project_files"]
    }
  },
  {
    name: "renderer_status",
    description: "Verifica o worker local e a fila do MediaForge.",
    inputSchema: { type: "object", additionalProperties: false }
  },
  {
    name: "list_videos",
    description: "Lista os jobs recentes de vídeo.",
    inputSchema: { type: "object", additionalProperties: false }
  },
  {
    name: "get_video",
    description: "Consulta o estado e o artefato de um job.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", pattern: "^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$" } },
      required: ["id"]
    }
  }
];

function requestToken(request) {
  const header = String(request.headers.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function requireBearer(request, authenticateBearer) {
  const token = requestToken(request);
  if (authenticateBearer) {
    const authenticated = await authenticateBearer(token);
    if (authenticated) return authenticated;
  }

  const expected = process.env.MEDIAFORGE_MCP_TOKEN ?? "";
  const host = process.env.MEDIAFORGE_HOST ?? "127.0.0.1";
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  const required = process.env.MEDIAFORGE_REQUIRE_AUTH === "true" || !loopback;

  if (!required) return { scopes: ["videos:read", "videos:write", "offline_access"], legacy: true };
  if (!expected) {
    const error = new Error("MEDIAFORGE_MCP_TOKEN is required when MCP authentication is enabled");
    error.code = "MCP_AUTH_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }
  if (!tokenMatches(token, expected)) {
    const error = new Error("MCP authentication required");
    error.code = "MCP_AUTH_REQUIRED";
    error.status = 401;
    throw error;
  }
  return { scopes: ["videos:read", "videos:write", "offline_access"], legacy: true };
}

function protocolVersion(request, params) {
  const requested = String(
    request.headers["mcp-protocol-version"]
      ?? params?.protocolVersion
      ?? DEFAULT_PROTOCOL
  );
  return SUPPORTED_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL;
}

function writeJson(response, status, body, version) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "mcp-protocol-version": version
  });
  response.end(JSON.stringify(body));
}

function writeResult(response, id, result, version) {
  writeJson(response, 200, { jsonrpc: "2.0", id, result }, version);
}

function writeError(response, id, code, message, status, version) {
  writeJson(response, status, {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  }, version);
}

function textResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    isError
  };
}

function toolByName(name) {
  return VIDEOS_SECRETS_TOOLS.find((tool) => tool.name === name) ?? null;
}

export async function handleVideosSecretsMcp({
  request,
  response,
  parseBody,
  createJob,
  listJobs,
  getJob,
  rendererStatus,
  authenticateBearer
}) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, MCP-Protocol-Version",
      "access-control-allow-methods": "POST, OPTIONS"
    });
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, OPTIONS" });
    response.end();
    return;
  }

  let body;
  let auth;
  try {
    body = await parseBody(request);
    auth = await requireBearer(request, authenticateBearer);
  } catch (error) {
    const status = error.status ?? 400;
    const version = DEFAULT_PROTOCOL;
    if (status === 401) {
      response.setHeader("www-authenticate", 'Bearer resource_metadata="' + (process.env.MEDIAFORGE_OAUTH_ISSUER ?? "https://mediaforge.salevo.site").replace(/[/]$/, "") + '/.well-known/oauth-protected-resource/mcp", scope="videos:read videos:write"');
    }
    return writeError(response, body?.id ?? null, -32000, error.message, status, version);
  }

  const id = body?.id ?? null;
  const method = String(body?.method ?? "");
  const params = body?.params && typeof body.params === "object" ? body.params : {};
  const version = protocolVersion(request, params);

  try {
    if (method === "initialize") {
      return writeResult(response, id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mediaforge", version: "0.2.0" }
      }, version);
    }

    if (method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }

    if (method === "tools/list" || method === "server/discover") {
      return writeResult(response, id, { tools: VIDEOS_SECRETS_TOOLS }, version);
    }

    if (method !== "tools/call") {
      return writeError(response, id, -32601, "Method not found", 404, version);
    }

    const name = String(params.name ?? "");
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    if (!toolByName(name)) {
      return writeError(response, id, -32602, "Unknown tool", 400, version);
    }

    if (name === "create_video") {
      if (!auth.scopes.includes("videos:write")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const job = await createJob({
        title: args.title,
        prompt: args.prompt,
        duration_seconds: args.duration_seconds,
        aspect_ratio: args.aspect_ratio,
        resolution: args.resolution ?? (args.aspect_ratio === "16:9" ? "landscape-4k" : args.aspect_ratio === "1:1" ? "square-4k" : "portrait-4k"),
        fps: args.fps ?? 60,
        quality: args.quality ?? "high",
        workers: args.workers,
        preflight: args.preflight ?? true,
        project_files: args.project_files
      });
      return writeResult(response, id, textResult({
        id: job.id,
        status: job.status,
        message: "Vídeo adicionado à fila do MediaForge."
      }), version);
    }

    if (name === "renderer_status") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      return writeResult(response, id, textResult(await rendererStatus()), version);
    }

    if (name === "list_videos") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      return writeResult(response, id, textResult({ jobs: await listJobs(30) }), version);
    }

    if (name === "get_video") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const job = await getJob(String(args.id ?? ""));
      if (!job) return writeResult(response, id, textResult("Trabalho não encontrado.", true), version);
      return writeResult(response, id, textResult({ job }), version);
    }

    return writeError(response, id, -32602, "Unsupported tool", 400, version);
  } catch (error) {
    const status = error.status ?? 400;
    if (status === 401) response.setHeader("www-authenticate", 'Bearer resource_metadata="' + (process.env.MEDIAFORGE_OAUTH_ISSUER ?? "https://mediaforge.salevo.site").replace(/[/]$/, "") + '/.well-known/oauth-protected-resource/mcp", scope="videos:read videos:write"');
    return writeError(response, id, -32603, error.message, status, version);
  }
}
