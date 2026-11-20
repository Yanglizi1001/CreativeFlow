import {versionSignature} from '../versionLifecycle.mjs';
import {workStore as personalStore} from '../workStore';
import {createEntityCommands,materializeDatabase,prepareProjectUpload} from './model.mjs';
import {setViewNamespace} from '../viewState';
const listeners=new Set(),privateViews=new Map();
let nativeState={space:null},queue=Promise.resolve();
let snapshot={...personalStore.getSnapshot(),space:null,sync:null};
const api=()=>{const bridge=window.creativeFlowWindow?.collaboration;if(!bridge)throw Error('请在桌面软件中连接公司空间');return bridge;};
const serial=fn=>{const task=queue.catch(()=>{}).then(fn);queue=task;return task;};
function publish(value){snapshot=value;listeners.forEach(fn=>fn());}
const viewKey=id=>`creative-flow-private-view-v1:${id}:${window.location.hash==='#/widgets'?'widget':'main'}`;
function privateViewFor(id){
  if(privateViews.has(id))return privateViews.get(id);
  let value;try{const saved=JSON.parse(localStorage.getItem(viewKey(id)));value={preferences:saved?.preferences||{},versions:new Map(saved?.versions||[])};}catch{value={preferences:{},versions:new Map()};}
  privateViews.set(id,value);return value;
}
function receive(state) {
  nativeState=state;
  setViewNamespace(state.space?.id||'personal');
  if(!state.space||!state.data){publish({...personalStore.getSnapshot(),space:null,sync:null});return;}
  const id=state.space.id,privateView=privateViewFor(id);
  const db=materializeDatabase(state.data.entities,privateView.preferences,id,state.data.activities||[]);
  for(const project of db.projects)for(const task of project.tasks)for(const version of task.versions)Object.assign(version,privateView.versions.get(version.id)||{});
  const saveStatus=state.conflicts.length?`有 ${state.conflicts.length} 项同步冲突`:state.pendingCount?`${state.online?'正在同步':'离线已保存'} · ${state.pendingCount} 项待同步`:state.online?'已同步':state.error?'离线 · '+state.error:'离线缓存';
  publish({db,space:state.space,sync:state,history:state.history,saveStatus,revision:snapshot.revision+1});
}
function rememberPrivate(db,id) {
  const versions=new Map(db.projects.flatMap(p=>p.tasks.flatMap(t=>t.versions.map(v=>[v.id,{reviewPosition:v.reviewPosition,reviewedAt:v.reviewedAt}]))));
  const {customOptions,tagColors,...preferences}=db.preferences||{};privateViews.set(id,{versions,preferences});
  try{localStorage.setItem(viewKey(id),JSON.stringify({versions:[...versions],preferences}));}catch{}
}
function failure(error){publish({...snapshot,saveStatus:'未保存：'+error.message});throw error;}
personalStore.subscribe(()=>{if(!nativeState.space)publish({...personalStore.getSnapshot(),space:null,sync:null});});
const bridge=window.creativeFlowWindow?.collaboration;
if(bridge){bridge.onChanged(receive);bridge.status().then(receive).catch(()=>{});}
export const workspaceStore={
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>snapshot,
  list:()=>api().list(),join:values=>api().join(values),
  switchSpace:connection=>api().switchSpace(connection?.id||null).then(receive),
  async refresh(){if(nativeState.space)receive(await api().sync(nativeState.space.id));},
  change(updater,label='更新协作资料',options) {
    if(!nativeState.space)return personalStore.change(updater,label,options);
    const id=nativeState.space.id;
    return serial(async()=>{
      if(nativeState.space?.id!==id)throw Error('空间已切换，请重新选择内容');
      receive(await api().spaceState(id));const before=snapshot.db,next=typeof updater==='function'?updater(before):updater;
      const revisions=Object.fromEntries(nativeState.data.entities.map(row=>[row.id,row.revision]));
      let commands=createEntityCommands(before,next,revisions);
      // Viewers read duration from the player without writing shared metadata.
      commands=commands.filter(c=>!(c.kind==='version'&&c.type==='update'&&Object.keys(c.fields).every(k=>k==='duration')&&!['edit','manage'].includes(nativeState.data.entities.find(e=>e.id===c.id)?.permission)));
      rememberPrivate(next,id);
      if(!commands.length){receive(nativeState);return;}
      try {
        const metadataOnly=commands.every(c=>c.kind==='version'&&c.type==='update'&&Object.keys(c.fields).every(key=>key==='duration'));
        const token=await api().enqueue(id,{operationId:crypto.randomUUID(),epoch:nativeState.data.epoch,commands},label,{history:options?.history!==false&&!metadataOnly});
        receive(await api().spaceState(id));return token;
      }catch(error){return failure(error);}
    });
  },
  flush:()=>nativeState.space?serial(async()=>{receive(await api().spaceState(nativeState.space.id));return structuredClone(snapshot.db);}):personalStore.flush(),
  travel:async(direction,id)=>{if(!nativeState.space)return personalStore.travel(direction,id);try{const label=await api().travel(nativeState.space.id,direction,id);receive(await api().status());return label;}catch(error){return failure(error);}},
  replace:db=>nativeState.space?Promise.reject(Error('公司空间不能用个人备份覆盖，请切回“我的项目”')):personalStore.replace(db),
  deleteVersion(target){return serial(async()=>{
    if(!nativeState.space||!nativeState.online||nativeState.pendingCount||nativeState.conflicts.length)throw Error('请连接主机并处理待同步修改后再删除版本');
    const id=nativeState.space.id,version=snapshot.db.projects.find(p=>p.id===target.projectId)?.tasks.find(t=>t.id===target.taskId)?.versions.find(v=>v.id===target.versionId);
    if(!version||version.collaboration?.permission!=='manage')throw Error('没有删除此版本的权限');
    if(versionSignature(version)!==target.signature)throw Error('版本或意见已更新，请重新核对');
    const entities=nativeState.data.entities,ids=new Set([target.versionId]);for(let pass=0;pass<3;pass++)for(const row of entities)if(ids.has(row.parentId))ids.add(row.id);
    const depth={opinion:0,list:1,version:2},commands=entities.filter(r=>ids.has(r.id)).sort((a,b)=>depth[a.kind]-depth[b.kind]).map(r=>({type:'delete',kind:r.kind,id:r.id,revision:r.revision,expected:r.fields}));
    await api().request(id,'versionDelete',{versionId:target.versionId,batch:{operationId:crypto.randomUUID(),epoch:nativeState.data.epoch,commands}});
    receive(await api().spaceState(id));return true;
  });},
  async upload(connection,project,includeMedia=false) {
    const key=`creative-flow-upload-v2:${connection.id}:${project.id}`;let pending;try{pending=JSON.parse(localStorage.getItem(key));}catch{}
    if(!pending){const prepared=prepareProjectUpload(project),state=await api().spaceState(connection.id),before=materializeDatabase(state.data.entities);
      pending={projectId:prepared.project.id,media:prepared.media,batch:{operationId:crypto.randomUUID(),epoch:state.data.epoch,commands:createEntityCommands(before,{...before,projects:[...before.projects,prepared.project]},Object.fromEntries(state.data.entities.map(e=>[e.id,e.revision])))}};
      localStorage.setItem(key,JSON.stringify(pending));
    }
    await api().enqueue(connection.id,pending.batch,'上传本地项目「'+project.name+'」');
    if(includeMedia&&pending.media.length){const result=await api().publishProjectMedia(connection.id,pending.media);if(result.cancelled)throw Error('项目资料已保存，视频发布已取消；可在协作版本中单独发布');}
    localStorage.removeItem(key);return pending.projectId;
  }
};
