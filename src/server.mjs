import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateJob } from "./job-schema.mjs";

const host = process.env.MEDIAFORGE_HOST ?? "127.0.0.1";
const port = Number(process.env.MEDIAFORGE_PORT ?? 8787);
const dataDir = process.env.MEDIAFORGE_DATA_DIR ?? ".mediaforge";
const jobsDir = join(dataDir, "jobs");

await mkdir(jobsDir, { recursive: true });

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

async function parseBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error("request body too large");
  }
  return JSON.parse(raw || "{}");
}

async function saveJob(job) {
  await writeFile(join(jobsDir, job.id + ".json"), JSON.stringify(job, null, 2) + "\n");
}

async function loadJob(id) {
  return JSON.parse(await readFile(join(jobsDir, id + ".json"), "utf8"));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://" + (request.headers.host ?? "localhost"));
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/health") {
      return send(response, 200, {
        ok: true,
        service: "mediaforge-orchestrator",
        renderer: process.env.MEDIAFORGE_RENDERER ?? "dry-run"
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      const payload = await parseBody(request);
      const validation = validateJob(payload);
      if (!validation.ok) return send(response, 400, { ok: false, errors: validation.errors });

      const id = randomUUID();
      const inputProject = payload.project;
      const job = {
        id,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prompt: payload.prompt,
        project: {
          title: inputProject.title,
          durationSeconds: inputProject.durationSeconds ?? 15,
          aspectRatio: inputProject.aspectRatio ?? "9:16",
          outputs: inputProject.outputs ?? ["video"],
          renderer: inputProject.renderer ?? "hyperframes",
          sourceDir: inputProject.sourceDir ?? null,
          outputName: inputProject.outputName ?? null
        },
        voice: payload.voice ?? null,
        assets: payload.assets ?? [],
        metadata: payload.metadata ?? {}
      };
      await saveJob(job);
      return send(response, 202, { ok: true, job });
    }

    if (request.method === "GET" && parts[0] === "v1" && parts[1] === "jobs" && parts[2]) {
      const job = await loadJob(parts[2]);
      return send(response, 200, { ok: true, job });
    }

    return send(response, 404, { ok: false, error: "not_found" });
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : 400;
    return send(response, status, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  console.log("MediaForge listening on http://" + host + ":" + port);
});
