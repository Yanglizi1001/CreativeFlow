const {spawn}=require('node:child_process');
const path=require('node:path');
function launchManager(executable,sessionFile,{elevate=false,developmentEntry}={}){
 const args=[...(developmentEntry?[developmentEntry]:[]),'--collaboration-manager',...(sessionFile?['--manager-session='+sessionFile]:[])];
 if(!elevate){const child=spawn(executable,args,{detached:true,windowsHide:false,stdio:'ignore'});child.unref();return Promise.resolve({started:true});}
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const command=`try {$p=Start-Process -FilePath ${quote(executable)} -ArgumentList ${quote(args.map(a=>'"'+a+'"').join(' '))} -Verb RunAs -WindowStyle Normal -PassThru; 'CFMANAGER-LAUNCH:ok'} catch {$cancelled=$false;$reason=$_.Exception;while($reason){if($reason.NativeErrorCode -eq 1223){$cancelled=$true};$reason=$reason.InnerException};if($cancelled){'CFMANAGER-LAUNCH:cancelled'}else{'CFMANAGER-LAUNCH:error'};exit 1}`;
 return new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','ignore']});let output='';child.stdout.on('data',b=>{if(output.length<1000)output+=b;});child.on('error',reject);child.on('close',()=>output.includes('CFMANAGER-LAUNCH:ok')?resolve({started:true}):output.includes('cancelled')?resolve({cancelled:true}):reject(Error('无法申请本机管理权限，请重试。')));});
}
module.exports={launchManager};
