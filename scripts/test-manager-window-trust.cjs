const {_electron}=require(process.env.CF_PLAYWRIGHT_PATH),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {root,absolute}=require('./project-paths.cjs');
const output=absolute('qaRoot','manager/window-trust');fs.mkdirSync(output,{recursive:true});
const checks=[];
async function run(label,asar,fail=false){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'creativeflow-manager-qa-'));
 let app;try{
  app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'host-manager-trust-window.cjs')],env:{...process.env,CF_MANAGER_TEST_DIR:folder,CF_MANAGER_ASAR:asar||'',CF_MANAGER_FAIL_STATUS:fail?'1':'0'}});
  const page=await app.firstWindow();page.setDefaultTimeout(12000);
  if(fail){
   await page.getByRole('heading',{name:'暂时无法读取主机状态',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'安装协作主机',exact:true}).count(),0);
   assert.equal(await page.getByText('尚未安装协作服务',{exact:true}).count(),0);
   assert.ok(!(await page.getByRole('alert').innerText()).includes('Error invoking remote method'));
   await page.screenshot({path:path.join(output,'status-failed.png')});
   await app.evaluate(()=>{global.__failStatus=false});
   await page.getByRole('button',{name:'重新读取状态',exact:true}).click();
  }
  await page.getByRole('button',{name:'停止协作',exact:true}).waitFor();
  assert.equal(await page.getByText('不受信任的窗口',{exact:true}).count(),0);
  await page.getByRole('button',{name:'刷新状态',exact:true}).click();
  await page.getByRole('button',{name:'刷新状态',exact:true}).waitFor({state:'visible'});
  // The same packaged guard must still reject unrelated frames and WebContents.
  const rejected=await app.evaluate(()=>{
   const req=global.__trustRequire,{BrowserWindow}=req('electron'),p=req('node:path'),{pathToFileURL}=req('node:url');
   const w=BrowserWindow.getAllWindows()[0],entry=p.resolve(p.dirname(global.__mainPath),'../dist/index.html');
   const {isTrustedWindow}=req(p.join(p.dirname(global.__mainPath),'window-trust.cjs'));
   const valid={sender:w.webContents,senderFrame:w.webContents.mainFrame};
   return {valid:isTrustedWindow(valid,w,entry),foreign:!isTrustedWindow({...valid,sender:{}},w,entry),subframe:!isTrustedWindow({...valid,senderFrame:{url:pathToFileURL(entry).href}},w,entry),calls:global.__trustCalls,trace:global.__trustTrace};
  });
  assert.equal(rejected.valid,true);assert.equal(rejected.foreign,true);assert.equal(rejected.subframe,true);assert.ok(rejected.calls>=2);
  await page.screenshot({path:path.join(output,label+'.png')});checks.push({label,passed:true,...rejected});
 }catch(error){if(app){const p=await app.firstWindow();console.error(label,await p.locator('body').innerText());console.error(await app.evaluate(()=>({trace:global.__trustTrace,module:global.__mainPath})));}throw error;}finally{if(app)await app.close();}
}
(async()=>{
 await run('source',null);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'creativeflow-manager-qa-'));
 const unified=require('./project-paths.cjs').layout.releaseKind==='unified';
 const source=absolute('buildRoot',unified?'client/win-unpacked/resources/app.asar':'manager/win-unpacked/resources/app.asar');
 for(const name of ['normal','中文 路径 # ~ % 主机']){
  const target=path.join(folder,name,'app.asar');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  await run(name==='normal'?'packaged-short-temp':'packaged-chinese-special',unified?path.join(target,'host-manager'):target);
 }
 await run('status-retry',unified?path.join(source,'host-manager'):source,true);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),scope:'Real Electron IPC and packaged ASAR; isolated fake controller. No company service or data changes.',checks},null,2));
 console.log('Manager window trust: all four real Electron scenarios passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
