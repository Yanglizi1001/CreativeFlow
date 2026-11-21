import {parseOpinionTime,isGeneralOpinion} from './opinions.js';
export const OPINION_SORT_DEFAULTS={task:{mode:'original',direction:'asc'},review:{mode:'timeline',direction:'asc'},feedback:{mode:'created',direction:'desc'},widget:{mode:'created',direction:'desc'}};
export function normalizeOpinionSort(value={},scope='task'){
 const base=OPINION_SORT_DEFAULTS[scope]||OPINION_SORT_DEFAULTS.task;
 return {mode:['original','timeline','created','updated'].includes(value.mode)?value.mode:base.mode,direction:['asc','desc'].includes(value.direction)?value.direction:base.direction,openFirst:value.openFirst===true,generalFirst:value.generalFirst!==false,hideGeneral:value.hideGeneral===true};
}
export function opinionDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))return null;const n=Date.parse(value);return Number.isFinite(n)?n:null;}
export function sortOpinions(entries=[],options={},itemOf=value=>value){
 const sort=normalizeOpinionSort(options),direction=sort.direction==='desc'?-1:1;
 return entries.map((entry,index)=>({entry,item:itemOf(entry),index})).sort((a,b)=>{
  if(sort.mode==='timeline'){const group=Number(!isGeneralOpinion(a.item))-Number(!isGeneralOpinion(b.item));if(group)return sort.generalFirst?group:-group;}
  if(sort.openFirst&&!!a.item.done!==!!b.item.done)return Number(!!a.item.done)-Number(!!b.item.done);
  if(sort.mode==='original')return a.index-b.index;
  const key=item=>sort.mode==='timeline'?(isGeneralOpinion(item)?null:parseOpinionTime(String(item.time))):opinionDate(sort.mode==='created'?item.createdAt:item.updatedAt||item.createdAt);
  const left=key(a.item),right=key(b.item);
  if(left===null&&right!==null)return 1;if(right===null&&left!==null)return -1;
  if(left!==null&&right!==null&&left!==right)return (left-right)*direction;
  const ac=opinionDate(a.item.createdAt),bc=opinionDate(b.item.createdAt);if(ac!==null&&bc!==null&&ac!==bc)return ac-bc;
  return a.index-b.index;
 }).map(row=>row.entry);
}
export const OPINION_TIME_FIELDS=['createdAt','updatedAt','statusChangedAt','timeOrigin','inheritedFrom','sourceCreatedAt'];
const allItems=db=>(db?.projects||[]).flatMap(p=>p.tasks.flatMap(t=>t.versions.flatMap(v=>v.lists.flatMap(l=>l.items))));
export function stampOpinionChanges(before,after,now=new Date().toISOString()){
 const prior=new Map(allItems(before).map(item=>[item.id,item]));
 for(const r of before?.versionTrash||[])for(const list of r.version.lists)for(const item of list.items)prior.set(item.id,item);
 return {...after,projects:after.projects.map(p=>({...p,tasks:p.tasks.map(t=>({...t,versions:t.versions.map(v=>({...v,lists:v.lists.map(l=>({...l,items:l.items.map(item=>{
  const old=prior.get(item.id);
  if(!old){const created=opinionDate(item.createdAt)!==null?item.createdAt:now;return {...item,createdAt:created,updatedAt:opinionDate(item.updatedAt)!==null?item.updatedAt:created,timeOrigin:item.timeOrigin||'recorded'};}
  const result={...item};
  if(old.text!==item.text||(old.time||'')!==(item.time||''))result.updatedAt=now;
  if(old.done!==item.done||old.status!==item.status)result.statusChangedAt=now;
  return result;
 })}))}))}))}))};
}
