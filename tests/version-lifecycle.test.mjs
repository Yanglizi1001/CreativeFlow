import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextVersionNumber,versionSignature,removeLocalVersion,restoreLocalVersion} from '../src/versionLifecycle.mjs';
import {addHistory,applyWork} from '../src/history.js';
const fixture=()=>({schema:2,projects:[{id:'p',name:'项目',tasks:[{id:'t',name:'任务',due:'2026-12-01',versions:[{id:'v',name:'V3',file:{name:'视频.mp4',path:'D:/original.mp4'},lists:[{id:'l',name:'意见',items:[{id:'i',text:'修改',done:false}]}]}]}]}]});
const target=db=>({projectId:'p',taskId:'t',versionId:'v',signature:versionSignature(db.projects[0].tasks[0].versions[0])});
test('last version goes to durable trash with opinions and original path, retaining task schedule',()=>{
 const db=fixture(),deleted=removeLocalVersion(db,target(db));assert.equal(db.projects[0].tasks[0].versions.length,1);
 assert.equal(deleted.projects[0].tasks[0].versions.length,0);assert.equal(deleted.projects[0].tasks[0].due,'2026-12-01');assert.equal(nextVersionNumber(deleted.projects[0].tasks[0]),4);
 const persisted=JSON.parse(JSON.stringify(deleted)),restored=restoreLocalVersion(persisted,persisted.versionTrash[0].id);
 assert.deepEqual(restored.projects[0].tasks[0].versions,db.projects[0].tasks[0].versions);assert.deepEqual(restored.versionTrash,[]);
});
test('concurrent opinion changes reject deletion; playback metadata does not invalidate confirmation',()=>{
 const db=fixture(),request=target(db);db.projects[0].tasks[0].versions[0].reviewPosition=5;
 assert.equal(removeLocalVersion(db,request).versionTrash.length,1);
 db.projects[0].tasks[0].versions[0].lists[0].items.push({id:'new',text:'新的意见',done:false});assert.throws(()=>removeLocalVersion(db,request),/已更新/);
});
test('restore refuses orphaned parents and name collisions without changing the trash',()=>{
 const db=fixture(),deleted=removeLocalVersion(db,target(db)),id=deleted.versionTrash[0].id;
 deleted.projects[0].tasks[0].versions.push({id:'other',name:'v3',lists:[]});assert.throws(()=>restoreLocalVersion(deleted,id),/同名/);assert.equal(deleted.versionTrash.length,1);
 deleted.projects=[];assert.throws(()=>restoreLocalVersion(deleted,id),/任务不存在/);
});
test('local undo restores deletion atomically without reusing the highest version number',()=>{
 const before=fixture(),after=removeLocalVersion(before,target(before));
 const h=addHistory({past:[],future:[]},before,after,'删除版本','op');const undo=applyWork(after,h.past[0].patches,'undo');
 assert.equal(undo.projects[0].tasks[0].versions[0].id,'v');assert.equal(nextVersionNumber(undo.projects[0].tasks[0]),4);assert.ok(!undo.versionTrash?.length);
});
