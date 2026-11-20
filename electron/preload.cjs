const { contextBridge, ipcRenderer } = require('electron');
let flushWork=null;
ipcRenderer.on('window:flush-input', (_event, requestId) => {
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) active.blur();
  else document.querySelectorAll('.detail-form textarea, .detail-form input').forEach(input => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  if (requestId != null) setTimeout(async() => {try{await flushWork?.();}finally{ipcRenderer.send('window:inputs-flushed',requestId);}}, 100);
});

contextBridge.exposeInMainWorld('creativeFlowWindow', {
  sessionId: process.argv.find(value=>value.startsWith('--creative-flow-session='))?.split('=').at(-1),
  onFlushWork: callback => {flushWork=callback;return()=>{if(flushWork===callback)flushWork=null;};},
  collaboration: {
    disconnect: id => ipcRenderer.invoke('collaboration:disconnect',id),
    list: () => ipcRenderer.invoke('collaboration:list'),
    join: values => ipcRenderer.invoke('collaboration:join', values),
    request: (id,action,body) => ipcRenderer.invoke('collaboration:request', id,action,body),
    status: () => ipcRenderer.invoke('collaboration:status'),
    spaceState: id => ipcRenderer.invoke('collaboration:space-state',id),
    switchSpace: id => ipcRenderer.invoke('collaboration:switch',id),
    enqueue: (id,batch,label,options) => ipcRenderer.invoke('collaboration:enqueue',id,batch,label,options),
    travel: (id,direction,expectedId) => ipcRenderer.invoke('collaboration:travel',id,direction,expectedId),
    sync: id => ipcRenderer.invoke('collaboration:sync',id),
    resolve: (id,operationId,choice,observed) => ipcRenderer.invoke('collaboration:resolve',id,operationId,choice,observed),
    exportPending: id => ipcRenderer.invoke('collaboration:export-pending',id),
    publish: (id,versionId) => ipcRenderer.invoke('collaboration:publish',id,versionId),
    publishProjectMedia: (id,files) => ipcRenderer.invoke('collaboration:publish-project-media',id,files),
    prepared: (id,accepted) => ipcRenderer.send('collaboration:prepared',id,accepted),
    onChanged: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('collaboration:changed',listener);return()=>ipcRenderer.removeListener('collaboration:changed',listener);},
    onPrepare: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('collaboration:prepare',listener);return()=>ipcRenderer.removeListener('collaboration:prepare',listener);},
    onSwitchFinished: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('collaboration:switch-finished',listener);return()=>ipcRenderer.removeListener('collaboration:switch-finished',listener);},
    onUploadProgress: callback => {const listener=(_event,state)=>callback(state);ipcRenderer.on('collaboration:upload-progress',listener);return()=>ipcRenderer.removeListener('collaboration:upload-progress',listener);}
  },
  employeeAccess: {
    importFile:()=>ipcRenderer.invoke('employee-access:import'),
    pending:()=>ipcRenderer.invoke('employee-access:pending'),
    trust:id=>ipcRenderer.invoke('employee-access:trust',id),
    diagnose:host=>ipcRenderer.invoke('employee-access:diagnose',host),
    exportReport:report=>ipcRenderer.invoke('employee-access:export-report',report),
    onFile:callback=>{const listener=()=>callback();ipcRenderer.on('employee-access:file',listener);return()=>ipcRenderer.removeListener('employee-access:file',listener);}
  },
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
