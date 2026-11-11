import { hashSecret, hashPassword, randomToken, readState, updateState, verifyPassword, verifySecret, createSession, verifySession } from "./state-store.mjs";
import { getTestCompositionFiles } from "./test-composition.mjs";

const SESSION_COOKIE = "mf_session";
const SESSION_TTL = 8 * 60 * 60;

const DASHBOARD_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MediaForge</title><style>
body{margin:0;background:#090a11;color:#f7f5ff;font:15px system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:28px 18px}.card{background:#151724;border:1px solid #303243;border-radius:16px;padding:22px;margin:14px 0}h1{margin:0 0 8px}h2{font-size:18px}p{color:#b8b9c8;line-height:1.5}input,button{font:inherit;padding:11px;border-radius:8px}input{display:block;width:100%;box-sizing:border-box;margin:8px 0 14px;background:#090b12;color:#fff;border:1px solid #44485d}button{border:0;background:#8f7bea;color:white;font-weight:700;cursor:pointer;margin:4px}.hidden{display:none}.row{display:flex;gap:10px;flex-wrap:wrap}.stat{padding:14px;background:#0f111b;border-radius:10px;min-width:190px}.mono{word-break:break-all;background:#090b12;padding:10px;border-radius:8px}.ok{color:#70e2c4}.error{color:#ff9a9a}</style><main>
<h1>MediaForge</h1><p>Orquestrador de criação e renderização de áudio e vídeo.</p>
<section id="setup" class="card hidden"><h2>Configuração inicial</h2><p>Defina a senha administrativa e use o código de configuração fornecido no ambiente.</p><form id="setupForm"><label>Código de configuração</label><input id="setupToken" type="password" required><label>Senha administrativa (mínimo 14 caracteres)</label><input id="setupPassword" type="password" minlength="14" required><button>Configurar</button></form><div id="setupOutput" class="mono hidden"></div></section>
<section id="login" class="card hidden"><h2>Entrar</h2><form id="loginForm"><label>Senha administrativa</label><input id="loginPassword" type="password" required><button>Entrar</button></form><p><a href="/admin-reset">Esqueci a senha administrativa</a></p></section>
<section id="dashboard" class="hidden"><div class="card"><h2>Forge Midjourney</h2><p>Planeje briefings, ganchos e storyboards. A renderização será conectada após a validação da composição HyperFrames.</p><a href="/studio" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#8f7bea;color:#fff;font-weight:700;text-decoration:none">Abrir Forge Midjourney</a></div><div class="row"><div class="stat">Worker: <strong id="worker"></strong></div><div class="stat">Jobs ativos: <strong id="jobs"></strong></div><div class="stat">MCP: <strong id="mcp"></strong></div></div>
<div class="card"><h2>Tokens</h2><button id="plugin">Gerar token MCP</button><button id="workerRotate">Gerar token Worker</button><div id="tokenOutput" class="mono hidden"></div></div>
<div class="card"><h2>Teste controlado</h2><p>O teste só cria o job; a renderização será executada quando o worker for iniciado.</p><button id="test">Criar job de teste</button><span id="testOutput"></span></div>
<div class="card"><button id="refresh">Atualizar</button><button id="logout">Sair</button></div></section>
<script>
const $=(id)=>document.getElementById(id); const show=(id,on=true)=>$(id).classList.toggle("hidden",!on); const msg=(id,text)=>$(id).textContent=text;
async function api(path,options={}){const r=await fetch(path,{headers:{"content-type":"application/json"},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Erro HTTP "+r.status);return d}
async function boot(){const s=await api("/api/setup/status");if(s.setupRequired){show("setup");return}const a=await api("/api/session");if(a.authenticated){show("dashboard");await refresh()}else show("login")}
$("setupForm").onsubmit=async(e)=>{e.preventDefault();try{const d=await api("/api/setup",{method:"POST",body:JSON.stringify({setup_token:$("setupToken").value,password:$("setupPassword").value})});show("setupOutput");msg("setupOutput","Guarde estes tokens agora. MCP: "+d.plugin_token+" | Worker: "+d.worker_token);show("setup",false);show("dashboard")}catch(x){msg("setupOutput",x.message);show("setupOutput")}};
$("loginForm").onsubmit=async(e)=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify({password:$("loginPassword").value})});show("login",false);show("dashboard");await refresh()}catch(x){alert(x.message)}};
async function refresh(){const d=await api("/api/pairing/status");msg("worker",d.worker_online?"online":"offline");msg("jobs",String(d.active_jobs));msg("mcp",d.plugin_configured?"configurado":"não configurado")}
$("refresh").onclick=refresh;
$("logout").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"});location.reload()};
$("plugin").onclick=async()=>{const d=await api("/api/plugin/rotate",{method:"POST",body:"{}"});show("tokenOutput");msg("tokenOutput","Token MCP: "+d.plugin_token)};
$("workerRotate").onclick=async()=>{const d=await api("/api/worker/rotate",{method:"POST",body:"{}"});show("tokenOutput");msg("tokenOutput","Token Worker: "+d.worker_token)};
$("test").onclick=async()=>{const d=await api("/api/test-job",{method:"POST",body:"{}"});msg("testOutput"," Job criado: "+d.id)};
boot().catch((e)=>msg("login",e.message));
</script></main></html>`;

const RESET_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redefinir senha — MediaForge</title><style>
body{margin:0;background:#090a11;color:#f7f5ff;font:15px system-ui,sans-serif}main{max-width:520px;margin:8vh auto;padding:20px}.card{background:#151724;border:1px solid #303243;border-radius:16px;padding:24px}h1{margin-top:0}p{color:#b8b9c8;line-height:1.5}label{display:block;margin-top:14px}input,button{font:inherit;padding:12px;border-radius:8px;width:100%;box-sizing:border-box}input{margin:7px 0 14px;background:#090b12;color:#fff;border:1px solid #44485d}button{border:0;background:#8f7bea;color:white;font-weight:700;cursor:pointer}a{color:#b9aaff}#result{margin-top:14px;white-space:pre-wrap;overflow-wrap:anywhere}</style><main><section class="card"><h1>Redefinir senha administrativa</h1><p>Use o código de configuração <b>MEDIAFORGE_SETUP_TOKEN</b> da Hostinger. Ele autoriza esta redefinição e não é a senha da sua conta Hostinger.</p><form id="resetForm"><label>Código de configuração</label><input id="setupToken" type="password" autocomplete="off" required><label>Nova senha (mínimo 14 caracteres)</label><input id="newPassword" type="password" minlength="14" maxlength="256" autocomplete="new-password" required><label>Confirme a nova senha</label><input id="confirmPassword" type="password" minlength="14" maxlength="256" autocomplete="new-password" required><button type="submit">Redefinir senha</button></form><p id="result" role="status"></p><p><a href="/dashboard">Voltar ao painel</a></p></section></main><script>
const form=document.getElementById("resetForm"),result=document.getElementById("result");
form.addEventListener("submit",async event=>{event.preventDefault();result.textContent="";const token=document.getElementById("setupToken").value;const password=document.getElementById("newPassword").value;const confirm=document.getElementById("confirmPassword").value;if(password!==confirm){result.textContent="As senhas não coincidem.";return;}try{const response=await fetch("/api/admin/reset-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({setup_token:token,password})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error==="INVALID_RESET_TOKEN"?"Código de configuração inválido.":data.error==="PASSWORD_TOO_SHORT"?"A senha precisa ter pelo menos 14 caracteres.":data.error==="RESET_RATE_LIMITED"?"Muitas tentativas. Aguarde 15 minutos.":data.error||"Não foi possível redefinir a senha.");result.textContent="Senha redefinida. Você já está autenticado no painel. Os tokens do worker e do MCP foram preservados.";form.reset();setTimeout(()=>location.href="/dashboard",1200);}catch(error){result.textContent=error.message;}});
</script></html>`;

const resetAttempts = new Map();

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function html(response) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(DASHBOARD_HTML);
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie ?? "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export async function isAdminSession(request) {
  const state = await readState();
  const session = verifySession(cookies(request)[SESSION_COOKIE], state.settings.sessionSecret);
  return Boolean(session?.role === "admin");
}

function setSession(response, state) {
  const value = createSession({ role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, state.settings.sessionSecret);
  response.setHeader("set-cookie", SESSION_COOKIE + "=" + encodeURIComponent(value) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + SESSION_TTL);
}

function clearSession(response) {
  response.setHeader("set-cookie", SESSION_COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function requireAdmin(request, response) {
  if (await isAdminSession(request)) return true;
  send(response, 401, { error: "AUTH_REQUIRED" });
  return false;
}

export async function handlePanel({ request, response, parseBody, createJob, listJobs, rendererStatus }) {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;

  if (request.method === "GET" && (path === "/" || path === "/dashboard")) return html(response);
  if (request.method === "GET" && path === "/admin-reset") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(RESET_HTML);
    return;
  }

  if (request.method === "GET" && path === "/api/setup/status") {
    const state = await readState();
    return send(response, 200, {
      setupRequired: !state.settings.passwordHash,
      setupConfigured: Boolean(state.settings.passwordHash),
      setupAvailable: Boolean(process.env.MEDIAFORGE_SETUP_TOKEN) || process.env.MEDIAFORGE_ALLOW_LOCAL_SETUP === "true"
    });
  }

  if (request.method === "POST" && path === "/api/setup") {
    const body = await parseBody(request);
    const setupToken = String(body.setup_token ?? "");
    const password = String(body.password ?? "");
    const host = process.env.MEDIAFORGE_HOST ?? "127.0.0.1";
    const localAllowed = ["127.0.0.1", "localhost", "::1"].includes(host) && process.env.MEDIAFORGE_ALLOW_LOCAL_SETUP === "true";
    if (!localAllowed && (!process.env.MEDIAFORGE_SETUP_TOKEN || setupToken !== process.env.MEDIAFORGE_SETUP_TOKEN)) {
      return send(response, 403, { error: "SETUP_TOKEN_INVALID" });
    }
    if (password.length < 14) return send(response, 400, { error: "PASSWORD_TOO_SHORT" });
    const result = await updateState((state) => {
      if (state.settings.passwordHash) return null;
      const pluginToken = randomToken();
      const workerToken = randomToken();
      state.settings.passwordHash = hashPassword(password);
      state.settings.pluginTokenHash = hashSecret(pluginToken);
      state.settings.workerTokenHash = hashSecret(workerToken);
      return { pluginToken, workerToken };
    });
    if (!result) return send(response, 409, { error: "ALREADY_CONFIGURED" });
    const state = await readState();
    setSession(response, state);
    return send(response, 200, { ok: true, plugin_token: result.pluginToken, worker_token: result.workerToken });
  }

  if (request.method === "POST" && path === "/api/admin/reset-password") {
    const address = String(request.socket?.remoteAddress ?? "unknown");
    const now = Date.now();
    const attempts = resetAttempts.get(address);
    if (attempts && attempts.expiresAt > now && attempts.count >= 5) {
      return send(response, 429, { error: "RESET_RATE_LIMITED" });
    }
    const body = await parseBody(request);
    const setupToken = String(body.setup_token ?? "");
    const configuredToken = String(process.env.MEDIAFORGE_SETUP_TOKEN ?? "");
    if (!verifySecret(setupToken, hashSecret(configuredToken))) {
      const next = !attempts || attempts.expiresAt <= now
        ? { count: 1, expiresAt: now + 15 * 60 * 1000 }
        : { count: attempts.count + 1, expiresAt: attempts.expiresAt };
      resetAttempts.set(address, next);
      if (resetAttempts.size > 1000) resetAttempts.clear();
      return send(response, 403, { error: "INVALID_RESET_TOKEN" });
    }
    resetAttempts.delete(address);
    const password = String(body.password ?? "");
    if (password.length < 14 || password.length > 256) {
      return send(response, 400, { error: "PASSWORD_TOO_SHORT" });
    }
    const updated = await updateState((state) => {
      if (!state.settings.passwordHash) return false;
      state.settings.passwordHash = hashPassword(password);
      state.settings.sessionSecret = randomToken(32);
      return true;
    });
    if (!updated) return send(response, 409, { error: "ADMIN_NOT_CONFIGURED" });
    const state = await readState();
    setSession(response, state);
    return send(response, 200, { ok: true, authenticated: true });
  }

  if (request.method === "POST" && path === "/api/login") {
    const body = await parseBody(request);
    const state = await readState();
    if (!verifyPassword(body.password ?? "", state.settings.passwordHash)) return send(response, 401, { error: "INVALID_CREDENTIALS" });
    setSession(response, state);
    return send(response, 200, { authenticated: true });
  }

  if (request.method === "GET" && path === "/api/session") {
    return send(response, 200, { authenticated: await isAdminSession(request) });
  }

  if (request.method === "POST" && path === "/api/logout") {
    clearSession(response);
    return send(response, 200, { ok: true });
  }

  if (!(await requireAdmin(request, response))) return;

  if (request.method === "GET" && path === "/api/pairing/status") {
    const state = await readState();
    const status = await rendererStatus();
    const jobs = await listJobs(200);
    return send(response, 200, {
      worker_online: status.online,
      worker_last_seen: status.last_seen,
      plugin_configured: Boolean(state.settings.pluginTokenHash),
      active_jobs: jobs.filter((job) => ["queued", "processing"].includes(job.status)).length
    });
  }

  if (request.method === "GET" && path === "/api/jobs") return send(response, 200, { jobs: await listJobs(100) });

  if (request.method === "POST" && path === "/api/plugin/rotate") {
    const token = randomToken();
    await updateState((state) => { state.settings.pluginTokenHash = hashSecret(token); });
    return send(response, 200, { plugin_token: token });
  }

  if (request.method === "POST" && path === "/api/worker/rotate") {
    const token = randomToken();
    await updateState((state) => { state.settings.workerTokenHash = hashSecret(token); });
    return send(response, 200, { worker_token: token });
  }

  if (request.method === "POST" && path === "/api/test-job") {
    const job = await createJob({
      title: "Teste MediaForge",
      prompt: "Teste controlado de composição HyperFrames.",
      duration_seconds: 10,
      aspect_ratio: "16:9",
      resolution: "4k",
      fps: 60,
      quality: "high",
      project_files: await getTestCompositionFiles()
    });
    return send(response, 202, { id: job.id, status: job.status });
  }

  send(response, 404, { error: "NOT_FOUND" });
}
