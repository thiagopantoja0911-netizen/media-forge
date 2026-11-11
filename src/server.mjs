import { createServer } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  MAX_PROJECT_BYTES,
  validateJob,
  validateProjectFiles,
  isSafeRelativePath
} from "./job-schema.mjs";
import { handleVideosSecretsMcp } from "./videos-secrets-mcp.mjs";
import { authenticateBearer, handleOAuth } from "./oauth.mjs";
import { handlePanel, isAdminSession } from "./panel.mjs";
import { handleRemoteWorker } from "./remote-worker-server.mjs";
import { attachLocalGsap } from "./project-normalizer.mjs";
import { readState } from "./state-store.mjs";
import { resolveStoragePath, mediaForgeDataDirectory } from "./storage-paths.mjs";

const host = process.env.MEDIAFORGE_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.MEDIAFORGE_PORT ?? process.env.PORT ?? 8787);
const dataDir = mediaForgeDataDirectory();
const jobsDir = join(dataDir, "jobs");
const workerStatusFile = join(dataDir, "worker-status.json");
const projectsRoot = resolveStoragePath(process.env.MEDIAFORGE_PROJECTS_DIR ?? join(dataDir, "projects"));
const JOB_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

await mkdir(jobsDir, { recursive: true });
await mkdir(projectsRoot, { recursive: true });
const bundledGsap = await readFile(new URL("../assets/gsap.min.js", import.meta.url));

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

async function parseBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw, "utf8") > MAX_PROJECT_BYTES + 2_000_000) {
      throw new Error("request body too large");
    }
  }
  return JSON.parse(raw || "{}");
}

async function readRawBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw, "utf8") > MAX_PROJECT_BYTES + 2_000_000) {
      throw new Error("request body too large");
    }
  }
  return raw;
}

function normalizeProjectFiles(files) {
  if (!Array.isArray(files)) return files;
  return files.map((file) => {
    if (file?.encoding === "base64") {
      return { path: file.path, contentBase64: file.content };
    }
    return { path: file?.path, content: file?.content };
  });
}

async function normalizePayload(input) {
  const incomingFiles = normalizeProjectFiles(input.projectFiles ?? input.project_files);
  const projectFiles = await Promise.resolve(attachLocalGsap(incomingFiles, bundledGsap));
  const project = input.project ?? {
    title: input.title,
    durationSeconds: input.durationSeconds ?? input.duration_seconds,
    aspectRatio: input.aspectRatio ?? input.aspect_ratio,
    outputs: ["video"],
    renderer: "hyperframes",
    outputName: input.outputName ?? input.output_name,
    resolution: input.resolution,
    fps: input.fps,
    quality: input.quality,
    workers: input.workers,
    browserGpu: input.browserGpu ?? input.browser_gpu,
    preflight: input.preflight
  };

  return {
    ...input,
    project,
    projectFiles
  };
}

function jobPath(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) {
    const error = new Error("invalid job id");
    error.code = "INVALID_JOB_ID";
    throw error;
  }
  return join(jobsDir, id + ".json");
}

async function saveJob(job) {
  await writeFile(jobPath(job.id), JSON.stringify(job, null, 2) + "\n");
}

async function loadJob(id) {
  return JSON.parse(await readFile(jobPath(id), "utf8"));
}

async function listJobs(limit = 50) {
  const names = (await readdir(jobsDir)).filter((name) => name.endsWith(".json") && JOB_ID_PATTERN.test(name.slice(0, -5)));
  const jobs = [];
  for (const name of names) {
    try {
      jobs.push(JSON.parse(await readFile(join(jobsDir, name), "utf8")));
    } catch {
      // Ignore a partially written or invalid job file; the next write will repair it.
    }
  }
  jobs.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return jobs.slice(0, limit);
}

async function createJob(rawPayload) {
  const payload = await normalizePayload(rawPayload);
  const validation = validateJob(payload);
  if (!validation.ok) {
    const error = new Error(validation.errors.join("; "));
    error.code = "INVALID_JOB";
    throw error;
  }

  const fileValidation = payload.projectFiles
    ? validateProjectFiles(payload.projectFiles)
    : { ok: true, errors: [], bytes: 0 };
  if (!fileValidation.ok) {
    const error = new Error(fileValidation.errors.join("; "));
    error.code = "INVALID_PROJECT";
    throw error;
  }

  const id = randomUUID().replaceAll("-", "");
  const inputProject = payload.project;
  const hasInlineFiles = Boolean(payload.projectFiles);
  const sourceDir = hasInlineFiles ? id : (inputProject.sourceDir ?? null);
  const job = {
    id,
    status: "queued",
    attempts: 0,
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prompt: payload.prompt,
    project: {
      title: inputProject.title,
      durationSeconds: inputProject.durationSeconds ?? 15,
      aspectRatio: inputProject.aspectRatio ?? "9:16",
      outputs: inputProject.outputs ?? ["video"],
      renderer: inputProject.renderer ?? "hyperframes",
      sourceDir,
      outputName: inputProject.outputName ?? null,
      resolution: inputProject.resolution ?? null,
      fps: inputProject.fps ?? null,
      quality: inputProject.quality ?? null,
      workers: inputProject.workers ?? null,
      browserGpu: inputProject.browserGpu ?? null,
      preflight: inputProject.preflight ?? true,
      inlineFiles: hasInlineFiles,
      fileCount: hasInlineFiles ? payload.projectFiles.length : 0,
      fileBytes: fileValidation.bytes
    },
    voice: payload.voice ?? null,
    assets: payload.assets ?? [],
    metadata: payload.metadata ?? {}
  };

  if (hasInlineFiles) await materializeProject(id, payload.projectFiles);
  await saveJob(job);
  return job;
}

async function materializeProject(jobId, files) {
  const root = resolve(projectsRoot, jobId);
  for (const file of files) {
    if (!isSafeRelativePath(file.path)) throw new Error("unsafe project file path");
    const target = resolve(root, file.path);
    const relativeTarget = target.slice(root.length);
    if (target !== root && !relativeTarget.startsWith("\\") && !relativeTarget.startsWith("/")) {
      throw new Error("project file escapes project root");
    }
    await mkdir(dirname(target), { recursive: true });
    const data = typeof file.content === "string"
      ? file.content
      : Buffer.from(file.contentBase64, "base64");
    await writeFile(target, data);
  }
  return root;
}

async function rendererStatus() {
  let worker = null;
  try {
    worker = JSON.parse(await readFile(workerStatusFile, "utf8"));
  } catch {
    // No heartbeat means the local worker is offline.
  }
  const lastSeen = worker?.lastSeen ?? null;
  const online = Boolean(lastSeen && Date.now() - Date.parse(lastSeen) < 45_000);
  const jobs = await listJobs(200);
  const queued = jobs.filter((job) => job.status === "queued").length;
  const processing = jobs.filter((job) => job.status === "processing").length;
  return {
    online,
    last_seen: lastSeen,
    queued_jobs: queued,
    processing_jobs: processing,
    renderer: worker?.renderer ?? process.env.MEDIAFORGE_RENDERER ?? "dry-run",
    message: online
      ? "Computador conectado e renderizador MediaForge ativo."
      : "Worker MediaForge offline. Ligue o computador e inicie o worker."
  };
}

function sameToken(actual, expected) {
  if (!actual || !expected) return false;
  const a=Buffer.from(actual), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
async function requireApiScope(request, response, scope) {
  const token=String(request.headers.authorization??"").match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||"";
  let identity=token?await authenticateBearer(token):null;
  const authState=await readState();
  const allowBootstrapToken=!authState.settings.pluginTokenHash || process.env.MEDIAFORGE_ALLOW_STATIC_MCP_TOKEN==="true";
  if(!identity && allowBootstrapToken && sameToken(token,process.env.MEDIAFORGE_MCP_TOKEN))
    identity={scopes:["videos:read","videos:write"]};
  const loopback=["127.0.0.1","localhost","::1"].includes(host);
  const required=process.env.MEDIAFORGE_REQUIRE_AUTH==="true" || !loopback;
  if(!required && !token)return true;
  if(!identity) {
    response.setHeader("www-authenticate","Bearer");
    send(response,401,{ok:false,error:"AUTH_REQUIRED"});return false;
  }
  if(!identity.scopes?.includes(scope)) {
    send(response,403,{ok:false,error:"INSUFFICIENT_SCOPE"});return false;
  }
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://" + (request.headers.host ?? "localhost"));
    const parts = url.pathname.split("/").filter(Boolean);
    if(await handleRemoteWorker({request,response,url,jobsDir,projectsRoot,workerStatusFile})) return;

    if (url.pathname === "/mcp") {
      return handleVideosSecretsMcp({
        request,
        response,
        parseBody,
        createJob,
        listJobs,
        getJob: async (id) => {
          try {
            return await loadJob(id);
          } catch (error) {
            if (error.code === "ENOENT" || error.code === "INVALID_JOB_ID") return null;
            throw error;
          }
        },
        rendererStatus,
        authenticateBearer
      });
    }

    if (url.pathname === "/.well-known/oauth-protected-resource"
      || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      return handleOAuth({ request, response, route: "resource", readRawBody, isAdminSession });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return handleOAuth({ request, response, route: "server", readRawBody, isAdminSession });
    }

    if (url.pathname === "/oauth/register"
      || url.pathname === "/oauth/authorize"
      || url.pathname === "/oauth/token") {
      return handleOAuth({
        request,
        response,
        route: url.pathname.split("/").filter(Boolean)[1],
        readRawBody,
        isAdminSession
      });
    }

    if (url.pathname === "/" || url.pathname === "/dashboard"
      || url.pathname.startsWith("/api/")) {
      return handlePanel({
        request,
        response,
        parseBody,
        createJob,
        listJobs,
        rendererStatus
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return send(response, 200, {
        ok: true,
        service: "mediaforge-orchestrator",
        renderer: process.env.MEDIAFORGE_RENDERER ?? "dry-run",
        worker: await rendererStatus()
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      if(!(await requireApiScope(request,response,"videos:write")))return;
      const job = await createJob(await parseBody(request));
      return send(response, 202, { ok: true, job });
    }

    if (request.method === "GET" && url.pathname === "/v1/jobs") {
      if(!(await requireApiScope(request,response,"videos:read")))return;
      return send(response, 200, { ok: true, jobs: await listJobs(100) });
    }

    if (request.method === "GET" && parts[0] === "v1" && parts[1] === "jobs" && parts[2]) {
      if(!(await requireApiScope(request,response,"videos:read")))return;
      const job = await loadJob(parts[2]);
      return send(response, 200, { ok: true, job });
    }

    return send(response, 404, { ok: false, error: "not_found" });
  } catch (error) {
    const status = error.status ?? (error.code === "ENOENT" ? 404 : 400);
    return send(response, status, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  console.log("MediaForge listening on http://" + host + ":" + port);
});
