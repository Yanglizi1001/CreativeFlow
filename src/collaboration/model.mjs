// The collaboration wire format is entity-based. Never send a personal database
// as a replacement for company data, or synchronize personal playback state.
export const ENTITY_FIELDS = Object.freeze({
  project: ['name','description','notes','status','type','start','due','color','defaultColor','archived'],
  task: ['versionSequence','name','description','notes','status','type','start','due','color','defaultColor'],
  version: ['name','status','createdAt','file','duration'],
  list: ['name'],
  opinion: ['text','time','done','status','createdAt','updatedAt','statusChangedAt','timeOrigin','inheritedFrom','sourceCreatedAt'],
  preferences: ['customOptions','tagColors']
});
const children = {project:['tasks','task'],task:['versions','version'],version:['lists','list'],list:['items','opinion']};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>JSON.parse(JSON.stringify(value));

export function flattenDatabase(db) {
  const result=[];
  const ids=new Set();
  function visit(kind, value, parentId, order) {
    if (!value || typeof value.id!=='string' || !value.id || ids.has(value.id)) throw Error('项目中存在无效或重复标识，无法上传');
    ids.add(value.id);
    const fields={};
    for(const key of ENTITY_FIELDS[kind]) if(value[key]!==undefined) fields[key]=copy(value[key]);
    if(fields.file?.source==='collaboration')delete fields.file.url;
    result.push({kind,id:value.id,parentId,order,fields});
    const child=children[kind];
    if(child) (value[child[0]]||[]).forEach((entry,index)=>visit(child[1],entry,value.id,index));
  }
  db.projects.forEach((project,index)=>visit('project',project,null,index));
  const fields={};
  for(const key of ENTITY_FIELDS.preferences) if(db.preferences?.[key]!==undefined) fields[key]=copy(db.preferences[key]);
  if(Object.keys(fields).length) result.push({kind:'preferences',id:'workspace-preferences',parentId:null,order:0,fields});
  return result;
}

export function materializeDatabase(entities, personalPreferences={},connectionId,activities=[]) {
  const nodes=new Map();
  for(const entity of entities) {
    if(!ENTITY_FIELDS[entity.kind]) throw Error('协作主机返回了不兼容的数据');
    const fields={};
    for(const key of ENTITY_FIELDS[entity.kind]) if(entity.fields[key]!==undefined) fields[key]=copy(entity.fields[key]);
    if(fields.file?.source==='collaboration'&&connectionId)fields.file.url=`cfmedia://${connectionId}/${fields.file.mediaId}`;
    const value={id:entity.id,...fields,collaboration:{permission:entity.permission||'none',createdBy:entity.createdBy,creatorName:entity.creatorName||'成员',revision:entity.revision}};
    if(children[entity.kind]) value[children[entity.kind][0]]=[];
    if(entity.kind==='project') value.activities=activities.filter(activity=>activity.projectId===entity.id).map(activity=>({...activity,at:new Date(activity.at).toLocaleString('zh-CN')})).slice(0,50);
    nodes.set(entity.id,{...entity,value});
  }
  const projects=[];
  for(const entity of [...nodes.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))) {
    if(entity.kind==='preferences') continue;
    if(entity.kind==='project') {projects.push(entity.value);continue;}
    const parent=nodes.get(entity.parentId);
    if(!parent || children[parent.kind]?.[1]!==entity.kind) throw Error('协作数据的层级不完整');
    parent.value[children[parent.kind][0]].push(entity.value);
  }
  const sharedPreferences=nodes.get('workspace-preferences')?.fields||{};
  return {schema:2,preferences:{...personalPreferences,...sharedPreferences},projects};
}

export function createEntityCommands(before, after, revisions={}) {
  const oldEntities=flattenDatabase(before), newEntities=flattenDatabase(after);
  const previous=new Map(oldEntities.map(entity=>[entity.id,entity]));
  const next=new Map(newEntities.map(entity=>[entity.id,entity]));
  const commands=[];
  // Parents are created before children. Deletions run in reverse order.
  for(const entity of newEntities) {
    const old=previous.get(entity.id);
    if(!old) {commands.push({type:'create',...entity});continue;}
    if(old.kind!==entity.kind||old.parentId!==entity.parentId) throw Error('不支持移动协作数据的层级');
    const fields={},expected={};
    for(const key of ENTITY_FIELDS[entity.kind]) if(!equal(old.fields[key],entity.fields[key])) {
      fields[key]=entity.fields[key]??null;expected[key]=old.fields[key]??null;
    }
    if(Object.keys(fields).length) commands.push({type:'update',kind:entity.kind,id:entity.id,fields,expected,revision:revisions[entity.id]||0});
  }
  for(const entity of oldEntities.reverse()) if(!next.has(entity.id)) commands.push({type:'delete',kind:entity.kind,id:entity.id,revision:revisions[entity.id]||0});
  return commands;
}

// Explicit copy: uploader and server receive fresh IDs. The local original and
// other uploads can never become aliases of the company master record.
export function prepareProjectUpload(project, makeId=()=>crypto.randomUUID()) {
  const uploaded=copy(project), missingMedia=[],media=[];
  function visit(kind,value) {
    value.id=makeId();
    delete value.activities;delete value.reviewPosition;delete value.reviewedAt;
    if(kind==='version' && value.file) {
      // Local drive letters, blob URLs and bundled demo files do not resolve on
      // colleagues' machines. Media publication is a separate, explicit step.
      missingMedia.push(value.file.name||value.name);
      if(value.file.path&&/\.(mp4|m4v|webm|mov)$/i.test(value.file.name||value.file.path))media.push({versionId:value.id,path:value.file.path,name:value.file.name||value.name});
      value.file=null;delete value.duration;
    }
    if(kind==='opinion'&&!value.createdAt)value.timeOrigin='legacy';
    const child=children[kind];if(child) value[child[0]].forEach(entry=>visit(child[1],entry));
  }
  visit('project',uploaded);
  return {project:uploaded,missingMedia,media};
}
