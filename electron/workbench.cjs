const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { readPreferences, writePreferences } = require('./desktop-preferences.cjs');
const sessionId = require('crypto').randomUUID();
const { installCollaboration } = require('./collaboration.cjs');
if(process.env.CREATIVEFLOW_TEST_PROFILE){const directory=path.resolve(process.env.CREATIVEFLOW_TEST_PROFILE);if(!directory.startsWith(path.resolve(require('os').tmpdir())+path.sep)||!path.basename(directory).startsWith('creativeflow-071-'))throw Error('Invalid isolated test profile');app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));}

let mainWindow;
let widgetWindow;
let tray;
let trayMenu;
let desktopPreferences;
let closePending = false;
let quitting = false;
let quitPending;
let flushCounter = 0;
let managerBridge,externalManagerSession,authorization;
const {Manager,managerResources,managerExecutable,developmentEntry}=require('./manager-window.cjs');
const {createManagerBridge,sendManagerEvent}=require('./manager-bridge.cjs');
function trustedClient(event){if(!require('../host-manager/electron/window-trust.cjs').isTrustedWindow(event,mainWindow,path.join(__dirname,'../dist/index.html')))throw Error('不受信任的窗口');}
async function openManager(){
  if(externalManagerSession&&await sendManagerEvent(externalManagerSession,{type:'activate',parentFile:managerBridge.file}))return;
  const sessions=path.join(app.getPath('userData'),'manager-host','requests');
  try{for(const name of fs.readdirSync(sessions).filter(name=>/^[a-f0-9-]+\.json$/.test(name)).slice(-8))if(await sendManagerEvent(path.join(sessions,name),{type:'activate',parentFile:managerBridge.file}))return;}catch{}
  const {Controller}=require('../host-manager/electron/controller.cjs');const controller=new Controller(managerResources());
  const publicStatus=await controller.invoke({action:'public-status'});
  return Manager.start({integrated:true,isAdministrator:publicStatus.administrator===true,resources:managerResources(),controller,getPreferences:()=>desktopPreferences,setPreferences:patch=>setDesktopPreferences(patch),openClient:async host=>{restoreMainWindow();mainWindow.webContents.send('manager:open-client',host||'');return {ok:true};},authorize:()=>{
    if(authorization)return authorization;
    authorization=require('./manager-launch.cjs').launchManager(managerExecutable(),managerBridge.file,{elevate:true,developmentEntry:developmentEntry()}).finally(()=>{authorization=null;});return authorization;
  }});
}
function setDesktopPreferences(patch) {
  if(typeof patch?.launchAtLogin==='boolean')app.setLoginItemSettings({name:'CreativeFlow',openAtLogin:patch.launchAtLogin,path:managerExecutable(),args:['--startup']});
  desktopPreferences = writePreferences(app.getPath('userData'), desktopPreferences, patch);
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.setAlwaysOnTop(desktopPreferences.widgetAlwaysOnTop);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('desktop:preferences-changed', desktopPreferences);
  return desktopPreferences;
}
function flushWindow(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return Promise.resolve();
  return new Promise(resolve => {
    const id = ++flushCounter;
    const finish = () => { clearTimeout(timer); ipcMain.removeListener('window:inputs-flushed', acknowledge); resolve(); };
    const acknowledge = (event, reply) => { if (event.sender === window.webContents && reply === id) finish(); };
    const timer = setTimeout(finish, 2500);
    ipcMain.on('window:inputs-flushed', acknowledge);
    window.webContents.send('window:flush-input', id);
  });
}
function requestQuit() {
  if(Manager.isRunning()){dialog.showMessageBox(mainWindow,{type:'info',message:'协作管理操作尚未完成，请等待后再退出。'});return Promise.resolve(false);}
  if (quitPending) return quitPending;
  quitPending = Promise.all([mainWindow,widgetWindow].filter(Boolean).map(flushWindow)).then(() => { quitting = true; app.quit(); });
  return quitPending;
}
async function requestClose() {
  if (closePending || quitting || quitPending) return;
  closePending = true;
  try {
    let action = desktopPreferences.closeToTray ? 'hide' : 'quit';
    if (desktopPreferences.askBeforeClose) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question', title: '关闭创作流？', message: '关闭创作流？',
        detail: '隐藏到系统托盘后，创作流将在后台运行，桌面小组件仍可使用。',
        buttons: ['取消', '隐藏到托盘', '退出应用'], defaultId: desktopPreferences.closeToTray ? 1 : 2, cancelId: 0,
        checkboxLabel: '不再提醒，记住本次选择', checkboxChecked: false, noLink: true
      });
      if (result.response === 0) return;
      action = result.response === 1 ? 'hide' : 'quit';
      if (result.checkboxChecked) setDesktopPreferences({ closeToTray: action === 'hide', askBeforeClose: false });
    }
    if (action === 'hide') { await flushWindow(mainWindow); hideToTray(); }
    else await requestQuit();
  } catch {
    if (mainWindow && !mainWindow.isDestroyed()) await dialog.showMessageBox(mainWindow, { type: 'error', message: '关闭操作未完成，请重试。', detail: '请确认本地设置可保存后再试。' });
  } finally { closePending = false; }
}
function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!tray || tray.isDestroyed()) { mainWindow.minimize(); return; }
  mainWindow.webContents.send('window:flush-input');
  mainWindow.hide(); mainWindow.setSkipTaskbar(true);
}
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'app.ico'));
  tray.setToolTip('创作流 Beta · 双击打开');
  trayMenu = Menu.buildFromTemplate([
    { id: 'open-main', label: '打开创作流', click: restoreMainWindow },
    { id: 'open-widget', label: '打开桌面小组件', click: createWidgetWindow },
    { id: 'open-manager', label: '协作管理器', click: ()=>openManager().catch(error=>dialog.showErrorBox('无法打开协作管理器',error.message)) },
    { id: 'hide-main', label: '最小化到托盘', click: hideToTray },
    { type: 'separator' },
    { id: 'quit', label: '退出创作流', click: requestQuit }
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('double-click', restoreMainWindow);
}
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_event,args) => {restoreMainWindow();if(require('./employee-access.cjs').queueAccessFile(args))mainWindow?.webContents.send('employee-access:file');});

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
      additionalArguments: ['--creative-flow-session=' + sessionId],
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  const publishWindowState=()=>mainWindow?.webContents.send('window:state-changed',{maximized:mainWindow.isMaximized()});
  mainWindow.on('maximize',publishWindowState);
  mainWindow.on('unmaximize',publishWindowState);
  mainWindow.on('minimize', () => mainWindow.webContents.send('window:flush-input'));
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); void requestClose(); } });
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
    minWidth: 560,
    minHeight: 410,
    frame: false,
    alwaysOnTop: desktopPreferences.widgetAlwaysOnTop,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    title: '创作流小组件 · Beta',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--creative-flow-session=' + sessionId],
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  widgetWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: '/widgets' });
  widgetWindow.on('close', event => {
    if (!quitting) { event.preventDefault(); widgetWindow.webContents.send('widget:close-requested'); }
  });
  widgetWindow.on('closed', () => { widgetWindow = null; });
}

ipcMain.on('window:minimize', () => { if (mainWindow) { mainWindow.setSkipTaskbar(false); mainWindow.minimize(); } });
ipcMain.handle('manager:open',event=>{trustedClient(event);return openManager().then(()=>({ok:true}));});
ipcMain.handle('manager:guide',async event=>{trustedClient(event);const error=await shell.openPath(path.join(managerResources(),'使用说明.pdf'));if(error)throw Error('无法打开说明书，请查看交付包中的说明书。');return true;});
ipcMain.handle('window:state-get', event => ({maximized:BrowserWindow.fromWebContents(event.sender)?.isMaximized()||false}));
ipcMain.on('window:hide-to-tray', async () => { if(mainWindow){await flushWindow(mainWindow);hideToTray();} });
ipcMain.on('window:quit', () => { void requestQuit(); });
ipcMain.handle('desktop:preferences-get', () => desktopPreferences);
ipcMain.handle('desktop:preferences-set', (_event, patch) => setDesktopPreferences(patch));
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:close-current', event => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.on('widget:open', () => createWidgetWindow());
ipcMain.on('widget:close-confirmed', event => {
  if (widgetWindow && event.sender === widgetWindow.webContents) widgetWindow.destroy();
});
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
  installCollaboration(app,(sender,frame)=>{
    if(![mainWindow,widgetWindow].some(window=>window&&!window.isDestroyed()&&window.webContents===sender))return false;
    try {return frame===sender.mainFrame && path.resolve(fileURLToPath(frame.url.split('#')[0]))===path.resolve(__dirname,'..','dist','index.html');}catch{return false;}
  });
  desktopPreferences = readPreferences(app.getPath('userData'));
  managerBridge=createManagerBridge(path.join(app.getPath('userData'),'manager-launch'),async message=>{
    if(message.type==='ready'){externalManagerSession=message.managerSession;const window=Manager.getWindow();if(window&&!Manager.isRunning())window.close();}
    if(message.type==='open-client'){restoreMainWindow();mainWindow?.webContents.send('manager:open-client',message.host||'');}
    if(message.type==='preferences')setDesktopPreferences(message.patch||{});
  });managerBridge.ready.catch(()=>{});
  createTray();
  createWindow();
  if(desktopPreferences.openManagerOnLaunch)mainWindow.once('ready-to-show',()=>openManager().catch(()=>{}));
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else restoreMainWindow();
  });
});

app.on('before-quit', event => {
  if (!quitting) { event.preventDefault(); void requestQuit(); return; }
  if (tray && !tray.isDestroyed()) tray.destroy();
  managerBridge?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { getTray: () => tray, getTrayMenu: () => trayMenu };
