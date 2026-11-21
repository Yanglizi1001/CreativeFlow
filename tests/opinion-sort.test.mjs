import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {applyCommands}=createRequire(import.meta.url)('../electron/collaboration-state.cjs');
import {sortOpinions,stampOpinionChanges,normalizeOpinionSort} from '../src/opinionSort.mjs';
const ids=a=>a.map(x=>x.id);
test('concurrent independent content fields do not conflict on shared modification metadata',()=>{
 const fields={text:'before',time:'00:03',done:false,updatedAt:'2026-01-02T00:00:00Z'};
 const snapshot={entities:[{id:'i',kind:'opinion',fields,permission:'edit',createdBy:'a',revision:2}]};
 const result=applyCommands(snapshot,[{type:'update',kind:'opinion',id:'i',fields:{text:'after',updatedAt:'2026-01-03T00:00:00Z'},expected:{text:'before',updatedAt:'2026-01-01T00:00:00Z'}}],{strict:true,actor:{memberId:'b',role:'member'}});
 assert.equal(result.entities[0].fields.text,'after');assert.equal(result.entities[0].fields.time,'00:03');
});
const rows=[{id:'long',time:'01:01:00'},{id:'general',time:''},{id:'zero',time:'00:00'},{id:'minute',time:'02:00'}];
test('numeric timeline, real zero, whole-video grouping and direction without mutations',()=>{
 const original=structuredClone(rows);assert.deepEqual(ids(sortOpinions(rows,{mode:'timeline'})),['general','zero','minute','long']);
 assert.deepEqual(ids(sortOpinions(rows,{mode:'timeline',direction:'desc',generalFirst:false})),['long','minute','zero','general']);assert.deepEqual(rows,original);
});
test('date missing always last, stable ties, independently prioritize unfinished',()=>{
 const rows=[{id:'old'},{id:'a',createdAt:'2026-11-20T10:00:00Z',done:true},{id:'b',createdAt:'2026-11-21T10:00:00Z'},{id:'c',createdAt:'2026-11-21T10:00:00Z'}];
 assert.deepEqual(ids(sortOpinions(rows,{mode:'created',direction:'desc'})),['b','c','a','old']);
 assert.deepEqual(ids(sortOpinions(rows,{mode:'created',direction:'asc'})),['a','b','c','old']);
 assert.deepEqual(ids(sortOpinions(rows,{mode:'original',openFirst:true})),['old','b','c','a']);
});
const db=items=>({projects:[{tasks:[{versions:[{lists:[{items}]}]}]}]});
const item=db=>db.projects[0].tasks[0].versions[0].lists[0].items[0];
test('creation/content/status timestamps represent different actions and leave legacy dates unknown',()=>{
 const now='2026-11-21T10:00:00.000Z';const legacy=db([{id:'i',text:'old',time:'',done:false}]);
 assert.equal(item(stampOpinionChanges(legacy,structuredClone(legacy),now)).createdAt,undefined);
 const added=stampOpinionChanges(db([]),legacy,now);assert.equal(item(added).createdAt,now);
 const status=structuredClone(added);item(status).done=true;const changed=stampOpinionChanges(added,status,'2026-11-21T11:00:00.000Z');
 assert.equal(item(changed).updatedAt,now);assert.equal(item(changed).statusChangedAt,'2026-11-21T11:00:00.000Z');
 const text=structuredClone(changed);item(text).text='new';assert.equal(item(stampOpinionChanges(changed,text,'2026-11-21T12:00:00Z')).updatedAt,'2026-11-21T12:00:00Z');
 assert.equal(item(legacy).createdAt,undefined);
});
test('restore retains timestamp and defaults are surface specific',()=>{
 const old={id:'i',text:'old',createdAt:'2026-10-01T00:00:00Z'};const before={...db([]),versionTrash:[{version:{lists:[{items:[old]}]}}]};
 assert.equal(item(stampOpinionChanges(before,db([old]))).createdAt,old.createdAt);
 assert.equal(normalizeOpinionSort({},'review').mode,'timeline');assert.equal(normalizeOpinionSort({},'feedback').direction,'desc');
});
