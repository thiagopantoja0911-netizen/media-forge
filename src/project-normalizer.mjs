import { MAX_PROJECT_BYTES, MAX_PROJECT_FILES } from "./job-schema.mjs";

function bytesOf(file) {
  if (typeof file.content === "string") return Buffer.byteLength(file.content, "utf8");
  if (typeof file.contentBase64 === "string") return Buffer.from(file.contentBase64, "base64").byteLength;
  return 0;
}
function textOf(file) {
  if (typeof file.content === "string") return file.content;
  if (typeof file.contentBase64 === "string" && /\.(html?|js|mjs|css)$/i.test(file.path || "")) {
    return Buffer.from(file.contentBase64, "base64").toString("utf8");
  }
  return null;
}

/**
 * Makes GSAP projects deterministic/offline by shipping the bundled local
 * library with the job and rewriting CDN references before project validation.
 */
export function attachLocalGsap(files, bundledGsap) {
  if (!Array.isArray(files)) return files;
  const output = files.map((file) => ({ ...file }));
  const index = output.findIndex((file) => file.path === "index.html");
  if (index < 0) return output;

  const needsGsap = output.some((file) => {
    const text = textOf(file);
    return typeof text === "string" && /\bgsap\b/i.test(text);
  });
  if (!needsGsap) return output;

  if (!Buffer.isBuffer(bundledGsap) || bundledGsap.length < 65_000) {
    const error = new Error("Bundled GSAP library is missing or incomplete");
    error.code = "GSAP_LIBRARY_UNAVAILABLE";
    throw error;
  }

  const indexText = textOf(output[index]);
  if (typeof indexText !== "string") {
    const error = new Error("index.html must be UTF-8 text when GSAP is used");
    error.code = "GSAP_INDEX_ENCODING_UNSUPPORTED";
    throw error;
  }

  const localTag = '<script src="assets/gsap.min.js"></script>';
  let html = indexText.replace(
    /<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*gsap(?:\.min)?\.js(?:\?[^"']*)?\1[^>]*>\s*<\/script>/gi,
    localTag
  );
  const alreadyReferencesLocal = /<script\b[^>]*\bsrc\s*=\s*(["'])assets\/gsap\.min\.js(?:\?[^"']*)?\1[^>]*>/i.test(html);
  if (!alreadyReferencesLocal) {
    if (/<\/head\s*>/i.test(html)) html = html.replace(/<\/head\s*>/i, localTag + "</head>");
    else if (/<script\b/i.test(html)) html = html.replace(/<script\b/i, localTag + "<script");
    else html += localTag;
  }
  output[index] = { path: "index.html", content: html };

  const hasAsset = output.some((file) => file.path === "assets/gsap.min.js");
  if (!hasAsset) {
    if (output.length >= MAX_PROJECT_FILES) {
      const error = new Error("Project file count exceeds limit after adding bundled GSAP");
      error.code = "PROJECT_FILE_LIMIT_WITH_GSAP";
      throw error;
    }
    const total = output.reduce((sum, file) => sum + bytesOf(file), 0);
    if (total + bundledGsap.length > MAX_PROJECT_BYTES) {
      const error = new Error("Project exceeds size limit after adding bundled GSAP");
      error.code = "PROJECT_TOO_LARGE_WITH_GSAP";
      throw error;
    }
    output.push({ path: "assets/gsap.min.js", content: bundledGsap.toString("utf8") });
  }
  return output;
}
