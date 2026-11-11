import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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

function runCheck(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "hyperframes@0.9.25", "check", "--json"], {
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

const directory = await mkdtemp(join(tmpdir(), "mediaforge-creator-check-"));
try {
  const built = await buildCreatorComposition(importSalevoStudioDraft(draft).manifest);
  for (const file of built.projectFiles) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  const result = await runCheck(directory);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.code !== 0) {
    throw new Error("HyperFrames check failed with exit code " + result.code);
  }
  process.stdout.write("\nHyperFrames check completed. Audio/media readiness remains false by design.\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
