import { createHash, randomBytes } from "node:crypto";
import { hashSecret, randomToken, verifyPassword, verifySecret, readState, updateState } from "./state-store.mjs";

const SCOPES = ["videos:read", "videos:write", "offline_access"];

function issuer() {
  return (process.env.MEDIAFORGE_OAUTH_ISSUER ?? "").replace(/\/$/, "")
    || "http://" + (process.env.MEDIAFORGE_HOST ?? "127.0.0.1") + ":" + (process.env.MEDIAFORGE_PORT ?? "8787");
}

function resource() {
  return issuer() + "/mcp";
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function html(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache"
  });
  response.end(JSON.stringify(body));
}

function fail(response, error, status = 400) {
  return json(response, status, { error });
}

function page(response, title, body, status = 200) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  });
  response.end("<!doctype html><html lang='pt-BR'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"
    + html(title) + " — MediaForge</title><style>body{background:#0b1020;color:#f0f4ff;font:16px system-ui,sans-serif;margin:0;padding:28px}main{max-width:530px;margin:8vh auto;padding:30px;border:1px solid #334060;border-radius:16px;background:#141d32}h1{font-size:24px}p{line-height:1.6}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;border:1px solid #64748b;background:#0b1020;color:white}.button{margin-top:20px;padding:13px 18px;border:0;border-radius:8px;background:#91c7ff;color:#081323;font-weight:700;cursor:pointer}small{color:#bac5d9}code{word-break:break-all}</style><main><h1>"
    + html(title) + "</h1>" + body + "</main></html>");
}

function redirect(response, uri, values) {
  const target = new URL(uri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, value);
  }
  response.writeHead(302, { location: target.toString(), "cache-control": "no-store" });
  response.end();
}

function parseForm(raw) {
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function validScopes(value) {
  const scopes = [...new Set(String(value ?? "videos:read videos:write offline_access").trim().split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !SCOPES.includes(scope))) {
    const error = new Error("invalid_scope");
    error.code = "invalid_scope";
    throw error;
  }
  return scopes;
}

function validRedirect(uri) {
  if (typeof uri !== "string" || uri.length > 1200 || /[\x00-\x20\x7f]/.test(uri)) return false;
  let parsed;
  try { parsed = new URL(uri); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return ["chatgpt.com", "chat.openai.com", "auth.openai.com", "platform.openai.com"].includes(host)
    || host.endsWith(".chatgpt.com");
}

function cleanup(state) {
  const now = Math.floor(Date.now() / 1000);
  for (const bucket of ["requests", "codes", "access", "refresh"]) {
    for (const [key, value] of Object.entries(state.oauth[bucket] ?? {})) {
      if (!value || Number(value.expiresAt ?? 0) <= now) delete state.oauth[bucket][key];
    }
  }
  for (const [key, value] of Object.entries(state.oauth.limits ?? {})) {
    if (!value || Number(value.until ?? 0) < now) delete state.oauth.limits[key];
  }
}

function rateLimit(state, key, max, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const current = state.oauth.limits[key] ?? { count: 0, until: now + windowSeconds };
  if (current.until < now) {
    current.count = 0;
    current.until = now + windowSeconds;
  }
  current.count += 1;
  state.oauth.limits[key] = current;
  return current.count <= max;
}

function oauthTokenPair(state, clientId, scopes) {
  const access = randomToken();
  const refresh = randomToken();
  const expiresIn = 3600;
  state.oauth.access[hashSecret(access)] = {
    clientId, scopes, resource: resource(), expiresAt: Math.floor(Date.now() / 1000) + expiresIn
  };
  const result = { access_token: access, token_type: "Bearer", expires_in: expiresIn, scope: scopes.join(" ") };
  if (scopes.includes("offline_access")) {
    state.oauth.refresh[hashSecret(refresh)] = {
      clientId, scopes, resource: resource(), expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400
    };
    result.refresh_token = refresh;
  }
  return result;
}

export async function authenticateBearer(token) {
  if (!token || token.length > 200) return null;
  const state = await readState();
  if (verifySecret(token, state.settings.pluginTokenHash)) {
    return { scopes: ["videos:read", "videos:write", "offline_access"], legacy: true };
  }
  const item = state.oauth.access[hashSecret(token)];
  if (!item || item.resource !== resource() || Number(item.expiresAt ?? 0) <= Math.floor(Date.now() / 1000)) return null;
  return { scopes: item.scopes ?? [], legacy: false };
}

export async function handleOAuth({ request, response, route, readRawBody, isAdminSession }) {
  const method = request.method;
  const now = Math.floor(Date.now() / 1000);

  if (route === "resource" && method === "GET") {
    return json(response, 200, {
      resource: resource(),
      authorization_servers: [issuer()],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"]
    });
  }

  if (route === "server" && method === "GET") {
    return json(response, 200, {
      issuer: issuer(),
      authorization_endpoint: issuer() + "/oauth/authorize",
      token_endpoint: issuer() + "/oauth/token",
      registration_endpoint: issuer() + "/oauth/register",
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: SCOPES,
      client_id_metadata_document_supported: false
    });
  }

  if (route === "register" && method === "POST") {
    let body;
    try { body = JSON.parse(await readRawBody(request)); } catch { return fail(response, "invalid_client_metadata"); }
    const redirects = body.redirect_uris;
    if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 5 || redirects.some((uri) => !validRedirect(uri))) {
      return fail(response, "invalid_redirect_uri");
    }
    if ((body.token_endpoint_auth_method ?? "none") !== "none") return fail(response, "invalid_client_metadata");
    const clientId = "mf_" + randomToken(24);
    const name = String(body.client_name ?? "ChatGPT").slice(0, 100).trim() || "ChatGPT";
    const result = await updateState((state) => {
      cleanup(state);
      if (!rateLimit(state, "register", 25, 3600) || Object.keys(state.oauth.clients).length >= 300) return null;
      state.oauth.clients[clientId] = {
        redirectUris: [...new Set(redirects)],
        clientName: name,
        createdAt: now
      };
      return true;
    });
    if (!result) return fail(response, "temporarily_unavailable", 429);
    return json(response, 201, {
      client_id: clientId,
      client_name: name,
      redirect_uris: [...new Set(redirects)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    });
  }

  if (route === "authorize" && method === "GET") {
    const url = new URL(request.url, issuer());
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const challengeMethod = url.searchParams.get("code_challenge_method") ?? "";
    const requestedResource = url.searchParams.get("resource") ?? "";
    const stateParam = url.searchParams.get("state") ?? "";
    if (stateParam.length > 400 || clientId.length > 300 || challengeMethod !== "S256"
      || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || url.searchParams.get("response_type") !== "code"
      || requestedResource !== resource()) return fail(response, "invalid_request");
    let scopes;
    try { scopes = validScopes(url.searchParams.get("scope")); } catch { return fail(response, "invalid_scope"); }

    const transaction = randomToken();
    const client = await updateState((storage) => {
      cleanup(storage);
      const item = storage.oauth.clients[clientId];
      if (!item || !item.redirectUris.includes(redirectUri)) return null;
      storage.oauth.requests[hashSecret(transaction)] = {
        clientId, redirectUri, challenge, state: stateParam, scopes, expiresAt: now + 600
      };
      return item;
    });
    if (!client) return fail(response, "invalid_client", 401);
    const logged = await isAdminSession(request);
    const password = logged ? "" : "<label for='password'>Senha do painel MediaForge</label><input id='password' name='password' type='password' autocomplete='current-password' required>";
    return page(response, "Autorizar o ChatGPT",
      "<p><strong>" + html(client.clientName) + "</strong> solicita acesso ao MediaForge.</p>"
      + "<p>Destino: <code>" + html(new URL(redirectUri).hostname) + "</code></p>"
      + "<p>Permissões: " + html(scopes.join(", ")) + "</p>"
      + "<small>A permissão de escrita pode iniciar renderizações no computador conectado.</small>"
      + "<form action='/oauth/authorize' method='post'><input type='hidden' name='transaction' value='" + html(transaction) + "'>"
      + password + "<button class='button' type='submit' name='approve' value='yes'>Autorizar conexão</button></form>");
  }

  if (route === "authorize" && method === "POST") {
    const form = parseForm(await readRawBody(request));
    const transaction = form.transaction ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(transaction) || form.approve !== "yes") return fail(response, "invalid_request");
    const logged = await isAdminSession(request);
    const result = await updateState((storage) => {
      cleanup(storage);
      const requestItem = storage.oauth.requests[hashSecret(transaction)];
      if (!requestItem) return { error: "expired_or_invalid_request" };
      if (!logged && !verifyPassword(form.password ?? "", storage.settings.passwordHash)) return { error: "invalid_credentials" };
      const code = randomToken();
      storage.oauth.codes[hashSecret(code)] = {
        clientId: requestItem.clientId,
        redirectUri: requestItem.redirectUri,
        challenge: requestItem.challenge,
        scopes: requestItem.scopes,
        resource: resource(),
        expiresAt: now + 180
      };
      delete storage.oauth.requests[hashSecret(transaction)];
      return { redirectUri: requestItem.redirectUri, state: requestItem.state, code };
    });
    if (result.error) return page(response, "Autorização não concluída", "<p>Verifique a senha ou inicie novamente a conexão.</p>", 403);
    return redirect(response, result.redirectUri, { code: result.code, state: result.state });
  }

  if (route === "token" && method === "POST") {
    const form = parseForm(await readRawBody(request));
    const clientId = form.client_id ?? "";
    if ((form.resource ?? "") !== resource()) return fail(response, "invalid_target");
    if (form.grant_type === "authorization_code") {
      const verifier = form.code_verifier ?? "";
      if (verifier.length < 43 || verifier.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(verifier)) return fail(response, "invalid_grant");
      const challenge = b64url(createHash("sha256").update(verifier).digest());
      const result = await updateState((storage) => {
        cleanup(storage);
        const item = storage.oauth.codes[hashSecret(form.code ?? "")];
        if (!item || item.clientId !== clientId || item.redirectUri !== (form.redirect_uri ?? "")
          || item.resource !== resource() || item.challenge !== challenge) return null;
        delete storage.oauth.codes[hashSecret(form.code ?? "")];
        return oauthTokenPair(storage, clientId, item.scopes);
      });
      if (!result) return fail(response, "invalid_grant");
      return json(response, 200, result);
    }
    if (form.grant_type === "refresh_token") {
      const result = await updateState((storage) => {
        cleanup(storage);
        const key = hashSecret(form.refresh_token ?? "");
        const item = storage.oauth.refresh[key];
        if (!item || item.clientId !== clientId || item.resource !== resource()) return null;
        delete storage.oauth.refresh[key];
        return oauthTokenPair(storage, clientId, item.scopes);
      });
      if (!result) return fail(response, "invalid_grant");
      return json(response, 200, result);
    }
    return fail(response, "unsupported_grant_type");
  }

  return fail(response, "invalid_request", 405);
}
