import test from 'node:test';
import assert from 'node:assert/strict';
import {COLOR_PALETTE, allocateTaskColor, defaultTaskColor, legacyTaskColor, migrateColors, projectColor, readableText, scheduleColor, tagColors, validColor} from '../src/colors.js';
import {validDatabase} from '../src/validateDatabase.js';

const fixture=()=>({schema:2,preferences:{},projects:[{id:'p',name:'项目',color:'#087f8c',tasks:[{id:'t',name:'任务',versions:[]}]}]});
const luminance=color=>color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('任务颜色独立于项目，恢复的是自己的默认颜色',()=>{
  const project={color:'#087f8c'},task={project,color:'#b34747',defaultColor:'#6555ba'};
  assert.equal(scheduleColor(task),'#b34747');project.color='#bd4975';assert.equal(scheduleColor(task),'#b34747');
  task.color=defaultTaskColor(task);assert.equal(scheduleColor(task),'#6555ba');task.color=null;assert.equal(scheduleColor(task),'#6555ba');
});
test('旧数据迁移保留原有排期颜色，不覆盖项目和已有自定义颜色，重复迁移不再修改',()=>{
  const old=fixture(),expected=legacyTaskColor({...old.projects[0].tasks[0],project:old.projects[0]});
  old.projects[0].tasks.push({id:'custom',name:'自定义',color:'#bd4975',versions:[]});
  const next=migrateColors(old);assert.equal(next.projects[0].color,old.projects[0].color);assert.equal(next.projects[0].tasks[0].color,expected);assert.equal(next.projects[0].tasks[1].color,'#bd4975');assert.equal(old.projects[0].tasks[0].color,undefined);assert.equal(migrateColors(next),next);
  const fresh=migrateColors(fixture(),false);assert.equal(fresh.projects[0].tasks[0].color,COLOR_PALETTE[0]);assert.equal(fresh.projects[0].tasks[0].defaultColor,COLOR_PALETTE[0]);
});
test('beta.4 跟随项目的任务固化当前颜色，已有独立颜色不变，标签配置保留',()=>{
  const old=fixture();old.preferences={colorSettingsVersion:1,tagColors:{stage:{'客户审核':'#bd4975'}}};
  old.projects[0].tasks.push({id:'independent',name:'独立任务',color:'#b34747',versions:[]});
  const next=migrateColors(old);assert.equal(next.preferences.colorSettingsVersion,2);assert.equal(next.projects[0].tasks[0].color,'#087f8c');assert.equal(next.projects[0].tasks[0].defaultColor,'#087f8c');assert.equal(next.projects[0].tasks[1].color,'#b34747');assert.deepEqual(next.preferences.tagColors,old.preferences.tagColors);
  next.projects[0].color='#6555ba';assert.equal(scheduleColor({...next.projects[0].tasks[0],project:next.projects[0]}),'#087f8c');
});
test('同项目新任务优先分配未使用的颜色，删除或新增不改变已有任务颜色',()=>{
  const tasks=[{color:COLOR_PALETTE[0]},{color:COLOR_PALETTE[1]}];assert.equal(allocateTaskColor(tasks),COLOR_PALETTE[2]);
  const snapshot=structuredClone(tasks);tasks.push({color:allocateTaskColor(tasks)});assert.deepEqual(tasks.slice(0,2),snapshot);tasks.splice(0,1);assert.equal(allocateTaskColor(tasks),COLOR_PALETTE[0]);
});
test('排期文字和浅底标签在预设色及极端自定义色下均达到正常文字对比度',()=>{
  for(const color of [...COLOR_PALETTE,'#ffffff','#000000','#ffff00','#00ffff','#ff00ff','#eeeeee']){
    assert(contrast(color,readableText(color))>=4.5,color+' bar contrast');const tag=tagColors(color);assert(contrast(tag.backgroundColor,tag.color)>=4.5,color+' tag contrast');
  }
});
test('非法颜色不会成为样式，带颜色的备份可验证，错误颜色映射被拒绝',()=>{
  assert(!validColor('url(example)'));assert(!validColor('#123'));assert.equal(tagColors('bad'),undefined);assert.equal(projectColor({color:'bad'}),'#3878cf');
  const data=fixture();data.preferences.tagColors={project:{'进行中':'#b34747'},version:{'进行中':'#087f8c'}};assert(validDatabase(data));assert.notEqual(data.preferences.tagColors.project['进行中'],data.preferences.tagColors.version['进行中']);
  data.preferences.tagColors.project['进行中']='bad';assert(!validDatabase(data));data.preferences.tagColors=[];assert(!validDatabase(data));
});
