import { readFile } from "node:fs/promises";

const ASSETS = new Map([
  ["/studio", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/preview", ["index.html", "text/html; charset=utf-8"]],
  ["/studio/preview/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/studio/preview/studio.css", ["studio.css", "text/css; charset=utf-8"]],
  ["/studio/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/studio/studio.css", ["studio.css", "text/css; charset=utf-8"]]
]);

export async function handleStudio({ request, response, isAdminSession }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
    response.end();
    return;
  }

  const url = new URL(request.url, "http://localhost");
  // The consolidated preview is public and strictly limited to static assets.
  // /studio and its administrative endpoints remain session-protected.
  const publicPreview = url.pathname === "/studio/preview"
    || url.pathname === "/studio/preview/app.js"
    || url.pathname === "/studio/preview/studio.css";
  if (!publicPreview && !(await isAdminSession(request))) {
    response.writeHead(303, { location: "/dashboard", "cache-control": "no-store" });
    response.end();
    return;
  }
  const asset = ASSETS.get(url.pathname);
  if (!asset) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("Not found");
    return;
  }

  const [file, contentType] = asset;
  let content = await readFile(new URL("../studio/" + file, import.meta.url));
  if (url.pathname === "/studio/preview" && file === "index.html") {
    // Keep the staging UI, but remove server-side render/compose actions.
    const html = content.toString("utf8")
      .replace('href="/studio/studio.css"', 'href="/studio/preview/studio.css"')
      .replace('src="/studio/app.js"', 'src="/studio/preview/app.js"')
      .replace('<main id="conteudo" class="container">',
        '<main id="conteudo" class="container"><aside class="panel" role="note"><strong>PRÉVIA DO FORGE MIDJOURNEY</strong><p>Edite e exporte seu rascunho neste navegador. Para gerar pacotes ou renderizar, entre no Studio autenticado em /studio.</p></aside>')
      .replace('id="build-composition"', 'id="build-composition" disabled title="Use o Studio autenticado para gerar pacotes"')
      .replace('id="render-controlled"', 'id="render-controlled" disabled title="Use o Studio autenticado para renderizar"');
    content = Buffer.from(html, "utf8");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": publicPreview ? "noindex, nofollow" : "noindex",
    "content-security-policy": "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(content);
}
