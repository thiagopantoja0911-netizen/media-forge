#!/usr/bin/env node
// Converte um JSON exportado de video.salevo.site/studio/ sem enviar dados à rede.
import { readFile, stat } from "node:fs/promises";
import { importSalevoStudioDraft } from "../src/legacy-studio.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/import-salevo-studio.mjs <rascunho.json> > job-planejamento.json");
  process.exitCode = 2;
} else {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 100_000) {
      throw new Error("O arquivo precisa ser um JSON de até 100 KB.");
    }
    const raw = JSON.parse(await readFile(file, "utf8"));
    const result = importSalevoStudioDraft(raw);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    // Não imprimir o conteúdo do rascunho nem informações privadas em caso de falha.
    console.error("Não foi possível importar o projeto: " +
      (error instanceof SyntaxError ? "JSON inválido." : error.message));
    process.exitCode = 1;
  }
}
