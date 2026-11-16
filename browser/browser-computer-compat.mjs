// Backward-compatible transport for a ChatGPT MCP app with a frozen tool list.
// Bounded Windows automation through the existing tab_run_many contract; no generic shell or remote command execution.
// The existing tab_run_many JSON Schema is preserved byte-for-byte.
export const COMPUTER_COMPAT_ACTION = '__browser_mcp_computer_v1__';

const routes = Object.freeze({
  status: 'computer_status',
  foreground_session_start:'computer_desktop_foreground_session_start',
  pair: 'computer_pair',
  diagnose: 'computer_diagnose',
  task_status: 'computer_task_status',
  session_start:'computer_desktop_session_start',session_status:'computer_desktop_session_status',session_stop:'computer_desktop_session_stop',
  windows:'computer_windows',screen:'computer_screen',image:'computer_task_image',click:'computer_click',type:'computer_type',app:'computer_app',ui:'computer_ui',files:'computer_files',metrics:'computer_metrics'
});
const err = (reason) => ({isError:true,content:[{type:'text',text:JSON.stringify({error:reason})}]});
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export function runComputerCompat(owner, args, computerBridge) {
  // Return null for all normal Chrome actions: absolutely no change to browser routing.
  if (args?.action !== COMPUTER_COMPAT_ACTION) return null;
  if (!owner) return err('OAUTH_REQUIRED');
  if (!plain(args) || Object.keys(args).some(key => !['action','tabIds','selector'].includes(key)) ||
      !Array.isArray(args.tabIds) || args.tabIds.length !== 1 || args.tabIds[0] !== 0 ||
      typeof args.selector !== 'string' || Buffer.byteLength(args.selector,'utf8') > 8192) return err('INVALID_COMPUTER_BRIDGE_ARGS');
  let request;
  try { request = JSON.parse(args.selector); }
  catch { return err('INVALID_COMPUTER_BRIDGE_JSON'); }
  if (!plain(request) || Object.keys(request).some(k => !['operation','arguments'].includes(k)) ||
      typeof request.operation !== 'string' || !Object.hasOwn(routes,request.operation) ||
      (request.arguments !== undefined && !plain(request.arguments))) return err('OPERATION_NOT_PERMITTED');
  const input=request.arguments||{};
  const keys=Object.keys(input);
  switch(request.operation){
    case 'status':
    case 'diagnose':
    case 'session_start':
    case 'foreground_session_start':
    case 'session_status':
    case 'session_stop':
    case 'windows':
    case 'screen':
    case 'metrics':
      if(keys.length) return err('UNEXPECTED_ARGUMENTS');
      break;
    case 'pair':
      if(keys.length!==1 || keys[0]!=='code' || typeof input.code!=='string' ||
         !/^[A-HJ-NP-Z2-9]{12}$/.test(input.code)) return err('PAIR_CODE_INVALID');
      break;
    case 'task_status':
    case 'image':
      if(keys.length!==1 || keys[0]!=='taskId' || typeof input.taskId!=='string' ||
         !/^[a-f0-9]{32}$/.test(input.taskId)) return err('INVALID_TASK_ID');
      break;
    case 'click':
      if(keys.length!==3||!keys.every(k=>['x','y','button'].includes(k))||
         !Number.isInteger(input.x)||!Number.isInteger(input.y)||
         Math.abs(input.x)>12000||Math.abs(input.y)>12000||
         !['left','right','double'].includes(input.button))return err('INVALID_MOUSE_ARGS');
      break;
    case 'type':
      if(keys.length!==1||keys[0]!=='text'||typeof input.text!=='string'||input.text.length<1||input.text.length>300)return err('INVALID_TEXT_ARGS');
      break;
    case 'app':
      if(keys.some(k=>!['action','app','handle'].includes(k)) ||
          !(keys.length===2&&input.action==='open'&&['notepad','calculator','paint','explorer'].includes(input.app)||
            keys.length===2&&input.action==='activate'&&typeof input.handle==='string'&&/^[a-f0-9]{1,16}$/i.test(input.handle)))return err('APP_NOT_ALLOWED');
      break;
    case 'ui': {
      const allowed=['operation','windowHandle','automationId','name','controlType','value','confirmDestructive'];
      const operations=['inspect','set_value','invoke','toggle','select','expand','collapse'];
      const types=['Button','Edit','Text','ComboBox','CheckBox','RadioButton','ListItem','MenuItem','TabItem','Hyperlink','TreeItem','Pane','Window','List','DataGrid','DataItem','Custom','Group','Document'];
      if(keys.some(k=>!allowed.includes(k))||!operations.includes(input.operation)||typeof input.windowHandle!=='string'||!/^[a-f0-9]{1,16}$/i.test(input.windowHandle))return err('UI_ARGS_INVALID');
      if(input.operation!=='inspect'&&!(typeof input.automationId==='string'&&input.automationId.length>0&&input.automationId.length<=128)&&!(typeof input.name==='string'&&input.name.length>0&&input.name.length<=128))return err('UI_SELECTOR_REQUIRED');
      if(input.automationId!==undefined&&(typeof input.automationId!=='string'||input.automationId.length>128))return err('UI_SELECTOR_INVALID');
      if(input.name!==undefined&&(typeof input.name!=='string'||input.name.length>128))return err('UI_SELECTOR_INVALID');
      if(input.controlType!==undefined&&!types.includes(input.controlType))return err('UI_CONTROL_TYPE_INVALID');
      if(input.operation==='set_value'&&(typeof input.value!=='string'||input.value.length>4000))return err('UI_VALUE_INVALID');
      if(input.operation!=='set_value'&&input.value!==undefined)return err('UNEXPECTED_ARGUMENTS');
      if(input.operation==='invoke'&&input.confirmDestructive!==undefined&&typeof input.confirmDestructive!=='boolean')return err('UI_CONFIRMATION_INVALID');
      if(input.operation!=='invoke'&&input.confirmDestructive!==undefined)return err('UNEXPECTED_ARGUMENTS');
      if(input.operation==='inspect'&&keys.some(k=>!['operation','windowHandle'].includes(k)))return err('UNEXPECTED_ARGUMENTS');
      break;
    }
    case 'files':
      if(keys.some(k=>!['action','root','path','destinationRoot','destination'].includes(k))||
         !['list','mkdir','move','copy','rename'].includes(input.action)||
         !['Desktop','Documents','Downloads'].includes(input.root)||
         typeof input.path!=='string'||input.path.length>240||
         (['move','copy','rename'].includes(input.action)&&
           (typeof input.destination!=='string'||input.destination.length<1||input.destination.length>240||
            (input.action==='rename' ? keys.includes('destinationRoot'):!['Desktop','Documents','Downloads'].includes(input.destinationRoot)))))return err('FILES_ARGS_INVALID');
      break;
    default: return err('OPERATION_NOT_PERMITTED');
  }
  // The bridge enforces owner isolation, a locally approved 1-hour session, rate limits and explicit app/path allowlists. No generic shell or remote updates.
  return computerBridge.runTool(owner,routes[request.operation],input);
}
