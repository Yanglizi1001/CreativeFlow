import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {CollaborationEngine}=require('../electron/collaboration-engine.cjs');
const {applyCommands}=require('../electron/collaboration-state.cjs');
const actor={id:'connection',memberId:'owner',displayName:'管理员',role:'owner'};
const initial=()=>({epoch:'epoch',members:[],entities:[{kind:'project',id:'p',parentId:null,order:0,fields:{name:'项目',notes:'原始备注'},revision:1,permission:'manage',createdBy:'owner'}]});
const batch=(id,name='我的名称')=>({operationId:id,epoch:'epoch',commands:[{type:'update',kind:'project',id:'p',fields:{name},expected:{name:'项目'},revision:1}]});
async function environment(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creativeflow-engine-')),file=path.join(directory,'cache.sqlite');let online=true,server=initial(),rejectStatus=0,commits=0;
  const seen=new Set();
  async function request(_id,action,payload){
    if(!online)throw Error('网络断开');
    if(action==='snapshot')return structuredClone(server);
    if(rejectStatus){const error=Error('冲突或权限改变');error.status=rejectStatus;throw error;}
    if(!seen.has(payload.operationId)){server=applyCommands(server,payload.commands,{strict:true,actor});seen.add(payload.operationId);commits++;}
    return {applied:true};
  }
  const options={getConnection:()=>actor,request,broadcast:()=>{}};
  let engine=new CollaborationEngine(file,options);await engine.select('connection');await engine.pump('connection');
  return {get engine(){return engine;},get server(){return server;},get commits(){return commits;},set online(value){online=value;},set reject(value){rejectStatus=value;},set server(value){server=value;},
    async restart(){await engine.pump('connection');engine.close();engine=new CollaborationEngine(file,options);},
    async close(){await engine.pump('connection');engine.close();const absolute=path.resolve(directory);if(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('creativeflow-engine-'))fs.rmSync(absolute,{recursive:true,force:true});}};
}
test('offline edits are durable across restart and sync once when network returns',async()=>{
  const env=await environment();try{
    env.online=false;env.engine.enqueue('connection',batch('one'),'离线改名');await env.engine.pump('connection');
    assert.equal(env.engine.status().pendingCount,1);assert.equal(env.engine.status().data.entities[0].fields.name,'我的名称');
    await env.restart();assert.equal(env.engine.status().pendingCount,1);assert.equal(env.engine.status().data.entities[0].fields.name,'我的名称');
    env.online=true;await env.engine.pump('connection');assert.equal(env.engine.status().pendingCount,0);assert.equal(env.server.entities[0].fields.name,'我的名称');assert.equal(env.commits,1);
    env.engine.enqueue('connection',batch('one'),'同一操作重试');await env.engine.pump('connection');assert.equal(env.commits,1);
  }finally{await env.close();}
});
test('two windows cannot overwrite a field edited in the other window',async()=>{
  const env=await environment();try{env.online=false;env.engine.enqueue('connection',batch('one'),'窗口一');
    assert.throws(()=>env.engine.enqueue('connection',batch('two','窗口二内容'),'窗口二'),/其他窗口/);
    assert.equal(env.engine.status().pendingCount,1);
  }finally{await env.close();}
});
test('server rejection keeps drafts, blocks further edits and requires explicit resolution',async()=>{
  const env=await environment();try{
    env.reject=409;env.engine.enqueue('connection',batch('one'),'我的改名');await env.engine.pump('connection');
    assert.equal(env.engine.status().conflicts.length,1);assert.equal(env.engine.exportPending('connection').pending[0].batch.commands[0].fields.name,'我的名称');
    assert.throws(()=>env.engine.enqueue('connection',batch('two'),'新修改'),/处理冲突/);
    const state=env.engine.status();env.reject=0;await env.engine.resolve('connection','one','retry',state.serverEntities);await env.engine.pump('connection');
    assert.equal(env.engine.status().pendingCount,0);assert.equal(env.server.entities[0].fields.name,'我的名称');
  }finally{await env.close();}
});
test('conflict resolution refuses to overwrite server content changed since comparison',async()=>{
  const env=await environment();try{
    env.reject=409;env.engine.enqueue('connection',batch('one'),'改名');await env.engine.pump('connection');const observed=env.engine.status().serverEntities;
    const updated=structuredClone(env.server);updated.entities[0].fields.name='同事的新名称';env.server=updated;
    await assert.rejects(env.engine.resolve('connection','one','retry',observed),/又有变化/);
    assert.equal(env.engine.status().pendingCount,1);
  }finally{await env.close();}
});
test('restored workspace epoch quarantines old edits instead of replaying them',async()=>{
  const env=await environment();try{
    env.online=false;env.engine.enqueue('connection',batch('one'),'离线改名');await env.engine.pump('connection');
    const restored=initial();restored.epoch='restored';env.server=restored;env.online=true;await env.engine.pump('connection');
    assert.equal(env.commits,0);assert.equal(env.engine.status().conflicts.length,1);
    await assert.rejects(env.engine.resolve('connection','one','retryOriginal'),/恢复/);
    await env.engine.resolve('connection','one','discard');assert.equal(env.engine.status().pendingCount,0);
  }finally{await env.close();}
});
test('revoked credentials hide the cached server data while retaining own pending drafts',async()=>{
  const env=await environment();try{
    env.reject=401;env.engine.enqueue('connection',batch('one'),'离线改名');await env.engine.pump('connection');
    assert.equal(env.engine.status().authorized,false);assert.equal(env.engine.status().data.entities.length,0);assert.equal(env.engine.exportPending('connection').pending.length,1);
  }finally{await env.close();}
});
test('unrelated remote field survives synchronization and conditional undo',async()=>{
  const env=await environment();try{
    env.engine.enqueue('connection',batch('one'),'改名');await env.engine.pump('connection');
    const changed=structuredClone(env.server);changed.entities[0].fields.notes='同事写的备注';changed.entities[0].revision++;env.server=changed;await env.engine.pump('connection');
    env.engine.travel('connection','undo');await env.engine.pump('connection');assert.equal(env.server.entities[0].fields.name,'项目');assert.equal(env.server.entities[0].fields.notes,'同事写的备注');
  }finally{await env.close();}
});
