'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  API_BASE, TASK_NAME, workerPath, fetchHealth, tailLog, MemoryStore, assistantReply
} = require('./core.cjs');

const APP_ID = 'site.salevo.unificdesktop';
const DASH_SIZE = { width: 1160, height: 790 };
const MINI_SIZE = { width: 378, height: 390 };
const DOCK_SIZE = { width: 68, height: 68 };
let dashboard, mini, dock, tray, memory, busy = false, hideTimer = null;
let lastHealth = { api: false, worker: false, queued: 0, processing: 0 };
let lastHealthTime = 0;
const isWindows = process.platform === 'win32';

function iconPath() { return path.join(__dirname, '..', 'assets', 'icon.png'); }
function scriptPath() { return app.isPackaged
  ? path.join(process.resourcesPath, 'scripts', 'bootstrap-worker.ps1')
  : path.join(__dirname, '..', 'scripts', 'bootstrap-worker.ps1'); }
function launchDir() { return workerPath(); }
function runPowershell(file, args = [], timeout = 180000) {
  return new Promise((resolve, reject) => {
    if (!isWindows) return reject(new Error('A instalação e reinício do worker exigem Windows.'));
    const params = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args];
    execFile('powershell.exe', params, { windowsHide: true, timeout, maxBuffer: 128 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || stdout || error.message).slice(-1600)));
      else resolve(String(stdout).slice(-1600));
    });
  });
}
function workArea() { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea; }
function dockBounds() {
  const rect = workArea();
  return { x: rect.x + rect.width - DOCK_SIZE.width - 16, y: rect.y + rect.height - DOCK_SIZE.height - 22, ...DOCK_SIZE };
}
function miniBounds() {
  const d = dock.getBounds();
  const display = screen.getDisplayMatching(d).workArea;
  return { x: Math.max(display.x + 10, d.x - MINI_SIZE.width - 12), y: Math.max(display.y + 10, Math.min(d.y + d.height - MINI_SIZE.height, display.y + display.height - MINI_SIZE.height - 10)), ...MINI_SIZE };
}
function createWin(page, settings) {
  const w = new BrowserWindow({
    ...settings, icon: iconPath(), backgroundColor: '#0a111c', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, webSecurity: true, devTools: !app.isPackaged }
  });
  w.loadFile(path.join(__dirname, '..', 'ui', page));
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (event) => event.preventDefault());
  return w;
}
function openDashboard() {
  if (!dashboard || dashboard.isDestroyed()) {
    dashboard = createWin('dashboard.html', { ...DASH_SIZE, minWidth: 890, minHeight: 650, show: false, title: 'Unific Desktop', frame: true });
    dashboard.on('close', event => {
      if (!app.isQuitting) { event.preventDefault(); dashboard.hide(); }
    });
  }
  dashboard.show(); dashboard.focus(); hideMini();
}
function showMini() {
  if (!mini || mini.isDestroyed() || !dock || dock.isDestroyed()) return;
  if (hideTimer) clearTimeout(hideTimer);
  mini.setBounds(miniBounds()); mini.showInactive();
}
function hideMini(force = false) {
  if (hideTimer) clearTimeout(hideTimer);
  if (force) { if (mini && !mini.isDestroyed()) mini.hide(); return; }
  hideTimer = setTimeout(() => {
    if (!mini || mini.isDestroyed() || !mini.isVisible()) return;
    const point = screen.getCursorScreenPoint();
    const inside = r => point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height;
    if (!inside(mini.getBounds()) && (!dock || !inside(dock.getBounds()))) mini.hide();
  }, 430);
}
function createTrayAndDock() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 18, height: 18 }));
  tray.setToolTip('Unific Desktop — MediaForge');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Dashboard', click: openDashboard },
    { label: 'Mostrar assistente', click: showMini },
    { type: 'separator' },
    { label: 'Sair do Unific Desktop', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('mouse-enter', showMini);
  tray.on('mouse-move', showMini);
  tray.on('click', openDashboard);
  dock = createWin('dock.html', { ...dockBounds(), transparent: true, backgroundColor: '#00000000', frame: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, resizable: false, maximizable: false,
    show: false, focusable: false });
  dock.setAlwaysOnTop(true, 'floating');
  dock.once('ready-to-show', () => dock.showInactive());
  mini = createWin('mini.html', { ...MINI_SIZE, frame: false, alwaysOnTop: true, skipTaskbar: true,
    show: false, resizable: false, maximizable: false, hasShadow: true, focusable: true });
  mini.on('blur', () => hideMini());
  screen.on('display-metrics-changed', () => { dock?.setBounds(dockBounds()); if (mini?.isVisible()) mini.setBounds(miniBounds()); });
}
async function snapshot(fresh = false) {
  if (fresh || Date.now() - lastHealthTime > 6000) {
    lastHealth = await fetchHealth(); lastHealthTime = Date.now();
  }
  const folder = launchDir();
  const installed = fs.existsSync(path.join(folder, 'desktop', 'run-worker.ps1'));
  const paired = installed && (fs.existsSync(path.join(folder, '.mediaforge', 'worker-token.dpapi')) ||
    (() => { try { return /^MEDIAFORGE_WORKER_TOKEN=/m.test(fs.readFileSync(path.join(folder, '.env.local'),'utf8')); } catch { return false; } })());
  return { ...lastHealth, folder, installed, paired, logs: installed ? tailLog(folder) : [],
    hostname: require('node:os').hostname(), platform: process.platform,
    startAtLogin: app.getLoginItemSettings().openAtLogin, version: app.getVersion(), busy };
}
function lockOperation(fn) { return async () => {
  if (busy) return { ok: false, error: 'Há outra operação de manutenção em andamento.' };
  busy = true;
  try { return { ok: true, output: await fn() }; }
  catch (e) { return { ok: false, error: String(e.message).slice(0, 1200) }; }
  finally { busy = false; }
}; }
function registerIPC() {
  ipcMain.handle('unific:snapshot', () => snapshot(true));
  ipcMain.handle('unific:notes', () => memory.read());
  ipcMain.handle('unific:save-note', (e, text) => memory.save(text));
  ipcMain.handle('unific:ask', async (e, q) => assistantReply(q, await snapshot(), memory.read()));
  ipcMain.handle('unific:open-dashboard', openDashboard);
  ipcMain.handle('unific:show-mini', showMini);
  ipcMain.handle('unific:hide-mini', () => hideMini());
  ipcMain.handle('unific:dismiss', () => { dashboard?.hide(); hideMini(true); });
  ipcMain.handle('unific:open-worker-folder', async () => {
    const dir = launchDir(); return fs.existsSync(dir) ? shell.openPath(dir) : 'Diretório ainda não existe.';
  });
  ipcMain.handle('unific:login-settings', (e, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('unific:restart-worker', lockOperation(async () => {
    const install = launchDir();
    if (!fs.existsSync(path.join(install, 'desktop', 'start-worker-background.ps1')))
      throw new Error('Worker não instalado. Use Instalar primeiro.');
    return runPowershell(path.join(install, 'desktop', 'start-worker-background.ps1'), ['-InstallDir', install], 90_000);
  }));
  ipcMain.handle('unific:install-worker', lockOperation(async () => runPowershell(scriptPath(), [], 15 * 60_000)));
}
async function bootstrapOnFirstLaunch() {
  // Fresh installs provision dependencies automatically. Never change or overwrite
  // a populated legacy V2 directory, and never invent a worker credential.
  const folder = launchDir();
  if (fs.existsSync(path.join(folder, 'desktop', 'run-worker.ps1')) || fs.existsSync(folder)) return;
  const stamp = path.join(app.getPath('userData'), 'auto-install-attempt.json');
  if (fs.existsSync(stamp)) return; // Retry manually through the dashboard.
  fs.writeFileSync(stamp, JSON.stringify({ at: new Date().toISOString(), state: 'started' }));
  busy = true;
  try {
    const output = await runPowershell(scriptPath(), [], 15 * 60_000);
    fs.writeFileSync(stamp, JSON.stringify({ at: new Date().toISOString(), state: 'finished', info: output.slice(-700) }));
  } catch (error) {
    fs.writeFileSync(stamp, JSON.stringify({ at: new Date().toISOString(), state: 'failed', error: String(error.message).slice(0, 700) }));
  } finally { busy = false; }
}
const alreadyRunning = !app.requestSingleInstanceLock();
if (alreadyRunning) app.quit();
else {
  app.on('second-instance', openDashboard);
  app.whenReady().then(() => {
    if (isWindows) app.setAppUserModelId(APP_ID);
    memory = new MemoryStore(path.join(app.getPath('userData'), 'assistant-memory.json'));
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    registerIPC(); createTrayAndDock();
    if (!process.argv.includes('--hidden')) openDashboard();
    if (isWindows) setTimeout(() => bootstrapOnFirstLaunch(), 3000);
  });
  app.on('window-all-closed', () => {}); // Tray and dock remain alive.
  app.on('before-quit', () => { app.isQuitting = true; });
}
