const {app,dialog}=require('electron'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {readPreferences,writePreferences}=require('./desktop-preferences.cjs');
const {Manager,managerResources,managerExecutable,developmentEntry}=require('./manager-window.cjs');
const {createManagerBridge,sendManagerEvent}=require('./manager-bridge.cjs');
if(process.env.CREATIVEFLOW_TEST_PROFILE){const test=path.resolve(process.env.CREATIVEFLOW_TEST_PROFILE),os=require('node:os');if(!test.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(test).startsWith('creativeflow-071-'))throw Error('Invalid isolated test profile');app.setPath('userData',test);}
const base=app.getPath('userData');
const token=spawnSync(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{encoding:'utf8',windowsHide:true});
const administrator=token.status===0&&token.stdout.trim()==='True';
app.setPath('userData',path.join(base,administrator?'manager-host':'manager-access'));
let parentFile=process.argv.find(v=>v.startsWith('--manager-session='))?.slice('--manager-session='.length),bridge,authorization;
const parent=message=>sendManagerEvent(parentFile,message);
async function setPreferences(patch){
 if(await parent({type:'preferences',patch}))return readPreferences(base);
 if(typeof patch.launchAtLogin==='boolean')app.setLoginItemSettings({name:'CreativeFlow',openAtLogin:patch.launchAtLogin,path:managerExecutable(),args:['--startup']});
 return writePreferences(base,readPreferences(base),patch);
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',(_event,args)=>{const file=args.find(v=>v.startsWith('--manager-session='));if(file)parentFile=file.slice('--manager-session='.length);const win=Manager.getWindow();if(win){if(win.isMinimized())win.restore();win.show();win.focus();}if(bridge)void parent({type:'ready',managerSession:bridge.file});});
 app.whenReady().then(async()=>{
  bridge=createManagerBridge(path.join(app.getPath('userData'),'requests'),async message=>{if(message.type==='activate'){if(typeof message.parentFile==='string')parentFile=message.parentFile;const win=Manager.getWindow();if(win){if(win.isMinimized())win.restore();win.show();win.focus();}await parent({type:'ready',managerSession:bridge.file});}if(message.type==='ready'){await parent(message);Manager.getWindow()?.close();}});await bridge.ready;
  await Manager.start({integrated:true,isAdministrator:administrator,resources:managerResources(),getPreferences:()=>readPreferences(base),setPreferences,openClient:async host=>{if(!await parent({type:'open-client',host}))throw Error('主窗口已退出，请从开始菜单打开创作流后再试。');return {ok:true};},authorize:()=>{if(authorization)return authorization;authorization=require('./manager-launch.cjs').launchManager(managerExecutable(),bridge.file,{elevate:true,developmentEntry:developmentEntry()}).finally(()=>{authorization=null;});return authorization;}});
  if(administrator)await parent({type:'ready',managerSession:bridge.file});
 }).catch(error=>{dialog.showErrorBox('协作管理器无法打开',error.message);app.quit();});
 app.on('before-quit',event=>{if(Manager.isRunning()){event.preventDefault();return;}bridge?.close();});
 app.on('window-all-closed',()=>app.quit());
}
