const { contextBridge, ipcRenderer } = require('electron');
ipcRenderer.on('window:flush-input', (_event, requestId) => {
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) active.blur();
  else document.querySelectorAll('.detail-form textarea, .detail-form input').forEach(input => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  if (requestId != null) setTimeout(() => ipcRenderer.send('window:inputs-flushed', requestId), 100);
});

contextBridge.exposeInMainWorld('creativeFlowWindow', {
  sessionId: process.argv.find(value=>value.startsWith('--creative-flow-session='))?.split('=').at(-1),
  hideToTray: () => ipcRenderer.send('window:hide-to-tray'),
  quit: () => ipcRenderer.send('window:quit'),
  minimize: () => ipcRenderer.send('window:minimize'),
  getWindowState: () => ipcRenderer.invoke('window:state-get'),
  onWindowStateChanged: callback => {
    const listener=(_event,state)=>callback(state);
    ipcRenderer.on('window:state-changed',listener);
    return ()=>ipcRenderer.removeListener('window:state-changed',listener);
  },
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  closeCurrent: () => ipcRenderer.send('window:close-current'),
  openWidget: () => ipcRenderer.send('widget:open'),
  confirmWidgetClose: () => ipcRenderer.send('widget:close-confirmed'),
  onWidgetCloseRequested: callback => {
    const listener = () => callback();
    ipcRenderer.on('widget:close-requested', listener);
    return () => ipcRenderer.removeListener('widget:close-requested', listener);
  },
  getDesktopPreferences: () => ipcRenderer.invoke('desktop:preferences-get'),
  setDesktopPreferences: patch => ipcRenderer.invoke('desktop:preferences-set', patch),
  onDesktopPreferencesChanged: callback => {
    const listener = (_event, preferences) => callback(preferences);
    ipcRenderer.on('desktop:preferences-changed', listener);
    return () => ipcRenderer.removeListener('desktop:preferences-changed', listener);
  },
  selectFile: () => ipcRenderer.invoke('file:select'),
  openPath: filePath => ipcRenderer.invoke('file:open', filePath),
  toFileUrl: filePath => { const value = filePath.replace(/\\/g, '/'); return (value.startsWith('//') ? 'file:' : 'file:///') + value.split('/').map(part => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/'); },
  exportBackup: content => ipcRenderer.invoke('backup:export', content),
  importBackup: () => ipcRenderer.invoke('backup:import')
});
