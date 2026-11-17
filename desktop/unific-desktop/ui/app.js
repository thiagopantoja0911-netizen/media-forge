'use strict';
const api=window.unific;
const page=document.body.dataset.page;
const $=id=>document.getElementById(id);
const all=(selector)=>[...document.querySelectorAll(selector)];
const formatTime=t=>{if(!t)return'Nunca';const d=new Date(t);return Number.isNaN(d.valueOf())?'Desconhecido':d.toLocaleString('pt-BR');};
const txt=(id,value)=>{const el=$(id);if(el)el.textContent=String(value);};
let currentView='overview',state=null,graph=null;
function toast(message){const el=$('toast');if(!el)return;el.textContent=String(message);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),8500);}
function navigate(view){
  if(!['overview','engine','browser','diagnostics','assistant','settings'].includes(view))return;
  currentView=view;
  all('[data-screen]').forEach(el=>el.classList.toggle('active',el.dataset.screen===view));
  all('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
}
function setHealth(s){
  state=s;
  const up=!!s.worker,reachable=!!s.api;
  const status=up?'Online':reachable?'Atenção':'Offline';
  txt('head-status',status);txt('footer-label',up?'HyperFrames conectado':reachable?'API disponível · worker offline':'API indisponível');
  $('head-led')?.classList.toggle('ok',up);$('footer-led')?.classList.toggle('ok',up);
  txt('api-stat',reachable?'Online':'Offline');txt('api-detail',reachable?'Endpoint /health respondendo':s.error||'Sem resposta válida');
  txt('worker-stat',up?'Online':'Offline');txt('worker-detail',up?'Heartbeat recente':'Sem heartbeat válido');
  txt('queued-stat',reachable?String(s.queued||0):'—');txt('queued-detail',`${s.processing||0} em processamento`);
  txt('brain-stat',String(s.memoryCount||0));txt('brain-detail',`${s.memoryTopics||0} núcleos com aprendizado`);
  txt('last-refresh','Atualizado às '+new Date().toLocaleTimeString('pt-BR'));
  txt('flow-state',up?'Conexão ativa, worker pronto para processar.':'Worker desconectado — aguardando reconexão com a API.');
  txt('engine-status',up?'HyperFrames operacional':'HyperFrames desconectado');
  txt('last-heartbeat',formatTime(s.lastSeen));txt('engine-queued',String(s.queued||0));txt('engine-processing',String(s.processing||0));
  txt('install-state',s.installed?'Worker detectado':'Worker não instalado');txt('install-folder',s.folder||'—');
  txt('token-state',s.paired?'Presente (valor oculto)':'Não configurada');txt('version','v'+s.version);
  if($('login-toggle'))$('login-toggle').checked=!!s.startAtLogin;
  if($('learn-toggle'))$('learn-toggle').checked=!!s.memoryAutoLearn;
  txt('diag-api',reachable?'Online':s.error||'Indisponível');
  txt('diag-worker',up?'Ativo':'Offline');txt('diag-install',s.installed?s.folder:'Ausente');
  txt('diag-system',`${s.platform} · ${s.hostname}`);txt('logs',s.logs?.length?s.logs.join('\n'):'Nenhum log disponível.');
  txt('bridge-api',reachable?'Respondendo':'Sem resposta');
  txt('hover-api',reachable?'Online':'Offline');txt('hover-worker',up?'ONLINE':'OFFLINE');
  txt('hover-queue',String(s.queued||0));txt('hover-brain',String(s.memoryCount||0));
  txt('hover-description',up?'HyperFrames está recebendo jobs.':reachable?'A API responde; aguardando heartbeat do worker.':'Servidor MediaForge indisponível.');
  txt('hover-engine-status',up?'online':'offline');txt('hover-seen',formatTime(s.lastSeen));
  txt('hover-diag',up?'Worker conectado.':reachable?'API online; worker sem sinal. Confira os logs para entender a falha.':s.error||'API indisponível.');
  $('hover-main-led')?.classList.toggle('ok',up);
}
const points={
  marketing:[280,170],comunicacao:[530,130],abordagens:[400,340],vendas:[240,485],
  criativos:[830,180],automacao:[770,430],operacao:[955,525],aprendizado:[580,605]
};
function svgNode(tag,attrs={},textValue=null){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
  if(textValue!==null)el.textContent=String(textValue);
  return el;
}
function renderNetwork(canvasId,brain,compact=false){
  const svg=$(canvasId);if(!svg||!brain)return;
  svg.replaceChildren();
  const sx=compact?0.41:1,sy=compact?0.29:1,offsetX=compact?5:0,offsetY=compact?0:0;
  const position=id=>{const p=points[id]||[540,350];return [p[0]*sx+offsetX,p[1]*sy+offsetY];};
  const observed=new Set((brain.nodes||[]).filter(n=>n.count>0).map(n=>n.id));
  for(const link of brain.links||[]){
    const [x1,y1]=position(link.a),[x2,y2]=position(link.b);
    const connected=observed.has(link.a)&&observed.has(link.b);
    svg.appendChild(svgNode('line',{x1,y1,x2,y2,stroke:connected?'#62efcc':'#2e7a7c',
      'stroke-width':compact?Math.max(.55,Math.min(3,link.strength*.56)):Math.max(.9,Math.min(4,link.strength*.7)),
      'stroke-opacity':connected?.75:.22,'stroke-linecap':'round'}));
  }
  for(const node of brain.nodes||[]){
    const [x,y]=position(node.id),lit=node.count>0,rad=compact?7:14;
    if(lit)svg.appendChild(svgNode('circle',{cx:x,cy:y,r:rad*(compact?2.1:2.3),fill:'#3ce8bd','fill-opacity':.09}));
    svg.appendChild(svgNode('circle',{cx:x,cy:y,r:rad+(lit?Math.min(node.count,8):0)*(compact?.25:.5),
      fill:lit?'#63f0cd':'#28545e','fill-opacity':lit?.9:.62,stroke:lit?'#9bfff2':'#4e8c91','stroke-width':compact?.7:1.3}));
    if(!compact){
      svg.appendChild(svgNode('text',{x:x+25,y:y+4,fill:lit?'#b1fff0':'#56878c','font-size':'14',
        'letter-spacing':'1','font-family':'Segoe UI,Arial,sans-serif'},node.label.toUpperCase()));
    }
  }
}
async function refresh(){
  try{
    const [s,g]=await Promise.all([api.snapshot(),api.graph()]);
    setHealth(s);graph=g;renderNetwork('brain-canvas',g,false);renderNetwork('knowledge-canvas',g,true);
    txt('knowledge-count',g.total||0);
    txt('hover-memory',`A rede conecta ${g.nodes.filter(n=>n.count>0).length} assunto(s) e preserva ${g.total} aprendizado(s).`);
    if(page==='dashboard')showMemories(g);
  }catch(err){toast('Falha ao consultar o sistema: '+err.message);}
}
function showMemories(g){
  const host=$('memories-list');if(!host)return;host.replaceChildren();
  if(!g.entries?.length){const el=document.createElement('span');el.className='muted';el.textContent='O cérebro está pronto para aprender. Registre uma preferência acima.';host.appendChild(el);return;}
  for(const entry of g.entries.slice(0,12)){
    const item=document.createElement('div');item.className='memory-chip';
    const text=document.createElement('p');text.textContent=entry.text;
    const meta=document.createElement('small');meta.textContent=entry.topics.join(' · ')||'geral';meta.title=formatTime(entry.createdAt);
    const wrap=document.createElement('div');wrap.append(text,meta);
    const del=document.createElement('button');del.type='button';del.title='Apagar esta memória';del.textContent='×';
    del.addEventListener('click',async()=>{if(!confirm('Excluir este aprendizado da rede?'))return;await api.removeMemory(entry.id);await refresh();});
    item.append(wrap,del);host.append(item);
  }
}
async function workerAction(kind){
  const prompt=kind==='restart'
    ? 'Reiniciar somente o worker? O sistema NÃO removerá nem recriará tarefas agendadas; uma renderização ativa poderá ser interrompida.'
    : 'Preparar dependências do MediaForge? A instalação atual e a tarefa agendada serão preservadas.';
  if(!confirm(prompt))return;
  toast('Executando verificação autorizada...');
  try{const output=kind==='restart'?await api.restartWorker():await api.installWorker();
    toast(output.ok?output.output||'Operação concluída.':output.error||'Operação não concluída.');}
  catch(err){toast('Operação não concluída: '+err.message);}
  await refresh();
}
function appendChat(message,role){
  const log=$('assistant-log');if(!log)return;
  const p=document.createElement('p');p.className='assistant-message '+(role==='user'?'user':'bot');p.textContent=message;
  log.appendChild(p);log.scrollTop=log.scrollHeight;
}
function bindButton(id,cb){$(id)?.addEventListener('click',cb);}
if(page==='dashboard'){
  all('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  all('[data-jump]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.jump)));
  bindButton('dismiss',()=>api.dismiss());
  bindButton('quick-restart',()=>workerAction('restart'));bindButton('engine-restart',()=>workerAction('restart'));
  bindButton('engine-install',()=>workerAction('install'));
  bindButton('quick-folder',async()=>{const res=await api.openWorkerFolder();if(res)toast(res);});
  bindButton('diag-refresh',refresh);
  $('login-toggle')?.addEventListener('change',async e=>{try{e.target.checked=await api.loginSettings(e.target.checked);}catch(err){toast(err.message);}});
  $('learn-toggle')?.addEventListener('change',async e=>{
    try{const res=await api.memorySettings({autoLearn:e.target.checked});e.target.checked=res.autoLearn;toast(res.autoLearn?'Aprendizado automático ativado.':'Aprendizado automático desativado.');}
    catch(err){toast(err.message);}
  });
  $('remember-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const field=$('remember-text'),note=field.value.trim();if(!note)return;
    try{const saved=await api.saveNote(note);field.value='';toast(`Aprendizado conectado: ${saved.topics.join(', ')||'geral'}`);await refresh();}
    catch(err){toast(err.message);}
  });
  bindButton('memory-export',async()=>{try{const res=await api.exportMemory();if(res.ok)toast('Rede exportada para '+res.filePath);}catch(err){toast(err.message);}});
  bindButton('memory-clear',async()=>{if(confirm('Excluir TODAS as memórias registradas no Unific V1.1? Esta ação não exclui o backup original da V1.')){
    await api.clearMemory();toast('Memórias da V1.1 limpas.');await refresh();}});
  $('assistant-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const input=$('assistant-input');const question=input.value.trim();if(!question)return;
    input.value='';appendChat(question,'user');
    try{appendChat(await api.ask(question),'bot');await refresh();}
    catch(err){appendChat('Não consegui responder: '+err.message,'bot');}
  });
  api.onNavigate(navigate);
}else if(page==='hover'){
  all('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
  bindButton('hover-close',()=>api.hideHover());
  bindButton('hover-expand',()=>api.openDashboard(currentView));
  $('hover-assistant-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const input=$('hover-assistant-input');const question=input.value.trim();if(!question)return;
    txt('hover-assistant-reply','Consultando...');input.value='';
    try{txt('hover-assistant-reply',await api.ask(question));await refresh();}
    catch(err){txt('hover-assistant-reply','Não foi possível responder: '+err.message);}
  });
}
refresh();setInterval(refresh,page==='dashboard'?16000:13000);
