#!/usr/bin/env node
/* MCP adapter: adds browser_run_workflow while preserving the existing OAuth/device relay. */
import { Readable } from 'node:stream';
import { app } from './server.mjs';
import { VIDEOS_SECRETS_TOOLS } from '../src/videos-secrets-mcp.mjs';
import { composeUnifiedMediaTools } from './mediaforge-tool-catalog.mjs';
import { handleUnifiedMediaMcp } from '../src/server.mjs';

const coreHandler = app.listeners('request')[0];
if (typeof coreHandler !== 'function') throw new Error('Relay core request handler not found');

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

function response(status, headers, body) { return {status, headers, body}; }
function makeFakeResponse() {
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const headers = Object.create(null);
  const finishListeners = [];
  const res = {
    writableEnded: false,
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return this; },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    once(event, handler) {
      if (event === 'finish' && typeof handler === 'function') finishListeners.push(handler);
      return this;
    },
    writeHead(status, values = {}) { this.statusCode = status; Object.assign(headers, Object.fromEntries(Object.entries(values).map(([k,v])=>[k.toLowerCase(),v]))); return this; },
    end(chunk = '') {
      this.writableEnded = true;
      const result = response(this.statusCode, {...headers}, Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      try { for (const handler of finishListeners) handler(); }
      finally { finish(result); }
      return this;
    }
  };
  return {res, done};
}
async function invokeCore(originalReq, payload) {
  const raw = JSON.stringify(payload);
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST';
  req.url = originalReq.url || '/mcp';
  req.headers = {...originalReq.headers};
  req.socket = originalReq.socket;
  req.connection = originalReq.socket;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  const {res, done} = makeFakeResponse();
  await coreHandler(req, res);
  return await done;
}
// Dedicated internal forwarder: no public MediaForge bearer is accepted here.
// Browser OAuth is checked against the original relay before this is called.
async function invokeMedia(originalReq,payload){
  const raw=JSON.stringify(payload);
  const request=Readable.from([Buffer.from(raw)]);
  request.method='POST';
  request.url='/mcp';
  request.headers={...originalReq.headers};
  request.socket=originalReq.socket;
  request.connection=originalReq.socket;
  request.httpVersion='1.1';
  request.httpVersionMajor=1;
  request.httpVersionMinor=1;
  const {res,done}=makeFakeResponse();
  await handleUnifiedMediaMcp({request,response:res});
  return await done;
}
const MEDIAFORGE_TOOL_NAMES=new Set(VIDEOS_SECRETS_TOOLS.map(tool=>tool.name));
if(MEDIAFORGE_TOOL_NAMES.size!==VIDEOS_SECRETS_TOOLS.length)throw Error('DUPLICATE_MEDIAFORGE_TOOL_NAME');
const UNIFIED_MEDIA_TOOLS=VIDEOS_SECRETS_TOOLS;
function send(res, result) {
  const headers = {...result.headers};
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  res.writeHead(result.status, headers);
  res.end(result.body);
}
async function readIncoming(req, max = 65536) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw Object.assign(new Error('Payload grande'), {status: 413}); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
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
async function handle(req, res) {
  const url = new URL(req.url || '/', 'https://localhost');
  // Delegate /health to the core relay so extension and ChatGPT origins receive CORS headers.
  if (url.pathname !== '/mcp' || req.method !== 'POST') return coreHandler(req, res);
  try {
    // Validate the existing Browser OAuth grant before reading a large
    // cinematic asset payload. Invalid callers cannot upload any job data.
    const authProbe=await invokeCore(req,{jsonrpc:'2.0',id:0,method:'ping'});
    if(authProbe.status!==200)return send(res,authProbe);
    const raw = await readIncoming(req,32*1024*1024);
    let payload;
    try { payload = JSON.parse(raw); } catch { throw Object.assign(new Error('JSON-RPC inválido'), {status: 400}); }
    if (payload?.method === 'tools/list') {
      const result = await invokeCore(req, payload);
      if (result.status !== 200) return send(res, result);
      const body = JSON.parse(result.body);
      const tools = body?.result?.tools;
      if(Array.isArray(tools)){
        if(!tools.some(tool=>tool.name===WORKFLOW_TOOL.name))tools.push(WORKFLOW_TOOL);
        body.result.tools=composeUnifiedMediaTools(tools, UNIFIED_MEDIA_TOOLS);
      }
      return send(res, response(result.status, result.headers, JSON.stringify(body)));
    }
    if (payload?.method === 'initialize') {
      const result = await invokeCore(req, payload);
      if (result.status !== 200) return send(res, result);
      const body = JSON.parse(result.body);
      if (body?.result?.serverInfo) body.result.serverInfo.version = '0.7.0';
      return send(res, response(result.status, result.headers, JSON.stringify(body)));
    }
    if(payload?.method==='tools/call' && MEDIAFORGE_TOOL_NAMES.has(payload?.params?.name)){
      // Only reachable after the verified browser:control OAuth probe.
      const result=await invokeMedia(req,payload);
      return send(res,result);
    }
    if (payload?.method === 'tools/call' && payload?.params?.name === WORKFLOW_TOOL.name) {
      const args = validateWorkflow(payload.params.arguments || {});
      const encoded = JSON.stringify(args);
      const result = await invokeCore(req, {
        jsonrpc: '2.0',
        id: payload.id,
        method: 'tools/call',
        params: {name: 'tab_run_many', arguments: {tabIds: [0], action: '__browser_mcp_workflow__', selector: encoded}}
      });
      return send(res, result);
    }
    const result = await invokeCore(req, payload);
    return send(res, result);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return send(res, response(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}, JSON.stringify({error:String(error?.message || error)})));
  }
}

app.removeAllListeners('request');
app.on('request', (req, res) => { handle(req, res).catch(error => { if (!res.writableEnded) send(res, response(500, {'content-type':'application/json; charset=utf-8'}, JSON.stringify({error:String(error?.message || error)}))); }); });
console.error('Unific Media Browser MCP adapter 0.8.0 ativo: Chrome + Windows + MediaForge');
