const path=require('node:path');
const fs=require('node:fs');
const {fileURLToPath}=require('node:url');

// Chromium and Node encode short Windows paths differently (ADMINI~1 / ADMINI%7E1).
// Compare resolved files, while still requiring this window's main frame.
function canonicalFile(file){
  const resolved=fs.realpathSync(file);
  return process.platform==='win32'?path.normalize(resolved).toLowerCase():resolved;
}
function isTrustedWindow(event,window,entry){
  try{
    if(!window||window.isDestroyed()||event.sender!==window.webContents)return false;
    const frame=event.senderFrame;
    if(!frame||frame!==window.webContents.mainFrame)return false;
    // Chromium can leave a literal percent sign unescaped in a loaded file URL.
    const url=new URL(frame.url.replace(/%(?![0-9a-f]{2})/gi,'%25'));
    if(url.protocol!=='file:'||url.host||url.search||url.hash)return false;
    return canonicalFile(fileURLToPath(url))===canonicalFile(entry);
  }catch{return false;}
}
module.exports={isTrustedWindow};
