import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenDatabase,materializeDatabase,createEntityCommands,prepareProjectUpload} from '../src/collaboration/model.mjs';
import {validDatabase} from '../src/validateDatabase.js';
const base=()=>({schema:2,preferences:{compact:true,customOptions:{taskStages:['待配音']},tagColors:{stage:{待配音:'#123456'}}},projects:[{id:'p',name:'项目',notes:'项目备注',start:'2026-11-01',due:'2026-12-01',color:'#123456',tasks:[{id:'t',name:'视频',type:'视频',status:'待配音',notes:'任务备注',defaultColor:'#123456',versions:[{id:'v',name:'V2',status:'客户审核',createdAt:'2026-11-19',file:{path:'D:/private.mp4',name:'样片.mp4'},duration:60,reviewPosition:25,reviewedAt:'今天',lists:[{id:'l',name:'意见',items:[{id:'i',text:'整体修改',time:'',done:false,status:'todo'},{id:'i2',text:'片头',time:'00:00',done:true,status:'done'}]}]}]}]}]});
test('local hierarchy and shared fields round trip without losing dates, colors or general opinions',()=>{
  const db=base();const result=materializeDatabase(flattenDatabase(db),{compact:true});
  assert.ok(validDatabase(result));assert.deepEqual(result.preferences.customOptions,db.preferences.customOptions);
  assert.equal(result.projects[0].tasks[0].notes,'任务备注');assert.equal(result.projects[0].due,'2026-12-01');
  const version=result.projects[0].tasks[0].versions[0];assert.equal(version.reviewPosition,undefined);
  assert.equal(version.lists[0].items[0].time,'');assert.equal(version.lists[0].items[1].time,'00:00');
  assert.equal(result.projects[0].tasks[0].defaultColor,'#123456');
});
test('calendar edit only submits changed entity fields, never a database replacement',()=>{
  const before=base(),after=structuredClone(before);after.projects[0].tasks[0].due='2026-11-30';
  assert.deepEqual(createEntityCommands(before,after,{t:4}),[{type:'update',kind:'task',id:'t',fields:{due:'2026-11-30'},expected:{due:null},revision:4}]);
});
test('playback, project activities and local display options never produce shared commands',()=>{
  const before=base(),after=structuredClone(before);after.preferences.compact=false;
  after.projects[0].activities=[{text:'播放'}];after.projects[0].tasks[0].versions[0].reviewPosition=40;
  assert.deepEqual(createEntityCommands(before,after),[]);
});
test('version inheritance creates parents first; deletion removes descendants first',()=>{
  const before=base(),after=structuredClone(before);const v=after.projects[0].tasks[0].versions[0];v.id='v3';v.lists[0].id='l3';v.lists[0].items.forEach(i=>i.id+='copy');
  const commands=createEntityCommands(before,after,{i:2,i2:1,l:1,v:3});
  assert.deepEqual(commands.filter(c=>c.type==='create').map(c=>c.kind),['version','list','opinion','opinion']);
  assert.deepEqual(commands.filter(c=>c.type==='delete').map(c=>c.kind),['opinion','opinion','list','version']);
});
test('explicit upload preserves local original and uses new IDs and no unusable file references',()=>{
  const original=base().projects[0],saved=structuredClone(original);let n=0;
  const result=prepareProjectUpload(original,()=>`new-${++n}`);
  assert.deepEqual(original,saved);assert.equal(result.project.tasks[0].versions[0].file,null);
  assert.deepEqual(result.missingMedia,['样片.mp4']);assert.equal(result.project.id,'new-1');
  assert.equal(result.project.tasks[0].versions[0].reviewPosition,undefined);
});
test('duplicate entity IDs fail before uploading any records',()=>{
  const db=base();db.projects[0].tasks[0].id='p';assert.throws(()=>flattenDatabase(db),/重复/);
});
test('empty company space never loads personal demo data',()=>{
  assert.deepEqual(materializeDatabase([]).projects,[]);
});
