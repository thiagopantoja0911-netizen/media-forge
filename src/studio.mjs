import { readFile } from "node:fs/promises";

const ASSETS = new Map([
  ["/studio", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/studio/studio.css", ["studio.css", "text/css; charset=utf-8"]]
]);

export async function handleStudio({ request, response, isAdminSession }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
    response.end();
    return;
  }

  const authenticated = await isAdminSession(request);
  // Only the dedicated preview hostname may show UI assets without a session.
  // The compose API and all admin endpoints remain authenticated.
  const previewMode = process.env.MEDIAFORGE_STAGING_PREVIEW === "true"
    && String(request.headers?.host ?? "").split(":")[0].toLowerCase() === "forge-preview.salevo.site";
  if (!authenticated && !previewMode) {
    response.writeHead(303, { location: "/dashboard", "cache-control": "no-store" });
    response.end();
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const asset = ASSETS.get(url.pathname);
  if (!asset) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("Not found");
    return;
  }

  const [file, contentType] = asset;
  let content = await readFile(new URL("../studio/" + file, import.meta.url));
  if (previewMode && !authenticated && file === "index.html") {
    const html = content.toString("utf8")
      .replace(
        '<main id="conteudo" class="container">',
        '<main id="conteudo" class="container"><aside role="note" style="margin:16px 0;padding:14px 18px;border:1px solid #e9bd61;border-radius:10px;color:#f5deb0;background:#242018"><strong>PRÉVIA ISOLADA DO FORGE MIDJOURNEY</strong> — Navegue, edite o roteiro e exporte os dados locais. Esta é a área antiga de rascunhos. Para levar seu projeto ao domínio principal, clique em <b>Baixar JSON</b> no final da página e depois em <b>Importar JSON</b> no Studio autenticado de mediaforge.salevo.site. A geração de pacotes e a renderização permanecem disponíveis apenas no domínio principal.</aside>'
      )
      .replace('id="build-composition"', 'id="build-composition" disabled title="Indisponível nesta prévia sem login"');
    content = Buffer.from(html, "utf8");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(content);
}
