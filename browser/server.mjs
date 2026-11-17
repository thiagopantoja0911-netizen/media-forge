#!/usr/bin/env node
/* Browser MCP HTTPS relay — Node 22+, no third-party packages.
 * Run behind TLS reverse proxy. This server MUST NOT be internet-facing over HTTP.
 * Persistent BROWSER_MCP_BRIDGE_DATA_DIR should be a non-public, backed-up volume.
 */
import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import {createComputerBridge} from './computer-bridge.mjs';
import {createParallelExecution} from './parallel-execution.mjs';
import {runComputerCompat} from './browser-computer-compat.mjs';
import {createBehavioralLibrary} from './server-behavioral-knowledge.mjs';
import {toolSpecs as devforgeToolSpecs, runTool as runDevforgeTool} from './devforge/devforge-runtime.mjs';

const BASE=(process.env.BROWSER_MCP_BRIDGE_URL||'https://mcpbrowser.salevo.site').replace(/\/$/,'');
if (!BASE.startsWith('https://') && process.env.BROWSER_MCP_TEST_HTTP!=='1') throw new Error('HTTPS obrigatório em BROWSER_MCP_BRIDGE_URL');
const RESOURCE=BASE+'/mcp';
const PORT=Number(process.env.PORT||4872);
const ROOT=path.resolve(process.env.BROWSER_MCP_BRIDGE_DATA_DIR||path.join(process.cwd(),'.bridge-private'));
mkdirSync(ROOT,{recursive:true,mode:0o700});
const FILE=path.join(ROOT,'state.json');
// Keep OAuth bearer tokens in per-token private files, not only in the
// in-memory snapshot that each Hostinger Node worker loads on startup.
const OAUTH_ROOT=path.join(ROOT,'oauth-tokens');
mkdirSync(OAUTH_ROOT,{recursive:true,mode:0o700});
const computerBridge=createComputerBridge(ROOT);
const parallelExecution=createParallelExecution(ROOT);
const behavioralLibrary=createBehavioralLibrary(ROOT,{onAuthorizedImportPage:(owner)=>{
  // Session is bound to the OAuth owner and never exposed to the model.
  const value=token();
  store.sbiSessions[hash(value)]={owner,expires:now()+14*86400000};
  save();
  return 'sbi_session='+value+'; Max-Age=1209600; Path=/sbi; Secure; HttpOnly; SameSite=Lax';
}});
const empty=()=>({clients:{},devices:{},claims:{},authFlows:{},codes:{},access:{},refresh:{},sbiSessions:{}});
let store=existsSync(FILE)?{...empty(),...JSON.parse(readFileSync(FILE,'utf8'))}:empty();
function save(){const tmp=FILE+'.tmp';writeFileSync(tmp,JSON.stringify(store),{mode:0o600});renameSync(tmp,FILE);}
function token(){return randomBytes(32).toString('base64url');}
function hash(s){return createHash('sha256').update(s).digest('hex');}
function oauthTokenFile(kind,hashedToken){
 if(!['access','refresh'].includes(kind)||!/^[a-f0-9]{64}$/.test(hashedToken))throw Error('INVALID_OAUTH_RECORD');
 return path.join(OAUTH_ROOT,kind+'-'+hashedToken+'.json');
}
function readOAuthRecord(kind,hashedToken){
 try{
  const row=JSON.parse(readFileSync(oauthTokenFile(kind,hashedToken),'utf8'));
  return row&&typeof row==='object'&&!Array.isArray(row)?row:null;
 }catch{return null;}
}
function persistOAuthRecord(kind,rawToken,record){
 const target=oauthTokenFile(kind,hash(rawToken));
 const temp=target+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 writeFileSync(temp,JSON.stringify(record),{mode:0o600,flag:'wx'});
 renameSync(temp,target);
}
function revokeOAuthRecord(kind,hashedToken){
 try{unlinkSync(oauthTokenFile(kind,hashedToken));}catch(error){if(error?.code!=='ENOENT')throw error;}
}
function readLegacyOAuthRecord(section,hashedToken){
 const inMemory=store[section]?.[hashedToken];
 if(inMemory)return inMemory;
 try{
  const snapshot=JSON.parse(readFileSync(FILE,'utf8'));
  return snapshot?.[section]?.[hashedToken]||null;
 }catch{return null;}
}
function eq(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
function now(){return Date.now();}
function die(status,message){const err=new Error(message);err.status=status;throw err;}
function clean(){const time=now();for(const k of ['claims','authFlows','codes','access','refresh','sbiSessions'])for(const [id,entry] of Object.entries(store[k])) if(entry.expires<time)delete store[k][id];}
const polls=new Map(),running=new Map();
const rate=new Map();
function limiter(key,max,windowMs=60000){const t=now(),a=(rate.get(key)||[]).filter(n=>n>t-windowMs);a.push(t);rate.set(key,a);if(a.length>max)die(429,'Limite de tentativas excedido');}
function json(res,status,data,headers={}){if(res.writableEnded)return;res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY',...headers});res.end(JSON.stringify(data));}
function html(res,status,body){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",'referrer-policy':'no-referrer'});res.end(body);}
function authHeader(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');}
async function body(req,max=32768){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)die(413,'Payload grande');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
function form(s){return Object.fromEntries(new URLSearchParams(s));}
function deviceAuth(req){const t=authHeader(req);if(!t)die(401,'Dispositivo não autenticado');const h=hash(t);let d=Object.values(store.devices).find(x=>eq(x.tokenHash,h));if(!d)die(401,'Dispositivo não autenticado');return d;}
function userAuth(req){
 const bearer=authHeader(req);
 if(!bearer){console.error('[browser-oauth] mcp unauthorized: missing_bearer');die(401,'Autenticação OAuth necessária');}
 if(bearer.length>512){console.error('[browser-oauth] mcp unauthorized: invalid_token_length');die(401,'Token OAuth inválido');}
 const key=hash(bearer);
 const access=readOAuthRecord('access',key)||readLegacyOAuthRecord('access',key);
 if(!access){console.error('[browser-oauth] mcp unauthorized: unknown_bearer');die(401,'Token OAuth inválido');}
 if(access.expires<now()){console.error('[browser-oauth] mcp unauthorized: expired_bearer');die(401,'Token OAuth expirado');}
 if(access.resource!==RESOURCE||!Array.isArray(access.scopes)||!access.scopes.includes('browser:control')){
  console.error('[browser-oauth] mcp unauthorized: resource_or_scope_mismatch');
  die(401,'Token OAuth inválido');
 }
 return access.owner;
}
function pin(){const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:10},()=>abc[randomBytes(1)[0]%abc.length]).join('');}
function newClaim(device){for(const [h,v] of Object.entries(store.claims))if(v.device===device.id)delete store.claims[h];const code=pin();store.claims[hash(code)]={device:device.id,expires:now()+600000};save();return code;}
function uriAllowed(uri){
 try{
  const u=new URL(uri);
  if(u.username||u.password||u.hash)return false;
  // Allow Claude's exact OAuth callback, not arbitrary URLs on claude.ai.
  if(u.origin==='https://claude.ai'&&u.pathname==='/api/mcp/auth_callback'&&!u.search)return true;
  return (u.protocol==='https:'&&(u.hostname==='chatgpt.com'||u.hostname.endsWith('.chatgpt.com')||u.hostname==='openai.com'||u.hostname.endsWith('.openai.com')))
   ||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));
 }catch{return false;}
}
const ALLOWED_ACTIONS = new Set([
  'tab_list','tab_open','navigate','reload','read_page','read_page_structure',
  'find_elements','wait_for','click','type_text','select_option','scroll',
  'tab_group_create','tab_group_list','tab_group_update','tab_group_add_tabs',
  'tab_group_ungroup','tab_group_move','tab_move','tab_duplicate','tab_pin',
  'tab_open_many','window_list','window_open','window_move_tabs',
  'session_save','session_list','browser_diagnostics','tab_run_many'
]);
const WORKFLOW_TOOL = {
  name: 'browser_run_workflow',
  description: 'Executa um plano de navegador de até 10 etapas em uma única chamada. A extensão executa em sequência, resolve referências entre etapas, aguarda e verifica resultados, tenta novamente apenas leituras seguras e mantém abas novas em segundo plano por padrão. Não permite voltar/avançar, fechar abas, apagar sessões ou capturar a aba visível.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array', minItems: 1, maxItems: 10,
        items: {
          type: 'object',
          properties: {
            id: {type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,39}$'},
            label: {type: 'string', maxLength: 80},
            action: {type: 'string', enum: [...ALLOWED_ACTIONS]},
            args: {type: 'object', additionalProperties: true},
            waitFor: {type: 'object', properties: {selector: {type: 'string'}, tabId: {type: 'number'}, timeoutMs: {type: 'number'}}, required: ['selector'], additionalProperties: false},
            verify: {type: 'object', properties: {type: {type: 'string', enum: ['selector_exists','text_contains','url_contains']}, value: {type: 'string'}, tabId: {type: 'number'}}, required: ['type','value'], additionalProperties: false},
            retries: {type: 'integer', minimum: 0, maximum: 2}
          },
          required: ['id','action'], additionalProperties: false
        }
      },
      continueOnError: {type: 'boolean'},
      maxRetries: {type: 'integer', minimum: 0, maximum: 2}
    },
    required: ['steps'], additionalProperties: false
  },
  securitySchemes: [{type: 'oauth2', scopes: ['browser:control']}]
};


function validateWorkflow(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !Array.isArray(args.steps) || args.steps.length < 1 || args.steps.length > 10) throw Object.assign(new Error('O plano deve conter de 1 a 10 etapas'), {status: 400});
  if (args.continueOnError !== undefined && typeof args.continueOnError !== 'boolean') throw Object.assign(new Error('continueOnError deve ser booleano'), {status: 400});
  if (args.maxRetries !== undefined && (!Number.isInteger(args.maxRetries) || args.maxRetries < 0 || args.maxRetries > 2)) throw Object.assign(new Error('maxRetries deve ser de 0 a 2'), {status: 400});
  const ids = new Set();
  for (const step of args.steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw Object.assign(new Error('Etapa inválida'), {status: 400});
    if (typeof step.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(step.id) || ids.has(step.id)) throw Object.assign(new Error('ID de etapa inválido ou duplicado'), {status: 400});
    ids.add(step.id);
    if (!ALLOWED_ACTIONS.has(step.action)) throw Object.assign(new Error(`Ação não permitida: ${String(step.action)}`), {status: 400});
    if (step.args !== undefined && (!step.args || typeof step.args !== 'object' || Array.isArray(step.args))) throw Object.assign(new Error(`args inválido na etapa ${step.id}`), {status: 400});
    if (step.retries !== undefined && (!Number.isInteger(step.retries) || step.retries < 0 || step.retries > 2)) throw Object.assign(new Error(`retries inválido na etapa ${step.id}`), {status: 400});
    if (step.waitFor && (typeof step.waitFor !== 'object' || typeof step.waitFor.selector !== 'string' || !step.waitFor.selector)) throw Object.assign(new Error(`waitFor inválido na etapa ${step.id}`), {status: 400});
    if (step.verify && (!['selector_exists','text_contains','url_contains'].includes(step.verify.type) || typeof step.verify.value !== 'string')) throw Object.assign(new Error(`verify inválido na etapa ${step.id}`), {status: 400});
  }
  if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 48000) throw Object.assign(new Error('Plano excede 48 KB'), {status: 413});
  return args;
}

const specs=[
 ['browser_status','Verifica conexão do navegador.',{}],
 ['tab_list','Lista abas web disponíveis.',{}],
 ['tab_open','Abre uma nova aba HTTP(S).',{url:'string',active:'boolean'}],
 ['tab_focus','Foca uma aba.',{tabId:'number'}],
 ['tab_close','Fecha uma aba somente com confirmação explícita.',{tabId:'number',confirmed:'boolean'}],
 ['navigate','Navega para URL HTTP(S).',{tabId:'number',url:'string'}],
 ['go_back','Volta no histórico.',{tabId:'number'}],
 ['go_forward','Avança no histórico.',{tabId:'number'}],
 ['reload','Recarrega a aba.',{tabId:'number'}],
 ['read_page','Lê página web; pode revelar conteúdo autenticado.',{tabId:'number',maxChars:'number'}],
 ['find_elements','Encontra elementos por seletor CSS.',{tabId:'number',selector:'string'}],
 ['click','Clica num elemento (ações sensíveis só com confirmação).',{tabId:'number',selector:'string',confirmed:'boolean'}],
 ['type_text','Preenche texto em campos comuns, nunca senhas, cartões ou OTP.',{tabId:'number',selector:'string',text:'string'}],
 ['select_option','Seleciona uma opção.',{tabId:'number',selector:'string',value:'string'}],
 ['scroll','Rola a página.',{tabId:'number',x:'number',y:'number'}],
 ['screenshot','Captura a aba visível.',{tabId:'number'}],
 ['wait_for','Aguarda seletor CSS aparecer.',{tabId:'number',selector:'string',timeoutMs:'number'}],
 ['tab_group_create','Cria grupo para abas existentes.',{tabIds:'array',title:'string',color:'string',collapsed:'boolean'}],
 ['tab_group_list','Lista grupos de abas.',{windowId:'number'}],
 ['tab_group_update','Atualiza nome, cor ou recolhimento de um grupo.',{groupId:'number',title:'string',color:'string',collapsed:'boolean'}],
 ['tab_group_add_tabs','Move abas existentes para um grupo.',{groupId:'number',tabIds:'array'}],
 ['tab_group_ungroup','Remove abas de grupos sem fechar as páginas.',{groupId:'number',tabIds:'array'}],
 ['tab_group_move','Move grupo para posição ou janela escolhida.',{groupId:'number',index:'number',windowId:'number'}],
 ['tab_move','Move uma aba para outra posição ou janela.',{tabId:'number',index:'number',windowId:'number'}],
 ['tab_duplicate','Duplica uma aba existente.',{tabId:'number'}],
 ['tab_pin','Fixa ou desafixa uma aba.',{tabId:'number',pinned:'boolean'}],
 ['tab_open_many','Abre várias URLs e opcionalmente cria um grupo.',{urls:'array',groupTitle:'string',color:'string',active:'boolean',windowId:'number'}],
 ['window_list','Lista janelas normais do Chrome.',{}],
 ['window_open','Abre uma janela do Chrome.',{urls:'array',focused:'boolean'}],
 ['window_focus','Foca uma janela.',{windowId:'number'}],
 ['window_move_tabs','Move várias abas para uma janela.',{windowId:'number',tabIds:'array'}],
 ['session_save','Salva abas e grupos de uma janela no Chrome local.',{name:'string',windowId:'number'}],
 ['session_list','Lista sessões salvas localmente na extensão.',{}],
 ['session_restore','Restaura sessão salva em uma nova janela.',{name:'string'}],
 ['session_delete','Exclui sessão salva, mediante confirmação.',{name:'string',confirmed:'boolean'}],
 ['browser_diagnostics','Diagnostica conexão e permissões sem expor credenciais.',{}],
 ['tab_run_many','Executa leitura, busca, scroll ou atualização em múltiplas abas.',{tabIds:'array',action:'string',selector:'string',maxChars:'number',x:'number',y:'number'}],
 ['read_page_structure','Lê estrutura de títulos, links, formulários e tabelas.',{tabId:'number'}]
];
const requiredByName={
 tab_group_create:['tabIds'],tab_group_list:[],tab_group_update:['groupId'],tab_group_add_tabs:['groupId','tabIds'],
 tab_group_ungroup:[],tab_group_move:['groupId','index'],tab_move:['tabId','index'],tab_duplicate:['tabId'],tab_pin:['tabId','pinned'],
 tab_open_many:['urls'],window_list:[],window_open:[],window_focus:['windowId'],window_move_tabs:['windowId','tabIds'],
 session_save:['name'],session_list:[],session_restore:['name'],session_delete:['name','confirmed'],browser_diagnostics:[],
 tab_run_many:['tabIds','action'],read_page_structure:['tabId']
};
const arrayKeys=new Set(['tabIds','urls']);

const schema=Object.fromEntries(specs.map(([n,d,p])=>[n,{name:n,description:d,inputSchema:{type:'object',properties:Object.fromEntries(Object.entries(p).map(([key,v])=>[key,v==='array'?{type:'array',items:{type:key==='urls'?'string':'number'},minItems:1,maxItems:key==='urls'?20:30}:{type:v}])),required:requiredByName[n]||Object.keys(p).filter(v=>!['active','confirmed','maxChars','x','y','timeoutMs'].includes(v)),additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['browser:control']}]}]));
schema[WORKFLOW_TOOL.name] = WORKFLOW_TOOL;
const POINTER_ACTIONS = new Set(['pointer_move','pointer_click','pointer_drag']);
const CONTEXT_BROWSER_ACTIONS = ['navigate','reload','read_page','read_page_structure','find_elements','wait_for','click','type_text','select_option','scroll','screenshot','tab_run_many',...POINTER_ACTIONS];
function validatePointerArgs(action,args){
 if(!POINTER_ACTIONS.has(action)||!args||typeof args!=='object'||Array.isArray(args))throw Error('POINTER_ARGS_INVALID');
 const allowed=['tabId','x','y','fromX','fromY','toX','toY','steps'];
 if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('POINTER_ARG_NOT_ALLOWED');
 if(!Number.isSafeInteger(args.tabId)||args.tabId<1)throw Error('POINTER_TAB_INVALID');
 const required=action==='pointer_drag'?['fromX','fromY','toX','toY']:(args.x!==undefined||args.y!==undefined)?['x','y']:['fromX','fromY'];
 for(const k of required){
  if(typeof args[k]!=='number'||!Number.isFinite(args[k])||args[k]<0||args[k]>30000)throw Error('POINTER_'+k+'_INVALID');
 }
 if(args.steps!==undefined&&(!Number.isSafeInteger(args.steps)||args.steps<3||args.steps>32))throw Error('POINTER_STEPS_INVALID');
 return args;
}
const CONTEXT_ACTION_TOOL = {
  name: 'browser_context_action',
  description: 'Executa uma ação de navegador dentro de um contexto e worker registrados. Ações independentes usam lanes diferentes; leituras compartilham lock e escritas conflitantes retornam RESOURCE_BUSY imediatamente.',
  inputSchema: {
    type: 'object',
    properties: {
      contextId: {type:'string', pattern:'^[a-f0-9]{32}$'},
      taskId: {type:'string', pattern:'^[a-f0-9]{32}$'},
      workerId: {type:'string', pattern:'^[a-f0-9]{32}$'},
      action: {type:'string', enum: CONTEXT_BROWSER_ACTIONS},
      args: {type:'object', additionalProperties:true}
    },
    required: ['contextId','taskId','workerId','action','args'],
    additionalProperties:false
  },
  securitySchemes: [{type:'oauth2',scopes:['browser:control']}]
};
// Only extend the tool catalog; never replace or reroute Chrome commands.
Object.assign(schema,computerBridge.toolSpecs);
Object.assign(schema,parallelExecution.toolSpecs);
schema[CONTEXT_ACTION_TOOL.name]=CONTEXT_ACTION_TOOL;
Object.assign(schema,behavioralLibrary.toolSpecs);
Object.assign(schema,devforgeToolSpecs);
function validateArgs(action,args){
  if(action===WORKFLOW_TOOL.name)return validateWorkflow(args);
 const spec=schema[action]?.inputSchema;
 if(!spec)die(400,'Comando desconhecido');
 if(!args||typeof args!=='object'||Array.isArray(args))die(400,'Argumentos devem ser um objeto');
 for(const name of spec.required||[])if(args[name]===undefined)die(400,`Argumento obrigatório: ${name}`);
 for(const [name,val] of Object.entries(args)){
  const descriptor=spec.properties[name];if(!descriptor)die(400,`Argumento desconhecido: ${name}`);
  if(typeof val!==descriptor.type && !(descriptor.type==='array'&&Array.isArray(val)))die(400,`Tipo inválido para ${name}`);
  if(descriptor.type==='array'){
   if(val.length<descriptor.minItems||val.length>descriptor.maxItems||val.some(x=>typeof x!==descriptor.items.type))die(400,`Lista inválida: ${name}`);
  }
  if(descriptor.type==='number'&&!Number.isFinite(val))die(400,`Número inválido: ${name}`);
 }
 return args;
}
const pollKey=(deviceId,laneId='main')=>deviceId+':'+laneId;
function dispatch(d,laneId='main'){
 const key=pollKey(d.id,laneId),poll=polls.get(key);if(!poll)return false;
 const task=[...running.values()].find(t=>t.device===d.id&&t.laneId===laneId&&!t.sent);if(!task)return false;
 polls.delete(key);clearTimeout(poll.timer);task.sent=true;
 json(poll.res,200,{id:task.id,action:task.action,args:task.args,laneId:task.laneId});
 return true;
}
async function runContextAction(owner,input){
 try{
  if(!owner)return {isError:true,content:[{type:'text',text:JSON.stringify({error:'OAUTH_REQUIRED'})}]};
  if(!input||!CONTEXT_BROWSER_ACTIONS.includes(input.action))throw Error('CONTEXT_ACTION_NOT_ALLOWED');
  const args=input.args||{};
  if(POINTER_ACTIONS.has(input.action))validatePointerArgs(input.action,args);
  else validateArgs(input.action,args);
  const contextResult=parallelExecution.runTool(owner,'browser_context_tabs',{contextId:input.contextId});
  if(contextResult.isError)return contextResult;
  const contextData=JSON.parse(contextResult.content[0].text);
  const targetTabs=input.action==='tab_run_many'?args.tabIds:[args.tabId];
  if(!Array.isArray(targetTabs)||!targetTabs.length||targetTabs.some(id=>!Number.isSafeInteger(id)||!contextData.tabIds.includes(id)))throw Error('TAB_NOT_IN_CONTEXT');
  const operation=input.action==='tab_run_many'?args.action:input.action;
  const readOnly=new Set(['read_page','read_page_structure','find_elements','wait_for','screenshot']);
  if(input.action==='tab_run_many'&&!['read_page','read_page_structure','find_elements','wait_for','screenshot','scroll','click','type_text','select_option','reload','navigate'].includes(operation))throw Error('PARALLEL_ACTION_NOT_ALLOWED');
  const statusResult=parallelExecution.runTool(owner,'browser_task_status',{contextId:input.contextId,taskId:input.taskId});
  if(statusResult.isError)return statusResult;
  const taskStatus=JSON.parse(statusResult.content[0].text);
  if(taskStatus.status!=='running'||!taskStatus.workers.some(w=>w.workerId===input.workerId&&w.contextId===input.contextId&&w.status==='running'))throw Error('WORKER_NOT_ACTIVE');
  const d=Object.values(store.devices).filter(device=>device.owner===owner).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0))[0];
  if(!d||now()-(d.lastSeen||0)>45000)throw Error('CHROME_DISCONNECTED');
  if(!parallelExecution.isActiveLane(owner,input.workerId))throw Error('LANE_NOT_ACTIVE');
  const key=pollKey(d.id,input.workerId);
  if([...running.values()].some(t=>t.device===d.id&&t.laneId===input.workerId))throw Error('LANE_BUSY');
  if(!polls.has(key))throw Error('LANE_NOT_READY');
  const mode=readOnly.has(operation)?'read':'write';
  const acquired=[];
  try{
   for(const tabId of targetTabs){
    const lock=parallelExecution.claimResource(owner,{contextId:input.contextId,taskId:input.taskId,workerId:input.workerId,resourceKey:'tab:'+tabId,mode,leaseMs:55000});
    if(lock.error)throw Object.assign(new Error('RESOURCE_BUSY'),{resourceKey:'tab:'+tabId,activeWorkers:lock.activeWorkers||[]});
    acquired.push({resourceKey:'tab:'+tabId,lockId:lock.lockId});
   }
   return await runTool(owner,input.action,args,input.workerId);
  }finally{
   for(const lock of acquired){
    try{parallelExecution.releaseResource(owner,{contextId:input.contextId,taskId:input.taskId,workerId:input.workerId,...lock});}catch{}
   }
  }
 }catch(error){
  return {isError:true,content:[{type:'text',text:JSON.stringify({error:String(error.message||error).slice(0,120),resourceKey:error.resourceKey||null,activeWorkers:error.activeWorkers||[]})}]};
 }
}
function runTool(owner,action,args,laneId='main'){
  if(action==='browser_context_action')return runContextAction(owner,args);
  if(Object.hasOwn(parallelExecution.toolSpecs,action))return Promise.resolve(parallelExecution.runTool(owner,action,args));
  if(Object.hasOwn(devforgeToolSpecs,action))return Promise.resolve(runDevforgeTool(owner,action,args));
  if(Object.hasOwn(behavioralLibrary.toolSpecs,action))return Promise.resolve(behavioralLibrary.runTool(owner,action,args));
  if(action==='tab_run_many'){
    const compatibility=runComputerCompat(owner,args,computerBridge);
    if(compatibility!==null)return Promise.resolve(compatibility);
  }
  if(Object.hasOwn(computerBridge.toolSpecs,action))return Promise.resolve(computerBridge.runTool(owner,action,args));
  if(action===WORKFLOW_TOOL.name)return runTool(owner,'tab_run_many',{tabIds:[0],action:'__browser_mcp_workflow__',selector:JSON.stringify(args)});if(!schema[action]&&!(laneId!=='main'&&POINTER_ACTIONS.has(action)))return Promise.resolve({isError:true,content:[{type:'text',text:'Ferramenta desconhecida'}]});const d=Object.values(store.devices).filter(d=>d.owner===owner).sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0))[0];if(action==='browser_status')return Promise.resolve({content:[{type:'text',text:JSON.stringify({connected:!!(d&&now()-(d.lastSeen||0)<45000),device:d?.id||null,lastClient:d?.lastClient||null,lastSeen:d?.lastSeen?new Date(d.lastSeen).toISOString():null})}]});if(!d||now()-(d.lastSeen||0)>45000)return Promise.resolve({isError:true,content:[{type:'text',text:'Chrome desconectado da ponte HTTPS.'}]});if(action==='tab_open' && args?.url===BASE+'/sbi/auto-import'){
    const raw=behavioralLibrary.runTool(owner,'sbi_library_import_session',{}).content?.[0]?.text||'{}';
    const session=JSON.parse(raw);
    if(session.status!=='ready'||typeof session.uploadUrl!=='string'){
      return Promise.resolve({isError:true,content:[{type:'text',text:JSON.stringify({status:'error',code:session.code||'import_session_unavailable'})}]});
    }
    args={...args,url:session.uploadUrl,active:true};
  }
  if(laneId!=='main'){
    if(!parallelExecution.isActiveLane(owner,laneId))return Promise.resolve({isError:true,content:[{type:'text',text:'LANE_NOT_ACTIVE'}]});
    if([...running.values()].some(t=>t.device===d.id&&t.laneId===laneId))return Promise.resolve({isError:true,content:[{type:'text',text:'LANE_BUSY'}]});
    if(!polls.has(pollKey(d.id,laneId)))return Promise.resolve({isError:true,content:[{type:'text',text:'LANE_NOT_READY'}]});
    if([...running.values()].filter(t=>t.owner===owner&&t.laneId!=='main').length>=45)return Promise.resolve({isError:true,content:[{type:'text',text:'OWNER_PARALLEL_LIMIT'}]});
  }else{
    if([...running.values()].some(t=>t.device===d.id&&t.laneId==='main'))return Promise.resolve({isError:true,content:[{type:'text',text:'LANE_BUSY'}]});
    if(!polls.has(pollKey(d.id,'main')))return Promise.resolve({isError:true,content:[{type:'text',text:'LANE_NOT_READY'}]});
  }
  return new Promise(resolve=>{
    const id=token();
    const task={id,device:d.id,owner,laneId,action,args,sent:false,resolve,timer:setTimeout(()=>{
      running.delete(id);
      resolve({isError:true,content:[{type:'text',text:'Chrome não respondeu à ponte (55 s).'}]});
    },55000)};
    running.set(id,task);
    if(!dispatch(d,laneId)){
      clearTimeout(task.timer);running.delete(id);
      resolve({isError:true,content:[{type:'text',text:'LANE_NOT_READY'}]});
    }
  });}
// Support both the current stateless MCP discovery and existing 2025-era clients.
// The URL, OAuth resource and all browser tools remain unchanged.
const BROWSER_MODERN_PROTOCOL='2026-07-28';
const BROWSER_SUPPORTED_PROTOCOLS=[BROWSER_MODERN_PROTOCOL,'2025-03-26'];
function browserMcpVersion(message,headers={}){
  const declared=message?.params?._meta?.['io.modelcontextprotocol/protocolVersion']
    ||headers['mcp-protocol-version'];
  return declared===BROWSER_MODERN_PROTOCOL||(!declared&&message?.method==='server/discover')
    ?BROWSER_MODERN_PROTOCOL:'2025-03-26';
}
async function rpc(req,owner,protocolVersion='2025-03-26'){
  if(!req||typeof req!=='object'||Array.isArray(req))die(400,'JSON-RPC inválido');
  if(req.id===undefined)return null;
  const base={jsonrpc:'2.0',id:req.id};
  const p=req.params||{};
  const modern=protocolVersion===BROWSER_MODERN_PROTOCOL;
  switch(req.method){
    case 'server/discover':
      return {...base,result:{
        resultType:'complete',supportedVersions:BROWSER_SUPPORTED_PROTOCOLS,
        capabilities:{tools:{listChanged:false}},ttlMs:0,cacheScope:'private',
        _meta:{'io.modelcontextprotocol/serverInfo':{name:'browser-mcp-https',version:'0.7.1'}}
      }};
    case 'initialize':
      return {...base,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'browser-mcp-https',version:'0.7.1'}}};
    case 'ping':return {...base,result:modern?{resultType:'complete'}:{}};
    case 'tools/list':
      return {...base,result:modern?
        {resultType:'complete',tools:Object.values(schema),ttlMs:0,cacheScope:'private'}:
        {tools:Object.values(schema)}};
    case 'tools/call':{
      const result=await runTool(owner,p.name,validateArgs(p.name,p.arguments||{}));
      return {...base,result:modern?{...result,resultType:'complete'}:result};
    }
    default:return {...base,error:{code:-32601,message:'Método não encontrado'}};
  }
}
const app=http.createServer(async(req,res)=>{
 const u=new URL(req.url,BASE); const ip=req.socket.remoteAddress||'unknown';const pathname=u.pathname;
  // Never log the authorization header, query parameters, request body, tokens or device IDs.
  if (['/mcp','/authorize','/register','/token','/device/status','/health','/.well-known/oauth-protected-resource','/.well-known/oauth-authorization-server'].includes(pathname)) {
    const started=Date.now();
    res.once('finish',()=>console.error('[relay-http]',req.method,pathname,res.statusCode,Date.now()-started+'ms'));
  }
 try{
  // Do not reflect Origin; browser-based cross-origin calls are intentionally unsupported.
  const origin=String(req.headers.origin||'');
  const extensionOrigin=/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  const chatgptOrigin=origin==='https://chatgpt.com';
  if(extensionOrigin||chatgptOrigin){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Browser-MCP-Client');
    res.setHeader('Access-Control-Max-Age','600');
  }
  if(req.method==='OPTIONS'){
    if(!extensionOrigin&&!chatgptOrigin)return json(res,403,{error:'Origem não permitida'});
    res.writeHead(204,{'cache-control':'no-store'});return res.end();
  }
  // Secure browser-only fallback for library import when the ChatGPT app catalog has
  // not refreshed the sbi_library_import_session MCP tool yet.
  // The 10-character claim is minted by the already-paired browser extension.
  if(pathname==='/sbi/setup'&&req.method==='GET'){
    return html(res,200,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Secrets — Importação privada</title><style>body{background:#101820;color:#f6f7f8;font:16px system-ui;max-width:620px;margin:8vh auto;padding:24px}h1{font-size:25px}label{display:block;margin:18px 0 8px}input,button{padding:12px;border-radius:8px;font:inherit}input{background:#23313e;color:white;border:1px solid #526578;letter-spacing:2px;text-transform:uppercase}button{background:#28a979;border:none;color:#06130e;font-weight:700;cursor:pointer}small{color:#bdcbd8}</style><h1>Secrets Behavioral Intelligence</h1><p>Importação protegida da biblioteca de livros. Gere um <strong>código de autorização atualizado</strong> na extensão Browser MCP HTTPS do seu Chrome, informe abaixo e prossiga para selecionar o banco privado.</p><form method="POST" action="/sbi/setup"><label for="claim">Código de vinculação do Browser MCP</label><input id="claim" name="claim_code" maxlength="10" minlength="10" pattern="[A-HJ-NP-Za-hj-np-z2-9]{10}" required autocomplete="off" autocapitalize="characters" placeholder="10 CARACTERES"><button type="submit">Autorizar importação</button></form><p><small>Use apenas o arquivo <code>biblioteca.sqlite</code> (não o ZIP). O código é usado uma única vez. O banco permanece no diretório privado do servidor e não será publicado em public_html.</small></p></html>`);
  }
  if(pathname==='/sbi/setup'&&req.method==='POST'){
    limiter('sbi_setup:'+ip,8,600000);
    if(origin&&origin!==BASE)die(403,'Origem não autorizada');
    const fetchSite=String(req.headers['sec-fetch-site']||'');
    if(fetchSite&&!['same-origin','none'].includes(fetchSite))die(403,'Origem de formulário não autorizada');
    const claimCode=String(form(await body(req,2048)).claim_code||'').replace(/\s/g,'').toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{10}$/.test(claimCode))die(400,'Código inválido');
    const claimHash=hash(claimCode),claim=store.claims[claimHash];
    if(!claim||claim.expires<now())die(403,'Código de vinculação expirado ou inválido');
    const device=store.devices[claim.device];
    if(!device||!device.owner||now()-(device.lastSeen||0)>120000)die(403,'Conexão do Browser MCP indisponível');
    const raw=behavioralLibrary.runTool(device.owner,'sbi_library_import_session',{}).content?.[0]?.text||'{}';
    const session=JSON.parse(raw);
    if(session.status!=='ready'||typeof session.uploadUrl!=='string'){
      const safeCodes=new Set(['already_imported','persistent_storage_not_configured']);
      return json(res,409,{status:'error',code:safeCodes.has(session.code)?session.code:'session_unavailable'});
    }
    const sessionToken=token();
    store.sbiSessions[hash(sessionToken)]={owner:device.owner,expires:now()+14*86400000};
    delete store.claims[claimHash];
    save();
    res.writeHead(303,{'location':session.uploadUrl,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff', 'set-cookie':'sbi_session='+sessionToken+'; Max-Age=1209600; Path=/sbi; Secure; HttpOnly; SameSite=Lax'});
    return res.end();
  }
  // Browser form fallback for indexing page summaries when the app tool catalog is stale.
  if(pathname==='/sbi/visual-index'&&(req.method==='GET'||req.method==='POST')){
    limiter('sbi-visual-index:'+ip,30,60000);
    const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
    const browserCookie=cookies.find(x=>x.startsWith('sbi_session='));
    const secret=browserCookie?.slice('sbi_session='.length)||'';
    const browserSession=/^[A-Za-z0-9_-]{40,50}$/.test(secret)?store.sbiSessions[hash(secret)]:null;
    if(!browserSession||browserSession.expires<now())return json(res,401,{status:'unauthorized',code:'pair_browser_first'});
    if(req.method==='GET'){
      const docId=String(u.searchParams.get('document_id')||'');
      const escapeHtml=(v)=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      return html(res,200,'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Secrets — indexação visual privada</title><style>body{background:#101820;color:#f0f5fa;font:16px system-ui;max-width:800px;margin:5vh auto;padding:24px}textarea{width:100%;min-height:300px;background:#243441;color:white;border:1px solid #607589;border-radius:8px;padding:12px;font:13px monospace}button{padding:12px 18px;border:0;border-radius:8px;background:#2db889;font-weight:700}</style><h1>Indexação visual privada por página</h1><p>Envie no máximo 12 resumos de páginas por lote. Identifique claramente o que não estiver legível. Este índice é resumo visual, não transcrição literal.</p><form method="POST" action="/sbi/visual-index"><input type="hidden" name="documentId" value="'+escapeHtml(docId)+'"><textarea name="payload" maxlength="42000" required placeholder=\'{"pages":[{"page":1,"text":"Resumo visual da página..."}]}\'></textarea><p><button type="submit">Adicionar ao índice privado</button></p></form></html>');
    }
    // Accept the same-origin page and the paired Browser MCP extension context.
    // The HttpOnly owner cookie is checked above before either origin is trusted.
    const fetchSite=String(req.headers['sec-fetch-site']||'');
    const opaqueSameOrigin=origin==='null'&&fetchSite==='same-origin';
    const trustedOrigin=!origin||origin===BASE||origin==='https://chatgpt.com'||extensionOrigin||opaqueSameOrigin;
    if(!trustedOrigin)die(403,'Origem não autorizada');
    if(fetchSite&&!['same-origin','none'].includes(fetchSite)&&!extensionOrigin&&origin!=='https://chatgpt.com')die(403,'Origem de formulário não autorizada');
    const fields=form(await body(req,48000));
    const resultText=behavioralLibrary.runTool(browserSession.owner,'sbi_library_index_visual_pages',{documentId:String(fields.documentId||''),payload:String(fields.payload||'')}).content?.[0]?.text||'{}';
    const resultData=JSON.parse(resultText);
    return json(res,resultData.status==='error'?400:200,resultData);
  }
  // Owner-authenticated fallback for literal OCR text when the MCP tool catalog is stale.
  if(pathname==='/sbi/ocr-index'&&(req.method==='GET'||req.method==='POST')){
    limiter('sbi-ocr-index:'+ip,30,60000);
    const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
    const browserCookie=cookies.find(x=>x.startsWith('sbi_session='));
    const secret=browserCookie?.slice('sbi_session='.length)||'';
    const browserSession=/^[A-Za-z0-9_-]{40,50}$/.test(secret)?store.sbiSessions[hash(secret)]:null;
    if(!browserSession||browserSession.expires<now())return json(res,401,{status:'unauthorized',code:'pair_browser_first'});
    if(req.method==='GET'){
      const docId=String(u.searchParams.get('document_id')||'');
      const escapeHtml=(v)=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      const pageHtml='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Secrets — indexação OCR privada</title><style>body{background:#101820;color:#f0f5fa;font:16px system-ui;max-width:800px;margin:5vh auto;padding:24px}textarea{width:100%;min-height:300px;background:#243441;color:white;border:1px solid #607589;border-radius:8px;padding:12px;font:13px monospace}button{padding:12px 18px;border:0;border-radius:8px;background:#2db889;font-weight:700}</style><h1>Indexação OCR privada</h1><p>Envie até 6 páginas por lote, com texto OCR literal (não resumo visual). Máximo de 6.000 caracteres por página. As páginas existentes serão atualizadas sem duplicação; texto substantivo já existente será preservado.</p><form method="POST" action="/sbi/ocr-index"><input type="hidden" name="documentId" value="'+escapeHtml(docId)+'"><textarea name="payload" maxlength="42000" required placeholder="{&quot;pages&quot;:[{&quot;page&quot;:1,&quot;text&quot;:&quot;Texto OCR literal da página 1...&quot;}]}"></textarea><p><button type="submit">Adicionar texto OCR ao índice privado</button></p></form></html>';
      return html(res,200,pageHtml);
    }
    const fetchSite=String(req.headers['sec-fetch-site']||'');
    const opaqueSameOrigin=origin==='null'&&fetchSite==='same-origin';
    const trustedOrigin=!origin||origin===BASE||origin==='https://chatgpt.com'||extensionOrigin||opaqueSameOrigin;
    if(!trustedOrigin)die(403,'Origem não autorizada');
    if(fetchSite&&!['same-origin','none'].includes(fetchSite)&&!extensionOrigin&&origin!=='https://chatgpt.com')die(403,'Origem de formulário não autorizada');
    const fields=form(await body(req,160000));
    const resultText=behavioralLibrary.runTool(browserSession.owner,'sbi_library_index_ocr_pages',{documentId:String(fields.documentId||''),payload:String(fields.payload||'')}).content?.[0]?.text||'{}';
    const resultData=JSON.parse(resultText);
    return json(res,resultData.status==='error'?400:200,resultData);
  }
  // Owner-scoped indexing coverage for the linked Chrome session.
  if(pathname==='/sbi/status'&&req.method==='GET'){
    limiter('sbi-status:'+ip,30,60000);
    const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
    const browserCookie=cookies.find(x=>x.startsWith('sbi_session='));
    const secret=browserCookie?.slice('sbi_session='.length)||'';
    const browserSession=/^[A-Za-z0-9_-]{40,50}$/.test(secret)?store.sbiSessions[hash(secret)]:null;
    if(!browserSession||browserSession.expires<now())return json(res,401,{status:'unauthorized',code:'pair_browser_first',setupUrl:BASE+'/sbi/setup'});
    const data=JSON.parse(behavioralLibrary.runTool(browserSession.owner,'sbi_library_status',{}).content[0].text);
    if(data.status==='not_imported')return json(res,409,{status:'not_imported'});
    if(data.status==='error')return json(res,503,{status:'error',code:'library_not_ready'});
    return json(res,200,data);
  }
  // Search fallback through the already-connected Chrome, without requiring an
  // app-catalog refresh. The browser cookie is minted only after a valid
  // one-time extension claim and is bound to the existing OAuth device owner.
  if(pathname==='/sbi/search'&&req.method==='GET'){
    limiter('sbi-search:'+ip,60,60000);
    const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
    const browserCookie=cookies.find(x=>x.startsWith('sbi_session='));
    const secret=browserCookie?.slice('sbi_session='.length)||'';
    const browserSession=/^[A-Za-z0-9_-]{40,50}$/.test(secret)?store.sbiSessions[hash(secret)]:null;
    if(!browserSession||browserSession.expires<now())return json(res,401,{status:'unauthorized',code:'pair_browser_first',setupUrl:BASE+'/sbi/setup'});
    const escapeHtml=(v)=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const rawQuery=String(u.searchParams.get('q')||'').trim();
    const rawDocument=String(u.searchParams.get('document')||'').trim().slice(0,140);
    if(rawQuery.length>180)die(400,'Consulta muito longa');
    const header='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Secrets — pesquisar biblioteca</title><style>body{background:#101820;color:#f0f5fa;font:16px system-ui;max-width:800px;margin:5vh auto;padding:24px}h1{font-size:24px}input,button{font:inherit;padding:10px;border-radius:8px}input{background:#243441;color:white;border:1px solid #607589;width:60%}button{background:#2db889;color:#061b11;border:0}article{background:#1b2b38;padding:16px;margin:12px 0;border-radius:10px}small{color:#cad9e6}code{font-size:13px}</style><h1>Secrets Behavioral Intelligence — biblioteca privada</h1><form method="GET" action="/sbi/search"><input name="q" maxlength="180" required value="'+escapeHtml(rawQuery)+'" placeholder="Termo de pesquisa"><input name="document" maxlength="140" value="'+escapeHtml(rawDocument)+'" placeholder="Filtrar por título do livro"><button>Pesquisar</button></form>';
    if(!rawQuery)return html(res,200,header+'<p>Biblioteca vinculada ao seu Chrome. Pesquise um conceito dos livros.</p></html>');
    const data=JSON.parse(behavioralLibrary.runTool(browserSession.owner,'sbi_library_search',{query:rawQuery,document:rawDocument,limit:5}).content[0].text);
    if(data.status==='not_imported')return html(res,409,header+'<p>Biblioteca ainda não importada. Use a sessão de envio autorizada em /sbi/setup.</p></html>');
    if(data.status!=='ready')return json(res,503,{status:'error',code:'library_not_ready'});
    const found=(data.results||[]).map(x=>'<article><h2>'+escapeHtml(x.title||'Obra')+'</h2><p><small>'+escapeHtml(x.source||'Seção não identificada')+'</small></p><p>'+escapeHtml(x.excerpt||'')+'</p><small>Documento: <code>'+escapeHtml(x.document_id||'')+'</code></small></article>').join('');
    return html(res,200,header+'<p>Resultados: '+(data.results||[]).length+'. Consulte a obra original antes de citar ou aplicar.</p>'+(found||'<p>Nenhum trecho localizado.</p>')+'</html>');
  }
  if(pathname==='/sbi/import') {await behavioralLibrary.handleImportHttp(req,res,u);return;}
  if(await computerBridge.handleAgentHTTP(req,res,pathname))return;
  if(pathname==='/downloads/AUTOATUALIZAR-BROWSER-MCP.cmd'&&req.method==='GET'){
    const filePath=path.join(process.cwd(),'updates','AUTOATUALIZAR-BROWSER-MCP.cmd');
    if(!existsSync(filePath))die(404,'Atualizador indisponível');
    const bytes=readFileSync(filePath);
    res.writeHead(200,{
      'content-type':'application/octet-stream',
      'content-disposition':'attachment; filename="AUTOATUALIZAR-BROWSER-MCP.cmd"',
      'content-length':bytes.length,
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'x-frame-options':'DENY'
    });
    res.end(bytes);
    return;
  }
  if(pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true,service:'browser-mcp-relay',version:'0.7.0',directExtension:true,workflowAgent:true,parallelWorkers:true,maxParallelWorkers:15});
  if(pathname==='/\.well-known/oauth-protected-resource'||pathname==='/.well-known/oauth-protected-resource'||pathname==='/.well-known/oauth-protected-resource/mcp')return json(res,200,{resource:RESOURCE,authorization_servers:[BASE],bearer_methods_supported:['header'],scopes_supported:['browser:control']});
  if(pathname==='/.well-known/oauth-authorization-server')return json(res,200,{issuer:BASE,authorization_endpoint:BASE+'/authorize',token_endpoint:BASE+'/token',registration_endpoint:BASE+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:['browser:control']});
  if(pathname==='/register'&&req.method==='POST'){
    limiter('reg:'+ip,10,3600000);const data=JSON.parse(await body(req));if(!Array.isArray(data.redirect_uris)||!data.redirect_uris.length||data.redirect_uris.some(x=>!uriAllowed(x)))die(400,'Redirect URI não autorizada');if(data.token_endpoint_auth_method&&data.token_endpoint_auth_method!=='none')die(400,'Apenas cliente público PKCE');const id=token();store.clients[id]={redirect_uris:data.redirect_uris};save();return json(res,201,{client_id:id,client_id_issued_at:Math.floor(now()/1000),redirect_uris:data.redirect_uris,token_endpoint_auth_method:'none'});
  }
  if(pathname==='/device/enroll'&&req.method==='POST'){
    limiter('enroll:'+ip,5,3600000);const id=token(),secret=token();const d={id,tokenHash:hash(secret),owner:null,lastSeen:0};store.devices[id]=d;const claim_code=newClaim(d);return json(res,201,{device_id:id,device_token:secret,claim_code,expires_in:600});
  }
  if(pathname==='/device/claim'&&req.method==='POST'){const d=deviceAuth(req);limiter('deviceclaim:'+d.id,5,3600000);return json(res,200,{claim_code:newClaim(d),expires_in:600});}
  if(pathname==='/device/status'&&req.method==='GET'){const d=deviceAuth(req);return json(res,200,{ok:true,deviceId:d.id,connected:now()-(d.lastSeen||0)<45000,lastSeen:d.lastSeen?new Date(d.lastSeen).toISOString():null,lastClient:d.lastClient||'windows-agent'});}
  if(pathname==='/device/lanes'&&req.method==='GET'){
    const d=deviceAuth(req);
    d.lastSeen=now();d.lastClient=String(req.headers['x-browser-mcp-client']||'windows-agent').slice(0,64);save();
    const prefix=d.id+':';
    const pollingLanes=[...polls.keys()].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
    return json(res,200,{lanes:parallelExecution.listActiveLanes(d.owner),pollingLanes,maxLanes:15,protocol:'lane-v1'});
  }
  if(pathname==='/device/next'&&req.method==='GET'){
    const d=deviceAuth(req);
    const laneId=String(u.searchParams.get('laneId')||req.headers['x-browser-mcp-lane']||'main');
    if(laneId!=='main'&&!parallelExecution.isActiveLane(d.owner,laneId))die(403,'Lane não autorizada');
    d.lastSeen=now();d.lastClient=String(req.headers['x-browser-mcp-client']||'windows-agent').slice(0,64);save();
    const key=pollKey(d.id,laneId),prev=polls.get(key);
    if(prev){clearTimeout(prev.timer);json(prev.res,200,{idle:true,laneId});}
    const timer=setTimeout(()=>{polls.delete(key);json(res,200,{idle:true,laneId});},4500);
    polls.set(key,{res,timer});dispatch(d,laneId);return;
  }
  if(pathname==='/device/result'&&req.method==='POST'){
    const d=deviceAuth(req),v=JSON.parse(await body(req,16*1024*1024)),task=running.get(v.id);if(!task||task.device!==d.id)die(404,'Tarefa não encontrada');clearTimeout(task.timer);running.delete(v.id);task.resolve(v.result||{isError:true,content:[{type:'text',text:'Resultado vazio'}]});return json(res,200,{ok:true});
  }
  if(pathname==='/authorize'&&req.method==='GET'){
    const client=store.clients[u.searchParams.get('client_id')];const redirect=u.searchParams.get('redirect_uri');const challenge=u.searchParams.get('code_challenge');if(!client||!client.redirect_uris.includes(redirect)||u.searchParams.get('response_type')!=='code'||u.searchParams.get('code_challenge_method')!=='S256'||!challenge||challenge.length<43||challenge.length>128||u.searchParams.get('resource')!==RESOURCE)die(400,'OAuth inválido');
    const fid=token();store.authFlows[fid]={clientId:u.searchParams.get('client_id'),redirect,challenge,state:u.searchParams.get('state')||'',expires:now()+600000,tries:0};save();return html(res,200,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autorizar Browser MCP</title><style>body{background:#10151b;color:white;font:17px system-ui;max-width:530px;margin:12vh auto;padding:24px}input,button{padding:12px;font:inherit;border-radius:8px}input{background:#232c33;color:#fff;border:1px solid #54616e}button{background:#2eaa7a;color:#fff;border:0}small{color:#bbb}</style><h1>Conectar Browser MCP</h1><p>Para liberar o controle do seu Chrome para esta conta ChatGPT, informe o código de autorização exibido pela extensão Browser MCP.</p><form method="POST" action="/browser/authorize"><input type="hidden" name="flow" value="${fid}"><input required name="claim_code" maxlength="10" minlength="10" autocomplete="off" placeholder="CÓDIGO DE 10 CARACTERES"><button type="submit">Autorizar</button></form><p><small>Permite leitura e ações em páginas autenticadas. Autorize somente sua própria conexão.</small></p></html>`);
  }
  if(pathname==='/authorize'&&req.method==='POST'){
    limiter('oauthguess:'+ip,12,600000);const f=form(await body(req));const flow=store.authFlows[f.flow];if(!flow||flow.expires<now())die(400,'Autorização expirada');flow.tries++;if(flow.tries>5)die(429,'Muitas tentativas neste código');const c=store.claims[hash(String(f.claim_code||'').replace(/\s/g,'').toUpperCase())];if(!c||c.expires<now()) {save();die(403,'Código inválido ou expirado');}const d=store.devices[c.device];if(!d)die(400,'Dispositivo não encontrado');d.owner ||= token();delete store.claims[hash(String(f.claim_code).replace(/\s/g,'').toUpperCase())];delete store.authFlows[f.flow];const code=token();store.codes[hash(code)]={clientId:flow.clientId,redirect:flow.redirect,challenge:flow.challenge,owner:d.owner,resource:RESOURCE,expires:now()+120000};save();const callback=new URL(flow.redirect);callback.searchParams.set('code',code);if(flow.state)callback.searchParams.set('state',flow.state);res.writeHead(302,{location:callback.toString(),'cache-control':'no-store','referrer-policy':'no-referrer'});return res.end();
  }
  if(pathname==='/token'&&req.method==='POST'){
    const f=form(await body(req));if(!store.clients[f.client_id])die(400,'invalid_client');let owner;
    if(f.grant_type==='authorization_code'){const c=store.codes[hash(f.code||'')];if(!c||c.expires<now()||c.clientId!==f.client_id||c.redirect!==f.redirect_uri||c.resource!==RESOURCE||hash(f.code_verifier||'')===''||createHash('sha256').update(f.code_verifier||'').digest('base64url')!==c.challenge)die(400,'invalid_grant');owner=c.owner;delete store.codes[hash(f.code)];}
    else if(f.grant_type==='refresh_token'){
      const refreshHash=hash(f.refresh_token||'');
      const r=readOAuthRecord('refresh',refreshHash)||readLegacyOAuthRecord('refresh',refreshHash);
      if(!r||r.expires<now()||r.clientId!==f.client_id||r.resource!==RESOURCE)die(400,'invalid_grant');
      owner=r.owner;delete store.refresh[refreshHash];revokeOAuthRecord('refresh',refreshHash);
    }
    else die(400,'unsupported_grant_type');
    const access=token(),refresh=token();
    const accessRecord={owner,clientId:f.client_id,resource:RESOURCE,scopes:['browser:control'],expires:now()+3600000};
    const refreshRecord={owner,clientId:f.client_id,resource:RESOURCE,expires:now()+30*86400000};
    persistOAuthRecord('access',access,accessRecord);
    persistOAuthRecord('refresh',refresh,refreshRecord);
    save();
    return json(res,200,{access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:'browser:control'});
  }
  if(pathname==='/mcp'&&['POST','GET'].includes(req.method)){
    let owner;try{owner=userAuth(req);}catch{res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Conecte sua conta Browser MCP"`);return json(res,401,{error:'Autenticação OAuth obrigatória'});}
    if(req.method==='GET')return json(res,405,{error:'MCP Stateless: use POST'});
    const data=JSON.parse(await body(req,65536));const version=browserMcpVersion(data,req.headers);const reply=await rpc(data,owner,version);if(!reply){res.writeHead(202,{'cache-control':'no-store'});return res.end();}return json(res,200,reply,version===BROWSER_MODERN_PROTOCOL?{'mcp-protocol-version':version}:{'mcp-session-id':'stateless'});
  }
  return json(res,404,{error:'Não encontrado'});
 }catch(e){return json(res,e.status||500,{error:e.message});}
});
if (process.env.UNIFIC_EMBEDDED!=='1') app.listen(PORT,'0.0.0.0',()=>console.error(`Browser MCP HTTPS relay integrado 0.6.1 na porta ${PORT}, base=${BASE}`));
export {app};
