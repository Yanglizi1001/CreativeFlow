import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import trust from '../host-manager/electron/window-trust.cjs';

test('manager accepts encoded local entry, rejects other windows, frames and URLs',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'creativeflow-trust-'));
 try{
  const entry=path.join(folder,'中文 ~ 空格 # %.html');fs.writeFileSync(entry,'fixture');
  const url=pathToFileURL(entry).href,frame={url},contents={mainFrame:frame};
  const window={webContents:contents,isDestroyed:()=>false},event={sender:contents,senderFrame:frame};
  const check=()=>trust.isTrustedWindow(event,window,entry);
  assert.equal(check(),true);frame.url=url.replace(/%7E/ig,'~');assert.equal(check(),true);
  frame.url=url.replace(/%25/g,'%');assert.equal(check(),true);
  for(const invalid of [url+'?x=1',url+'#frame','https://localhost/index.html','data:text/html,test',pathToFileURL(path.join(folder,'other.html')).href,'file://other-host/share/index.html']){frame.url=invalid;assert.equal(check(),false,invalid);}
  frame.url=url;assert.equal(trust.isTrustedWindow({...event,sender:{}},window,entry),false);
  assert.equal(trust.isTrustedWindow({...event,senderFrame:{url}},window,entry),false);
  assert.equal(trust.isTrustedWindow(event,{...window,isDestroyed:()=>true},entry),false);
  assert.equal(trust.isTrustedWindow(event,null,entry),false);
 }finally{assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(folder,{recursive:true,force:true});}
});
