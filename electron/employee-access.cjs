const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {validateAccessProfile}=require('./access-profile.cjs');
let pendingFile=process.argv.find(value=>path.isAbsolute(value)&&value.toLowerCase().endsWith('.cfspace'))||'';
function queueAccessFile(args){const value=args.find(value=>path.isAbsolute(value)&&value.toLowerCase().endsWith('.cfspace'));if(value)pendingFile=value;return !!value;}
function verifyCompanyHost(profile){
  return new Promise((resolve,reject)=>{
    const url=new URL(profile.host),tls=require('node:tls'),cert=new (require('node:crypto').X509Certificate)(Buffer.from(profile.certificate,'base64'));
    const socket=tls.connect({host:url.hostname,port:Number(url.port)||443,servername:url.hostname,ca:cert.toString(),rejectUnauthorized:true},()=>{try{const peer=new (require('node:crypto').X509Certificate)(socket.getPeerCertificate().raw);if(peer.fingerprint256.replaceAll(':','')!==profile.fingerprintSha256)throw Error('主机证书已变更，请重新获取公司接入文件');resolve(true)}catch(error){reject(error)}finally{socket.destroy()}});
    socket.setTimeout(12000,()=>{socket.destroy();reject(Error('公司主机连接超时，请确认协作服务已启动'))});socket.on('error',()=>reject(Error('主机未连接或证书与接入文件不一致，请检查地址并向管理员获取最新文件')));
  });
}
function installEmployeeAccess(app,isTrustedSender,network,{ipcMain,dialog,BrowserWindow} = require('electron')){
  const profiles=new Map(),approvedFile=path.join(app.getPath('userData'),'company-access-profiles-v1.json');let approved=[];
  if(fs.existsSync(approvedFile)){try{for(const row of JSON.parse(fs.readFileSync(approvedFile,'utf8'))){try{const valid=validateAccessProfile(row);approved.push(valid);network.trustCompanyProfile(valid);}catch{}}}catch{}}
  function remember(profile){const rows=[...approved.filter(row=>row.host!==profile.host),profile];fs.writeFileSync(approvedFile+'.tmp',JSON.stringify(rows),{mode:0o600});fs.renameSync(approvedFile+'.tmp',approvedFile);approved=rows;}
  const register=(name,fn)=>ipcMain.handle('employee-access:'+name,async(event,...args)=>{if(!isTrustedSender(event.sender,event.senderFrame))throw Error('不允许的窗口');return fn(event,...args)});
  function read(file){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>40000)throw Error('接入文件过大或无效');const profile=validateAccessProfile(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\ufeff/,'')));const id=randomUUID();profiles.set(id,profile);while(profiles.size>20)profiles.delete(profiles.keys().next().value);return {...profile,id,certificate:undefined,trusted:approved.some(row=>row.host===profile.host&&row.fingerprintSha256===profile.fingerprintSha256)};}
  register('import',async(event)=>{const file=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'导入公司接入文件',properties:['openFile'],filters:[{name:'公司接入文件',extensions:['cfspace']}]});return file.canceled?null:read(file.filePaths[0])});
  register('pending',()=>{if(!pendingFile)return null;const file=pendingFile;pendingFile='';return read(file)});
  register('trust',async(event,id)=>{
    const profile=profiles.get(id);if(!profile)throw Error('请重新导入公司接入文件');validateAccessProfile(profile);
    await verifyCompanyHost(profile);
    const result=await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:'warning',title:'确认公司主机',message:'信任此公司主机并继续？',detail:`公司：${profile.workspaceName}\n地址：${profile.host}\n证书 SHA-256：${profile.fingerprintSha256}\n\n请确认接入文件由公司管理员提供。信任仅用于创作流协作连接，并会核对证书指纹、主机名和有效期。`,buttons:['取消','信任并继续'],defaultId:0,cancelId:0,noLink:true});
    if(result.response!==1)return {cancelled:true};
    remember(profile);await network.trustCompanyProfile(profile);return {trusted:true};
  });
  register('diagnose',async(_event,host)=>{
    const url=new URL(host);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.hash||url.search)throw Error('请填写管理员提供的 HTTPS 主机地址');
    let result;const checks=[];const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await network.fetch(url.origin+'/api/v1/health',{redirect:'error',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const health=await response.json();if(health.status!=='ok')throw Error('协作接口响应异常');checks.push({name:'网络与证书',ok:true,detail:'已通过 HTTPS 安全连接公司主机（协作直连）'},{name:'主机版本',ok:health.features?.includes('integrated-media-v1')===true,detail:health.integratedVersion||'需要升级主机'});result={online:true,compatible:health.features?.includes('integrated-media-v1')===true};}
    catch(error){const reason=String(error.message);checks.push({name:'网络与证书',ok:false,detail:/ERR_CERT/i.test(reason)?'证书未受信任、已变更或主机名不匹配。请导入管理员最新接入文件并确认信任。':/Abort|timeout/i.test(reason+' '+error.name)?'连接超时，请确认主机已启动且两台电脑处于可互通的公司局域网。':'无法连接主机，请核对地址，并请管理员检查协作服务及网络。'});result={online:false,compatible:false};}finally{clearTimeout(timer)}
    return {...result,host:url.origin,checkedAt:new Date().toISOString(),checks};
  });
  register('export-report',async(event,report)=>{const value={host:String(report?.host||'').slice(0,200),checkedAt:report?.checkedAt,online:report?.online,compatible:report?.compatible,checks:report?.checks};const text=JSON.stringify(value,null,2);if(text.length>12000)throw Error('检测报告无效');const result=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender),{defaultPath:'创作流员工连接检测.json',filters:[{name:'检测报告',extensions:['json']}]});if(result.canceled)return false;fs.writeFileSync(result.filePath,text);return true});
  return {getProfile:id=>profiles.get(id)};
}
module.exports={installEmployeeAccess,queueAccessFile,verifyCompanyHost};
