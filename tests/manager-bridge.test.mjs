import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const {createManagerBridge,sendManagerEvent}=createRequire(import.meta.url)('../electron/manager-bridge.cjs');
test('manager bridge authenticates UI-only events, rejects changed token and unsupported operations, cleans up',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creativeflow-071-manager-bridge-')),events=[];
 const bridge=createManagerBridge(directory,message=>events.push(message.type));await bridge.ready;
 try{
  assert.equal(await sendManagerEvent(bridge.file,{type:'activate'}),true);
  assert.equal(await sendManagerEvent(bridge.file,{type:'upgrade',path:'D:\\unrelated'}),false);
  const wrong=path.join(directory,'wrong.json'),info=JSON.parse(fs.readFileSync(bridge.file));fs.writeFileSync(wrong,JSON.stringify({...info,token:'0'.repeat(64)}));assert.equal(await sendManagerEvent(wrong,{type:'activate'}),false);
  assert.deepEqual(events,['activate']);assert.equal(await sendManagerEvent(path.join(directory,'missing.json'),{type:'activate'}),false);
 }finally{bridge.close();}
 assert.equal(fs.existsSync(bridge.file),false);
});
