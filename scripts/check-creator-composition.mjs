import { mkdtemp, mkdir, writeFile, rm, cp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";
import { buildCreatorComposition } from "../src/creator-composer.mjs";

const draft = {
  version: 1,
  title: "Creator Studio — composição de validação",
  topic: "Teste de storyboard em cinco cenas",
  duration: "30",
  intent: "curiosidade",
  tone: "investigativo",
  hookA: "O detalhe aparece no primeiro frame",
  hookB: "Você percebeu isso?",
  hookC: "O que parece simples muda tudo",
  selectedHook: "hookA",
  scenes: [
    { spoken: "O detalhe aparece no primeiro frame.", onscreen: "O detalhe aparece aqui", action: "Gancho visual", sound: "Impacto inicial" },
    { spoken: "Primeiro, entenda o contexto.", onscreen: "O contexto muda a história", action: "Aproximação", sound: "Ambiente" },
    { spoken: "Agora observe a prova.", onscreen: "A prova visual", action: "Transformação", sound: "Micro som" },
    { spoken: "A revelação conecta os pontos.", onscreen: "A revelação", action: "Mudança de perspectiva", sound: "Acento" },
    { spoken: "Agora a história faz sentido.", onscreen: "Agora faz sentido", action: "Payoff final", sound: "Fechamento" }
  ]
};

function runCli(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "hyperframes@0.9.25", ...args], {
      cwd,
      env: { ...process.env, CI: "1" },
      windowsHide: true,
      shell: process.platform === "win32"
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

const registryDirectory = await mkdtemp(join(tmpdir(), "mediaforge-transition-registry-"));
try {
  const installed = await runCli(registryDirectory, ["add", "hw-scribble-transition", "--json"]);
  process.stdout.write("Installed registry transition reference:\\n" + installed.stdout);
  if (installed.stderr) process.stderr.write(installed.stderr);
  if (installed.code !== 0) throw new Error("Could not install HyperFrames hw-scribble-transition reference");
} finally {
  await rm(registryDirectory, { recursive: true, force: true });
}

const directory = await mkdtemp(join(tmpdir(), "mediaforge-creator-check-"));
try {
  const catalog = await runCli(directory, ["catalog", "--query", "editorial paper wipe color flood transition", "--type", "block", "--tag", "transition", "--json"]);
  process.stdout.write("Transition registry search:\\n" + catalog.stdout);
  if (catalog.stderr) process.stderr.write(catalog.stderr);
  if (catalog.code !== 0) {
    throw new Error("HyperFrames transition catalog search failed with exit code " + catalog.code);
  }

  const built = await buildCreatorComposition(importSalevoStudioDraft(draft).manifest);
  for (const file of built.projectFiles) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  const result = await runCli(directory, ["check", "--json"]);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.code !== 0) {
    throw new Error("HyperFrames check failed with exit code " + result.code);
  }

  const snapshot = await runCli(directory, ["snapshot", "--review"]);
  process.stdout.write(snapshot.stdout);
  if (snapshot.stderr) process.stderr.write(snapshot.stderr);
  if (snapshot.code !== 0) {
    throw new Error("HyperFrames snapshot --review failed with exit code " + snapshot.code);
  }

  const sourceSnapshots = join(directory, ".hyperframes", "artifacts", "snapshots");
  const snapshotFiles = await readdir(sourceSnapshots, { recursive: true });
  if (!snapshotFiles.length) throw new Error("HyperFrames did not produce review snapshots");
  if (process.env.RUNNER_TEMP) {
    const targetSnapshots = join(process.env.RUNNER_TEMP, "mediaforge-creator-snapshots");
    await rm(targetSnapshots, { recursive: true, force: true });
    await cp(sourceSnapshots, targetSnapshots, { recursive: true });
    process.stdout.write("Review snapshots copied to CI artifact directory.\\n");
  }
  process.stdout.write("HyperFrames check and review snapshots completed. Audio/media readiness remains false by design.\\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
