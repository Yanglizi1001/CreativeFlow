import {nextVersionNumber,versionSignature,removeLocalVersion,restoreLocalVersion} from './versionLifecycle.mjs';
import {readDrafts} from './collaboration/drafts';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { workspaceStore as workStore } from './collaboration/workspaceStore';
import { cloneSeedData, uid } from './data';
import { COLOR_PALETTE, allocateTaskColor, migrateColors } from './colors';
import {toggleOpinion} from './opinions';

function activityTime() {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function appendActivity(project, text) {
  if (!text) return project;
  const entry = { id: uid('activity'), at: activityTime(), text };
  return { ...project, activities: [entry, ...(project.activities || [])].slice(0, 50) };
}

export function useCreativeFlow() {
  const {db:allDb,history,saveStatus,space,sync}=useSyncExternalStore(workStore.subscribe,workStore.getSnapshot);
  const db=useMemo(()=>space?{...allDb,projects:allDb.projects.filter(project=>!project.archived)}:allDb,[allDb,space]);
  const setDb=(updater,label='更新工作数据',options)=>workStore.change(updater,label,options).catch(()=>null);
  const [deletedItem, setDeletedItem] = useState(null);

  const [selection, setSelection] = useState(() => {
    const project = db.projects[0];
    return { projectId: project?.id, taskId: project?.tasks[0]?.id, versionId: project?.tasks[0]?.versions.at(-1)?.id, listId: project?.tasks[0]?.versions.at(-1)?.lists.at(-1)?.id };
  });

  const active = useMemo(() => {
    const project = db.projects.find(entry => entry.id === selection.projectId) ?? db.projects[0];
    const task = project?.tasks.find(entry => entry.id === selection.taskId) ?? project?.tasks[0];
    const version = task?.versions.find(entry => entry.id === selection.versionId) ?? task?.versions.at(-1);
    const list = version?.lists.find(entry => entry.id === selection.listId) ?? version?.lists[0];
    return { project, task, version, list };
  }, [db, selection]);

  const chooseProject = projectId => {
    const project = db.projects.find(entry => entry.id === projectId);
    const task = project?.tasks[0];
    const version = task?.versions.at(-1);
    setSelection({ projectId, taskId: task?.id, versionId: version?.id, listId: version?.lists[0]?.id });
  };
  const chooseTask = taskId => {
    const task = active.project.tasks.find(entry => entry.id === taskId);
    const version = task?.versions.at(-1);
    setSelection(current => ({ ...current, taskId, versionId: version?.id, listId: version?.lists[0]?.id }));
  };
  const chooseVersion = versionId => {
    setSelection(current => {
      const project = db.projects.find(entry => entry.id === current.projectId);
      const task = project?.tasks.find(entry => entry.id === current.taskId);
      const version = task?.versions.find(entry => entry.id === versionId);
      return version ? { ...current, versionId, listId: version.lists[0]?.id } : current;
    });
  };
  const chooseList = listId => setSelection(current => ({ ...current, listId }));
  const selectPath = ({ projectId, taskId, versionId, listId }) => {
    const project = db.projects.find(entry => entry.id === projectId);
    const task = project?.tasks.find(entry => entry.id === taskId) ?? project?.tasks[0];
    const version = task?.versions.find(entry => entry.id === versionId) ?? task?.versions.at(-1);
    const list = version?.lists.find(entry => entry.id === listId) ?? version?.lists[0];
    setSelection({ projectId: project?.id, taskId: task?.id, versionId: version?.id, listId: list?.id });
  };

  const updateProjectAt = (projectId, updater, activityText = '') => setDb(current => ({
    ...current,
    projects: current.projects.map(project => project.id === projectId ? appendActivity(updater(project), activityText) : project)
  }),activityText || '更新项目信息');
  const updateProject = (updater, activityText = '') => updateProjectAt(active.project?.id, updater, activityText);
  const updateTask = (updater, activityText = '') => updateProject(project => ({ ...project, tasks: project.tasks.map(task => task.id === active.task?.id ? updater(task) : task) }), activityText);
  const updateVersion = (updater, activityText = '') => updateTask(task => ({ ...task, versions: task.versions.map(version => version.id === active.version?.id ? updater(version) : version) }), activityText);
  const updateList = (updater, activityText = '') => updateVersion(version => ({ ...version, lists: version.lists.map(list => list.id === active.list?.id ? updater(list) : list) }), activityText);
  const recordActivity = (text, projectId = active.project?.id) => updateProjectAt(projectId, project => project, text);

  const addProject = async values => {
    const taskId = uid('task'); const versionId = uid('version');
    const project = { id: uid('project'), name: values.name, description: values.description || '', notes: '', status: values.projectStatus || '计划中', type: values.type || '视频', start: values.start || '', due: values.due || '', color: values.color || COLOR_PALETTE[db.projects.length % COLOR_PALETTE.length], defaultColor: COLOR_PALETTE[db.projects.length % COLOR_PALETTE.length], activities: [{ id: uid('activity'), at: activityTime(), text: '创建了项目' }], tasks: [{ id: taskId, color: COLOR_PALETTE[0], defaultColor: COLOR_PALETTE[0], name: values.taskName || '首个任务', type: values.type || '视频', status: '前期策划', start: values.start || '', due: values.due || '', versions: [{ id: versionId, name: 'V1', status: '进行中', createdAt: new Date().toISOString().slice(0, 10), file: null, lists: [] }] }] };
    if(values.empty)project.tasks=[];
    const saved=await setDb(current => ({ ...current, projects: [...current.projects, project] }),`新建项目「${project.name}」`);
    if(saved===null)return null;
    setSelection({ projectId: project.id, taskId, versionId, listId: undefined });
    return project;
  };
  const deleteProject = (projectId = active.project?.id) => {
    if (!projectId) return false;
    const remaining = db.projects.filter(project => project.id !== projectId);
    if (remaining.length === db.projects.length) return false;
    const fallbackProject = remaining[0];
    const fallbackTask = fallbackProject?.tasks[0];
    const fallbackVersion = fallbackTask?.versions.at(-1);
    setDb(current => ({ ...current, projects: current.projects.filter(project => project.id !== projectId) }),`删除项目「${db.projects.find(p=>p.id===projectId)?.name}」`);
    setSelection({ projectId: fallbackProject?.id, taskId: fallbackTask?.id, versionId: fallbackVersion?.id, listId: fallbackVersion?.lists[0]?.id });
    return true;
  };
  const addTask = async values => {
    const project=db.projects.find(p=>p.id===(values.projectId || active.project?.id));
    if(!project)return null;
    const versionId=uid('version'),color=allocateTaskColor(project.tasks);
    const task={id:uid('task'),color,defaultColor:color,name:values.name,type:values.type||project.type,status:values.status||'前期策划',start:values.start||'',due:values.due||project.due,versions:[{id:versionId,name:'V1',status:'进行中',createdAt:new Date().toLocaleDateString('sv-SE'),file:values.file||null,lists:[]}]};
    const saved=await updateProjectAt(project.id,p=>({...p,start:task.start&&(!p.start||task.start<p.start)?task.start:p.start,due:task.due&&(!p.due||task.due>p.due)?task.due:p.due,tasks:[...p.tasks,task]}),`添加了任务「${task.name}」`);
    if(saved===null)return null;
    setSelection({projectId:project.id,taskId:task.id,versionId,listId:undefined});
    return {projectId:project.id,task};
  };
  const deleteTask = (projectId = active.project?.id, taskId = active.task?.id) => {
    const project = db.projects.find(entry => entry.id === projectId);
    if (!project || !taskId || !project.tasks.some(task => task.id === taskId)) return false;
    const remaining = project.tasks.filter(task => task.id !== taskId);
    const fallbackTask = remaining[0];
    const fallbackVersion = fallbackTask?.versions.at(-1);
    updateProjectAt(projectId, current => ({ ...current, tasks: current.tasks.filter(task => task.id !== taskId) }), `删除了任务「${project.tasks.find(task => task.id === taskId)?.name || ''}」`);
    setSelection({ projectId, taskId: fallbackTask?.id, versionId: fallbackVersion?.id, listId: fallbackVersion?.lists[0]?.id });
    return true;
  };
  const addVersion = async ({inherit=false,projectId=active.project?.id,taskId=active.task?.id,sourceVersionId=active.version?.id,name,file=null}={}) => {
    const project=db.projects.find(p=>p.id===projectId),task=project?.tasks.find(t=>t.id===taskId);
    if(!task)return null;
    const previous=task.versions.find(v=>v.id===sourceVersionId);
    const number=nextVersionNumber(task);
    const version={id:uid('version'),name:name?.trim()||`V${number}`,status:'进行中',createdAt:new Date().toLocaleDateString('sv-SE'),file,lists:inherit&&previous?previous.lists.map(source=>({id:uid('list'),name:source.name,items:source.items.filter(row=>!row.done).map(row=>({...row,id:uid('item'),done:false,status:'todo'}))})):[]};
    const saved=await updateProjectAt(projectId,p=>({...p,tasks:p.tasks.map(t=>t.id===taskId?{...t,versionSequence:Math.max(number,t.versionSequence||0),versions:[...t.versions,version]}:t)}),`创建了版本 ${version.name}`);
    if(saved===null)return null;
    setSelection({projectId,taskId,versionId:version.id,listId:version.lists[0]?.id});
    return version;
  };
  const deleteVersion = async (target={}) => {
    if(typeof target==='string')target={versionId:target};
    target={projectId:active.project?.id,taskId:active.task?.id,versionId:active.version?.id,...target};
    const drafts=readDrafts(space?.id||'personal');
    if(drafts.some(d=>d.key.includes(':'+target.versionId)||d.draft?.versionId===target.versionId))throw Error('此版本还有未提交草稿，请先在审阅、修改意见或小组件中保存或取消编辑');
    const task=db.projects.find(p=>p.id===target.projectId)?.tasks.find(t=>t.id===target.taskId),version=task?.versions.find(v=>v.id===target.versionId);
    if(!version)throw Error('版本不存在或没有访问权限');
    if(space){await workStore.deleteVersion({...target,signature:target.signature||versionSignature(version)});}
    else await workStore.change(current=>removeLocalVersion(current,{...target,signature:target.signature||versionSignature(version)}),'删除版本「'+version.name+'」');
    if(selection.projectId===target.projectId&&selection.taskId===target.taskId&&active.version?.id===target.versionId){const next=task.versions.filter(v=>v.id!==target.versionId).at(-1);setSelection(current=>({...current,versionId:next?.id,listId:next?.lists[0]?.id}));}
    return true;
  };
  const listDeletedVersions=async()=>{
    if(space)return window.creativeFlowWindow.collaboration.request(space.id,'versionTrash');
    const current=workStore.getSnapshot().db;
    return (current.versionTrash||[]).map(r=>{const task=current.projects.find(p=>p.id===r.projectId)?.tasks.find(t=>t.id===r.taskId),duplicate=task?.versions.some(v=>v.id===r.version.id||v.name.trim().toLowerCase()===r.version.name.trim().toLowerCase());return {...r,name:r.version.name,canRestore:!!task&&!duplicate,reason:!task?'所属项目或任务已删除，请先撤销其删除':duplicate?'已有同名版本，请先重命名现有版本':''};});
  };
  const restoreVersion=async id=>{if(space){await window.creativeFlowWindow.collaboration.request(space.id,'versionRestore',{versionId:id});await workStore.refresh();}else await workStore.change(current=>restoreLocalVersion(current,id),'从回收站恢复版本');};
  const addList = name => {
    const created = { id: uid('list'), name, items: [] };
    updateVersion(version => ({ ...version, lists: [...version.lists, created] }), `新建了修改清单「${name}」`);
    setSelection(current => ({ ...current, listId: created.id }));
  };
  const deleteList = (listId = active.list?.id) => {
    if (!listId || !active.version?.lists.some(list => list.id === listId)) return false;
    const remaining = active.version.lists.filter(list => list.id !== listId);
    const deleted = active.version.lists.find(list => list.id === listId);
    updateVersion(version => ({ ...version, lists: version.lists.filter(list => list.id !== listId) }), `删除了修改清单「${deleted?.name || ''}」`);
    setSelection(current => ({ ...current, listId: remaining[0]?.id }));
    return true;
  };
  const addItem = (text, time = '') => updateList(list => ({ ...list, items: [...list.items, { id: uid('item'), text, time, done: false, status: 'todo' }] }), '添加了修改意见');
  const toggleItem = itemId => {
    const item = active.list?.items.find(row => row.id === itemId);
    updateList(list => ({ ...list, items: list.items.map(row => row.id === itemId ? toggleOpinion(row,space?!item?.done:undefined) : row) }), item?.done ? '重新打开了修改意见' : '完成了修改意见');
  };
  const toggleItemAt = (projectId, taskId, versionId, listId, itemId) => {
    const item = db.projects.find(project => project.id === projectId)?.tasks.find(task => task.id === taskId)?.versions.find(version => version.id === versionId)?.lists.find(list => list.id === listId)?.items.find(row => row.id === itemId);
    updateProjectAt(projectId, project => ({
      ...project,
      tasks: project.tasks.map(task => task.id !== taskId ? task : ({
        ...task,
        versions: task.versions.map(version => version.id !== versionId ? version : ({
          ...version,
          lists: version.lists.map(list => list.id !== listId ? list : ({
            ...list,
            items: list.items.map(row => row.id !== itemId ? row : toggleOpinion(row,space?!item?.done:undefined))
          }))
        }))
      }))
    }), item?.done ? '重新打开了修改意见' : '完成了修改意见');
  };
  const editItemAt=(projectId,taskId,versionId,listId,itemId,patch,expectedText)=>setDb(current=>{
    const item=current.projects.find(p=>p.id===projectId)?.tasks.find(t=>t.id===taskId)?.versions.find(v=>v.id===versionId)?.lists.find(l=>l.id===listId)?.items.find(i=>i.id===itemId);
    // Check the latest record inside the shared write lock; never revive a deleted opinion.
    const expected=expectedText&&typeof expectedText==='object'?expectedText:expectedText===undefined?{}:{text:expectedText};
    if(!item||Object.entries(expected).some(([key,value])=>(item[key]??'')!==(value??'')))return current;
    return {...current,projects:current.projects.map(p=>p.id!==projectId?p:appendActivity({...p,tasks:p.tasks.map(t=>t.id!==taskId?t:{...t,versions:t.versions.map(v=>v.id!==versionId?v:{...v,lists:v.lists.map(l=>l.id!==listId?l:{...l,items:l.items.map(i=>i.id===itemId?{...i,...patch}:i)})})})},'编辑了修改意见'))};
  },'编辑了修改意见');
  const editItem = (itemId, patch) => updateList(list => ({ ...list, items: list.items.map(row => row.id === itemId ? { ...row, ...patch } : row) }),'编辑了修改意见');
  const removeItemAt=async(projectId,taskId,versionId,listId,itemId)=>{
    const token=await updateVersionAt(projectId,taskId,versionId,version=>({...version,lists:version.lists.map(list=>list.id===listId?{...list,items:list.items.filter(row=>row.id!==itemId)}:list)}),'删除了修改意见');
    if(token)setDeletedItem({token});return token;
  };
  const removeItem=itemId=>removeItemAt(active.project.id,active.task.id,active.version.id,active.list.id,itemId);
  const undoDeleteItem=()=>{if(deletedItem)workStore.travel('undo',deletedItem.token).catch(()=>{});setDeletedItem(null);};
  useEffect(() => { if (!deletedItem) return; const timer = setTimeout(() => setDeletedItem(null), 10000); return () => clearTimeout(timer); }, [deletedItem]);
  const importItems = rows => updateList(list => ({ ...list, items: [...list.items, ...rows.map(row => ({ ...row, id: uid('item'), done: false, status: 'todo' }))] }), `导入了 ${rows.length} 条修改意见`);
  const setFile = file => updateVersion(version => ({ ...version, file, duration: undefined, reviewPosition: 0 }), `关联了版本文件「${file?.name || '未命名文件'}」`);
  const clearFile = () => {
    if (!active.version?.file) return false;
    updateVersion(version => ({ ...version, file: null }), `取消关联版本文件「${active.version.file.name}」`);
    return true;
  };
  const addCustomOption = (kind, value) => setDb(current => {
    const currentOptions = current.preferences?.customOptions?.[kind] || [];
    if (currentOptions.includes(value)) return current;
    return { ...current, preferences: { ...current.preferences, customOptions: { projectStatuses: [], projectTypes: [], taskStages: [], ...(current.preferences?.customOptions || {}), [kind]: [...currentOptions, value] } } };
  },'添加自定义标签');
  const removeCustomOption = (kind, value) => setDb(current => {
    const currentOptions = current.preferences?.customOptions?.[kind] || [];
    return { ...current, preferences: { ...current.preferences, customOptions: { projectStatuses: [], projectTypes: [], taskStages: [], ...(current.preferences?.customOptions || {}), [kind]: currentOptions.filter(option => option !== value) } } };
  },'删除自定义标签');
  const updateVersionAt = (projectId, taskId, versionId, updater, activityText = '') => updateProjectAt(projectId, project => ({ ...project, tasks: project.tasks.map(task => task.id !== taskId ? task : ({ ...task, versions: task.versions.map(version => version.id === versionId ? updater(version) : version) })) }), activityText);
  const addItemAt = (projectId, taskId, versionId, listId, text, time = '') => updateVersionAt(projectId, taskId, versionId, version => ({ ...version, lists: version.lists.map(list => list.id !== listId ? list : ({ ...list, items: [...list.items, { id: uid('item'), text, time, done: false, status: 'todo' }] })) }), '添加了修改意见');
  const addReviewItem = async (projectId, taskId, versionId, listId, text, time = '') => {
    const createdListId = listId || uid('list');
    const createdItem = { id: uid('item'), text, time, done: false, status: 'todo' };
    const saved=await updateVersionAt(projectId, taskId, versionId, version => listId ? ({ ...version, lists: version.lists.map(list => list.id !== listId ? list : ({ ...list, items: [...list.items, createdItem] })) }) : ({ ...version, lists: [...version.lists, { id: createdListId, name: '审阅意见', items: [createdItem] }] }), `${time ? `在 ${time} ` : ''}添加了审阅意见`);
    if(saved===null)return null;
    setSelection({ projectId, taskId, versionId, listId: createdListId });
    return {listId:createdListId,itemId:createdItem.id};
  };
  const setReviewPosition = (projectId, taskId, versionId, seconds) => updateVersionAt(projectId, taskId, versionId, version => ({ ...version, reviewPosition: Math.max(0, Math.round(seconds)), reviewedAt: new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) }));
  const reset=async()=>{if(space)return;await workStore.replace(migrateColors(cloneSeedData(),false));window.location.reload();};
  const replaceDatabase=async database=>{await workStore.replace(database);window.location.reload();};
  const undo=()=>workStore.travel('undo').catch(()=>null),redo=()=>workStore.travel('redo').catch(()=>null);


  return { db, allProjects:allDb.projects, space, sync, history, undo, redo, flush:workStore.flush, deletedItem:history.past.at(-1)?.id===deletedItem?.token?deletedItem:null, undoDeleteItem, saveStatus, setDb, selection, active, chooseProject, chooseTask, chooseVersion, chooseList, selectPath, updateProjectAt, updateProject, updateTask, updateVersion, updateVersionAt, recordActivity, addProject, deleteProject, addTask, deleteTask, addVersion, deleteVersion, listDeletedVersions, restoreVersion, addList, deleteList, addItem, addItemAt, addReviewItem, toggleItem, toggleItemAt, editItem, editItemAt, removeItemAt, removeItem, importItems, setFile, clearFile, setReviewPosition, addCustomOption, removeCustomOption, reset, replaceDatabase };
}
