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
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  closeCurrent: () => ipcRenderer.send('window:close-current'),
  openWidget: () => ipcRenderer.send('widget:open'),
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
