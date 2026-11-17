'use strict';
const { contextBridge,ipcRenderer }=require('electron');
const invoke=(name,arg)=>ipcRenderer.invoke('unific:'+name,arg);
contextBridge.exposeInMainWorld('unific',Object.freeze({
  snapshot:()=>invoke('snapshot'),
  graph:()=>invoke('graph'),
  notes:()=>invoke('notes'),
  saveNote:value=>invoke('save-note',value),
  memorySettings:options=>invoke('memory-settings',options),
  removeMemory:id=>invoke('memory-remove',id),
  clearMemory:()=>invoke('memory-clear'),
  exportMemory:()=>invoke('memory-export'),
  ask:value=>invoke('ask',value),
  restartWorker:()=>invoke('restart-worker'),
  installWorker:()=>invoke('install-worker'),
  openWorkerFolder:()=>invoke('open-worker-folder'),
  openDashboard:view=>invoke('open-dashboard',view),
  hideHover:()=>invoke('hide-hover'),
  loginSettings:enabled=>invoke('login-settings',enabled),
  dismiss:()=>invoke('dismiss'),
  onNavigate:callback=>ipcRenderer.on('unific:navigate',(event,view)=>callback(view))
}));
