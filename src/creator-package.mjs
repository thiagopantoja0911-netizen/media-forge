import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { validateProjectFiles, isSafeRelativePath } from "./job-schema.mjs";

export async function extractCreatorPackage(bundle, outputDirectory) {
  if (!bundle || typeof bundle !== "object" || !Array.isArray(bundle.projectFiles)) {
    throw new TypeError("Pacote Creator Studio inválido.");
  }
  const validation = validateProjectFiles(bundle.projectFiles);
  if (!validation.ok) throw new TypeError(validation.errors.join("; "));
  const root = resolve(outputDirectory);
  await mkdir(root, { recursive: false });
  try {
    for (const file of bundle.projectFiles) {
      if (!isSafeRelativePath(file.path) || file.path.includes("\\") || file.path === ".") {
        throw new TypeError("Caminho inseguro no pacote: " + file.path);
      }
      const target = resolve(root, file.path);
      if (target !== root && !target.startsWith(root + sep)) {
        throw new TypeError("Arquivo escapa da pasta de destino.");
      }
      await mkdir(dirname(target), { recursive: true });
      const bytes = typeof file.content === "string"
        ? Buffer.from(file.content, "utf8")
        : Buffer.from(file.contentBase64, "base64");
      await writeFile(target, bytes, { flag: "wx" });
    }
    return {
      outputDirectory: root,
      fileCount: bundle.projectFiles.length,
      bytes: validation.bytes,
      renderReady: bundle.readiness?.renderReady === true
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
