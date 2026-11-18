import { PopupMenu } from './WorkflowControls';
import React, { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from './version';
import { countItems } from './data';
import { AcrylicSelect, Button, ExplorerPanel, Icon, Mark, StatusTag, TypeIcon } from './ui';

export function TitleBar({ query, setQuery, flow, onProject, onTask, menuItems, onClose }) {
  const api = window.creativeFlowWindow;
  const headerRef = useRef(null);
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{let live=true;const off=api?.onWindowStateChanged?.(state=>{if(live)setMaximized(state.maximized);});api?.getWindowState?.().then(state=>{if(live)setMaximized(state.maximized);}).catch(()=>{});return()=>{live=false;off?.();};},[]);
  useEffect(() => {
    if (!query.trim()) return;
    const close = event => { if (!headerRef.current?.contains(event.target)) setQuery(''); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); setQuery(''); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [query, setQuery]);
  const matches = query.trim() ? flow.db.projects.flatMap(project => [
    ...(project.name.includes(query) ? [{project,label:project.name}] : []),
    ...project.tasks.filter(task=>task.name.includes(query) || task.versions.some(v=>v.lists.some(l=>l.items.some(i=>i.text.includes(query))))).map(task=>({project,task,label:task.name}))
  ]).slice(0,12) : [];
  return <header ref={headerRef} className="titlebar">
    <div className="brand"><Mark /><PopupMenu className="brand-menu" label="应用菜单" icon={null} items={menuItems}>创作流<Icon name="down" size={12}/></PopupMenu><small className="beta-badge" title={APP_VERSION}>BETA</small></div>
    <label className="global-search"><Icon name="search" /><input aria-label="全局搜索" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目、任务或修改意见…" /></label>
    {query.trim() ? <div className="search-results">{matches.map(row=><button key={row.task?.id || row.project.id} onClick={()=>{row.task ? onTask(row.project.id,row.task.id) : onProject(row.project.id);setQuery('');}}><TypeIcon type={row.task?.type || row.project.type}/><span>{row.label}<small>{row.task ? row.project.name : '项目'}</small></span><Icon name="chevron"/></button>)}{!matches.length ? <p>没有匹配的项目、任务或修改意见</p> : null}<button onClick={()=>setQuery('')}>关闭搜索</button></div> : null}<div className="window-controls"><button title="最小化到任务栏" aria-label="最小化到任务栏" onClick={() => api?.minimize()}><WindowGlyph kind="minimize"/></button><button title={maximized?"还原":"最大化"} aria-label={maximized?"还原窗口":"最大化窗口"} onClick={() => api?.toggleMaximize()}><WindowGlyph kind={maximized?"restore":"maximize"}/></button><button className="close" title="关闭窗口" aria-label="关闭窗口" onClick={() => onClose?onClose():api?.close()}><WindowGlyph kind="close"/></button></div>
  </header>;
}

const navItems = [['today', 'home', '今日'], ['projects', 'folder', '项目'], ['review', 'video', '审阅'], ['calendar', 'calendar', '日历'], ['feedback', 'comment', '修改意见']];
export function NavRail({ view, setView }) {
  return <aside className="navrail"><nav>{navItems.map(([id, icon, label]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} title={label} onClick={() => setView(id)}><Icon name={icon} size={22} /><span>{label}</span></button>)}</nav><button className={`bottom ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Icon name="settings" size={22} /><span>设置</span></button></aside>;
}

export function ProjectExplorer({ flow, query, onNewProject, onNewTask, onProject, onTask }) {
  const projects = flow.db.projects.filter(project => !query || `${project.name} ${project.tasks.map(task => task.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <ExplorerPanel title="项目与任务" label="项目" storageKey="creative-flow-project-explorer-width" actions={<button title="新建项目" aria-label="新建项目" onClick={onNewProject}><Icon name="plus"/></button>}>
    <div className="explorer-list">{projects.map(project => <section key={project.id} className={flow.active.project?.id === project.id ? 'current' : ''}>
      <button className="project-row" onClick={() => onProject(project.id)}><i style={{ background: project.color }} /><Icon name="folder" /><strong>{project.name}</strong><span>{project.tasks.length}</span></button>
      {flow.active.project?.id === project.id ? <div className="task-tree">{project.tasks.map(task => { const progress = countItems(task); return <button key={task.id} className={flow.active.task?.id === task.id ? 'active' : ''} onClick={() => onTask(project.id, task.id)}><TypeIcon type={task.type} /><span>{task.name}</span><em>{progress.done}/{progress.total}</em></button>; })}<button className="add-tree" onClick={onNewTask}><Icon name="plus" />新增任务</button></div> : null}
    </section>)}</div>
    <Button icon="plus" className="new-project" onClick={onNewProject}>新建项目</Button>
  </ExplorerPanel>;
}

function WindowGlyph({kind}) {
 const paths={minimize:'M1 6.5h10',maximize:'M1.5 1.5h9v9h-9z',restore:'M3.5 3.5v-2h7v7h-2M1.5 3.5h7v7h-7z',close:'m1.5 1.5 9 9m0-9-9 9'};
 return <svg className="window-glyph" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
