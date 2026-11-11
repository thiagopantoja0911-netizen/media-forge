#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { extractCreatorPackage } from "../src/creator-package.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Uso: node scripts/extract-creator-package.mjs <pacote.json> <pasta-destino-nova>");
  process.exitCode = 2;
} else {
  try {
    const info = await stat(input);
    if (!info.isFile() || info.size > 32 * 1024 * 1024) {
      throw new Error("O pacote precisa ser um arquivo JSON de até 32 MB.");
    }
    const bundle = JSON.parse(await readFile(input, "utf8"));
    const result = await extractCreatorPackage(bundle, output);
    process.stdout.write("Pacote extraído: " + result.fileCount + " arquivos em " + result.outputDirectory + "\n");
    if (!result.renderReady) {
      process.stdout.write("Atenção: este pacote ainda é somente para revisão; não está liberado para renderização.\n");
    }
  } catch (error) {
    console.error("Falha ao extrair pacote: " + error.message);
    process.exitCode = 1;
  }
}
