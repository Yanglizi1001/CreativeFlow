// Runs the actual desktop entry point with a disposable profile, never the
// operator's installed application's profile.
const {app}=require('electron');
const path=require('path');
const os=require('os');
const profile=path.resolve(process.env.CF_UI_TEST_PROFILE||'');
if(!profile.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(profile).startsWith('creativeflow-071-'))throw Error('An isolated test profile is required');
app.setPath('userData',profile);
app.setPath('crashDumps',path.join(profile,'crashes'));
app.commandLine.appendSwitch('disable-gpu');
global.__testOffline=process.env.CF_TEST_OFFLINE==='1';
app.whenReady().then(()=>{
  const channel=require('electron').session.fromPartition(require('../electron/collaboration-network.cjs').PARTITION);
  const original=channel.fetch.bind(channel);
  channel.fetch=(url,options)=>global.__testOffline&&String(url).startsWith('http://127.0.0.1:47858')?Promise.reject(Error('测试网络已断开')):original(url,options);
});
const testNet=require('electron').net,originalFetch=testNet.fetch.bind(testNet);
testNet.fetch=(url,options)=>global.__testOffline&&String(url).startsWith('http://127.0.0.1:47858')?Promise.reject(Error('测试网络已断开')):originalFetch(url,options);
global.__integrationInvite=async()=>{
  const {safeStorage,net}=require('electron');
  const entry=JSON.parse(require('fs').readFileSync(path.join(profile,'collaboration-connections-v1.json'),'utf8'))[0];
  const response=await net.fetch(entry.host+'/api/v1/admin/invitations',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+safeStorage.decryptString(Buffer.from(entry.encryptedToken,'base64'))},body:JSON.stringify({displayName:'第二成员',role:'member'})});
  return response.json();
};
require('../electron/main.cjs');
