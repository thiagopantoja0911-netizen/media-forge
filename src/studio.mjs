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

  if (!(await isAdminSession(request))) {
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
  const content = await readFile(new URL("../studio/" + file, import.meta.url));
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
