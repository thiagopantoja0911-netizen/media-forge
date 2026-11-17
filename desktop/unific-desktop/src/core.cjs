'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const API_BASE = 'https://unificmedia.salevo.site';
const TASK_NAME = 'MediaForge Worker - Staging';
const FRESH_MS = 45_000;
const MAX_RECORDS = 300;
const TOPICS = Object.freeze([
  { id: 'marketing', label: 'Marketing', words: ['marketing','campanha','anuncio','anuncio','trafego','meta ads','publicidade','funil','pixel','audiencia','conversao'] },
  { id: 'comunicacao', label: 'Comunicação', words: ['comunicacao','mensagem','conversa','chat','linguagem','resposta','email','whatsapp','dialogo'] },
  { id: 'abordagens', label: 'Abordagens', words: ['abordagem','prospect','cliente','contato','proposta','empresa','negociacao','lead'] },
  { id: 'vendas', label: 'Vendas', words: ['venda','checkout','pagamento','oferta','preco','compra','faturamento','receita','pedido'] },
  { id: 'criativos', label: 'Criativos', words: ['criativo','video','imagem','design','roteiro','motion','narracao','render','hiperframe','hyperframes'] },
  { id: 'automacao', label: 'Automação', words: ['automacao','workflow','processo','robot','script','integra','agente','desktop','mcp'] },
  { id: 'operacao', label: 'Operação', words: ['servidor','hostinger','erro','api','worker','conexao','deploy','sistema','diagnostico','node'] },
  { id: 'aprendizado', label: 'Aprendizado', words: ['aprender','memoria','lembrar','estudo','conhecimento','professor','ensinar','ingles'] }
]);
const SEED_EDGES = [
  ['marketing','comunicacao'], ['marketing','abordagens'], ['marketing','vendas'], ['marketing','criativos'],
  ['comunicacao','abordagens'], ['abordagens','vendas'], ['criativos','automacao'],
  ['automacao','operacao'], ['operacao','aprendizado'], ['aprendizado','comunicacao']
];
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
    api: data?.ok === true, worker: Boolean(fresh && worker?.online),
    queued: Math.max(0, Number(worker?.queued_jobs) || 0),
    processing: Math.max(0, Number(worker?.processing_jobs) || 0),
    renderer: String(worker?.renderer || 'hyperframes').slice(0, 40),
    lastSeen: seen, message: worker?.message || 'Sem heartbeat válido do worker'
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
      signal: controller.signal, headers: { accept: 'application/json' },
      redirect: 'error', cache: 'no-store'
    });
    const contentType = response.headers?.get('content-type') || '';
    if (!contentType.includes('application/json')) return { api:false, worker:false, error:`Resposta não JSON (HTTP ${response.status}). Possível proxy/WAF.`, queued:0, processing:0 };
    const json = await response.json();
    if (!response.ok) return { api:false, worker:false, error:`HTTP ${response.status}`, queued:0, processing:0 };
    return normalizeHealth(json);
  } catch (error) { return { api:false, worker:false, error:describeNetworkFailure(error), queued:0, processing:0 }; }
  finally { clearTimeout(timer); }
}
function tailLog(dir, limit = 12) {
  const file = path.join(dir,'.mediaforge','logs','worker-session.log');
  try {
    const size = fs.statSync(file).size;
    const handle = fs.openSync(file,'r');
    try {
      const bytes=Math.min(size,32*1024),buf=Buffer.alloc(bytes);
      fs.readSync(handle,buf,0,bytes,size-bytes);
      return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-limit).map(x=>x.slice(0,300));
    } finally { fs.closeSync(handle); }
  } catch { return []; }
}
function normalizeText(text) { return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function sanitizeNote(input) {
  const s=String(input||'').trim().slice(0,1200);
  // Never persist credentials or access tokens. Reject instead of masking potentially incomplete secrets.
  if (/\b(?:bearer\s+\S+|sk-[a-z0-9_-]{12,}|(?:password|senha|token|api[_ -]?key|secret)\s*[:=]\s*\S+)/i.test(s))
    throw new Error('Não guarde senhas, tokens ou chaves de API na memória.');
  return s;
}
function classifyTopics(text) {
  const norm=normalizeText(text);const scores=TOPICS.map(t=>({id:t.id,score:t.words.reduce((sum,word)=>sum+(norm.includes(normalizeText(word))?1:0),0)}));
  return scores.filter(t=>t.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(t=>t.id);
}
function emptyBrain() {
  return { version:2, settings:{ autoLearn:true }, entries:[],
    nodes:TOPICS.map(t=>({id:t.id,label:t.label,count:0})),
    links:SEED_EDGES.map(([a,b])=>({a,b,strength:1})) };
}
function safeBrain(value) {
  const result=emptyBrain();
  if (!value || typeof value!=='object')return result;
  result.settings.autoLearn=value.settings?.autoLearn!==false;
  result.entries=Array.isArray(value.entries)?value.entries.filter(e=>typeof e?.text==='string'&&Array.isArray(e.topics))
    .slice(-MAX_RECORDS).map(e=>({id:String(e.id||'').slice(0,80),text:e.text.slice(0,1200),topics:e.topics.filter(x=>TOPICS.some(t=>t.id===x)).slice(0,4),source:String(e.source||'user').slice(0,35),createdAt:e.createdAt||null})):[];
  return rebuildBrain(result);
}
function rebuildBrain(brain) {
  const nodes=TOPICS.map(t=>({id:t.id,label:t.label,count:0}));
  const edges=new Map(SEED_EDGES.map(([a,b])=>[[a,b].sort().join(':'),{a:[a,b].sort()[0],b:[a,b].sort()[1],strength:1}]));
  for (const entry of brain.entries) {
    for (const topic of entry.topics){const n=nodes.find(x=>x.id===topic);if(n)n.count++;}
    for(let i=0;i<entry.topics.length;i++)for(let j=i+1;j<entry.topics.length;j++){
      const [a,b]=[entry.topics[i],entry.topics[j]].sort(),key=a+':'+b;
      const existing=edges.get(key)||{a,b,strength:0};existing.strength=Math.min(20,existing.strength+1);edges.set(key,existing);
    }
  }
  brain.nodes=nodes;brain.links=[...edges.values()];return brain;
}
class MemoryStore {
  constructor(file, legacyFile=null){this.file=file;this.legacyFile=legacyFile;}
  readBrain(){
    try {return safeBrain(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch{}
    // Upgrade V1 data in memory without modifying the original file.
    const brain=emptyBrain();
    if(this.legacyFile){try{const v=JSON.parse(fs.readFileSync(this.legacyFile,'utf8'));for(const n of (v.notes||[]).slice(-MAX_RECORDS))if(typeof n.text==='string'){
      const text=sanitizeNote(n.text);if(!text)continue;
      brain.entries.push({id:crypto.randomUUID(),text,topics:classifyTopics(text),source:'v1-import',createdAt:n.createdAt||new Date().toISOString()});
    }}catch{} }
    return rebuildBrain(brain);
  }
  writeBrain(brain){
    fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(rebuildBrain(brain),null,2),{encoding:'utf8',mode:0o600});
    fs.renameSync(tmp,this.file);
  }
  graph(){const brain=this.readBrain();return {nodes:brain.nodes,links:brain.links,entries:brain.entries.slice(-60).reverse(),settings:brain.settings,total:brain.entries.length};}
  read(){return this.readBrain().entries;}
  save(text,source='explicit'){
    const cleaned=sanitizeNote(text);if(!cleaned)throw new Error('Digite algo para o assistente aprender.');
    const brain=this.readBrain();const entry={id:crypto.randomUUID(),text:cleaned,topics:classifyTopics(cleaned),source,createdAt:new Date().toISOString()};
    brain.entries=[...brain.entries,entry].slice(-MAX_RECORDS);this.writeBrain(brain);return entry;
  }
  autoLearn(text){
    const brain=this.readBrain();if(!brain.settings.autoLearn)return null;
    const s=String(text||'').trim();if(s.length<16)return null;
    if(!/\b(?:lembre|aprenda|prefir|prefiro|gosto|quero|necessito|preciso|meu|minha|sempre|nunca|importante|registre)\b/i.test(normalizeText(s)))return null;
    try{return this.save(s,'assistant');}catch{return null;}
  }
  configure(value){if(typeof value?.autoLearn!=='boolean')throw new Error('Configuração inválida.');const brain=this.readBrain();brain.settings.autoLearn=value.autoLearn;this.writeBrain(brain);return brain.settings;}
  remove(id){const brain=this.readBrain();brain.entries=brain.entries.filter(x=>x.id!==id);this.writeBrain(brain);return brain.entries.length;}
  clear(){const brain=emptyBrain();brain.settings=this.readBrain().settings;this.writeBrain(brain);return this.graph();}
  export(){return JSON.stringify(this.readBrain(),null,2);}
}
function assistantReply(prompt,snapshot,notes) {
  const q=normalizeText(prompt);
  if(/memoria|anota|lembra|salv|aprend/.test(q))return notes.length
    ? `Minha rede possui ${notes.length} lembrança(s) registrada(s). A mais recente: ${notes.at(-1).text}`
    : 'Minha rede de conhecimento está preparada, mas ainda não registrou aprendizados. Você pode ensiná-la nas Configurações.';
  if(/process|fila|video|render/.test(q))return `Renderizador: ${snapshot.worker?'online':'offline'}. Fila: ${snapshot.queued||0}; processando: ${snapshot.processing||0}. ${snapshot.error||snapshot.message||''}`;
  if(/erro|403|conex|api|hostinger|offline|worker/.test(q))return snapshot.api
    ? `A API responde, mas o worker está ${snapshot.worker?'online':'offline'}. Se o POST retornar HTTP 403 HTML, revise a proteção do proxy/WAF — reiniciar em loop não resolve. Confira Diagnóstico.`
    : `A API não está acessível. ${snapshot.error||'Verifique DNS, internet e hospedagem.'}`;
  return 'Sou o assistente de diagnóstico da versão beta. Posso consultar a rede de conhecimento, a fila e os serviços; ainda não tenho um modelo de IA conversacional conectado.';
}
module.exports={ API_BASE,TASK_NAME,TOPICS,SEED_EDGES,workerPath,normalizeHealth,describeNetworkFailure,fetchHealth,tailLog,normalizeText,sanitizeNote,classifyTopics,emptyBrain,rebuildBrain,MemoryStore,assistantReply };
