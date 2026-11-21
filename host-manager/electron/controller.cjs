const {spawn}=require('node:child_process');
const path=require('node:path');
const allowed=new Set(['public-status','status','diagnose','install','adopt','reattach','start','stop','autostart','manager-startup','storage-status','storage-configure','storage-cleanup','firewall','manage','backup','backup-schedule','migrate-data','migrate-program','restore','upgrade','export-access','uninstall']);
class Controller {
  constructor(resources){this.resources=resources;this.running=false;this.child=null;}
  async invoke(request){
    if(!request||typeof request!=='object'||!allowed.has(request.action))throw Error('不支持的管理操作');
    const input=JSON.stringify(request);if(Buffer.byteLength(input)>65536)throw Error('管理请求过大');
    if(this.running)throw Error('另一项操作正在进行，请稍候。');this.running=true;
    try{return await new Promise((resolve,reject)=>{
      const child=spawn(path.join(process.env.WINDIR||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.resources,'scripts/Manager.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
      let output='',error='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',data=>{if(output.length<4e6)output+=data;});child.stderr.on('data',data=>{if(error.length<2000)error+=data;});
      child.on('error',reject);child.on('close',code=>{this.child=null;const line=output.split(/\r?\n/).filter(x=>x.startsWith('CFMANAGER:')).at(-1);if(!line)return reject(Error(error||'无法读取管理结果，请导出故障报告。'));try{const result=JSON.parse(line.slice(10));if(result.error||code!==0)reject(Error(result.error||'操作未完成'));else resolve(result);}catch(e){reject(e);}});
      child.stdin.on('error',()=>{});child.stdin.end(input);
    });}finally{this.running=false;}
  }
}
module.exports={Controller,allowed};
