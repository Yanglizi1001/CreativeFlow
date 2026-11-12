import { taskColor } from './calendarLayout';
import { projectColor, readableText } from './colors';
import { Gantt } from './Schedule';
import { MonthCalendar } from './MonthCalendar';
import { taskOnDate, taskPeriod } from './calendarLayout';
import { TaskInspector } from './TaskInspector';
import { ProjectContextDrawer } from './projectViews';
import { useViewState } from './viewState';
import React, { useEffect, useMemo, useState } from 'react';
import { countItems } from './data';
import { dateKey, parseDate, weekBounds, monthCells, shiftDate } from './dates';
import { AcrylicSelect, Breadcrumbs, Button, Check, Icon, StatusTag, TypeIcon, useEscape } from './ui';

const workViews = [
  { value: 'all', label: '全部任务' },
  { value: 'production', label: '制作中' },
  { value: 'modifying', label: '修改中' },
  { value: 'review', label: '审核中' },
  { value: 'delivered', label: '已交付' },
];

function matchesWorkView(task, view) {
  if (view === 'all') return true;
  if (view === 'production') return ['前期策划', '中期拍摄', '后期制作'].includes(task.status);
  if (view === 'modifying') return task.status === '修改中';
  if (view === 'review') return ['内部审核', '客户审核'].includes(task.status);
  return task.status === '已交付';
}

export function TodayView({ flow, onNewProject, onOpenTask }) {
  const [workView, setWorkView] = useViewState('TodayView-workView', 'all');
  const tasks = useMemo(() => flow.db.projects.flatMap(project => project.tasks.map(task => ({ ...task, project }))).filter(task => matchesWorkView(task, workView)).sort((a, b) => (a.due || '').localeCompare(b.due || '')), [flow.db.projects, workView]);
  const openCount = flow.db.projects.flatMap(project => project.tasks.flatMap(task => task.versions.flatMap(version => version.lists.flatMap(list => list.items)))).filter(item => !item.done).length;
  return <main className="page today-page">
    <div className="page-heading"><div><h1>今日</h1><p>直接处理具体任务，并根据工作阶段切换视图。</p></div><div className="heading-actions"><span className="date-label">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span><Button variant="primary" icon="plus" onClick={onNewProject}>新建项目</Button></div></div>
    <section className="summary-strip"><div><strong>{tasks.length}</strong><span>当前视图任务</span></div><div><strong>{flow.db.projects.filter(project => project.status === '进行中').length}</strong><span>进行中的项目</span></div><div><strong>{openCount}</strong><span>未完成修改意见</span></div></section>
    <section className="page-section today-work"><div className="section-title"><div><h2>{workViews.find(item => item.value === workView)?.label}</h2><span>{tasks.length} 项</span></div><AcrylicSelect value={workView} options={workViews} onChange={setWorkView} label="今日工作视图" /></div>
      <div className="task-list enhanced">{tasks.map(task => { const progress = countItems(task); return <button key={`${task.project.id}-${task.id}`} onClick={() => onOpenTask(task.project.id, task.id)}><span className="type-icon"><TypeIcon type={task.type} /></span><span className="task-primary"><strong>{task.name}</strong><small>{task.project.name}</small></span><StatusTag value={task.project.status} kind="project" compact /><StatusTag value={task.status} compact /><time>{task.due || '未设日期'}</time><span className="fraction">{progress.done}/{progress.total}</span><Icon name="chevron" /></button>; })}{tasks.length === 0 ? <div className="inline-empty">当前视图没有任务</div> : null}</div>
    </section>
  </main>;
}

export function CalendarView({ flow, onNewProject, onNewTask, onOpenTask }) {
  const [mode, setMode] = useViewState('CalendarView-mode', 'month');
  const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem('calendar-date') || dateKey());
  const [drawer, setDrawer] = useState(null);
  useEscape(() => setDrawer(null), Boolean(drawer));
  const tasks = useMemo(() => flow.db.projects.flatMap(project => project.tasks.map(task => ({ ...task, project }))), [flow.db.projects]);
  const selectedIso = selectedDate;
  const [weekStart, weekEnd] = weekBounds(selectedIso);
  useEffect(() => { sessionStorage.setItem('calendar-date', selectedDate); }, [selectedDate]);
  const agendaTasks = useMemo(() => tasks.filter(task => mode === 'day' ? taskOnDate(task,selectedIso) : mode === 'week' ? taskPeriod(task).start <= weekEnd && taskPeriod(task).end >= weekStart : task.due?.startsWith(selectedIso.slice(0, 7))).sort((a, b) => (a.due || '').localeCompare(b.due || '')), [tasks, mode, selectedIso]);
  const days = monthCells(selectedIso);
  const showTask = (task, back = null) => { flow.selectPath({projectId:task.project.id,taskId:task.id}); setDrawer({type:'task',projectId:task.project.id,taskId:task.id,back}); };
  const showProject = (project, back = null) => setDrawer({type:'project',projectId:project.id,back});
  const backPanel = () => { const previous=drawer?.back; if(previous?.type==='task')flow.selectPath({projectId:previous.projectId,taskId:previous.taskId}); setDrawer(previous||null); };
  const showDetail = task => showTask(task);
  const showDay = day => { if (!day) return; setSelectedDate(day); setDrawer({ type: 'day', day }); };
  return <main className="page calendar-page">
    
    <div className="page-heading"><div><h1>计划</h1><p>以月、周、日查看具体任务和所处阶段。</p></div><div className="heading-actions"><div className="segmented">{[['month', '月'], ['week', '周'], ['day', '日'], ['gantt','甘特']].map(([id, label]) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>{label}</button>)}</div><Button variant="primary" icon="plus" onClick={onNewProject}>新建项目</Button></div></div>
    <div className="calendar-toolbar"><Button icon="left" aria-label="上一周期" onClick={() => { setSelectedDate(shiftDate(selectedDate, mode==='gantt'?'month':mode, -1)); setDrawer(null); }} /><strong>{(mode === 'month'||mode==='gantt') ? selectedIso.slice(0, 7) : mode === 'week' ? `${weekStart} — ${weekEnd}` : selectedIso}</strong><Button icon="right" aria-label="下一周期" onClick={() => { setSelectedDate(shiftDate(selectedDate, mode, 1)); setDrawer(null); }} /><Button onClick={() => { setSelectedDate(dateKey()); setDrawer({ type: 'day', day: dateKey() }); }}>今天</Button></div>
    {mode === 'gantt' ? <Gantt projects={flow.db.projects} date={selectedDate} onProject={project=>showProject(project)} onTask={(project,task)=>showTask({...task,project})} onOpenTask={onOpenTask}/> : mode === 'month' ? <MonthCalendar value={selectedDate} tasks={tasks} selected={selectedDate} onDay={showDay} onDetail={showDetail}/> : <div className="agenda">{agendaTasks.map(task => <button key={`${task.project.id}-${task.id}`} onClick={() => showDetail(task)}><time>{task.due || '未设日期'}</time><i style={{ background: taskColor(task) }} /><span><strong>{task.name}</strong><small>{task.project.name}</small></span><StatusTag value={task.project.status} kind="project" compact /><StatusTag value={task.status} compact /><Icon name="chevron" /></button>)}{agendaTasks.length === 0 ? <div className="inline-empty">这一天没有安排任务</div> : null}</div>}
    {drawer?.type === 'task' && flow.active.task ? <TaskInspector key={drawer.taskId} flow={flow} onClose={()=>setDrawer(null)} onBack={drawer.back?backPanel:undefined} onProject={()=>showProject(flow.active.project,drawer)}/> : null}
    {drawer?.type === 'project' ? <CalendarDetail selected={drawer} flow={flow} onClose={() => setDrawer(null)} onBack={drawer.back?backPanel:undefined} onInspectTask={(projectId,taskId)=>{const project=flow.db.projects.find(p=>p.id===projectId);const task=project?.tasks.find(t=>t.id===taskId);if(task)showTask({...task,project},drawer);}} /> : null}
    {drawer?.type === 'day' ? <DayPlanDrawer day={drawer.day} tasks={tasks.filter(task => taskOnDate(task,drawer.day))} flow={flow} onClose={() => setDrawer(null)} onShowProject={task=>showProject(task.project,drawer)} onShowTask={task=>showTask(task,drawer)} onNewProject={onNewProject} onNewTask={() => { const first = tasks.find(task => taskOnDate(task,drawer.day)); if (first) { flow.chooseProject(first.project.id); onNewTask(drawer.day); } else if (flow.active.project) onNewTask(drawer.day); else onNewProject(); }} /> : null}
  </main>;
}

function DayPlanDrawer({ day, tasks, flow, onClose, onShowProject, onShowTask, onNewProject, onNewTask }) {
  const [versions, setVersions] = useState({});
  return <><button className="drawer-scrim" aria-label="关闭今日计划" onClick={onClose} /><aside className="calendar-drawer day-plan-drawer"><header><div><h2>{day} · 当日计划</h2><small>共 {new Set(tasks.map(task => task.project.id)).size} 个项目 · {tasks.length} 个任务</small></div><button onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header><div className="day-plan-list">{tasks.map(task => { const version = task.versions.find(item => item.id === versions[task.id]) || task.versions.at(-1); const progress = countItems(task); return <section key={task.id}><button className="day-project" onClick={() => onShowProject(task)}><span style={{ background: projectColor(task.project), color: readableText(projectColor(task.project)) }}><TypeIcon type={task.project.type} /></span><strong>{task.project.name}</strong><Icon name="chevron" /></button><div className="day-task"><div className="day-task-title"><TypeIcon type={task.type} /><button className="day-task-open" onClick={()=>onShowTask(task)}>{task.name}</button><AcrylicSelect className="compact-version-select" value={version?.id} options={task.versions.map(item => ({ value: item.id, label: item.name }))} label="选择任务版本" onChange={value => setVersions(current => ({ ...current, [task.id]: value }))} /></div><div className="day-task-tags"><StatusTag value={task.project.status} kind="project" compact /><StatusTag value={task.status} compact /></div><p><Icon name="calendar" size={14} />计划完成：{task.due || '未设置'}</p><p><Icon name="list" size={14} />当前版本：{version?.file?.name || version?.name || '尚未建立'}</p><div className="day-progress"><span>任务进度</span><b>{progress.total ? Math.round(progress.done / progress.total * 100) : 0}%</b><i><em style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></i></div><button className="project-detail-link" onClick={() => onShowProject(task)}>查看项目详情 <Icon name="chevron" size={14} /></button></div></section>; })}{!tasks.length ? <div className="day-empty"><Icon name="calendar" size={30} /><strong>当天还没有计划</strong><span>可以新建项目或为当前项目添加任务。</span></div> : null}</div><footer><Button icon="plus" onClick={onNewProject}>新建项目</Button><Button variant="primary" icon="plus" onClick={onNewTask}>新增任务</Button></footer></aside></>;
}

function CalendarDetail({ selected, flow, onClose, onBack, onInspectTask }) {
  const project=flow.db.projects.find(p=>p.id===selected.projectId);
  if(!project)return null;
  return <ProjectContextDrawer key={project.id} project={project} flow={flow} onClose={onClose} onDeleted={onClose} onBack={onBack} onInspectTask={onInspectTask}/>;
}

export function FeedbackCenter({ flow, onOpenTask }) {
  const [projectFilter, setProjectFilter] = useViewState('FeedbackCenter-projectFilter', 'all');
  const [taskFilter, setTaskFilter] = useViewState('FeedbackCenter-taskFilter', 'all');
  const [statusFilter, setStatusFilter] = useViewState('FeedbackCenter-statusFilter', 'open');
  const [sortMode, setSortMode] = useViewState('FeedbackCenter-sortMode', 'project');
  const [editing, setEditing] = useState(null);
  const rawGroups = useMemo(() => flow.db.projects.flatMap(project => project.tasks.map(task => ({ project, task, bundles: task.versions.flatMap(version => version.lists.map(list => ({ version, list }))) }))).filter(group => group.bundles.some(bundle => bundle.list.items.length)), [flow.db.projects]);
  const [openGroups, setOpenGroups] = useState(() => new Set(rawGroups.filter(group => group.bundles.some(bundle => bundle.list.items.some(item => !item.done))).map(group => group.task.id)));
  const taskOptions = useMemo(() => [{ value: 'all', label: '全部任务' }, ...flow.db.projects.filter(project => projectFilter === 'all' || project.id === projectFilter).flatMap(project => project.tasks.map(task => ({ value: task.id, label: task.name })))], [flow.db.projects, projectFilter]);
  const groups = useMemo(() => {
    const filtered = rawGroups.filter(group => (projectFilter === 'all' || group.project.id === projectFilter) && (taskFilter === 'all' || group.task.id === taskFilter));
    if (sortMode === 'deadline') filtered.sort((a, b) => (a.task.due || '').localeCompare(b.task.due || ''));
    return filtered;
  }, [rawGroups, projectFilter, taskFilter, sortMode]);
  const toggleGroup = taskId => setOpenGroups(current => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
  return <main className="page feedback-center"><div className="page-heading"><div><h1>修改意见</h1><p>跨项目处理修改意见，完成后直接划掉。</p></div></div>
    <div className="feedback-filterbar"><AcrylicSelect value={projectFilter} label="筛选项目" onChange={value => { setProjectFilter(value); setTaskFilter('all'); }} options={[{ value: 'all', label: '全部项目' }, ...flow.db.projects.map(project => ({ value: project.id, label: project.name }))]} /><AcrylicSelect value={taskFilter} label="筛选任务" onChange={setTaskFilter} options={taskOptions} /><AcrylicSelect value={statusFilter} label="完成状态" onChange={setStatusFilter} options={[{ value: 'open', label: '仅看未完成' }, { value: 'all', label: '全部意见' }, { value: 'done', label: '仅看已完成' }]} /><AcrylicSelect value={sortMode} label="排序" onChange={setSortMode} options={[{ value: 'project', label: '按项目排列' }, { value: 'deadline', label: '按截止日期' }]} /></div>
    <div className="feedback-task-groups">{groups.map(group => {
      const allItems = group.bundles.flatMap(bundle => bundle.list.items);
      const done = allItems.filter(item => item.done).length;
      const open = openGroups.has(group.task.id);
      return <section key={group.task.id} className={open ? 'open' : ''}><div className="feedback-task-head"><button className="feedback-toggle" onClick={() => toggleGroup(group.task.id)}><Icon name={open ? 'down' : 'right'} /><span className="task-context"><TypeIcon type={group.task.type} /><span><strong>{group.task.name}</strong><small>{group.project.name} · 截止 {group.task.due || '未设置'}</small></span></span></button><StatusTag value={group.project.status} kind="project" compact /><StatusTag value={group.task.status} compact /><span className="feedback-progress">{done}/{allItems.length}</span><Button className="jump-button" onClick={() => onOpenTask(group.project.id, group.task.id)}>进入任务</Button></div>{open ? <div className="feedback-bundles">{group.bundles.map(bundle => {
        const visible = bundle.list.items.filter(item => statusFilter === 'all' || (statusFilter === 'open' ? !item.done : item.done));
        if (!visible.length) return null;
        return <div className="feedback-bundle" key={bundle.list.id}><header><strong>{bundle.version.name} · {bundle.list.name}</strong><span>{bundle.list.items.filter(item => item.done).length}/{bundle.list.items.length}</span></header>{visible.map(item => { const editKey = `${bundle.list.id}-${item.id}`; return <div className={`feedback-item ${item.done ? 'done' : ''}`} key={item.id}><Check checked={item.done} onChange={() => flow.toggleItemAt(group.project.id, group.task.id, bundle.version.id, bundle.list.id, item.id)} label={item.text} /><time>{item.time || '—'}</time>{editing === editKey ? <input autoFocus value={item.text} onChange={event => flow.editItemAt(group.project.id, group.task.id, bundle.version.id, bundle.list.id, item.id, { text: event.target.value })} onBlur={() => { flow.recordActivity('编辑了修改意见', group.project.id); setEditing(null); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /> : <button onClick={() => setEditing(editKey)}>{item.text}</button>}<span>{item.done ? '已完成' : '未完成'}</span></div>; })}</div>;
      })}</div> : null}</section>;
    })}{groups.length === 0 ? <div className="empty-state"><Icon name="check" size={34} /><h2>没有符合条件的修改意见</h2></div> : null}</div>
  </main>;
}
