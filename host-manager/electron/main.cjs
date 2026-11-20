const {app,BrowserWindow,ipcMain,dialog,clipboard,Menu,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const {isTrustedWindow}=require('./window-trust.cjs');
const {Controller}=require('./controller.cjs');let win,controller;
const entry=path.join(__dirname,'../dist/index.html');
const appRoot=path.dirname(__dirname),resources=appRoot.endsWith('.asar')?path.dirname(appRoot):path.join(appRoot,'resources');
function trusted(event){if(!isTrustedWindow(event,win,entry))throw Error('不受信任的窗口');}
const prompts={install:['安装协作服务器','将创建 Windows 服务、服务器证书和仅限公司局域网的防火墙规则。'],stop:['停止协作服务','员工暂时无法同步和播放协作视频，离线意见会留在各自电脑。'],firewall:['修复协作防火墙规则','仅开放专用网络及域网络中的本地子网，不会关闭系统防火墙。'],restore:['从备份恢复空间','恢复会替换当前协作资料和视频。将先创建完整备份；恢复后旧离线操作需要人工核对。'],upgrade:['升级现有主机','将先完整备份，再停止服务并更新程序。员工连接会短暂中断。'],uninstall:['卸载协作服务','将停止并删除协作服务、相关防火墙规则及定时备份任务。项目、视频、证书和程序文件均保留。'],backup:['创建完整备份','复制期间会暂停服务，完成后恢复原运行状态。'], 'migrate-data':['迁移协作空间','先完整备份，再暂停服务、复制校验和切换路径。原数据会保留。'],'migrate-program':['迁移服务器程序','将暂停服务、复制并校验程序后更新服务路径。原程序会保留。']};
async function start(options={}){
  controller=options.controller||new Controller(resources);
  win=new BrowserWindow({width:1180,height:820,minWidth:920,minHeight:660,backgroundColor:'#f5f3f8',title:'创作流协作管理器',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.on('close',event=>{if(controller.running){event.preventDefault();dialog.showMessageBox(win,{type:'info',message:'管理操作尚未完成，请等待后再关闭。'});}});
  ipcMain.handle('host-manager:invoke',async(event,request)=>{
    trusted(event);if(controller.running)throw Error('另一项操作正在进行，请稍候。');
    if(request?.action==='manager-startup'){request={action:'manager-startup',enabled:request.enabled===true,executablePath:process.env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe'),source:process.env.PORTABLE_EXECUTABLE_FILE?'portable':'installed'};}
    let prompt=prompts[request?.action];if(request?.action==='reattach')prompt=['重新注册已有主机','使用现有程序和数据重新建立协作服务，不会创建新空间或清空项目。'];const command=request?.command;
    if(request?.action==='manage'&&['disable','remove','revoke-device','transfer-owner','recover-owner','reinvite','cancel-invitations'].includes(command?.action))prompt=['确认成员接入变更',({disable:'停用后该成员所有设备会立即失去接入权限，历史意见仍保留。',remove:'移除后该成员无法接入，历史意见与项目不会删除。','revoke-device':'所选设备将失去接入权限。','transfer-owner':'将空间所有者身份转移给所选成员，原所有者变为普通成员。','recover-owner':'将生成新的管理员接入码，并作废管理员尚未使用的旧邀请码。',reinvite:'将生成新的接入码，并作废该成员尚未使用的旧邀请码。','cancel-invitations':'该成员尚未使用的邀请码将立即失效。'})[command.action]];
    if(request?.action==='uninstall'){
      if(typeof request.deleteData!=='boolean')throw Error('请先选择是否保留协作数据');
      if(request.deleteData){if(request.confirmation!=='删除协作数据'||typeof request.confirmedDataDirectory!=='string')throw Error('请填写删除确认');prompt=['永久删除此协作空间的数据？','将卸载服务，并永久删除协作数据库（含项目、成员、排期、权限和审阅意见）、已发布视频、服务器证书和原服务配置。\n数据目录：'+request.confirmedDataDirectory+'\n服务器程序、独立备份与原共享盘文件保留。此操作无法撤销。'];}
    }
    if(request?.action==='manager-startup'&&request.enabled)prompt=['登录后自动打开协作管理器','将在当前管理员登录 Windows 后打开管理器。更新软件或移动免安装版后，请在设置中重新启用，以更新启动位置。协作服务的开机启动设置独立控制。'];
    if(request?.action==='storage-cleanup'||request?.action==='manage'&&command?.action==='storage-cleanup')prompt=['永久清理无引用视频？','仅清理勾选且已不被任何版本或回收站引用的视频。再次检查通过后才会删除。此操作不能撤销。'];
    if(prompt){const result=await dialog.showMessageBox(win,{type:'warning',buttons:['取消',request?.action==='uninstall'&&request.deleteData?'卸载并永久删除':'继续'],defaultId:0,cancelId:0,title:prompt[0],message:prompt[0],detail:prompt[1]+(request.path?'\n目标：'+request.path:'')});if(result.response!==1)return {cancelled:true};}
    return controller.invoke(request);
  });
  ipcMain.handle('host-manager:choose',async(event,label)=>{trusted(event);const result=await dialog.showOpenDialog(win,{title:String(label).slice(0,80),properties:['openDirectory','createDirectory']});return result.canceled?'':result.filePaths[0];});
  ipcMain.handle('host-manager:copy',(event,text)=>{trusted(event);if(typeof text!=='string'||text.length>20000)throw Error('复制内容无效');clipboard.writeText(text);return true;});
  ipcMain.handle('host-manager:help',async event=>{trusted(event);const error=await shell.openPath(path.join(resources,'使用说明.pdf'));if(error)throw Error('无法打开说明书：'+error);return true;});
  ipcMain.handle('host-manager:report',async(event,report)=>{trusted(event);const result=await dialog.showSaveDialog(win,{defaultPath:'创作流主机检测报告.json',filters:[{name:'检测报告',extensions:['json']}]});if(result.canceled)return false;const text=JSON.stringify(report,null,2);if(text.length>1e6)throw Error('报告过大');await fs.writeFile(result.filePath,text,'utf8');return true;});
  await win.loadFile(entry);return win;
}
module.exports={start};
if(require.main===module){if(!app.requestSingleInstanceLock())app.quit();else {app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});app.whenReady().then(()=>start()).catch(error=>{dialog.showErrorBox('主机管理器无法启动',error.message);app.quit();});app.on('window-all-closed',()=>app.quit());}}
