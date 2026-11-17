'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, dialog, globalShortcut } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { API_BASE, workerPath, fetchHealth, tailLog, MemoryStore, assistantReply } = require('./core.cjs');

const APP_ID = 'site.salevo.unificdesktop'; // SAME as V1: keeps the existing NSIS installation and userData.
const HOVER_HEIGHT = 330;
const HOVER_WIDTH = 960;
const DESKTOP_HOTZONE = 15;
const isWindows = process.platform === 'win32';
let dashboard = null, hoverPanel = null, tray = null, memory = null;
let busy = false, lastHealth = {api:false,worker:false,queued:0,processing:0}, lastHealthTime = 0;
let detector = null, desktopActive = false, hoverOpenedOnDesktop = false, hoverCloseTimer = null;
let hoverInterval = null, settings = { startAtLogin:true };

const asset = file => path.join(__dirname,'..','assets',file);
const scriptPath = filename => app.isPackaged
  ? path.join(process.resourcesPath,'scripts',filename)
  : path.join(__dirname,'..','scripts',filename);
const userPrefFile = () => path.join(app.getPath('userData'),'desktop-prefs.json');
function loadPrefs() {
  try { const p=JSON.parse(fs.readFileSync(userPrefFile(),'utf8'));settings={startAtLogin:p.startAtLogin!==false}; }
  catch { settings={startAtLogin:true}; }
}
function savePrefs() {
  fs.mkdirSync(app.getPath('userData'),{recursive:true});
  fs.writeFileSync(userPrefFile(),JSON.stringify(settings,null,2),{encoding:'utf8',mode:0o600});
}
function runPowerShell(file,params=[],timeout=120000) {
  return new Promise((resolve,reject)=>{
    if(!isWindows)return reject(new Error('Esta operação exige Windows.'));
    const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...params];
    execFile('powershell.exe',args,{windowsHide:true,timeout,maxBuffer:128*1024,encoding:'utf8'},(error,out,err)=>{
      if(error) reject(new Error(String(err||out||error.message).slice(-1800)));
      else resolve(String(out).slice(-1800));
    });
  });
}
function createWindow(page,options) {
  const w=new BrowserWindow({
    ...options,icon:asset('icon.png'),backgroundColor:'#090f1c',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}
  });
  w.loadFile(path.join(__dirname,'..','ui',page));
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',event=>event.preventDefault());
  return w;
}
function targetArea(point=screen.getCursorScreenPoint()) { return screen.getDisplayNearestPoint(point).workArea; }
function hoverBounds(area=targetArea()) {
  const width=Math.min(HOVER_WIDTH,area.width-28),height=Math.min(HOVER_HEIGHT,area.height-26);
  return {x:Math.round(area.x+(area.width-width)/2),y:area.y+12,width,height};
}
function dashboardBounds(area=screen.getPrimaryDisplay().workArea) {
  const width=Math.min(1130,area.width-36),height=Math.min(765,area.height-38);
  return {x:Math.round(area.x+(area.width-width)/2),y:area.y+18,width,height};
}
function pointIn(point,bounds,padding=0) {return point.x>=bounds.x-padding && point.x<=bounds.x+bounds.width+padding && point.y>=bounds.y-padding && point.y<=bounds.y+bounds.height+padding;}
function openDashboard(view) {
  hideHover(true);
  if(!dashboard || dashboard.isDestroyed()){
    dashboard=createWindow('dashboard.html',{
      ...dashboardBounds(),show:false,frame:false,movable:false,resizable:false,minimizable:true,maximizable:false,
      skipTaskbar:false,title:'Unific Desktop'
    });
    dashboard.on('close',e=>{if(!app.isQuitting){e.preventDefault();dashboard.hide();}});
  }
  dashboard.setBounds(dashboardBounds());dashboard.show();dashboard.focus();
  if(typeof view==='string' && /^[a-z]+$/.test(view)) dashboard.webContents.send('unific:navigate',view);
}
function showHover() {
  if(!hoverPanel || hoverPanel.isDestroyed() || dashboard?.isVisible())return;
  if(hoverCloseTimer)clearTimeout(hoverCloseTimer);
  hoverPanel.setBounds(hoverBounds());
  if(!hoverPanel.isVisible())hoverPanel.showInactive();
  hoverOpenedOnDesktop=true;
}
function hideHover(force=false) {
  if(hoverCloseTimer)clearTimeout(hoverCloseTimer);
  if(force) {hoverPanel?.hide();hoverOpenedOnDesktop=false;return;}
  hoverCloseTimer=setTimeout(()=>{
    if(!hoverPanel?.isVisible())return;
    const cursor=screen.getCursorScreenPoint();
    if(!pointIn(cursor,hoverPanel.getBounds(),8))hideHover(true);
  },280);
}
function pollHover() {
  if(!hoverPanel || hoverPanel.isDestroyed() || dashboard?.isVisible())return;
  const point=screen.getCursorScreenPoint(),area=targetArea(point);
  const inZone=point.y>=area.y && point.y<=area.y+DESKTOP_HOTZONE && point.x>=area.x+70 && point.x<=area.x+area.width-70;
  if(desktopActive && inZone){showHover();return;}
  if(hoverPanel.isVisible()){
    const inside=pointIn(point,hoverPanel.getBounds(),8);
    if(!inside)hideHover();
    else if(!desktopActive && !hoverPanel.isFocused())hideHover(true);
  }
}
function startDesktopDetector() {
  if(!isWindows){desktopActive=false;return;}
  detector=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptPath('desktop-foreground.ps1')],
    {windowsHide:true,stdio:['ignore','pipe','ignore']});
  let buffer='';
  detector.stdout.setEncoding('utf8');
  detector.stdout.on('data',chunk=>{
    buffer+=chunk;
    let index;
    while((index=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);
      if(line==='1'||line==='0')desktopActive=line==='1';
    }
    if(buffer.length>100)buffer='';
  });
  detector.on('error',()=>{desktopActive=false;});
  detector.on('exit',()=>{desktopActive=false;detector=null;hideHover(true);});
}
function createTrayAndHover() {
  tray=new Tray(nativeImage.createFromPath(asset('icon.png')).resize({width:18,height:18}));
  tray.setToolTip('Unific Desktop — trabalhando em segundo plano');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Abrir Unific Desktop',click:()=>openDashboard('overview')},
    {label:'Diagnóstico',click:()=>openDashboard('diagnostics')},
    {label:'Configurações e memória',click:()=>openDashboard('settings')},
    {type:'separator'},
    {label:'Sair',click:()=>{app.isQuitting=true;app.quit();}}
  ]));
  tray.on('click',()=>openDashboard('overview'));
  hoverPanel=createWindow('hover.html',{
    ...hoverBounds(),transparent:true,backgroundColor:'#00000000',frame:false,show:false,
    resizable:false,movable:false,maximizable:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,focusable:true
  });
  hoverPanel.setAlwaysOnTop(true,'floating');
  hoverPanel.on('blur',()=>hideHover());
  screen.on('display-metrics-changed',()=>{
    if(hoverPanel?.isVisible())hoverPanel.setBounds(hoverBounds());
    if(dashboard?.isVisible())dashboard.setBounds(dashboardBounds());
  });
  startDesktopDetector();hoverInterval=setInterval(pollHover,160);
}
async function snapshot(fresh=false) {
  if(fresh||Date.now()-lastHealthTime>6500){lastHealth=await fetchHealth();lastHealthTime=Date.now();}
  const folder=workerPath(),installed=fs.existsSync(path.join(folder,'desktop','run-worker.ps1'));
  let paired=installed&&fs.existsSync(path.join(folder,'.mediaforge','worker-token.dpapi'));
  if(installed&&!paired){try{paired=/^MEDIAFORGE_WORKER_TOKEN=/m.test(fs.readFileSync(path.join(folder,'.env.local'),'utf8'));}catch{}}
  const graph=memory.graph();
  return {...lastHealth,folder,installed,paired,logs:installed?tailLog(folder):[],
    hostname:os.hostname(),platform:process.platform,startAtLogin:settings.startAtLogin,
    desktopOnly:true,memoryCount:graph.total,memoryTopics:graph.nodes.filter(x=>x.count>0).length,
    memoryAutoLearn:graph.settings.autoLearn,version:app.getVersion(),busy};
}
function lockOperation(fn){return async()=>{
  if(busy)return{ok:false,error:'Há outra operação em andamento.'};
  busy=true;
  try{return{ok:true,output:await fn()};}
  catch(err){return{ok:false,error:String(err.message||err).slice(0,1800)};}
  finally{busy=false;}
};}
function registerIPC(){
  ipcMain.handle('unific:snapshot',()=>snapshot(true));
  ipcMain.handle('unific:graph',()=>memory.graph());
  ipcMain.handle('unific:notes',()=>memory.read());
  ipcMain.handle('unific:save-note',(event,value)=>memory.save(value));
  ipcMain.handle('unific:memory-settings',(event,options)=>memory.configure(options));
  ipcMain.handle('unific:memory-remove',(event,id)=>memory.remove(String(id)));
  ipcMain.handle('unific:memory-clear',()=>memory.clear());
  ipcMain.handle('unific:memory-export',async()=>{
    const {canceled,filePath}=await dialog.showSaveDialog(dashboard||undefined,{title:'Exportar rede de conhecimento',defaultPath:'unific-brain-export.json',filters:[{name:'JSON',extensions:['json']}]});
    if(canceled||!filePath)return{ok:false,canceled:true};
    fs.writeFileSync(filePath,memory.export(),{encoding:'utf8',mode:0o600});return{ok:true,filePath};
  });
  ipcMain.handle('unific:ask',async(e,prompt)=>{
    if(typeof prompt!=='string'||prompt.length>500)throw new Error('Pergunta inválida.');
    memory.autoLearn(prompt);
    return assistantReply(prompt,await snapshot(),memory.read());
  });
  ipcMain.handle('unific:open-dashboard',(event,view)=>openDashboard(view));
  ipcMain.handle('unific:hide-hover',()=>hideHover());
  ipcMain.handle('unific:dismiss',()=>{dashboard?.hide();hideHover(true);});
  ipcMain.handle('unific:open-worker-folder',()=>{
    const dir=workerPath();return fs.existsSync(dir)?shell.openPath(dir):'Pasta do worker não encontrada.';
  });
  ipcMain.handle('unific:login-settings',(event,enabled)=>{
    if(typeof enabled!=='boolean')throw new Error('Configuração inválida.');
    settings.startAtLogin=enabled;savePrefs();
    if(isWindows)app.setLoginItemSettings({openAtLogin:enabled,openAsHidden:true,args:['--hidden']});
    return settings.startAtLogin;
  });
  ipcMain.handle('unific:restart-worker',lockOperation(async()=>{
    const install=workerPath();
    if(!fs.existsSync(path.join(install,'desktop','run-worker.ps1')))throw new Error('Worker não instalado. Prepare dependências antes.');
    return runPowerShell(scriptPath('restart-worker-safe.ps1'),['-InstallDir',install],90000);
  }));
  ipcMain.handle('unific:install-worker',lockOperation(async()=>runPowerShell(scriptPath('bootstrap-worker.ps1'),[],15*60000)));
}
async function bootstrapOnFirstLaunch(){
  const folder=workerPath();
  if(fs.existsSync(folder))return; // Never touch an existing V1/V2 folder automatically.
  const stamp=path.join(app.getPath('userData'),'auto-install-attempt.json');
  if(fs.existsSync(stamp))return;
  fs.writeFileSync(stamp,JSON.stringify({at:new Date().toISOString(),state:'started'}));
  busy=true;
  try{const output=await runPowerShell(scriptPath('bootstrap-worker.ps1'),[],15*60000);
    fs.writeFileSync(stamp,JSON.stringify({at:new Date().toISOString(),state:'finished',info:output.slice(-700)}));}
  catch(error){fs.writeFileSync(stamp,JSON.stringify({at:new Date().toISOString(),state:'failed',error:String(error.message).slice(0,700)}));}
  finally{busy=false;}
}
const alreadyRunning=!app.requestSingleInstanceLock();
if(alreadyRunning)app.quit();
else {
  app.on('second-instance',()=>openDashboard('overview'));
  app.whenReady().then(()=>{
    if(isWindows)app.setAppUserModelId(APP_ID);
    loadPrefs();
    if(isWindows)app.setLoginItemSettings({openAtLogin:settings.startAtLogin,openAsHidden:true,args:['--hidden']});
    memory=new MemoryStore(path.join(app.getPath('userData'),'neural-memory.json'),path.join(app.getPath('userData'),'assistant-memory.json'));
    registerIPC();createTrayAndHover();
    globalShortcut.register('CommandOrControl+Alt+U',()=>openDashboard('overview'));
    if(!process.argv.includes('--hidden'))openDashboard('overview');
    if(isWindows)setTimeout(bootstrapOnFirstLaunch,3500);
  });
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{
    app.isQuitting=true;
    if(hoverInterval)clearInterval(hoverInterval);
    if(detector){detector.kill();detector=null;}
    globalShortcut.unregisterAll();
  });
}
