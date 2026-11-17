'use strict';
const $ = id => document.getElementById(id);
const api = window.unific;
const page = document.body.dataset.page;
const fmt = t => {
  if (!t) return 'Nunca';
  const d = new Date(t);
  return Number.isNaN(+d) ? 'Desconhecido' : d.toLocaleString('pt-BR');
};
function set(id, content) { if ($(id)) $(id).textContent = content; }
function alertBox(message) {
  const toast = $('toast');if (!toast) return;
  toast.textContent = String(message);toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 6500);
}
let state = null;
async function refresh() {
  try { state = await api.snapshot(); paint(state); }
  catch (e) { alertBox('Não foi possível consultar o agente local: ' + e.message); }
}
function paint(s) {
  const up = Boolean(s.worker), apiUp = Boolean(s.api);
  if (page === 'mini') {
    set('mini-live', up ? 'ONLINE' : 'ATENÇÃO');
    set('mini-main-status', up ? 'Seu estúdio está conectado' : 'Renderizador desconectado');
    set('mini-description', up ? 'HyperFrames enviando sinais de atividade' : apiUp ? 'API está online, worker sem heartbeat' : 'API indisponível');
    set('mini-api', apiUp ? 'Online' : 'Offline');
    set('mini-worker', up ? 'Ativo' : 'Offline');
    set('mini-queued', String(s.queued || 0));
    $('mini-dot')?.classList.toggle('healthy', up);
    set('mini-tip', up ? 'Tudo certo. Você pode acompanhar os jobs no painel.' : 'Abra o dashboard para consultar os logs e tentar a recuperação.');
    return;
  }
  if (page !== 'dashboard') return;
  set('version', 'v' + s.version);
  set('api-stat', apiUp ? 'Online' : 'Offline');set('api-detail', apiUp ? 'Endpoint /health respondendo' : s.error || 'Sem resposta da API');
  set('worker-stat', up ? 'Online' : 'Offline');set('worker-detail', up ? 'Heartbeat recente' : 'Sem heartbeat recente');
  set('queued-stat', apiUp ? String(s.queued || 0) : '—');set('queued-detail', `${s.processing || 0} em processamento`);
  set('last-refresh','Atualizado às '+new Date().toLocaleTimeString('pt-BR'));
  set('hero-state', up ? 'SISTEMA OPERACIONAL' : 'ATENÇÃO REQUERIDA');
  set('flow-state',up ? 'Worker sincronizado e pronto para renderizar.' : 'Aguardando conexão do worker local.');
  $('hero-dot')?.classList.toggle('healthy', up);$('flow-dot')?.classList.toggle('healthy', up);$('bottom-dot')?.classList.toggle('healthy', up);
  set('bottom-copy', up ? 'Conexão MediaForge / HyperFrames ativa' : 'Worker offline — API ' + (apiUp ? 'operacional' : 'indisponível'));
  set('engine-status',up ? 'HyperFrames operacional' : 'HyperFrames desconectado');
  set('engine-chip',up ? 'ONLINE' : 'OFFLINE');
  set('last-heartbeat', fmt(s.lastSeen));set('engine-queued',String(s.queued||0));set('engine-processing',String(s.processing||0));
  set('install-state',s.installed ? 'Worker detectado' : 'Worker não instalado');
  set('install-folder',s.folder || '—');set('token-state',s.paired ? 'Configurada' : 'Não configurada');
  if ($('login-toggle')) $('login-toggle').checked = Boolean(s.startAtLogin);
  set('diag-api',apiUp ? 'Online' : s.error || 'Indisponível');set('diag-worker',up ? 'Ativo' : 'Offline');
  set('diag-install',s.installed ? s.folder : 'Ausente');set('diag-system',`${s.platform} · ${s.hostname}`);
  set('logs',s.logs?.length ? s.logs.join('\n') : 'Nenhum registro de worker encontrado.');
}
async function task(kind) {
  const message = kind === 'restart'
    ? 'Reiniciar somente o worker MediaForge? Essa ação interrompe qualquer renderização em execução.'
    : 'Preparar instalação do MediaForge? A pasta existente será preservada e nenhuma credencial será excluída.';
  if (!window.confirm(message)) return;
  alertBox('Executando operação local, sem abrir o PowerShell...');
  try {
    const result = kind === 'restart' ? await api.restartWorker() : await api.installWorker();
    alertBox(result.ok ? (result.output || 'Operação concluída.') : (result.error || 'Operação não concluída.'));
  } catch (e) { alertBox(e.message); }
  await refresh();
}
function view(name) {
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('active',e.dataset.panel===name));
  document.querySelectorAll('[data-view]').forEach(e => e.classList.toggle('active',e.dataset.view===name));
  set('view-label',({overview:'VISÃO GERAL',engine:'RENDERIZAÇÃO',memory:'MEMÓRIA',diagnostics:'DIAGNÓSTICO'})[name]||'VISÃO GERAL');
  if (name === 'memory') loadNotes();
}
function addLine(text, role) {
  const node=document.createElement('div');node.className='chat-line '+role;node.textContent=text;
  $('chatbox')?.appendChild(node);if ($('chatbox')) $('chatbox').scrollTop = $('chatbox').scrollHeight;
}
async function loadNotes() {
  const host=$('notes-list');if (!host) return;
  const notes=await api.notes();host.replaceChildren();
  if (!notes.length){const p=document.createElement('p');p.className='muted';p.textContent='Nenhuma anotação salva ainda.';host.append(p);return;}
  notes.slice().reverse().slice(0,14).forEach(n=>{const row=document.createElement('article');row.className='note';const a=document.createElement('p');a.textContent=n.text;const b=document.createElement('small');b.textContent=fmt(n.createdAt);row.append(a,b);host.append(row);});
}
if (page==='dock') {
  const orb=$('hover-orb');
  orb.addEventListener('mouseenter',()=>api.showMini());
  orb.addEventListener('mouseleave',()=>api.hideMini());
  orb.addEventListener('click',()=>api.openDashboard());
} else if (page==='mini') {
  document.body.addEventListener('mouseenter',()=>api.showMini());
  document.body.addEventListener('mouseleave',()=>api.hideMini());
  $('mini-dashboard').addEventListener('click',()=>api.openDashboard());
  $('mini-hide').addEventListener('click',()=>api.hideMini());
  refresh();setInterval(refresh,12000);
} else if (page==='dashboard') {
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
  $('hero-worker').addEventListener('click',()=>view('engine'));
  $('hero-memory').addEventListener('click',()=>view('memory'));
  $('refresh').addEventListener('click',refresh);$('diag-refresh').addEventListener('click',refresh);
  $('quick-restart').addEventListener('click',()=>task('restart'));
  $('engine-restart').addEventListener('click',()=>task('restart'));
  $('quick-install').addEventListener('click',()=>task('install'));
  $('engine-install').addEventListener('click',()=>task('install'));
  $('quick-folder').addEventListener('click',async()=>{const x=await api.openWorkerFolder();if(x)alertBox(x);});
  $('login-toggle').addEventListener('change',async e=>{try{e.target.checked=await api.loginSettings(e.target.checked);}catch(x){alertBox(x.message);}});
  $('chat-form').addEventListener('submit',async e=>{e.preventDefault();const prompt=$('chat-prompt').value.trim();if(!prompt)return;addLine(prompt,'user');$('chat-prompt').value='';try{addLine(await api.ask(prompt),'bot');}catch(x){addLine(x.message,'bot');}});
  $('note-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('new-note');if(!input.value.trim())return;try{await api.saveNote(input.value);input.value='';alertBox('Anotação salva na memória local.');await loadNotes();}catch(x){alertBox(x.message);}});
  refresh();setInterval(refresh,12000);
}
