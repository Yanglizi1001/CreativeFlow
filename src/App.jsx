import { useScrollMemory } from './viewState';
import { ColorProvider } from './ColorContext';
import React, { useEffect, useState } from 'react';
import { useCreativeFlow } from './useCreativeFlow';
import { Breadcrumbs, Button, Icon, Modal } from './ui';
import { CreateForm, NavRail, ProjectExplorer, TitleBar } from './shell';
import { ProjectDetail, ProjectOverview, TaskWorkspace } from './projectViews';
import { CalendarView, FeedbackCenter, TodayView } from './views';
import { SettingsView, WidgetPreview } from './miscViews';
import { ReviewCenter, ReviewExplorer, ReviewWorkspace } from './reviewViews';

export default function App() {
  const flow = useCreativeFlow();
  const [view, setView] = useState('projects');
  const [projectLevel, setProjectLevel] = useState('overview');
  const [reviewLevel, setReviewLevel] = useState('center');
  const [reviewScope, setReviewScope] = useState('all');
  const [returnStack, setReturnStack] = useState([]);
  useScrollMemory(view+':'+projectLevel+':'+reviewLevel);
  const rememberLocation = () => setReturnStack(stack => {
    const next = { view, projectLevel, reviewLevel, reviewScope, selection: { ...flow.selection } };
    return JSON.stringify(stack.at(-1)) === JSON.stringify(next) ? stack : [...stack, next];
  });
  const canGoBack = returnStack.length > 0 || (view === 'projects' && projectLevel !== 'overview') || (view === 'review' && (reviewLevel === 'workspace' || reviewScope !== 'all'));
  const goBack = () => {
    setRightPanel(false);
    const previous = returnStack.at(-1);
    if (previous) { setView(previous.view); setProjectLevel(previous.projectLevel); setReviewLevel(previous.reviewLevel); setReviewScope(previous.reviewScope); flow.selectPath(previous.selection); setReturnStack(stack => stack.slice(0, -1)); return; }
    if (view === 'projects') setProjectLevel(projectLevel === 'task' ? 'detail' : 'overview');
    if (view === 'review') { if (reviewLevel === 'workspace') { setReviewScope(flow.active.project?.id || 'all'); setReviewLevel('center'); } else setReviewScope('all'); }
  };
  const enterProjectLevel = level => { if (projectLevel !== level) rememberLocation(); setRightPanel(false); setProjectLevel(level); };
  const [query, setQuery] = useState('');
  const [rightPanel, setRightPanel] = useState(false);
  const [createMode, setCreateMode] = useState(null);
  const [createDate, setCreateDate] = useState('');
  const [versionDialog, setVersionDialog] = useState(false);
  const [toast, setToast] = useState(null);
  const [widgets, setWidgets] = useState(window.location.hash === '#/widgets');
  const notify = (message, type = 'ok') => { setToast({ message, type }); setTimeout(() => setToast(null), 2300); };
  useEffect(() => {
    const syncHash = () => setWidgets(window.location.hash === '#/widgets');
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);
  const changeView = next => { setReturnStack([]); setReviewScope('all'); setRightPanel(false); setView(next); if (next === 'projects') setProjectLevel('overview'); if (next === 'review') setReviewLevel('center'); };
  const openTask = (projectId, taskId) => { if (view !== 'projects' || projectLevel !== 'task' || flow.active.task?.id !== taskId) rememberLocation(); setRightPanel(false); flow.selectPath({ projectId, taskId }); setView('projects'); setProjectLevel('task'); };
  const openProject = projectId => { if (view !== 'projects' || projectLevel !== 'detail' || flow.active.project?.id !== projectId) rememberLocation(); setRightPanel(false); flow.chooseProject(projectId); setView('projects'); setProjectLevel('detail'); };
  const openReviewCenter = (scope = 'all') => { if (reviewLevel !== 'center' || reviewScope !== scope) rememberLocation(); if (scope !== 'all') flow.chooseProject(scope); setRightPanel(false); setReviewScope(scope); setReviewLevel('center'); };
  const openReview = (projectId = flow.active.project?.id, taskId = flow.active.task?.id, versionId = flow.active.version?.id) => {
    if (view !== 'review' || reviewLevel !== 'workspace' || flow.active.task?.id !== taskId) rememberLocation();
    setRightPanel(false);
    const project = flow.db.projects.find(item => item.id === projectId);
    const task = project?.tasks.find(item => item.id === taskId);
    const version = task?.versions.find(item => item.id === versionId) || task?.versions.at(-1);
    const list = version?.lists.find(item => item.id === flow.active.list?.id) || version?.lists.find(item => item.items.some(feedback => !feedback.done)) || version?.lists.at(-1);
    flow.selectPath({ projectId, taskId, versionId: version?.id, listId: list?.id });
    setView('review');
    setReviewLevel('workspace');
  };
  const openNewProject = () => { setCreateDate(''); setCreateMode('project'); };
  const closeDetails = action => () => { rememberLocation(); setRightPanel(false); action(); };
  const pathItems = view === 'projects' ? [
    {label:'项目',current:projectLevel==='overview',onClick:projectLevel==='overview'?undefined:closeDetails(()=>setProjectLevel('overview'))},
    ...(projectLevel!=='overview' && flow.active.project ? [{label:flow.active.project.name,current:projectLevel==='detail',onClick:projectLevel==='detail'?undefined:closeDetails(()=>setProjectLevel('detail'))}] : []),
    ...(projectLevel==='task' && flow.active.task ? [{label:flow.active.task.name,current:true}] : [])
  ] : view === 'review' ? [
    {label:'审阅中心',current:reviewLevel==='center'&&reviewScope==='all',onClick:reviewLevel==='center'&&reviewScope==='all'?undefined:()=>openReviewCenter()},
    ...((reviewLevel==='workspace'?flow.active.project:flow.db.projects.find(p=>p.id===reviewScope)) ? [{label:(reviewLevel==='workspace'?flow.active.project:flow.db.projects.find(p=>p.id===reviewScope)).name,current:reviewLevel==='center',onClick:reviewLevel==='workspace'?()=>openReviewCenter(flow.active.project.id):undefined}] : []),
    ...(reviewLevel==='workspace' && flow.active.task ? [{label:flow.active.task.name,current:true}] : [])
  ] : [{label:({today:'今日',calendar:'日历',feedback:'修改意见',settings:'设置'})[view],current:true}];
  if (widgets) return <ColorProvider flow={flow}><WidgetPreview flow={flow} /></ColorProvider>;
  return <ColorProvider flow={flow}><div className="app">
    <TitleBar query={query} setQuery={setQuery} flow={flow} onProject={openProject} onTask={openTask} />
    <NavRail view={view} setView={changeView} />
    <div className="app-content">
      {view === 'projects' ? <ProjectExplorer flow={flow} query={query} onNewProject={openNewProject} onNewTask={() => {setCreateDate('');setCreateMode('task');}} onProject={openProject} onTask={openTask} /> : null}
      {view === 'review' ? <ReviewExplorer flow={flow} query={query} onOpen={openReview} onProject={openReviewCenter} /> : null}
      <section className="main-surface">
        <div className="workspace-path"><Breadcrumbs items={pathItems}/><Button className="workspace-back" icon="left" aria-label="返回上一页" title={returnStack.length ? '返回来源页面' : canGoBack ? '返回上一级' : '暂无上一页'} disabled={!canGoBack} onClick={goBack}>返回</Button></div>
        <div className="workspace-content">
        {view === 'projects' && projectLevel === 'overview' ? <ProjectOverview flow={flow} onNewProject={openNewProject} onProjectDetail={() => enterProjectLevel('detail')} onTask={() => enterProjectLevel('task')} /> : null}
        {view === 'projects' && projectLevel === 'detail' ? <ProjectDetail flow={flow} onOverview={() => setProjectLevel('overview')} onTask={() => enterProjectLevel('task')} onNewTask={() => setCreateMode('task')} /> : null}
        {view === 'projects' && projectLevel === 'task' ? <TaskWorkspace flow={flow} rightPanel={rightPanel} setRightPanel={setRightPanel} openVersion={() => setVersionDialog(true)} toast={notify} onOverview={() => setProjectLevel('overview')} onProjectDetail={() => setProjectLevel('detail')} onReview={() => openReview()} /> : null}
        {view === 'review' && reviewLevel === 'center' ? <ReviewCenter key={reviewScope} onAll={()=>setReviewScope('all')} scope={reviewScope} flow={flow} onOpen={openReview} /> : null}
        {view === 'review' && reviewLevel === 'workspace' ? <ReviewWorkspace flow={flow} onBack={() => { setReviewScope('all'); setReviewLevel('center'); }} onProject={id => { setReviewScope(id); setReviewLevel('center'); }} toast={notify} /> : null}
        {view === 'today' ? <TodayView flow={flow} onNewProject={openNewProject} onOpenTask={openTask} /> : null}
        {view === 'calendar' ? <CalendarView flow={flow} onNewProject={openNewProject} onNewTask={date => { setCreateDate(typeof date==='string' ? date : ''); setCreateMode('task'); }} onOpenTask={openTask} onOpenProject={openProject} /> : null}
        {view === 'feedback' ? <FeedbackCenter flow={flow} onOpenTask={openTask} /> : null}
        {view === 'settings' ? <SettingsView flow={flow} toast={notify} /> : null}
        </div>
      </section>
    </div>
    <footer className="statusbar"><span>本地自动保存</span><span>{flow.db.projects.length} 个项目</span><span className="saved"><Icon name="check" size={14} />{flow.saveStatus}</span></footer>
    {createMode ? <Modal title={createMode === 'project' ? '新建项目' : '新增任务'} onClose={() => setCreateMode(null)} footer={<><Button onClick={() => setCreateMode(null)}>取消</Button><Button variant="primary" type="submit" form="create-form">创建</Button></>}><CreateForm initialDate={createDate} mode={createMode} flow={flow} onClose={() => setCreateMode(null)} onCreated={() => { setView('projects'); setProjectLevel(createMode === 'project' ? 'detail' : 'task'); }} /></Modal> : null}
    {versionDialog ? <Modal title="新增版本" onClose={() => setVersionDialog(false)} footer={<><Button onClick={() => { flow.addVersion({ inherit: false }); setVersionDialog(false); }}>建立空版本</Button><Button variant="primary" onClick={() => { flow.addVersion({ inherit: true }); setVersionDialog(false); }}>继承未完成意见</Button></>}><p className="dialog-copy">将创建 V{Math.max(0,...flow.active.task.versions.map(v=>Number(v.name.replace(/\D/g,''))||0))+1}。可以建立空版本，也可以把当前版本未完成的修改意见带入。</p></Modal> : null}
    {flow.deletedItem ? <div className="undo-notice" role="status">修改意见已删除 <Button onClick={flow.undoDeleteItem}>撤销</Button></div> : null}
    {toast ? <div className={`toast ${toast.type}`}><Icon name={toast.type === 'ok' ? 'check' : 'close'} />{toast.message}</div> : null}
  </div></ColorProvider>;
}
