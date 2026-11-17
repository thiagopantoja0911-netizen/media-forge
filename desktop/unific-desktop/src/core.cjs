'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const API_BASE = 'https://unificmedia.salevo.site';
const TASK_NAME = 'MediaForge Worker - Staging';
const FRESH_MS = 45_000;
const MAX_NOTES = 200;

function workerPath(env = process.env, exists = fs.existsSync) {
  const base = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const v2 = path.join(base, 'MediaForge-Staging-V2');
  const v1 = path.join(base, 'MediaForge-Staging');
  return exists(path.join(v2, 'desktop', 'run-worker.ps1')) ? v2 :
    exists(path.join(v1, 'desktop', 'run-worker.ps1')) ? v1 : v2;
}
function normalizeHealth(data, nowMs = Date.now()) {
  const worker = data && typeof data === 'object' ? data.worker : null;
  const seen = worker?.last_seen || null;
  const fresh = seen && Number.isFinite(Date.parse(seen)) && nowMs - Date.parse(seen) >= 0 && nowMs - Date.parse(seen) < FRESH_MS;
  return {
    api: data?.ok === true,
    worker: Boolean(fresh && worker?.online),
    queued: Math.max(0, Number(worker?.queued_jobs) || 0),
    processing: Math.max(0, Number(worker?.processing_jobs) || 0),
    renderer: String(worker?.renderer || 'hyperframes').slice(0, 40),
    lastSeen: seen,
    message: worker?.message || 'Sem heartbeat válido do worker'
  };
}
function describeNetworkFailure(error) {
  const code = error?.cause?.code || error?.code || '';
  const msg = String(error?.message || '').toLowerCase();
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Falha de DNS: confirme o endereço remoto.';
  if (code === 'ECONNREFUSED') return 'O servidor recusou a conexão.';
  if (code === 'ETIMEDOUT' || msg.includes('timeout') || msg.includes('abort')) return 'A API demorou mais que o limite de resposta.';
  return 'Falha de rede ao consultar o MediaForge.';
}
async function fetchHealth(fetchImpl = fetch, base = API_BASE, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(base + '/health', {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store'
    });
    const contentType = response.headers?.get('content-type') || '';
    if (!contentType.includes('application/json')) return { api: false, worker: false, error: `Resposta não JSON (HTTP ${response.status}). Possível proxy/WAF.`, queued: 0, processing: 0 };
    const json = await response.json();
    if (!response.ok) return { api: false, worker: false, error: `HTTP ${response.status}`, queued: 0, processing: 0 };
    return normalizeHealth(json);
  } catch (error) {
    return { api: false, worker: false, error: describeNetworkFailure(error), queued: 0, processing: 0 };
  } finally { clearTimeout(timer); }
}
function tailLog(dir, limit = 12) {
  const file = path.join(dir, '.mediaforge', 'logs', 'worker-session.log');
  try {
    const size = fs.statSync(file).size;
    const handle = fs.openSync(file, 'r');
    try {
      const bytes = Math.min(size, 32 * 1024);
      const buf = Buffer.alloc(bytes);
      fs.readSync(handle, buf, 0, bytes, size - bytes);
      return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-limit).map(x => x.slice(0, 300));
    } finally { fs.closeSync(handle); }
  } catch { return []; }
}
function sanitizeNote(input) {
  return String(input || '').trim().slice(0, 1200);
}
class MemoryStore {
  constructor(file) { this.file = file; }
  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data.notes) ? data.notes.filter(n => typeof n.text === 'string').slice(-MAX_NOTES) : [];
    } catch { return []; }
  }
  save(text) {
    const cleaned = sanitizeNote(text);
    if (!cleaned) throw new Error('Digite uma anotação.');
    const notes = [...this.read(), { text: cleaned, createdAt: new Date().toISOString() }].slice(-MAX_NOTES);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ version: 1, notes }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    return notes;
  }
}
function assistantReply(prompt, snapshot, notes) {
  const q = String(prompt || '').toLowerCase();
  if (/mem[oó]ria|anota|lembra|salv/.test(q)) return notes.length
    ? `Tenho ${notes.length} anotação(ões) salva(s) neste computador. A mais recente: ${notes.at(-1).text}`
    : 'Ainda não há anotações salvas. Use a seção Memória para registrar informações locais.';
  if (/process|fila|v[ií]deo|render/.test(q))
    return `Renderizador: ${snapshot.worker ? 'online' : 'offline'}. Fila: ${snapshot.queued || 0}; processando: ${snapshot.processing || 0}. ${snapshot.error || snapshot.message || ''}`;
  if (/erro|403|conex|api|hostinger|offline|worker/.test(q))
    return snapshot.api ? `A API responde, mas o worker está ${snapshot.worker ? 'online' : 'offline'}. Um HTTP 403 em POST pode ser causado por WAF/proxy; não reinicie em loop. Consulte os logs na seção Diagnóstico.` :
      `A API não está acessível. ${snapshot.error || 'Verifique DNS, internet e Hostinger.'}`;
  return 'Sou o assistente local da versão beta. Posso consultar status, fila e memória salva; respostas com IA externa ainda não estão configuradas.';
}
module.exports = { API_BASE, TASK_NAME, workerPath, normalizeHealth, describeNetworkFailure, fetchHealth, tailLog, MemoryStore, assistantReply, sanitizeNote };
