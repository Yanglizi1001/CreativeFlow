const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');

let mainWindow;
let widgetWindow;
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1584,
    height: 990,
    minWidth: 860,
    minHeight: 650,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    title: '创作流 Beta',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close(); });
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    widgetWindow.focus();
    return;
  }
  widgetWindow = new BrowserWindow({
    width: 620,
    height: 460,
    minWidth: 440,
    minHeight: 410,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    title: '创作流小组件 · Beta',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  widgetWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: '/widgets' });
  widgetWindow.on('closed', () => { widgetWindow = null; });
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:close-current', event => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.on('widget:open', () => createWidgetWindow());
ipcMain.handle('file:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  return { name: path.basename(filePath), path: filePath, size: `${(stat.size / 1024 / 1024).toFixed(1)} MB` };
});
ipcMain.handle('file:open', async (_event, filePath) => {
  if(typeof filePath!=='string') return '未提供文件路径';
  let target=filePath.startsWith('file:')?fileURLToPath(filePath):filePath;
  if(target.includes('app.asar'+path.sep)) {
    const folder=path.join(app.getPath('userData'),'DemoFiles');fs.mkdirSync(folder,{recursive:true});
    const copy=path.join(folder,path.basename(target));fs.copyFileSync(target,copy);target=copy;
  }
  return shell.openPath(target);
});
ipcMain.handle('backup:export', async (_event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: `创作流备份-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, 'utf8');
  return true;
});
ipcMain.handle('backup:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  return fs.readFileSync(result.filePaths[0], 'utf8');
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
