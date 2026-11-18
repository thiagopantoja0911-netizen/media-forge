export function normalizeProjectFiles(files) {
  if (!Array.isArray(files)) return files;
  return files.map((file) => {
    if (file?.encoding === "base64" && typeof file.contentBase64 !== "string") {
      return { path: file?.path, contentBase64: file?.content };
    }
    const normalized = { path: file?.path };
    if (Object.hasOwn(file ?? {}, "content")) normalized.content = file.content;
    if (Object.hasOwn(file ?? {}, "contentBase64")) normalized.contentBase64 = file.contentBase64;
    return normalized;
  });
}
