const {app,ipcMain,BrowserWindow}=require('electron'),path=require('node:path'),os=require('node:os');
const profile=path.resolve(process.env.CF_MANAGER_TEST_DIR||'');if(!profile.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(profile).startsWith('creativeflow-manager-qa-'))throw Error('Isolated profile required');
app.setPath('userData',profile);
global.__trustCalls=0;global.__trustTrace=[];
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(name,handler)=>handle(name,(event,...args)=>{
 const window=BrowserWindow.fromWebContents(event.sender),frame=event.senderFrame,top=window?.webContents.mainFrame;
 global.__trustTrace.push({name,frameURL:frame?.url,windowURL:window?.webContents.getURL(),sameFrame:frame===top,frameId:frame&&[frame.processId,frame.routingId],topId:top&&[top.processId,top.routingId]});
 return handler(event,...args);
});
const status={installed:true,state:'Running',autostart:true,computerName:'TRUST-CHECK',url:'https://TRUST-CHECK:47840',settings:{serverName:'TRUST-CHECK',dataDirectory:'D:\\TrustFixture',installDirectory:'D:\\TrustProgram'},drives:[],space:null};
global.__failStatus=process.env.CF_MANAGER_FAIL_STATUS==='1';
const controller={running:false,async invoke(request){global.__trustCalls++;if(request.action==='status'){if(global.__failStatus)throw Error('测试：状态读取失败');return status;}return {ok:true}}};
app.whenReady().then(async()=>{const main=process.env.CF_MANAGER_ASAR?path.join(process.env.CF_MANAGER_ASAR,'electron/main.cjs'):path.resolve(__dirname,'../host-manager/electron/main.cjs');global.__mainPath=require.resolve(main);global.__trustRequire=require;await require(main).start({controller})});
app.on('window-all-closed',()=>app.quit());
