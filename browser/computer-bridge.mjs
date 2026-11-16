// Browser MCP computer-control add-on. Browser tool handling remains untouched.
// No arbitrary shell, filesystem path, URL, process name or script parameters.
import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync, renameSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const DESKTOP_APPROVAL_MS=60*60*1000;
const TYPES=new Set(['diagnose','update-staging','desktop-session','desktop-foreground-session','desktop-windows','desktop-screen','desktop-click','desktop-type','desktop-app','desktop-ui','desktop-files','desktop-metrics']);
const BRANCH='feature/conexoes-mediaforge-primeiro';
const SHA=/^[0-9a-f]{40}$/i;
const ALLOWED_ORIGIN='thiagopantoja0911-netizen/media-forge';
const now=()=>Date.now();
const secret=()=>randomBytes(32).toString('base64url');
const digest=s=>createHash('sha256').update(String(s)).digest('hex');
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const code=()=>Array.from(randomBytes(12),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');
const cleanResult=(x,max=1800)=>{
 const json=JSON.stringify(x);
 return json&&json.length<=max?JSON.parse(json):{error:'RESULT_TOO_LARGE'};
};
const def=()=>({version:1,agents:{},tasks:{},audit:[]});
function schema(name,description,props,required=[]){
 return {name,description,inputSchema:{type:'object',properties:props,required,additionalProperties:false},
 securitySchemes:[{type:'oauth2',scopes:['browser:control']}]};
}
export const computerToolSpecs={
 computer_status:schema('computer_status','Estado do agente local Windows pareado ao Browser MCP. Não executa comandos.',{}),
 computer_pair:schema('computer_pair','Vincula o agente Windows por código efêmero exibido localmente; não altera o navegador.',{code:{type:'string',minLength:12,maxLength:12}},['code']),
 computer_diagnose:schema('computer_diagnose','Agenda diagnóstico de leitura do clone autorizado, sem shell remoto genérico.',{}),
 computer_update_staging:schema('computer_update_staging','Solicita atualização fast-forward do MediaForge Staging; exige confirmação local no notebook antes da execução.',{
  expectedSha:{type:'string',pattern:'^[0-9a-fA-F]{40}$'},confirmation:{type:'string',enum:['ATUALIZAR MEDIAFORGE']}
 },['expectedSha','confirmation']),
 computer_task_status:schema('computer_task_status','Consulta andamento de uma tarefa autorizada.',{taskId:{type:'string',maxLength:64}},['taskId']),
 computer_desktop_session_start:schema('computer_desktop_session_start','Solicita sessão de automação em segundo plano por 1 hora; exige aprovação física local no Windows.',{}),
 computer_desktop_foreground_session_start:schema('computer_desktop_foreground_session_start','Solicita interação visível por 1 hora; pode mudar foco, mouse e teclado. Exige aprovação física local separada.',{}),
 computer_desktop_session_status:schema('computer_desktop_session_status','Consulta prazo e status da sessão de controle.',{}),
 computer_desktop_session_stop:schema('computer_desktop_session_stop','Revoga a sessão de controle do Windows imediatamente.',{}),
 computer_windows:schema('computer_windows','Lista títulos e identificadores das janelas abertas, mediante sessão local aprovada.',{}),
 computer_screen:schema('computer_screen','Solicita uma imagem JPEG reduzida da área de trabalho, mediante sessão local aprovada.',{}),
 computer_metrics:schema('computer_metrics','Read-only RAM and storage capacity metrics, requires approved Windows session.',{}),
 computer_task_image:schema('computer_task_image','Lê a imagem da tarefa de captura, vinculada ao proprietário e com expiração curta.',{taskId:{type:'string',pattern:'^[a-f0-9]{32}$'}},['taskId']),
 computer_click:schema('computer_click','Clica dentro da tela, na sessão aprovada.',{x:{type:'number'},y:{type:'number'},button:{type:'string',enum:['left','right','double']}},['x','y','button']),
 computer_type:schema('computer_type','Digita até 300 caracteres Unicode durante sessão aprovada.',{text:{type:'string',minLength:1,maxLength:300}},['text']),
 computer_app:schema('computer_app','Abre Notepad, Calculadora, Paint ou Explorer sem ativar a janela; ativar uma janela exige sessão de primeiro plano.',{action:{type:'string',enum:['open','activate']},app:{type:'string'},handle:{type:'string'}},['action']),
 computer_ui:schema('computer_ui','Inspeciona e opera controles de qualquer janela por Windows UI Automation, sem enviar mouse/teclado nem ativar a janela. Exige sessão local aprovada.',{
  operation:{type:'string',enum:['inspect','set_value','invoke','toggle','select','expand','collapse']},
  windowHandle:{type:'string',pattern:'^[a-fA-F0-9]{1,16}$'},automationId:{type:'string',maxLength:128},name:{type:'string',maxLength:128},
  controlType:{type:'string',enum:['Button','Edit','Text','ComboBox','CheckBox','RadioButton','ListItem','MenuItem','TabItem','Hyperlink','TreeItem','Pane','Window','List','DataGrid','DataItem','Custom','Group','Document']},
  value:{type:'string',maxLength:4000},confirmDestructive:{type:'boolean'}
 },['operation','windowHandle']),
 computer_files:schema('computer_files','Lista, cria pastas, move, copia ou renomeia itens apenas em Desktop, Documentos e Downloads. Sem exclusão.',{
  action:{type:'string',enum:['list','mkdir','move','copy','rename']},root:{type:'string',enum:['Desktop','Documents','Downloads']},
  path:{type:'string',maxLength:240},destinationRoot:{type:'string',enum:['Desktop','Documents','Downloads']},
  destination:{type:'string',maxLength:240}},['action','root'])
};
export function createComputerBridge(dataDir,opts={}){
 const file=path.join(dataDir,'browser-computer-state.json');
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 let data=def(),storageHealthy=true;
 const screenshots=new Map();
 try{
  if(existsSync(file)){
   const original=JSON.parse(readFileSync(file,'utf8'));
   if(!original||typeof original!=='object'||Array.isArray(original)||
      !original.agents||typeof original.agents!=='object'||
      !original.tasks||typeof original.tasks!=='object')throw Error('INVALID_COMPUTER_STATE');
   data={...def(),...original};
  }
 }catch{
  // Never break Browser MCP navigation because optional computer state is damaged.
  storageHealthy=false;
  console.error('[browser-computer] optional maintenance state unavailable; Chrome remains active');
 }
 const rate=new Map();
 const limit=(id,max=6,windowMs=60000)=>{
  const stamps=(rate.get(id)||[]).filter(t=>t>now()-windowMs);
  if(stamps.length>=max)throw Object.assign(new Error('RATE_LIMITED'),{status:429});
  stamps.push(now());rate.set(id,stamps);
 };
 const persist=()=>{
  if(!storageHealthy)throw Error('COMPUTER_STATE_UNAVAILABLE');
  const temp=file+'.'+randomBytes(6).toString('hex')+'.tmp';
  writeFileSync(temp,JSON.stringify(data),{mode:0o600});
  renameSync(temp,file);
 };
 const audit=(action,owner,result)=>{
  data.audit.push({at:new Date().toISOString(),action,ownerFingerprint:digest(owner||'unpaired').slice(0,12),result});
  data.audit=data.audit.slice(-100);
 };
 const agentsOf=owner=>Object.values(data.agents).filter(a=>a.owner===owner);
 const view=t=>({taskId:t.id,kind:t.kind,status:t.status,createdAt:t.createdAt,updatedAt:t.updatedAt,expectedSha:t.expectedSha||null,
  report:t.report||null,error:t.error||null});
 function toolResult(obj,error=false){return {isError:error,content:[{type:'text',text:JSON.stringify(obj)}]};}
 const safeTool=(fn)=>{try{if(!storageHealthy)throw Error('COMPUTER_STATE_UNAVAILABLE');return toolResult(fn());}catch(e){return toolResult({error:String(e.message||e).slice(0,110)},true);}};
 function runTool(owner,name,args={}){
  if(name==='computer_task_image'){
   try {
    if(!storageHealthy||!owner)throw Error('OAUTH_REQUIRED');
    const t=data.tasks[String(args.taskId||'')];
    if(!t||t.owner!==owner||t.kind!=='desktop-screen'||t.status!=='done')throw Error('SCREEN_NOT_FOUND');
    const image=screenshots.get(t.id);
    if(!image||image.owner!==owner||image.expires<now())throw Error('SCREEN_EXPIRED');
    return {content:[{type:'image',mimeType:'image/jpeg',data:image.data},{type:'text',text:JSON.stringify({width:t.report?.width,height:t.report?.height,fullWidth:t.report?.fullWidth,fullHeight:t.report?.fullHeight,screenLeft:t.report?.screenLeft,screenTop:t.report?.screenTop})}]};
   }catch(e){return toolResult({error:String(e.message||e).slice(0,100)},true)}
  }
  return safeTool(()=>{
   if(!owner)throw Error('OAUTH_REQUIRED');
   const own=agentsOf(owner),agent=own.at(-1);
   if(name==='computer_pair'){
    limit('pair:'+digest(owner),5,10*60*1000);
    const entered=String(args.code||'').trim().toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{12}$/.test(entered))throw Error('PAIR_CODE_INVALID');
    const selected=Object.values(data.agents).find(a=>!a.owner&&a.pairExpires>now()&&same(a.pairHash,digest(entered)));
    if(!selected)throw Error('PAIR_CODE_INVALID_OR_EXPIRED');
    selected.owner=owner;delete selected.pairHash;delete selected.pairExpires;selected.pairedAt=now();
    audit('pair',owner,'paired');persist();return {paired:true,agentId:selected.id};
   }
   if(name==='computer_status')return {paired:!!agent,connected:!!(agent&&now()-agent.lastSeen<45000),
      agentCount:own.length,lastSeen:agent?.lastSeen?new Date(agent.lastSeen).toISOString():null,
      pending:Object.values(data.tasks).filter(t=>t.owner===owner&&!['done','failed','denied','cancelled'].includes(t.status)).length};
   if(name==='computer_desktop_session_status')return {active:!!(agent&&agent.desktopUntil>now()),expiresAt:agent?.desktopUntil?new Date(agent.desktopUntil).toISOString():null,foregroundActive:!!(agent&&agent.foregroundUntil>now()),foregroundExpiresAt:agent?.foregroundUntil?new Date(agent.foregroundUntil).toISOString():null,pendingApproval:Object.values(data.tasks).some(t=>t.owner===owner&&['desktop-session','desktop-foreground-session'].includes(t.kind)&&!['done','failed','denied','cancelled'].includes(t.status))};
   if(name==='computer_desktop_session_stop'){
    if(!agent)throw Error('WINDOWS_AGENT_NOT_PAIRED');
    agent.desktopUntil=0;agent.foregroundUntil=0;
    for(const [key,value] of screenshots)if(value.owner===owner)screenshots.delete(key);
    for(const t of Object.values(data.tasks))if(t.agentId===agent.id&&t.kind.startsWith('desktop-')&&!['done','failed','denied','cancelled'].includes(t.status)){t.status='cancelled';t.updatedAt=now();}
    audit('desktop_session_stop',owner,'revoked');persist();return {active:false,foregroundActive:false,revoked:true};
   }
   if(name==='computer_task_status'){
    const t=data.tasks[String(args.taskId||'')];if(!t||t.owner!==owner)throw Error('TASK_NOT_FOUND');
    return view(t);
   }
   if(['computer_desktop_session_start','computer_desktop_foreground_session_start','computer_windows','computer_screen','computer_click','computer_type','computer_app','computer_ui','computer_files','computer_metrics'].includes(name)){
    if(!agent)throw Error('WINDOWS_AGENT_NOT_PAIRED');
    if(now()-agent.lastSeen>45000)throw Error('WINDOWS_AGENT_OFFLINE');
    const create=name==='computer_desktop_session_start'||name==='computer_desktop_foreground_session_start';
    const foregroundAction=name==='computer_click'||name==='computer_type'||(name==='computer_app'&&args.action==='activate');
    limit('desktop_task:'+digest(owner),18,60000);
    const kinds={
     computer_desktop_session_start:'desktop-session',computer_desktop_foreground_session_start:'desktop-foreground-session',
     computer_windows:'desktop-windows',computer_screen:'desktop-screen',computer_click:'desktop-click',computer_type:'desktop-type',
     computer_app:'desktop-app',computer_ui:'desktop-ui',computer_files:'desktop-files',computer_metrics:'desktop-metrics'};
    const kind=kinds[name],x={...args};
    if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_TASK_ARGS');
    if(name==='computer_click'&&(!Number.isInteger(x.x)||!Number.isInteger(x.y)||x.x< -12000||x.x>12000||x.y< -12000||x.y>12000||!['left','right','double'].includes(x.button)))throw Error('INVALID_MOUSE_ARGS');
    if(name==='computer_type'&&(typeof x.text!=='string'||x.text.length<1||x.text.length>300))throw Error('INVALID_TEXT');
    if(name==='computer_app'){
      if(x.action==='open'&&['notepad','calculator','paint','explorer'].includes(x.app)){}
      else if(x.action==='activate'&&typeof x.handle==='string'&&/^[a-f0-9]{1,16}$/i.test(x.handle)){
       if(!(agent.foregroundUntil>now()))throw Error('FOREGROUND_SESSION_REQUIRED');
      }else throw Error('APP_NOT_ALLOWED');
    }
    if(name==='computer_ui'){
      const ops=['inspect','set_value','invoke','toggle','select','expand','collapse'];
      const types=['Button','Edit','Text','ComboBox','CheckBox','RadioButton','ListItem','MenuItem','TabItem','Hyperlink','TreeItem','Pane','Window','List','DataGrid','DataItem','Custom','Group','Document'];
      const allowed=['operation','windowHandle','automationId','name','controlType','value','confirmDestructive'];
      if(Object.keys(x).some(k=>!allowed.includes(k))||!ops.includes(x.operation)||typeof x.windowHandle!=='string'||!/^[a-f0-9]{1,16}$/i.test(x.windowHandle))throw Error('UI_ARGS_INVALID');
      if(x.operation!=='inspect'&&!(typeof x.automationId==='string'&&x.automationId.length>0&&x.automationId.length<=128)&&!(typeof x.name==='string'&&x.name.length>0&&x.name.length<=128))throw Error('UI_SELECTOR_REQUIRED');
      if(x.automationId!==undefined&&(typeof x.automationId!=='string'||x.automationId.length>128))throw Error('UI_SELECTOR_INVALID');
      if(x.name!==undefined&&(typeof x.name!=='string'||x.name.length>128))throw Error('UI_SELECTOR_INVALID');
      if(x.controlType!==undefined&&!types.includes(x.controlType))throw Error('UI_CONTROL_TYPE_INVALID');
      if(x.operation==='set_value'&&(typeof x.value!=='string'||x.value.length>4000))throw Error('UI_VALUE_INVALID');
      if(x.operation!=='set_value'&&x.value!==undefined)throw Error('UNEXPECTED_ARGUMENTS');
      if(x.operation==='invoke'&&x.confirmDestructive!==undefined&&typeof x.confirmDestructive!=='boolean')throw Error('UI_CONFIRMATION_INVALID');
      if(x.operation!=='invoke'&&x.confirmDestructive!==undefined)throw Error('UNEXPECTED_ARGUMENTS');
      if(x.operation==='inspect'&&Object.keys(x).some(k=>!['operation','windowHandle'].includes(k)))throw Error('UNEXPECTED_ARGUMENTS');
    }
    if(name==='computer_files'){
      if(!['list','mkdir','move','copy','rename'].includes(x.action)||!['Desktop','Documents','Downloads'].includes(x.root)||typeof x.path!=='string'||x.path.length>240)throw Error('FILE_ARGS_INVALID');
      if(['move','copy','rename'].includes(x.action)&&(!(typeof x.destination==='string'&&x.destination.length>=1&&x.destination.length<=240)||!(x.action==='rename'||['Desktop','Documents','Downloads'].includes(x.destinationRoot))))throw Error('FILE_TARGET_INVALID');
    }
    if(Object.keys(x).some(key=>!({ 'desktop-click':['x','y','button'],'desktop-type':['text'],'desktop-app':['action','app','handle'],
      'desktop-ui':['operation','windowHandle','automationId','name','controlType','value','confirmDestructive'],
      'desktop-files':['action','root','path','destinationRoot','destination'] }[kind]||[]).includes(key)))throw Error('UNEXPECTED_ARGUMENTS');
    if(!create&&(foregroundAction?!(agent.foregroundUntil>now()):!(agent.desktopUntil>now())))throw Error(foregroundAction?'FOREGROUND_SESSION_REQUIRED':'LOCAL_DESKTOP_APPROVAL_REQUIRED');
    if(Object.values(data.tasks).some(t=>t.agentId===agent.id&&!['done','failed','denied','cancelled'].includes(t.status)))throw Error('TASK_ALREADY_ACTIVE');
    const id=randomBytes(16).toString('hex'),t={id,kind,owner,agentId:agent.id,args:x,status:create?'pending_local_approval':'queued',createdAt:now(),updatedAt:now()};
    data.tasks[id]=t;
    const list=Object.values(data.tasks).sort((a,b)=>a.createdAt-b.createdAt);
    for(const old of list.slice(0,Math.max(0,list.length-40))){delete data.tasks[old.id];screenshots.delete(old.id);}
    audit('queue:'+kind,owner,'queued');persist();
    return {taskId:id,status:t.status,kind,localApprovalRequired:create,approvalPage:create?'http://127.0.0.1:4318/maintenance':null};
   }
   if(name==='computer_diagnose'||name==='computer_update_staging'){
    if(!agent)throw Error('WINDOWS_AGENT_NOT_PAIRED');
    if(now()-agent.lastSeen>45000)throw Error('WINDOWS_AGENT_OFFLINE');
    limit('task:'+digest(owner),4,60000);
    if(Object.values(data.tasks).some(t=>t.agentId===agent.id&&!['done','failed','denied','cancelled'].includes(t.status)))throw Error('TASK_ALREADY_ACTIVE');
    const update=name==='computer_update_staging';
    if(update&&args.confirmation!=='ATUALIZAR MEDIAFORGE')throw Error('EXPLICIT_CONFIRMATION_REQUIRED');
    if(update&&!SHA.test(String(args.expectedSha||'')))throw Error('INVALID_COMMIT_SHA');
    const id=randomBytes(16).toString('hex');
    const t={id,kind:update?'update-staging':'diagnose',owner,agentId:agent.id,
      status:update?'pending_local_approval':'queued',createdAt:now(),updatedAt:now(),
      expectedSha:update?String(args.expectedSha).toLowerCase():null,
      branch:BRANCH,origin:ALLOWED_ORIGIN};
    data.tasks[id]=t;
    const list=Object.values(data.tasks).sort((a,b)=>a.createdAt-b.createdAt);
    for(const old of list.slice(0,Math.max(0,list.length-40)))delete data.tasks[old.id];
    audit('queue:'+t.kind,owner,'queued');persist();
    return {taskId:id,status:t.status,kind:t.kind,localApprovalRequired:update,
      approvalPage:update?'http://127.0.0.1:4318/maintenance':null};
   }
   throw Error('COMPUTER_TOOL_NOT_FOUND');
  });
 }
 async function requestBody(req,max=4096){
  const chunks=[];let bytes=0;
  for await(const c of req){bytes+=c.length;if(bytes>max)throw Object.assign(new Error('BODY_TOO_LARGE'),{status:413});chunks.push(c);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(new Error('INVALID_JSON'),{status:400});}
 }
 function reply(res,status,obj){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','x-frame-options':'DENY'});
  res.end(JSON.stringify(obj));
 }
 function agentAuth(req){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  const h=digest(token);
  const agent=token&&Object.values(data.agents).find(a=>same(a.tokenHash,h));
  if(!agent)throw Object.assign(new Error('UNAUTHORIZED_AGENT'),{status:401});
  return agent;
 }
 async function handleAgentHTTP(req,res,pathname){
  if(!pathname.startsWith('/computer/agent/'))return false;
  if(!storageHealthy){reply(res,503,{error:'COMPUTER_STATE_UNAVAILABLE'});return true;}
  if(req.method!=='POST'){reply(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}
  try{
   if(pathname==='/computer/agent/enroll'){
    limit('enroll:'+String(req.socket.remoteAddress),3,60*60*1000);
    const unpaired=Object.values(data.agents).filter(a=>!a.owner&&a.pairExpires>now());
    if(unpaired.length>8)throw Object.assign(new Error('ENROLLMENT_LIMIT'),{status:429});
    const id=randomBytes(12).toString('hex'),accessToken=secret(),pairCode=code();
    data.agents[id]={id,owner:null,tokenHash:digest(accessToken),pairHash:digest(pairCode),pairExpires:now()+600000,lastSeen:0,desktopUntil:0,foregroundUntil:0};
    audit('agent_enroll',null,'created');persist();
    reply(res,201,{agentId:id,agentToken:accessToken,pairCode,expiresSeconds:600});return true;
   }
   const agent=agentAuth(req);
   const input=await requestBody(req,pathname==='/computer/agent/result'?1350000:4096);
   if(pathname==='/computer/agent/renew-pair'){
    if(agent.owner)throw Object.assign(new Error('AGENT_ALREADY_PAIRED'),{status:409});
    limit('renew-pair:'+agent.id,6,60*60*1000);
    const nextCode=code();
    agent.pairHash=digest(nextCode);agent.pairExpires=now()+600000;
    audit('pair_renew',null,'renewed');persist();
    reply(res,200,{pairCode:nextCode,expiresSeconds:600});return true;
   }
   if(pathname==='/computer/agent/poll'){
    // A crashed/offline agent must not leave a task permanently locked.
    for(const t of Object.values(data.tasks)){
     if(t.agentId===agent.id&&t.status==='running'&&t.leaseExpires<now()){
      t.status='failed';t.error='AGENT_LEASE_EXPIRED';t.updatedAt=now();
      delete t.lease;delete t.leaseExpires;
      audit('expire:'+t.kind,agent.owner,'failed');
     }
    }
    agent.lastSeen=now();agent.clientVersion=String(input.version||'1').slice(0,16);
    const task=Object.values(data.tasks).filter(t=>t.agentId===agent.id).sort((a,b)=>a.createdAt-b.createdAt)
      .find(t=>['pending_local_approval','queued'].includes(t.status));
    let result=null;
    if(task&&task.status==='pending_local_approval')
     result={id:task.id,kind:task.kind,needsLocalApproval:true,expectedSha:task.expectedSha,branch:task.branch,origin:task.origin};
    else if(task){
     if(task.kind.startsWith('desktop-')&&!['desktop-session','desktop-foreground-session'].includes(task.kind)){
      const foregroundRequired=task.kind==='desktop-click'||task.kind==='desktop-type'||(task.kind==='desktop-app'&&task.args?.action==='activate');
      const valid=foregroundRequired?agent.foregroundUntil>now():agent.desktopUntil>now();
      if(!valid){task.status='failed';task.error=foregroundRequired?'FOREGROUND_SESSION_EXPIRED':'DESKTOP_SESSION_EXPIRED';task.updatedAt=now();persist();reply(res,200,{paired:true,task:null,desktopUntil:agent.desktopUntil||0,foregroundUntil:agent.foregroundUntil||0});return true;}
     }
     task.status='running';task.updatedAt=now();task.lease=digest(secret());
     task.leaseExpires=now()+300000;
     result={id:task.id,kind:task.kind,args:task.args||{},lease:task.lease,expectedSha:task.expectedSha,branch:task.branch,origin:task.origin};
    }
    persist();reply(res,200,{paired:!!agent.owner,task:agent.owner?result:null,desktopUntil:agent.owner?agent.desktopUntil||0:0,foregroundUntil:agent.owner?agent.foregroundUntil||0:0});return true;
   }
   if(!agent.owner)throw Object.assign(new Error('AGENT_NOT_PAIRED'),{status:403});
   const t=data.tasks[String(input.id||'')];
   if(!t||t.agentId!==agent.id||t.owner!==agent.owner)throw Object.assign(new Error('TASK_NOT_FOUND'),{status:404});
   if(pathname==='/computer/agent/decision'){
    if(t.status!=='pending_local_approval'||!['update-staging','desktop-session','desktop-foreground-session'].includes(t.kind))throw Object.assign(new Error('NOT_WAITING_FOR_APPROVAL'),{status:409});
    if(input.approved!==true&&input.approved!==false)throw Object.assign(new Error('DECISION_REQUIRED'),{status:422});
    t.status=input.approved?'queued':'denied';t.updatedAt=now();audit('local_decision',agent.owner,t.status);persist();
    reply(res,200,{ok:true,status:t.status});return true;
   }
   if(pathname==='/computer/agent/session-stop'){
    agent.desktopUntil=0;
    for(const [key,value] of screenshots)if(value.owner===agent.owner)screenshots.delete(key);
    audit('local_desktop_stop',agent.owner,'revoked');persist();
    reply(res,200,{ok:true,active:false});return true;
   }
   if(pathname==='/computer/agent/result'){
    if(t.status!=='running'||!same(t.lease,String(input.lease||''))||t.leaseExpires<now())
      throw Object.assign(new Error('LEASE_INVALID'),{status:409});
    if(t.kind==='desktop-screen'&&input.success===true){
      const report=input.report||{},data64=String(report.data||'');
      if(data64.length>1250000||data64.length<100||!/^[A-Za-z0-9+/]+={0,2}$/.test(data64))throw Object.assign(new Error('SCREEN_PAYLOAD_INVALID'),{status:422});
      const bytes=Buffer.from(data64,'base64');
      if(bytes.length>900000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Object.assign(new Error('SCREEN_IMAGE_INVALID'),{status:422});
      screenshots.set(t.id,{owner:agent.owner,data:data64,expires:now()+120000});
      t.report=cleanResult({operation:'screen',imageReady:true,width:report.width,height:report.height,fullWidth:report.fullWidth,fullHeight:report.fullHeight,screenLeft:report.screenLeft,screenTop:report.screenTop});
      for(const [key,value] of screenshots)if(value.expires<now())screenshots.delete(key);
    }else t.report=cleanResult(input.report,t.kind.startsWith('desktop-')?10000:1800);
    if(t.kind==='desktop-session'&&input.success===true){agent.desktopUntil=now()+DESKTOP_APPROVAL_MS;t.report={active:true,mode:'background',expiresAt:new Date(agent.desktopUntil).toISOString()};}
    if(t.kind==='desktop-foreground-session'&&input.success===true){agent.foregroundUntil=now()+DESKTOP_APPROVAL_MS;t.report={active:true,mode:'foreground',expiresAt:new Date(agent.foregroundUntil).toISOString()};}
    t.status=input.success===true?'done':'failed';t.updatedAt=now();
    t.error=input.success===true?null:String(input.error||'UNKNOWN_ERROR').slice(0,240);
    delete t.lease;delete t.leaseExpires;audit('complete:'+t.kind,agent.owner,t.status);persist();
    reply(res,200,{ok:true,status:t.status});return true;
   }
   reply(res,404,{error:'NOT_FOUND'});return true;
  }catch(e){reply(res,e.status||400,{error:String(e.message||e).slice(0,120)});return true;}
 }
 return {toolSpecs:computerToolSpecs,runTool,handleAgentHTTP,
  getStateForTest:()=>JSON.parse(JSON.stringify(data))};
}
