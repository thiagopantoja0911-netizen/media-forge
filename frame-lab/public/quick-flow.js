/* MediaForge Frame Lab: resumable Windows-only reconstruction test. */
(() => {
  "use strict";
  const STORAGE = "mediaforge.frame-lab.windows-flow.v1";
  const mount = document.getElementById("workspace");
  if (!mount) return;
  const panel = document.createElement("section");
  panel.className = "card";
  panel.id = "windowsTestPanel";
  panel.innerHTML = "\n    <div class=\"row between\">\n      <div><h2>Teste completo no seu Windows</h2>\n        <p class=\"muted\" style=\"margin:0\">Referência → análise de todos os quadros → projeto editável → worker HyperFrames do Windows → MP4 → comparação.</p>\n      </div><span class=\"badge\" id=\"quickWorker\">Verificando worker…</span>\n    </div>\n    <div class=\"uploadzone\" style=\"margin-top:14px\">\n      <label>Referência original (.mp4)<input id=\"quickReference\" type=\"file\" accept=\".mp4,video/mp4\"></label>\n      <label>Reconstrução editável (.zip)<input id=\"quickProjectZip\" type=\"file\" accept=\".zip,application/zip\"></label>\n      <div class=\"row\"><button class=\"primary\" id=\"quickStart\">Testar no Windows</button>\n      <button id=\"quickResume\" class=\"hidden\">Retomar teste</button></div>\n    </div>\n    <p id=\"quickStatus\" role=\"status\" style=\"white-space:pre-wrap;margin:12px 0 0;color:var(--cyan)\">Os dois arquivos são necessários. A renderização será feita exclusivamente no worker do Windows.</p>\n    <p id=\"quickProjectId\" class=\"muted\" style=\"font-size:11px;margin:6px 0 0\"></p>\n";
  const first = mount.querySelector("section.card");
  if (first) first.after(panel);
  else mount.prepend(panel);
  const el = id => document.getElementById(id);
  const base = id => "/frame-lab/api/projects/" + encodeURIComponent(id);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let active = false;
  let workerOnline = false;
  let state = null;
  function store(next) {
    state = { ...next, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch { /* private mode */ }
    el("quickProjectId").textContent = state.id ? "Projeto preservado: " + state.id : "";
    el("quickResume").classList.toggle("hidden", !state.id || state.stage === "done");
  }
  function recover() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (data && /^[a-f0-9]{32}$/.test(data.id) && typeof data.stage === "string") return data;
    } catch { /* invalid saved state */ }
    return null;
  }
  function message(value) { el("quickStatus").textContent = String(value); }
  function checkpoint(stage, note) {
    store({ ...state, stage });
    message(note);
  }
  async function request(path, options = {}) {
    const res = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || "HTTP " + res.status);
    return data;
  }
  async function health() {
    try {
      const status = await request("/frame-lab/api/worker-status");
      workerOnline = status.online === true && status.renderer === "hyperframes";
      el("quickWorker").textContent = workerOnline ? "Windows · conectado" : "Windows · offline";
      return workerOnline;
    } catch {
      workerOnline = false;
      el("quickWorker").textContent = "Worker indisponível";
      return false;
    }
  }
  function busy(on) {
    active = on;
    el("quickStart").disabled = on;
    el("quickResume").disabled = on;
  }
  async function upload(id, type, file) {
    if (!file) throw new Error(type === "reference" ? "Selecione novamente o MP4 original." : "Selecione novamente o ZIP editável.");
    if ((type === "reference" && !/\.mp4$/i.test(file.name)) ||
        (type === "project" && !/\.zip$/i.test(file.name))) throw new Error("Formato de arquivo inválido.");
    message("Transferindo " + file.name + " (" + (file.size / 1048576).toFixed(2) + " MiB) para o Frame Lab…");
    return request(base(id) + "/upload/" + type, {
      method: "POST", body: file,
      headers: { "content-type": type === "project" ? "application/zip" : "video/mp4" }
    });
  }
  async function waitAnalysis(id, label) {
    let idle = 0;
    while (true) {
      const s = await request(base(id) + "/status");
      const p = s.progress || {};
      message(label + " · " + (p.stage || p.status || "aguardando") +
        (p.processedFrames != null ? " · " + p.processedFrames + " quadros" : "") +
        (p.error ? " · " + p.error : ""));
      if (p.status === "failed") throw new Error("Análise falhou: " + (p.error || "verifique o servidor"));
      if (s.hasReport && !s.running && p.status === "completed") return s;
      if (!s.running && (p.status === "waiting" || p.status === "queued") && ++idle >= 3) {
        if (!s.hasReference) throw new Error("Referência ausente. Selecione novamente o MP4.");
        await request(base(id) + "/analyze", { method: "POST" });
        idle = 0;
      } else if (s.running || p.status === "processing") idle = 0;
      await pause(2300);
    }
  }
  async function waitWindowsRender(id) {
    let missing = 0;
    while (true) {
      const r = await request(base(id) + "/render-job");
      const job = r.renderJob;
      if (!job && ++missing > 2) throw new Error("Job Windows não encontrado. O projeto foi preservado para retomar.");
      if (job) {
        message("Renderizando no Windows · " + job.status + " · " + (job.progress || 0) + "% · job " + job.id.slice(0, 12));
        if (job.status === "failed") throw new Error("Worker Windows falhou: " + (job.error?.message || "erro não especificado"));
        if (job.status === "completed") {
          if (!job.result?.artifactUploaded) throw new Error("Worker terminou, mas não devolveu o MP4 ao Frame Lab.");
          return job;
        }
      }
      await pause(3400);
    }
  }
  async function ensureCompare(id) {
    const s = await request(base(id) + "/status");
    if (s.running || ["queued", "processing"].includes(s.progress?.status)) return;
    if (s.progress?.status === "completed" && s.hasReport) {
      const report = await request(base(id) + "/report");
      if (Array.isArray(report.comparison) && report.comparison.length > 0) return;
    }
    try { await request(base(id) + "/compare", { method: "POST" }); }
    catch (e) { if (!/Another full-frame analysis is running|Analysis running/i.test(e.message)) throw e; }
  }
  async function finish(id) {
    const report = await request(base(id) + "/report");
    const frames = report.reference?.frameCount || 0;
    const pairs = report.comparison?.length || 0;
    if (!frames || pairs !== frames) throw new Error("Comparação incompleta: " + pairs + "/" + frames + " quadros.");
    checkpoint("done", "Concluído no Windows · " + pairs + "/" + frames + " quadros comparados. Revise as diferenças visuais; não foi declarada identidade automática.");
    history.replaceState(null, "", "/frame-lab?project=" + encodeURIComponent(id));
    // The existing inspector loads the final comparison using the persisted URL.
    setTimeout(() => location.reload(), 800);
  }
  async function continueFlow() {
    const id = state.id;
    if (state.stage === "upload-reference") {
      const s = await request(base(id) + "/status");
      if (!s.hasReference) await upload(id, "reference", el("quickReference").files[0]);
      checkpoint("upload-project", "Referência recebida. Preparando ZIP editável.");
    }
    if (state.stage === "upload-project") {
      const s = await request(base(id) + "/status");
      if (!s.hasProject) await upload(id, "project", el("quickProjectZip").files[0]);
      checkpoint("analyzing", "Analisando cada quadro, sem pular frames…");
      await request(base(id) + "/analyze", { method: "POST" });
    }
    if (state.stage === "analyzing") {
      await waitAnalysis(id, "Análise de referência");
      checkpoint("rendering", "Análise concluída. Preparando fila do Windows.");
    }
    if (state.stage === "rendering") {
      const existing = await request(base(id) + "/render-job");
      if (!existing.renderJob) {
        if (!(await health())) throw new Error("Worker Windows offline. Projeto salvo; ligue o worker e clique Retomar teste.");
        const submitted = await request(base(id) + "/render-job", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmRender: true, quality: "standard" })
        });
        message("Job Windows " + submitted.jobId.slice(0, 12) + " criado. Monitorando…");
      }
      await waitWindowsRender(id);
      checkpoint("comparing", "MP4 devolvido pelo Windows. Validando todos os quadros no Frame Lab.");
    }
    if (state.stage === "comparing") {
      await ensureCompare(id);
      await waitAnalysis(id, "Comparação automática");
      await finish(id);
    }
  }
  async function resume() {
    if (active || !state?.id || state.stage === "done") return;
    busy(true);
    try { await continueFlow(); }
    catch (e) { message("Teste interrompido na etapa '" + state.stage + "': " + e.message + "\nO projeto está salvo. Corrija o problema e clique Retomar teste."); }
    finally { busy(false); }
  }
  el("quickStart").addEventListener("click", async () => {
    if (active) return;
    const reference = el("quickReference").files[0], zip = el("quickProjectZip").files[0];
    if (!reference || !zip) return message("Selecione o MP4 original e o ZIP editável antes de iniciar.");
    if (state?.id && state.stage !== "done") return message("Já existe um projeto interrompido. Use Retomar teste, sem criar outro.");
    if (!(await health())) return message("Worker Windows offline. Inicie o worker no computador antes de testar.");
    if (!window.confirm("Confirmar análise e renderização do projeto no worker HyperFrames do seu computador Windows?")) return;
    busy(true);
    try {
      const created = await request("/frame-lab/api/projects", { method: "POST" });
      store({ id: created.id, stage: "upload-reference" });
      await continueFlow();
    } catch (e) { message("Fluxo interrompido: " + e.message + "\nProgresso salvo; utilize Retomar teste."); }
    finally { busy(false); }
  });
  el("quickResume").addEventListener("click", () => resume());
  state = recover();
  if (state) store(state);
  health();
  setInterval(() => { if (!active) health(); }, 12000);
  if (state?.id && state.stage !== "done") {
    message("Teste salvo: etapa " + state.stage + ". Retome sem refazer as etapas anteriores.");
    if (["analyzing", "rendering", "comparing"].includes(state.stage)) resume();
  }
})();