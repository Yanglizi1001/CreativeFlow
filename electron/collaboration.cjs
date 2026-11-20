const {ipcMain,safeStorage,protocol,BrowserWindow,dialog}=require('electron');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {CollaborationEngine}=require('./collaboration-engine.cjs');
const {createCollaborationNetwork}=require('./collaboration-network.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'cfmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
function validateHost(value) {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('请填写主机地址，例如 https://服务器名:47840');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('局域网连接需要使用 HTTPS 主机地址');
  return url.origin;
}
function installCollaboration(app,isTrustedSender) {
  const network=createCollaborationNetwork();
  const employeeAccess=require('./employee-access.cjs').installEmployeeAccess(app,isTrustedSender,network);
  const vaultFile=path.join(app.getPath('userData'),'collaboration-connections-v1.json');let connections,switching=null;
  function load(){if(connections)return connections;if(!fs.existsSync(vaultFile))return connections=[];const rows=JSON.parse(fs.readFileSync(vaultFile,'utf8'));if(!Array.isArray(rows))throw Error('空间连接配置损坏，请先备份配置文件');return connections=rows;}
  function save(rows){fs.writeFileSync(vaultFile+'.tmp',JSON.stringify(rows),{mode:0o600});fs.renameSync(vaultFile+'.tmp',vaultFile);connections=rows;}
  const publicEntry=e=>({id:e.id,host:e.host,name:e.name,workspaceId:e.workspaceId,memberId:e.memberId,displayName:e.displayName,role:e.role});
  function entry(id){const e=load().find(row=>row.id===id);if(!e)throw Error('空间连接不存在，请重新加入');return e;}
  function token(e){return safeStorage.decryptString(Buffer.from(e.encryptedToken,'base64'));}
  const windows=()=>BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()&&isTrustedSender(w.webContents,w.webContents.mainFrame));
  const broadcast=(channel,data)=>windows().forEach(w=>w.webContents.send(channel,data));
  async function request(host,route,{method='GET',body,authorization,statusOnly=false}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await network.fetch(host+route,{method,redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...(authorization?{Authorization:'Bearer '+authorization}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text();if(statusOnly)return response.status;
      let result;try{result=text?JSON.parse(text):null;}catch{throw Error('协作主机返回了不兼容的内容，请检查主机版本');}
      if(!response.ok){const error=Error(result?.message||({401:'身份已失效，请重新加入空间',403:'没有执行此操作的权限',404:'内容不存在或主机需要升级'}[response.status])||'协作请求失败');error.status=response.status;throw error;}
      return result;
    }catch(error){if(error.name==='AbortError')throw Error('连接主机超时；离线修改已保留在本机');if(!error.status&&/ERR_CERT|certificate/i.test(error.message))throw Error('主机证书未受信任或地址不匹配，请使用管理员提供的地址并安装公司主机证书');if(!error.status&&/net::|fetch|network|ECONN|ENOTFOUND/i.test(error.message))throw Error('无法连接公司主机，修改已保存在本机；请检查局域网和主机是否开机');throw error;}finally{clearTimeout(timer);}
  }
  async function remote(id,action,body) {
    const e=entry(id),root=`/api/v1/workspaces/${encodeURIComponent(e.workspaceId)}`;
    let method='GET',route;
    if(action==='snapshot')route=root+'/integrated/snapshot';
    else if(action==='storageGet')route=root+'/integrated/storage';
    else if(action==='commands'){method='POST';route=root+'/integrated/commands';}
    else if(action==='accessGet')route=root+`/integrated/versions/${encodeURIComponent(body.versionId)}/access`;
    else if(action==='accessSet'){method='PUT';route=root+`/integrated/versions/${encodeURIComponent(body.versionId)}/access`;}
    else if(action==='invite'){method='POST';route='/api/v1/admin/invitations';}
    else if(action==='removeMember'){method='DELETE';route='/api/v1/admin/members/'+encodeURIComponent(body.memberId);}
    else if(action==='memberInvite'){method='POST';route='/api/v1/admin/members/'+encodeURIComponent(body.memberId)+'/invitation';}
    else if(action==='versionTrash')route=root+'/integrated/versions/trash';
    else if(action==='versionDelete'){method='POST';route=root+'/integrated/versions/'+encodeURIComponent(body.versionId)+'/delete';}
    else if(action==='versionRestore'){method='POST';route=root+'/integrated/versions/'+encodeURIComponent(body.versionId)+'/restore';}
    else if(action==='trash')route=root+'/integrated/trash';
    else if(action==='restore'){method='POST';route=root+'/integrated/projects/'+encodeURIComponent(body.projectId)+'/restore';}
    else throw Error('不支持的协作操作');
    return request(e.host,route,{method,body:method==='GET'?undefined:action==='versionDelete'?body.batch:body,authorization:token(e)});
  }
  const engine=new CollaborationEngine(path.join(app.getPath('userData'),'collaboration-cache-v1.sqlite'),{getConnection:id=>publicEntry(entry(id)),request:remote,broadcast:state=>broadcast('collaboration:changed',state)});
  const handle=(channel,fn)=>ipcMain.handle(channel,async(event,...args)=>{if(!isTrustedSender(event.sender,event.senderFrame))throw Error('不允许的窗口');return fn(event,...args);});
  handle('collaboration:list',()=>load().map(publicEntry));
  handle('collaboration:status',()=>engine.status());
  handle('collaboration:space-state',async(_event,id)=>{if(!engine.load(id))await engine.refresh(id);return engine.status(id);});
  handle('collaboration:enqueue',(_event,id,batch,label,options)=>engine.enqueue(id,batch,label,{history:options?.history!==false}));
  handle('collaboration:travel',(_event,id,direction,expectedId)=>engine.travel(id,direction,expectedId));
  handle('collaboration:sync',async(_event,id)=>{await engine.pump(id);return engine.status(id);});
  handle('collaboration:resolve',(_event,id,operationId,choice,observed)=>engine.resolve(id,operationId,choice,observed));
  handle('collaboration:export-pending',async(event,id)=>{
    const result=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender),{defaultPath:'创作流离线草稿-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'JSON',extensions:['json']}]});
    if(result.canceled)return false;fs.writeFileSync(result.filePath,JSON.stringify(engine.exportPending(id),null,2));return true;
  });
  handle('collaboration:request',async(_event,id,action,body)=>{
    if(action==='versionDelete'&&publications.has(id+':'+body?.versionId))throw Error('此版本的视频正在发布，请等待完成后再删除');
    if(action==='storageGet')return remote(id,action,body);
    if(['commands','snapshot'].includes(action))throw Error('请使用统一同步通道');
    await engine.pump(id);if(engine.load(id)?.pending.length)throw Error('请先完成待同步操作后管理权限或成员');
    const result=await remote(id,action,body);await engine.pump(id);return result;
  });
  handle('collaboration:join',async(_event,values)=>{
    if(!safeStorage.isEncryptionAvailable())throw Error('系统凭据加密不可用，暂时无法保存协作身份');
    const host=validateHost(values.host),discovery=await request(host,'/api/v1/discovery-info');if(!discovery.isInitialized)throw Error('请先在服务器上初始化公司空间');
    if(values.accessProfileId){const expected=employeeAccess.getProfile(values.accessProfileId);if(!expected||expected.host!==host||expected.workspaceId&&expected.workspaceId!==discovery.workspaceId)throw Error('接入文件与实际公司空间不一致，请向管理员获取新文件');}
    const health=await request(host,'/api/v1/health');if(!health.features?.includes('integrated-media-v1'))throw Error('协作主机版本较旧，请先安装配套的 0.7.1 主机程序');
    if(await request(host,`/api/v1/workspaces/${encodeURIComponent(discovery.workspaceId)}/integrated/snapshot`,{statusOnly:true})!==401)throw Error('请先升级至配套的 0.7.1 协作主机');
    const session=await request(host,'/api/v1/invitations/redeem',{method:'POST',body:{invitationCode:values.invitationCode,displayName:values.displayName,deviceName:require('os').hostname()}});
    const old=load().find(e=>e.host===host&&e.workspaceId===session.workspaceId&&e.memberId===session.memberId);
    const e={id:old?.id||crypto.randomUUID(),host,name:discovery.workspaceName,...session,token:undefined,encryptedToken:safeStorage.encryptString(session.token).toString('base64')};save([...load().filter(row=>row.id!==e.id),e]);
    await engine.refresh(e.id);return publicEntry(e);
  });
  ipcMain.on('collaboration:prepared',(event,id,accepted)=>{
    if(!isTrustedSender(event.sender,event.senderFrame)||switching?.id!==id||!switching.waiters.has(event.sender.id))return;
    switching.waiters.get(event.sender.id)(Boolean(accepted));switching.waiters.delete(event.sender.id);
  });
  handle('collaboration:switch',async(_event,id)=>{
    if(switching)throw Error('另一个窗口正在切换空间，请先处理该窗口的草稿');
    const state={id:crypto.randomUUID(),waiters:new Map()};switching=state;
    try {
      const approvals=windows().map(w=>new Promise(resolve=>{
        state.waiters.set(w.webContents.id,resolve);w.webContents.send('collaboration:prepare',{id:state.id});
      }));
      let timer;const agreed=new Promise(resolve=>{let remaining=approvals.length;if(!remaining)resolve(true);approvals.forEach(p=>p.then(ok=>{if(!ok)resolve(false);if(--remaining===0)resolve(true);}));});
      const approved=await Promise.race([agreed,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),45000);})]);clearTimeout(timer);
      if(!approved)throw Error('空间切换已取消，请先处理各窗口尚未保存的内容');
      return await engine.select(id);
    }finally{broadcast('collaboration:switch-finished',{id:state.id});switching=null;}
  });
  handle('collaboration:disconnect',async(_event,id)=>{
    const e=entry(id);if(engine.active===id)throw Error('请先切换回“我的项目”，再退出此设备的连接');
    if(engine.status(id).pendingCount)throw Error('此空间仍有未同步修改，请先同步或导出离线草稿；连接暂未移除');
    const answer=await dialog.showMessageBox({type:'warning',message:'退出此设备的公司连接？',detail:`${e.name} · ${e.displayName}\n本机连接凭据会移除，公司项目与本地项目保留。重新接入需要新的邀请码。`,buttons:['取消','退出连接'],defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};save(load().filter(row=>row.id!==id));return {ok:true};
  });
  const publications=new Set();
  async function publish(id,versionId,filePath,onProgress){const key=id+':'+versionId;if(publications.has(key))throw Error('此版本的视频正在发布，请稍后再试');publications.add(key);try{return await publishVideoFile(id,versionId,filePath,onProgress);}finally{publications.delete(key);}}
  async function publishVideoFile(id,versionId,filePath,onProgress) {
    await engine.pump(id);const state=engine.status(id);if(!state.online||state.pendingCount)throw Error('请先连接主机并同步待处理修改，再发布视频');
    const version=state.data.entities.find(row=>row.id===versionId&&row.kind==='version');if(!version)throw Error('版本不存在或没有访问权限');
    const e=entry(id),stat=fs.statSync(filePath);if(!stat.isFile()||stat.size<=0||stat.size>20*1024**3)throw Error('请选择 20 GB 以内的视频文件');
    const health=await request(e.host,'/api/v1/health');if(health.features?.includes('storage-budget-v1')){const capacity=await remote(id,'storageGet');const size=bytes=>bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GB':(bytes/1024**2).toFixed(1)+' MB';if(stat.size>capacity.availableUploadBytes)throw Error('本次视频 '+size(stat.size)+'，当前可上传 '+size(capacity.availableUploadBytes)+'。空间容量不足，请联系管理员清理或扩容。');}
    const query=new URLSearchParams({uploadId:crypto.randomUUID(),name:path.basename(filePath),revision:String(version.revision),epoch:state.data.epoch});
    await network.ready;
    await new Promise((resolve,reject)=>{
      const upload=network.request({url:e.host+`/api/v1/workspaces/${encodeURIComponent(e.workspaceId)}/integrated/versions/${encodeURIComponent(versionId)}/media?`+query,method:'PUT',redirect:'error'});
      upload.chunkedEncoding=true;upload.setHeader('Authorization','Bearer '+token(e));upload.setHeader('Content-Type','application/octet-stream');upload.setHeader('X-CreativeFlow-Length',String(stat.size));
      const stream=fs.createReadStream(filePath);let sent=0,last=0,finished=false;
      const idle=setInterval(()=>{if(Date.now()-last>120000){upload.abort();finish(Error('视频传输超时，请检查网络后重试'));}},10000);last=Date.now();
      function finish(error){if(finished)return;finished=true;clearInterval(idle);stream.destroy();if(error){upload.abort();reject(error);}else resolve();}
      upload.on('error',finish);stream.on('error',finish);
      upload.on('response',response=>{let content='';response.on('data',chunk=>{content+=chunk.toString();});response.on('error',finish);response.on('end',()=>{if(response.statusCode>=200&&response.statusCode<300)finish();else {let message;try{message=JSON.parse(content).message;}catch{}finish(Error(message||'视频发布失败，请刷新后重试'));}});});
      void (async()=>{let reported=0;for await(const chunk of stream){if(finished)return;await new Promise(resolve=>upload.write(chunk,undefined,resolve));last=Date.now();sent+=chunk.length;if(Date.now()-reported>150||sent===stat.size){onProgress?.({sent,total:stat.size});reported=Date.now();}}if(!finished)upload.end();})().catch(finish);
    });
    await engine.refresh(id);return engine.status(id);
  }
  handle('collaboration:publish',async(event,id,versionId)=>{
    const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'发布协作视频',properties:['openFile'],filters:[{name:'视频',extensions:['mp4','m4v','webm','mov']}]});if(result.canceled)return null;
    return publish(id,versionId,result.filePaths[0],progress=>event.sender.send('collaboration:upload-progress',progress));
  });
  // Used only after an explicit project-upload confirmation showing every path.
  handle('collaboration:publish-project-media',async(event,id,files)=>{
    if(!Array.isArray(files)||files.length>500)throw Error('视频文件列表无效');
    const detail=files.map(f=>String(f.path)).join('\n');
    const answer=await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:'question',message:`将 ${files.length} 个视频复制到公司协作主机？`,detail,buttons:['取消','确认发布'],cancelId:0,defaultId:0,noLink:true});if(answer.response!==1)return {cancelled:true};
    for(const file of files)await publish(id,file.versionId,file.path,progress=>event.sender.send('collaboration:upload-progress',progress));return {cancelled:false};
  });
  protocol.handle('cfmedia',async request=>{
    try {
      const url=new URL(request.url),e=entry(url.hostname),mediaId=url.pathname.slice(1);if(!/^[0-9a-f-]{36}$/i.test(mediaId))return new Response('',{status:400});
      const headers={Authorization:'Bearer '+token(e)};if(request.headers.has('range'))headers.Range=request.headers.get('range');
      const response=await network.fetch(e.host+`/api/v1/workspaces/${encodeURIComponent(e.workspaceId)}/integrated/media/${mediaId}`,{headers,redirect:'error',signal:request.signal});
      // Anonymous CORS lets our renderer extract a frame without exposing the token.
      // The server still checks the current member's version permission on every request.
      const outputHeaders=new Headers(response.headers);outputHeaders.set('Access-Control-Allow-Origin','*');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers:outputHeaders});
    }catch{return new Response('无法读取协作视频，请检查连接或权限',{status:503});}
  });
  engine.start();app.once('will-quit',()=>engine.close());return engine;
}
module.exports={installCollaboration,validateHost};
