const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('creativeFlowWindow', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  closeCurrent: () => ipcRenderer.send('window:close-current'),
  openWidget: () => ipcRenderer.send('widget:open'),
  selectFile: () => ipcRenderer.invoke('file:select'),
  openPath: filePath => ipcRenderer.invoke('file:open', filePath),
  toFileUrl: filePath => { const value = filePath.replace(/\\/g, '/'); return (value.startsWith('//') ? 'file:' : 'file:///') + value.split('/').map(part => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/'); },
  exportBackup: content => ipcRenderer.invoke('backup:export', content),
  importBackup: () => ipcRenderer.invoke('backup:import')
});
