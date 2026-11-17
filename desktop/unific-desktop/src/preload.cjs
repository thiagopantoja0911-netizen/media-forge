'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, arg) => ipcRenderer.invoke('unific:' + name, arg);
contextBridge.exposeInMainWorld('unific', Object.freeze({
  snapshot: () => invoke('snapshot'),
  notes: () => invoke('notes'),
  saveNote: (value) => invoke('save-note', value),
  ask: (value) => invoke('ask', value),
  restartWorker: () => invoke('restart-worker'),
  installWorker: () => invoke('install-worker'),
  openWorkerFolder: () => invoke('open-worker-folder'),
  openDashboard: () => invoke('open-dashboard'),
  showMini: () => invoke('show-mini'),
  hideMini: () => invoke('hide-mini'),
  loginSettings: (enabled) => invoke('login-settings', enabled),
  dismiss: () => invoke('dismiss')
}));
