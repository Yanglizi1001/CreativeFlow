import { Thumbnail } from './Thumbnail';
import { mediaSource } from './demoMedia';
import { DateFields } from './Schedule';
import { useViewState } from './viewState';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TaskInspector } from './TaskInspector';
import { countItems } from './data';
import { parseFeedbackText } from './feedbackImport';
import { AcrylicSelect, Breadcrumbs, Button, Check, Icon, Modal, StatusTag, TypeIcon, useEscape } from './ui';

const baseStages = ['前期策划', '中期拍摄', '后期制作', '修改中', '内部审核', '客户审核', '已交付'];
const baseProjectStatuses = ['计划中', '进行中', '已暂停', '已完成'];
const baseProjectTypes = ['视频', '图片', 'PPT'];
const taggedOptions = (defaults, custom = [], kind = 'stage') => [...new Set([...defaults, ...custom])].map(value => ({ value, label: value, tag: true, kind }));

export function ProjectOverview({ flow, onNewProject, onProjectDetail, onTask }) {
  const [filter, setFilter] = useViewState('ProjectOverview-filter', '全部项目');
  const projects = flow.db.projects.filter(project => filter === '全部项目' || project.status === filter);
  return <main className="level-page project-overview">
    
    <div className="level-heading"><h1>所有项目</h1><Button variant="primary" icon="plus" onClick={onNewProject}>新建项目</Button></div>
    <div className="filter-tabs">{[...new Set(['全部项目', '进行中', '计划中', '已暂停', '已完成', ...(flow.db.preferences?.customOptions?.projectStatuses || [])])].map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <section className="project-table">
      <div className="project-table-head"><span>项目名称</span><span>类型</span><span>截止日期</span><span>进度</span><span>项目状态</span><span>当前阶段</span><span>任务</span><span /></div>
      {projects.map(project => {
        const progress = countItems(project);
        const expanded = flow.active.project?.id === project.id;
        const currentStage = project.tasks.find(task => task.status !== '已交付')?.status || project.tasks[0]?.status || '前期策划';
        return <React.Fragment key={project.id}>
          <button className={`project-main-row ${expanded ? 'expanded' : ''}`} onClick={() => { flow.chooseProject(project.id); onProjectDetail(); }}>
            <span className="project-name-cell"><i style={{ background: project.color }} /><Icon name="folder" /><strong>{project.name}</strong></span><span>{project.type}</span><time>{project.due || '未设置'}</time><span>{progress.done}/{progress.total}</span><span><StatusTag value={project.status} kind="project" /></span><span><StatusTag value={currentStage} /></span><span>{project.tasks.length}</span><Icon name="chevron" />
          </button>
          {expanded ? <div className="overview-task-preview">{project.tasks.map(task => { const taskProgress = countItems(task); return <button key={task.id} onClick={() => { flow.chooseTask(task.id); onTask(); }}><span className="task-indent"><TypeIcon type={task.type} /><strong>{task.name}</strong></span><span>{task.type}</span><time>{task.due || '未设置'}</time><span>{taskProgress.done}/{taskProgress.total}</span><StatusTag value={project.status} kind="project" compact /><StatusTag value={task.status} compact /><span>—</span><Icon name="chevron" /></button>; })}</div> : null}
        </React.Fragment>;
      })}
    </section>
    {!flow.db.projects.length ? <section className="empty-state"><Icon name="folder" size={32} /><h2>开始第一个创意项目</h2><p>建立项目后，可以添加任务、版本和修改意见。</p><Button variant="primary" icon="plus" onClick={onNewProject}>新建项目</Button></section> : null}<div className="table-count">共 {projects.length} 个项目</div>
  </main>;
}

export function ProjectDetail({ flow, onOverview, onTask, onNewTask }) {
  const project = flow.active.project;
  const [tab, setTab] = useViewState('ProjectDetail-tab', 'tasks');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  useEscape(() => setDetailsOpen(false), detailsOpen);
  useEscape(() => setDeleteProjectOpen(false), deleteProjectOpen);
  if (!project) return null;
  return <main className="project-detail-page">
    <section className="project-detail-main">
      
      <div className="project-detail-header"><div><h1>{project.name}</h1><p>{project.description || '暂无项目说明'}</p></div><div className="header-actions"><Button className="danger-action" icon="trash" disabled={!project} title="删除当前项目" onClick={() => setDeleteProjectOpen(true)}>删除项目</Button><Button variant="primary" icon="plus" onClick={onNewTask}>新增任务</Button><Button icon="list" onClick={() => setDetailsOpen(true)}>项目详情</Button></div></div>
      <div className="project-metadata"><div><small>项目状态</small><StatusTag value={project.status} kind="project" /></div><div><small>项目类型</small><span>{project.type}</span></div><div><small>项目周期</small><strong>{project.start || '未设开始'} → {project.due || '未设置'}</strong></div></div>
      <div className="detail-tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>项目概览</button><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>任务列表</button></div>
      {tab === 'overview' ? <section className="project-summary"><h2>项目说明</h2><p>{project.notes || '尚未填写项目备注。'}</p><h2>交付概况</h2><div className="summary-numbers"><span><strong>{project.tasks.length}</strong>个任务</span><span><strong>{project.tasks.filter(task => task.status === '已交付').length}</strong>已交付</span><span><strong>{countItems(project).total - countItems(project).done}</strong>条意见待处理</span></div></section> : <TaskTable project={project} flow={flow} onTask={onTask} />}
    </section>{detailsOpen ? <ProjectContextDrawer project={project} flow={flow} onClose={() => setDetailsOpen(false)} onDeleted={onOverview} onOpenTask={()=>{setDetailsOpen(false);onTask();}} /> : null}{deleteProjectOpen ? <Modal title={`删除项目「${project.name}」`} onClose={() => setDeleteProjectOpen(false)} footer={<><Button onClick={() => setDeleteProjectOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={() => { if (flow.deleteProject(project.id)) onOverview(); }}>确认删除项目</Button></>}><div className="delete-version-copy"><span className="delete-version-icon"><Icon name="trash" size={22} /></span><div><strong>项目及其所有任务都会被删除</strong><p>将同时删除 {project.tasks.length} 个任务、全部版本和修改意见记录。电脑中的原始文件不会被删除。</p></div></div><p className="form-hint">此操作无法撤销。</p></Modal> : null}
  </main>;
}

function ActivityFeed({ activities = [] }) {
  return <div className="activity"><div className="section-title"><h3>最近动态</h3><span>{activities.length} 条</span></div>{activities.length ? activities.map(entry => <div className="activity-row" key={entry.id}><i /><time>{entry.at}</time><span>{entry.text}</span></div>) : <p className="activity-empty">完成操作后，动态会自动记录在这里。</p>}</div>;
}

function ProjectDeleteZone({ project, flow, onDeleted }) {
  const [open, setOpen] = useState(false);
  const canDelete = Boolean(project);
  return <><div className="project-delete-zone"><div><strong>删除项目</strong><small>删除所有任务、版本和修改意见；不会删除电脑中的原文件。</small></div><Button className="danger-action" icon="trash" disabled={!canDelete} title={canDelete ? '删除当前项目' : '没有可删除的项目'} onClick={() => setOpen(true)}>删除项目</Button></div>{open ? <Modal title={`删除项目「${project.name}」`} onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={() => { if (flow.deleteProject(project.id)) { setOpen(false); onDeleted?.(); } }}>确认删除项目</Button></>}><div className="delete-version-copy"><span className="delete-version-icon"><Icon name="trash" size={22} /></span><div><strong>项目及其全部内容都会被删除</strong><p>包含 {project.tasks.length} 个任务、全部版本和修改意见记录。电脑中的原始文件不会被删除。</p></div></div><p className="form-hint">此操作无法撤销。</p></Modal> : null}</>;
}

export function ProjectContextDrawer({ project, flow, onClose, onDeleted, onOpenTask }) {
  const update = (key,value,label) => flow.updateProjectAt(project.id, current=>({...current,[key]:value}), '修改了项目'+label);
  useEscape(onClose);
  const custom=flow.db.preferences?.customOptions || {};
  return <><button className="drawer-scrim" aria-label="关闭项目详情" onClick={onClose}/><aside className="context-drawer project-context-drawer"><header><h2>项目详情</h2><button onClick={onClose} aria-label="关闭"><Icon name="close"/></button></header><div className="detail-form">
  <label>项目名称<input key={project.id+'name'} defaultValue={project.name} onBlur={e=>{const name=e.target.value.trim();if(name && name!==project.name)update('name',name,'名称');else e.target.value=project.name;}}/></label>
  <label>项目说明<textarea key={project.id+'description'} defaultValue={project.description} onBlur={e=>{if(e.target.value!==project.description)update('description',e.target.value,'说明');}}/></label>
  <DateFields entry={project} onChange={(key,value)=>{if(project.start && key==='due' && value && value<project.start || project.due && key==='start' && value>project.due){alert('开始日期不能晚于截止日期');return;}update(key,value,key==='start'?'开始日期':'截止日期');}}/>
  <label>项目状态<AcrylicSelect value={project.status} label="项目状态" options={taggedOptions(baseProjectStatuses,custom.projectStatuses,'project')} creatable onCreate={value=>{flow.addCustomOption('projectStatuses',value);update('status',value,'状态');}} onChange={value=>update('status',value,'状态')} renderValue={value=><StatusTag value={value}/>}/></label>
  <label>项目类型<AcrylicSelect value={project.type} label="项目类型" options={taggedOptions(baseProjectTypes,custom.projectTypes,'type')} creatable onCreate={value=>{flow.addCustomOption('projectTypes',value);update('type',value,'类型');}} onChange={value=>update('type',value,'类型')}/></label>
  <label>项目备注<textarea key={project.id+'notes'} defaultValue={project.notes || ''} placeholder="输入项目备注，离开输入框自动保存" onBlur={e=>{if(e.target.value!==(project.notes || ''))update('notes',e.target.value,'备注');}}/></label>
  </div><section className="inspector-tasks"><h3>包含的任务 · {project.tasks.length}</h3>{project.tasks.map(task=><button key={task.id} onClick={()=>{flow.selectPath({projectId:project.id,taskId:task.id});onOpenTask?.(project.id,task.id);}}><strong>{task.name}</strong><small>{task.due || '未设日期'}</small><StatusTag value={task.status}/></button>)}</section><ActivityFeed activities={project.activities}/><ProjectDeleteZone project={project} flow={flow} onDeleted={onDeleted}/></aside></>;
}

function TaskTable({ project, flow, onTask }) {
  const [selectedVersions, setSelectedVersions] = useState({});
  const choosePreviewVersion = (task, versionId) => {
    setSelectedVersions(current => ({ ...current, [task.id]: versionId }));
    flow.chooseTask(task.id);
    flow.chooseVersion(versionId);
  };
  return <section className="project-task-table"><div className="task-table-head"><span>#</span><span>任务名称</span><span>类型</span><span>截止日期</span><span>进度</span><span>项目状态</span><span>当前阶段</span><span>最新版本</span><span>未完成意见</span><span /></div>{project.tasks.map((task, index) => {
    const progress = countItems(task);
    const latest = task.versions.at(-1);
    const selectedVersion = task.versions.find(version => version.id === selectedVersions[task.id]) || latest;
    const selectedProgress = countItems(selectedVersion);
    const unfinished = selectedProgress.total - selectedProgress.done;
    const selected = flow.active.task?.id === task.id;
    const options = task.versions.map(version => ({ value: version.id, label: version.name }));
    return <React.Fragment key={task.id}><button className={`task-table-row ${selected ? 'selected' : ''}`} onClick={() => flow.chooseTask(task.id)} onDoubleClick={() => { flow.chooseTask(task.id); if (selectedVersion) flow.chooseVersion(selectedVersion.id); onTask(); }}><span>{index + 1}</span><span className="task-name-cell"><TypeIcon type={task.type} /><strong>{task.name}</strong></span><span>{task.type}</span><time>{task.due || '未设置'}</time><span className="mini-progress"><i style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} />{progress.total ? `${Math.round(progress.done / progress.total * 100)}%` : '0%'}</span><StatusTag value={project.status} kind="project" compact /><StatusTag value={task.status} compact /><strong className="version-link">{latest?.name || '—'}</strong><strong className={unfinished ? 'unfinished' : ''}>{unfinished}</strong><Icon name="chevron" /></button>{selected && selectedVersion ? <div className="task-version-preview"><div onClick={event => event.stopPropagation()}><AcrylicSelect className="compact-version-select" value={selectedVersion.id} options={options} label="选择任务版本" onChange={value => choosePreviewVersion(task, value)} /></div><Thumbnail file={selectedVersion.file} type={task.type} className="file-preview-icon"/><span className="preview-file-copy"><strong>{selectedVersion.file?.name || `${task.name}_${selectedVersion.name}`}</strong><small>{selectedVersion.createdAt}</small></span><StatusTag value={selectedVersion.status} compact /><span className="latest-feedback"><b>{unfinished}</b> 条未完成</span><Button className="enter-task" onClick={() => { flow.chooseVersion(selectedVersion.id); onTask(); }}>进入任务</Button><small className="double-click-hint">双击任务行进入</small></div> : null}</React.Fragment>;
  })}</section>;
}

function VersionTabs({ flow, onAdd, onDelete }) {
  const canDelete = Boolean(flow.active.version);
  if (!canDelete) return <section className="empty-state"><h2>这个任务还没有版本</h2><p>建立版本后即可关联文件、整理意见和审阅视频。</p><Button variant="primary" icon="plus" onClick={onAdd}>新增版本</Button></section>;
  return <div className="version-bar unified-version-bar"><span>版本</span><AcrylicSelect value={flow.active.version.id} options={flow.active.task.versions.map(version => ({ value: version.id, label: version.name }))} onChange={flow.chooseVersion} label="选择任务版本" /><AcrylicSelect value={flow.active.version.status} options={['进行中', '已完成']} label="版本状态" onChange={status => flow.updateVersion(version => ({ ...version, status }), '修改了版本状态')} renderValue={value => <StatusTag value={value} />} /><div className="version-actions"><Button icon="plus" onClick={onAdd}>新增版本</Button><Button className="danger-action" icon="trash" disabled={!canDelete} onClick={onDelete}>删除版本</Button></div></div>;
}

function FileRow({ flow, toast, onReview }) {
  const input = useRef();
  const file = flow.active.version?.file;
  const receive = selected => { if (!selected) return; flow.setFile(selected); toast('文件已关联到当前版本'); };
  const selectFile = async event => {
    const chosen = event?.target?.files?.[0];
    if (chosen) receive({ name: chosen.name, size: `${(chosen.size / 1048576).toFixed(1)} MB`, path: chosen.path || '' });
    else receive(await window.creativeFlowWindow?.selectFile?.());
  };
  return <div className="file-row">{file ? <><Thumbnail file={file} type={flow.active.task.type} className="file-thumb"/><span className="file-copy"><strong>{file.name}</strong><small>{file.size || '大小未知'} · {flow.active.version.createdAt}</small></span>{flow.active.task.type === '视频' ? <Button variant="primary" icon="play" onClick={onReview}>审阅</Button> : null}<Button onClick={() => mediaSource(file) ? window.creativeFlowWindow?.openPath?.(mediaSource(file)) : toast('当前仅保存了文件名')}>系统打开</Button><Button icon="copy" onClick={() => { navigator.clipboard?.writeText(file.path || file.name); toast('已复制文件信息'); }}>复制路径</Button><Button className="danger-action" icon="trash" onClick={() => { if (flow.clearFile()) toast('已取消关联，原文件未删除'); }}>取消关联</Button></> : <button className="empty-file" onClick={() => window.creativeFlowWindow?.selectFile ? selectFile() : input.current.click()}><Icon name="upload" /><span><strong>关联当前版本文件</strong><small>视频、图片、PPT 或其他交付文件</small></span></button>}<input ref={input} hidden type="file" onChange={selectFile} /></div>;
}

function Checklist({ flow, toast }) {
  const [filter, setFilter] = useState(false);
  const [sort, setSort] = useState('default');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({ time: '', text: '' });
  const importRef = useRef();
  const editRowRef = useRef(null);
  const lists = flow.active.version?.lists || [];
  const list = flow.active.list;
  const rows = useMemo(() => {
    const source = filter ? (list?.items || []).filter(row => !row.done) : [...(list?.items || [])];
    if (sort === 'time') source.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    if (sort === 'status') source.sort((a, b) => Number(a.done) - Number(b.done));
    return source;
  }, [list, filter, sort]);
  const add = event => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const match = value.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-—:：]?\s*(.+)$/);
    flow.addItem(match ? match[2] : value, match ? match[1] : '');
    setDraft('');
  };
  const importing = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseFeedbackText(text);
    flow.importItems(imported);
    toast(`已导入 ${imported.length} 条修改意见`);
    event.target.value = '';
  };
  const startEdit = row => { setEditing(row.id); setEditDraft({ time: row.time || '', text: row.text }); };
  const commitEdit = () => {
    if (!editing) return;
    flow.editItem(editing, { time: editDraft.time.trim(), text: editDraft.text.trim() || '未命名修改意见' });
    flow.recordActivity('编辑了修改意见');
    setEditing(null);
  };
  useEffect(() => {
    if (!editing) return undefined;
    const finishOutside = event => { if (!editRowRef.current?.contains(event.target)) commitEdit(); };
    document.addEventListener('pointerdown', finishOutside);
    return () => document.removeEventListener('pointerdown', finishOutside);
  }, [editing, editDraft]);
  if (!lists.length) return <section className="empty-state"><Icon name="comment" size={34} /><h2>为这个版本建立第一份修改清单</h2><p>可以按自检、内部反馈或客户轮次自由创建。</p><Button variant="primary" icon="plus" onClick={() => document.dispatchEvent(new Event('new-list'))}>新建修改清单</Button></section>;
  return <><div className="list-tabs">{lists.map(entry => { const progress = countItems(entry); return <button key={entry.id} className={list?.id === entry.id ? 'active' : ''} onClick={() => flow.chooseList(entry.id)}><span>{entry.name}</span><em>{progress.done}/{progress.total}</em></button>; })}<button className="add-list" onClick={() => document.dispatchEvent(new Event('new-list'))}><Icon name="plus" />新增列表</button></div>
    <div className="check-toolbar"><div><Button icon="download" onClick={() => importRef.current.click()}>导入意见</Button><Button className="danger-action" icon="trash" onClick={() => setDeleteListOpen(true)}>删除当前列表</Button><input ref={importRef} type="file" accept=".txt,.md,.srt" hidden onChange={importing} /><label className="filter"><Check checked={filter} onChange={event => setFilter(event.target.checked)} label="仅看未完成" />仅看未完成</label></div><AcrylicSelect value={sort} label="排序" onChange={setSort} options={[{ value: 'default', label: '默认顺序' }, { value: 'time', label: '按时间码' }, { value: 'status', label: '未完成优先' }]} /></div>
    <div className="check-table"><div className="table-head"><span /><span>#</span><span>时间点</span><span>修改意见</span><span>状态</span><span>操作</span></div>{rows.map((row, index) => <div ref={editing === row.id ? editRowRef : null} className={`check-row ${row.done ? 'done' : ''}`} key={row.id}><Check checked={row.done} onChange={() => flow.toggleItem(row.id)} label={row.text} /><span>{index + 1}</span>{editing === row.id ? <><input className="time-input" value={editDraft.time} onChange={event => setEditDraft(current => ({ ...current, time: event.target.value }))} /><input className="text-input" autoFocus value={editDraft.text} onChange={event => setEditDraft(current => ({ ...current, text: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') commitEdit(); if (event.key === 'Escape') setEditing(null); }} /></> : <><button className="timecode" onClick={() => startEdit(row)}>{row.time || '—'}</button><button className="item-text" onClick={() => startEdit(row)}>{row.text}</button></>}<span className={`status ${row.done ? 'done' : ''}`}>{row.done ? '已完成' : '未完成'}</span><span className="row-actions"><button onClick={() => editing === row.id ? commitEdit() : startEdit(row)}><Icon name="edit" /></button><button onClick={() => flow.removeItem(row.id)}><Icon name="trash" /></button></span></div>)}</div>
    <form className="quick-add" onSubmit={add}><Icon name="plus" /><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="输入修改意见；可用“00:32 音乐提前进入”自动识别时间码" /><button>添加</button></form>{deleteListOpen ? <Modal title={`删除修改清单「${list?.name || ''}」`} onClose={() => setDeleteListOpen(false)} footer={<><Button onClick={() => setDeleteListOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={() => { flow.deleteList(); setDeleteListOpen(false); toast('修改清单已删除'); }}>确认删除</Button></>}><p className="dialog-copy">将删除此列表及其中 {list?.items.length || 0} 条修改意见，其他列表和版本不会受影响。</p><p className="form-hint">此操作无法撤销。</p></Modal> : null}</>;
}

export function TaskWorkspace({ flow, rightPanel, setRightPanel, openVersion, toast, onOverview, onProjectDetail, onReview }) {
  const project = flow.active.project;
  const task = flow.active.task;
  const [newList, setNewList] = useState(false);
  const [deleteVersionOpen, setDeleteVersionOpen] = useState(false);
  const [deleteTaskOpen, setDeleteTaskOpen] = useState(false);
  const [name, setName] = useState('');
  const stageOptions = taggedOptions(baseStages, flow.db.preferences?.customOptions?.taskStages, 'stage');
  useEffect(() => { const open = () => setNewList(true); document.addEventListener('new-list', open); return () => document.removeEventListener('new-list', open); }, []);
  if (!project || !task) return null;
  const versionProgress = countItems(flow.active.version);
  return <>
    <main className="workarea">
      
      <div className="task-header"><div><h1>{task?.name || project.name}</h1><p>{project.description || '暂无项目说明'}</p></div><div className="task-header-actions"><AcrylicSelect className="stage-picker" value={task.status} options={stageOptions} label="项目阶段" creatable createLabel="输入新任务阶段…" onCreate={value => { flow.addCustomOption('taskStages', value); flow.updateTask(current => ({ ...current, status: value }), `将任务阶段改为「${value}」`); }} onChange={value => flow.updateTask(current => ({ ...current, status: value }), `将任务阶段改为「${value}」`)} renderValue={value => <StatusTag value={value} />} /><Button className="danger-action" icon="trash" onClick={() => setDeleteTaskOpen(true)}>删除任务</Button><Button icon="list" onClick={() => setRightPanel(true)}>任务详情</Button></div></div>
      <VersionTabs flow={flow} onAdd={openVersion} onDelete={() => setDeleteVersionOpen(true)} />
      {flow.active.version ? <><FileRow flow={flow} toast={toast} onReview={onReview} /><Checklist key={flow.active.version.id} flow={flow} toast={toast} /></> : null}
    </main>
    {rightPanel ? <TaskInspector key={task.id} flow={flow} onClose={() => setRightPanel(false)} onProject={() => { setRightPanel(false); onProjectDetail(); }} /> : null}
    {newList ? <Modal title="新建修改清单" onClose={() => setNewList(false)} footer={<><Button onClick={() => setNewList(false)}>取消</Button><Button variant="primary" onClick={() => { if (!name.trim()) return; flow.addList(name.trim()); setNewList(false); setName(''); }}>创建</Button></>}><label className="stack">名称<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="例如：客户第二轮反馈" /></label><p className="form-hint">按需建立任意修改类型，所有意见在同一页平铺显示。</p></Modal> : null}
    {deleteVersionOpen ? <Modal title={`删除版本 ${flow.active.version.name}`} onClose={() => setDeleteVersionOpen(false)} footer={<><Button onClick={() => setDeleteVersionOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={() => { const deleted = flow.deleteVersion(); setDeleteVersionOpen(false); if (deleted) toast('版本已删除'); }}>确认删除</Button></>}><div className="delete-version-copy"><span className="delete-version-icon"><Icon name="trash" size={22} /></span><div><strong>确定删除当前版本吗？</strong><p>将删除 {versionProgress.total} 条修改意见、{flow.active.version.lists.length} 个意见列表{flow.active.version.file ? '及关联文件记录' : ''}。电脑中的原始文件不会被删除。</p></div></div><p className="form-hint">此操作无法撤销，删除后将自动切换到最新的剩余版本。</p></Modal> : null}
    {deleteTaskOpen ? <Modal title={`删除任务「${task.name}」`} onClose={() => setDeleteTaskOpen(false)} footer={<><Button onClick={() => setDeleteTaskOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={() => { if (flow.deleteTask(project.id, task.id)) { setDeleteTaskOpen(false); onProjectDetail(); } }}>确认删除任务</Button></>}><div className="delete-version-copy"><span className="delete-version-icon"><Icon name="trash" size={22} /></span><div><strong>任务及其全部版本都会被删除</strong><p>将同时删除 {task.versions.length} 个版本和 {countItems(task).total} 条修改意见。电脑中的原始文件不会被删除。</p></div></div><p className="form-hint">此操作无法撤销。</p></Modal> : null}
  </>;
}
