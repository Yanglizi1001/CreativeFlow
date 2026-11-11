import React, { useState } from 'react';
import { APP_VERSION } from './version';
import { countItems } from './data';
import { AcrylicSelect, Button, Icon, Mark, ResizeHandle, StatusTag, TypeIcon, useResizableWidth } from './ui';

export function TitleBar({ query, setQuery, flow, onProject, onTask }) {
  const api = window.creativeFlowWindow;
  const matches = query.trim() ? flow.db.projects.flatMap(project => [
    ...(project.name.includes(query) ? [{project,label:project.name}] : []),
    ...project.tasks.filter(task=>task.name.includes(query) || task.versions.some(v=>v.lists.some(l=>l.items.some(i=>i.text.includes(query))))).map(task=>({project,task,label:task.name}))
  ]).slice(0,12) : [];
  return <header className="titlebar">
    <div className="brand"><Mark /><span>创作流</span><small className="beta-badge" title={APP_VERSION}>BETA</small></div>
    <label className="global-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目、任务或修改意见…" /></label>
    {query.trim() ? <div className="search-results">{matches.map(row=><button key={row.task?.id || row.project.id} onClick={()=>{row.task ? onTask(row.project.id,row.task.id) : onProject(row.project.id);setQuery('');}}><TypeIcon type={row.task?.type || row.project.type}/><span>{row.label}<small>{row.task ? row.project.name : '项目'}</small></span><Icon name="chevron"/></button>)}{!matches.length ? <p>没有匹配的项目、任务或修改意见</p> : null}<button onClick={()=>setQuery('')}>关闭搜索</button></div> : null}<div className="window-controls"><button onClick={() => api?.minimize()}>—</button><button onClick={() => api?.toggleMaximize()}>□</button><button className="close" onClick={() => api?.close()}>×</button></div>
  </header>;
}

const navItems = [['today', 'home', '今日'], ['projects', 'folder', '项目'], ['review', 'video', '审阅'], ['calendar', 'calendar', '日历'], ['feedback', 'comment', '修改意见']];
export function NavRail({ view, setView }) {
  return <aside className="navrail"><nav>{navItems.map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon name={icon} size={22} /><span>{label}</span></button>)}</nav><button className={`bottom ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Icon name="settings" size={22} /><span>设置</span></button></aside>;
}

export function ProjectExplorer({ flow, query, onNewProject, onNewTask, onProject, onTask }) {
  const [collapsed, setCollapsed] = useState(false);
  const size = useResizableWidth('creative-flow-project-explorer-width', 252, 220, 360);
  const projects = flow.db.projects.filter(project => !query || `${project.name} ${project.tasks.map(task => task.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (collapsed) return <aside className="explorer collapsed"><button onClick={() => setCollapsed(false)}><Icon name="right" /></button></aside>;
  return <aside className="explorer resizable-panel" style={{ width: size.width }}>
    <div className="explorer-heading"><strong>项目与任务</strong><div><button onClick={onNewProject}><Icon name="plus" /></button><button onClick={() => setCollapsed(true)}><Icon name="left" /></button></div></div>
    <div className="explorer-list">{projects.map(project => <section key={project.id} className={flow.active.project?.id === project.id ? 'current' : ''}>
      <button className="project-row" onClick={() => { flow.chooseProject(project.id); onProject(); }}><i style={{ background: project.color }} /><Icon name="folder" /><strong>{project.name}</strong><span>{project.tasks.length}</span></button>
      {flow.active.project?.id === project.id ? <div className="task-tree">{project.tasks.map(task => { const progress = countItems(task); return <button key={task.id} className={flow.active.task?.id === task.id ? 'active' : ''} onClick={() => { flow.chooseTask(task.id); onTask(); }}><TypeIcon type={task.type} /><span>{task.name}</span><em>{progress.done}/{progress.total}</em></button>; })}<button className="add-tree" onClick={onNewTask}><Icon name="plus" />新增任务</button></div> : null}
    </section>)}</div>
    <Button icon="plus" className="new-project" onClick={onNewProject}>新建项目</Button><ResizeHandle {...size} />
  </aside>;
}

export function CreateForm({ mode, flow, onClose, onCreated, initialDate }) {
  const [form, setForm] = useState({ name: '', taskName: '', type: '视频', start: '', due: initialDate || new Date().toLocaleDateString('sv-SE'), description: '', status: '前期策划', projectStatus: '计划中' });
  const custom = flow.db.preferences?.customOptions || {};
  const makeOptions = (defaults, additions, kind) => [...new Set([...defaults, ...(additions || [])])].map(value => ({ value, label: value, tag: true, kind }));
  const typeOptions = makeOptions(['视频', '图片', 'PPT'], custom.projectTypes, 'type');
  const stageOptions = makeOptions(['前期策划', '中期拍摄', '后期制作', '修改中', '内部审核', '客户审核'], custom.taskStages, 'stage');
  const statusOptions = makeOptions(['计划中', '进行中', '已暂停', '已完成'], custom.projectStatuses, 'project');
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = event => {
    event.preventDefault();
    if (!form.name.trim()) return;
    if(form.start && form.due && form.start>form.due){alert('开始日期不能晚于截止日期');return;}
    if(mode==='task' && ((form.start && flow.active.project.start && form.start<flow.active.project.start)||(form.due && flow.active.project.due && form.due>flow.active.project.due)) && !confirm('任务超出项目周期，是否扩展项目周期并创建？'))return;
    if (mode === 'project') flow.addProject({...form,name:form.name.trim()}); else flow.addTask({...form,name:form.name.trim()});
    onCreated?.();
    onClose();
  };
  return <form id="create-form" className="form-grid" onSubmit={submit}>
    <label className="span-2">{mode === 'project' ? '项目名称' : '任务名称'}<input autoFocus required name="name" value={form.name} onChange={update} placeholder={mode === 'project' ? '例如：新品发布会视频' : '例如：30 秒主宣传片'} /></label>
    {mode === 'project' ? <label className="span-2">首个任务<input name="taskName" value={form.taskName} onChange={update} placeholder="例如：30 秒主宣传片" /></label> : null}
    <label>类型<AcrylicSelect value={form.type} options={typeOptions} label="项目类型" creatable createLabel="输入新项目类型…" onChange={value => setForm(current => ({ ...current, type: value }))} onCreate={value => { flow.addCustomOption('projectTypes', value); setForm(current => ({ ...current, type: value })); }} renderValue={value => <StatusTag value={value} kind="type" compact />} /></label>
    <label>开始日期<input type="date" name="start" value={form.start} max={form.due || undefined} onChange={update}/></label><label>截止日期<input min={form.start || undefined} type="date" name="due" value={form.due} onChange={update} /></label>
    {mode === 'project' ? <><label className="span-2">项目状态<AcrylicSelect value={form.projectStatus} options={statusOptions} label="项目状态" creatable createLabel="输入新项目状态…" onChange={value => setForm(current => ({ ...current, projectStatus: value }))} onCreate={value => { flow.addCustomOption('projectStatuses', value); setForm(current => ({ ...current, projectStatus: value })); }} renderValue={value => <StatusTag value={value} kind="project" compact />} /></label><label className="span-2">项目说明<textarea name="description" value={form.description} onChange={update} /></label></> : <label className="span-2">当前阶段<AcrylicSelect value={form.status} options={stageOptions} label="当前阶段" creatable createLabel="输入新任务阶段…" onChange={value => setForm(current => ({ ...current, status: value }))} onCreate={value => { flow.addCustomOption('taskStages', value); setForm(current => ({ ...current, status: value })); }} renderValue={value => <StatusTag value={value} compact />} /></label>}
  </form>;
}
