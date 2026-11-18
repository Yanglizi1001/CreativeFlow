import { APP_STORAGE_KEY, cloneSeedData } from './data';
import { migrateColors } from './colors';
import { validDatabase } from './validateDatabase';
import { addHistory, applyWork } from './history';

const HISTORY_KEY=APP_STORAGE_KEY+'-session-history';
const session=window.creativeFlowWindow?.sessionId || (()=>{let id=sessionStorage.getItem('work-session');if(!id){id=crypto.randomUUID();sessionStorage.setItem('work-session',id);}return id;})();
const emptyHistory=()=>({session,past:[],future:[]});
function loadDb() {
  const raw=localStorage.getItem(APP_STORAGE_KEY);
  try {const db=raw?JSON.parse(raw):cloneSeedData();if(!validDatabase(db))throw Error();return migrateColors(db,Boolean(raw));}
  catch {const db=migrateColors(cloneSeedData(),false);if(raw){localStorage.setItem(APP_STORAGE_KEY+'-recovery',raw);db.preferences.recoveryAvailable=true;}return db;}
}
function loadHistory() {try {const h=JSON.parse(localStorage.getItem(HISTORY_KEY));return h?.session===session&&Array.isArray(h.past)&&Array.isArray(h.future)?h:emptyHistory();}catch{return emptyHistory();}}
let snapshot={db:loadDb(),history:loadHistory(),saveStatus:'已保存',revision:0};
try { if(!localStorage.getItem(APP_STORAGE_KEY))localStorage.setItem(APP_STORAGE_KEY,JSON.stringify(snapshot.db)); } catch {}
try {const old=JSON.parse(localStorage.getItem(HISTORY_KEY));if(old&&old.session!==session)localStorage.removeItem(HISTORY_KEY);}catch{}
const listeners=new Set();
let fallbackQueue=Promise.resolve();
function publish(db,history,status='已保存') {snapshot={db,history,saveStatus:status,revision:snapshot.revision+1};listeners.forEach(fn=>fn());}
function latest() {return {db:loadDb(),history:loadHistory()};}
function save(db,history) {
  localStorage.setItem(APP_STORAGE_KEY,JSON.stringify(db));
  // History is expendable; never sacrifice a successful work-data save for it.
  try {localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}
  catch {history={...emptyHistory(),notice:'已保存，但撤销记录因存储空间不足而清空'};try{localStorage.removeItem(HISTORY_KEY);}catch{}}
  publish(db,history,history.notice || '已保存');
}
function locked(action) {
  const run=()=>{try{return action();}catch(error){publish(snapshot.db,snapshot.history,'保存失败，请导出备份');throw error;}};
  // Web Locks serialize main-window and widget edits, including rapid toggles.
  return navigator.locks?.request ? navigator.locks.request('creative-flow-work-data',run) : (fallbackQueue=fallbackQueue.catch(()=>{}).then(run));
}
export const workStore={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  getSnapshot:()=>snapshot,
  flush(){return locked(()=>latest().db);},
  change(updater,label='更新工作数据',options={}) {
    return locked(()=>{const {db,history}=latest();const next=typeof updater==='function'?updater(db):updater;if(JSON.stringify(next)===JSON.stringify(db))return;
      const h=options.history===false?history:addHistory(history,db,next,label,crypto.randomUUID());save(next,h);return h.past.at(-1)?.id;
    });
  },
  travel(direction,expectedId) {
    return locked(()=>{const {db,history}=latest();const source=direction==='undo'?history.past:history.future;const entry=source.at(-1);if(!entry||(expectedId&&entry.id!==expectedId))return null;
      const next=applyWork(db,entry.patches,direction);
      for(const project of next.projects) if(entry.patches.some(p=>p.path[0]==='projects'&&p.path[1]?.id===project.id)) project.activities=[{id:crypto.randomUUID(),at:new Date().toLocaleString('zh-CN'),text:(direction==='undo'?'撤销：':'重做：')+entry.label},...(project.activities||[])].slice(0,50);
      const h=direction==='undo'?{...history,past:source.slice(0,-1),future:[...history.future,entry]}:{...history,past:[...history.past,entry],future:source.slice(0,-1)};save(next,h);return entry.label;
    });
  },
  replace(db){return locked(()=>save(migrateColors(db),emptyHistory()));}
};
window.addEventListener('storage',event=>{if([APP_STORAGE_KEY,HISTORY_KEY].includes(event.key)){const {db,history}=latest();publish(db,history);}});
