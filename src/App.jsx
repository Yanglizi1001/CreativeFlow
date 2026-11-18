import { CreationDialog, VersionDialog } from './CreationDialog';
import { HistoryButtons, useWorkShortcuts } from './WorkflowControls';
import { useBackups } from './useBackups';
import { APP_VERSION } from './version';
import { dateKey } from './dates';
import { useScrollMemory } from './viewState';
import { ColorProvider } from './ColorContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCreativeFlow } from './useCreativeFlow';
import { Breadcrumbs, Button, Icon, Modal } from './ui';
import { NavRail, ProjectExplorer, TitleBar } from './shell';
import { ProjectDetail, ProjectOverview, TaskWorkspace } from './projectViews';
import { CalendarView, FeedbackCenter, TodayView } from './views';
import { SettingsView, WidgetPreview } from './miscViews';
import { ReviewCenter, ReviewExplorer, ReviewWorkspace } from './reviewViews';

export default function App() {
  const flow = useCreativeFlow();
  const reviewGuard=useRef(null);
  const setReviewGuard=useCallback(fn=>{reviewGuard.current=fn;},[]);
  const guard=action=>reviewGuard.current?reviewGuard.current(action):action();
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
  const goBack = () => guard(() => {
    setRightPanel(false);
    const previous = returnStack.at(-1);
    if (previous) { setView(previous.view); setProjectLevel(previous.projectLevel); setReviewLevel(previous.reviewLevel); setReviewScope(previous.reviewScope); flow.selectPath(previous.selection); setReturnStack(stack => stack.slice(0, -1)); return; }
    if (view === 'projects') setProjectLevel(projectLevel === 'task' ? 'detail' : 'overview');
    if (view === 'review') { if (reviewLevel === 'workspace') { setReviewScope(flow.active.project?.id || 'all'); setReviewLevel('center'); } else setReviewScope('all'); }
  });
  const enterProjectLevel = level => { if (projectLevel !== level) rememberLocation(); setRightPanel(false); setProjectLevel(level); };
  const [query, setQuery] = useState('');
  const [rightPanel, setRightPanel] = useState(false);
  const [creation,setCreation]=useState(null);
  const [versionDialog,setVersionDialog]=useState(null);
  const [info,setInfo]=useState(null);
  const [createdTarget,setCreatedTarget]=useState(null);
  const [toast, setToast] = useState(null);
  const [widgets, setWidgets] = useState(window.location.hash === '#/widgets');
  const notify = (message, type = 'ok', action) => { setToast({message,type,action}); };
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),toast.action?9000:3000);return()=>clearTimeout(timer);},[toast]);
  const travel=direction=>guard(async()=>{const label=await flow[direction]();if(label){notify((direction==='undo'?'已撤销：':'已重做：')+label);}});
  useWorkShortcuts(travel);
  const backups=useBackups(flow,notify);
  useEffect(()=>{
    const project=flow.db.projects.find(p=>p.id===flow.selection.projectId);
    const task=project?.tasks.find(t=>t.id===flow.selection.taskId);
    if(view==='projects'&&projectLevel!=='overview'&&!project)setProjectLevel('overview');
    else if(view==='projects'&&projectLevel==='task'&&!task)setProjectLevel('detail');
    if(view==='review'&&reviewLevel==='workspace'&&(!project||!task)){setReviewLevel('center');if(!project)setReviewScope('all');}
  },[flow.db.projects]);
  useEffect(() => {
    const syncHash = () => setWidgets(window.location.hash === '#/widgets');
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);
  const changeView = next => guard(() => { setReturnStack([]); setReviewScope('all'); setRightPanel(false); setView(next); if (next === 'projects') setProjectLevel('overview'); if (next === 'review') setReviewLevel('center'); });
  const openTask = (projectId, taskId) => guard(() => { if (view !== 'projects' || projectLevel !== 'task' || flow.active.task?.id !== taskId) rememberLocation(); setRightPanel(false); flow.selectPath({ projectId, taskId }); setView('projects'); setProjectLevel('task'); });
  const openProject = projectId => guard(() => { if (view !== 'projects' || projectLevel !== 'detail' || flow.active.project?.id !== projectId) rememberLocation(); setRightPanel(false); flow.chooseProject(projectId); setView('projects'); setProjectLevel('detail'); });
  const openReviewCenter = (scope = 'all') => guard(() => { if (reviewLevel !== 'center' || reviewScope !== scope) rememberLocation(); if (scope !== 'all') flow.chooseProject(scope); setRightPanel(false); setReviewScope(scope); setReviewLevel('center'); });
  const openReview = (projectId = flow.active.project?.id, taskId = flow.active.task?.id, versionId = flow.active.version?.id) => guard(() => {
    if (view !== 'review' || reviewLevel !== 'workspace' || flow.active.task?.id !== taskId) rememberLocation();
    setRightPanel(false);
    const project = flow.db.projects.find(item => item.id === projectId);
    const task = project?.tasks.find(item => item.id === taskId);
    const version = task?.versions.find(item => item.id === versionId) || task?.versions.at(-1);
    const list = version?.lists.find(item => item.id === flow.active.list?.id) || version?.lists.find(item => item.items.some(feedback => !feedback.done)) || version?.lists.at(-1);
    flow.selectPath({ projectId, taskId, versionId: version?.id, listId: list?.id });
    setView('review');
    setReviewLevel('workspace');
  });
  const contextProjectId=view==='projects'&&projectLevel!=='overview'?flow.active.project?.id:view==='review'?(reviewLevel==='workspace'?flow.active.project?.id:reviewScope!=='all'?reviewScope:undefined):undefined;
  const contextTask=view==='projects'&&projectLevel==='task'||view==='review'&&reviewLevel==='workspace'?flow.active.task:undefined;
  const openNewProject=(date='')=>guard(()=>setCreation({mode:'project',date:typeof date==='string'?date:'',originSelection:{...flow.selection}}));
  const openNewTask=(date='',projectId=contextProjectId,video=view==='review')=>guard(()=>setCreation({mode:'task',date:typeof date==='string'?date:'',projectId,video,originSelection:{...flow.selection}}));
  const openVersion=(projectId=flow.active.project?.id,taskId=flow.active.task?.id,versionId=flow.active.version?.id)=>guard(()=>{if(taskId)setVersionDialog({projectId,taskId,versionId});});
  const created=(result)=>{
    if(creation.mode==='project'){
      if(view==='projects'){setProjectLevel('detail');setRightPanel(false);}else flow.selectPath(creation.originSelection);
      notify('项目已创建','ok',{label:'查看',run:()=>openProject(result.id)});
    }else{
      const target={projectId:result.projectId,taskId:result.task.id,versionId:result.task.versions.at(-1)?.id,token:Date.now()};
      setCreatedTarget(target);
      if(view==='projects'){setProjectLevel('task');setRightPanel(false);}
      if(view==='review'&&reviewLevel==='workspace')flow.selectPath(creation.originSelection);
      notify('任务已创建；若当前筛选下不可见，可点击查看','ok',{label:'查看',run:()=>view==='review'&&result.task.type==='视频'?openReview(target.projectId,target.taskId,target.versionId):openTask(target.projectId,target.taskId)});
    }
  };
  const versionCreated=version=>{setCreatedTarget({...versionDialog,versionId:version.id,token:Date.now()});notify('已创建版本 '+version.name,'ok',view==='review'&&reviewLevel==='center'?{label:'进入审阅',run:()=>openReview(versionDialog.projectId,versionDialog.taskId,version.id)}:undefined);};
  const openWidget=()=>window.creativeFlowWindow?.openWidget?window.creativeFlowWindow.openWidget():window.location.hash='#/widgets';
  const menuItems=[
    {heading:'创建'},
    {label:'新建项目',icon:'folder',action:()=>openNewProject()},
    {label:'新增任务',icon:'plus',detail:contextProjectId?flow.db.projects.find(p=>p.id===contextProjectId)?.name:'创建时选择所属项目',action:()=>openNewTask(view==='today'?dateKey():'')},
    {label:'新增版本',icon:'video',disabled:!contextTask,detail:contextTask?.name,hint:contextTask?'为当前任务建立版本':'请先打开一个具体任务',action:()=>openVersion()},
    {heading:'编辑'},
    {label:'撤销',icon:'undo',disabled:!flow.history.past.length,detail:flow.history.past.at(-1)?.label,shortcut:'Ctrl+Z',action:()=>travel('undo')},
    {label:'重做',icon:'redo',disabled:!flow.history.future.length,detail:flow.history.future.at(-1)?.label,shortcut:'Ctrl+Shift+Z',action:()=>travel('redo')},
    {heading:'数据'},
    {label:'导出备份',icon:'download',action:backups.exportData},
    {label:'导入备份',icon:'upload',action:()=>guard(backups.importData)},
    {heading:'窗口与应用'},
    {label:'显示桌面小组件',action:openWidget},
    {label:'隐藏到系统托盘',disabled:!window.creativeFlowWindow?.hideToTray,action:()=>window.creativeFlowWindow.hideToTray()},
    {label:'设置',icon:'settings',action:()=>changeView('settings')},
    {label:'快捷键说明',action:()=>setInfo('shortcuts')},
    {label:'关于创作流',action:()=>setInfo('about')},
    {label:'退出应用',disabled:!window.creativeFlowWindow?.quit,action:()=>guard(()=>window.creativeFlowWindow.quit())}
  ];
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
  if (widgets) return <ColorProvider flow={flow}><WidgetPreview flow={flow} onTravel={travel} onGuardChange={setReviewGuard}/>{toast?<div className={`toast ${toast.type}`} role="status">{toast.message}</div>:null}</ColorProvider>;
  return <ColorProvider flow={flow}><div className="app">
    <TitleBar query={query} setQuery={setQuery} flow={flow} onProject={openProject} onTask={openTask} menuItems={menuItems} onClose={()=>guard(()=>window.creativeFlowWindow?.close())} />
    <NavRail view={view} setView={changeView} />
    <div className="app-content">
      {view === 'projects' ? <ProjectExplorer flow={flow} query={query} onNewProject={openNewProject} onNewTask={() => openNewTask('',flow.active.project?.id)} onProject={openProject} onTask={openTask} /> : null}
      {view === 'review' ? <ReviewExplorer flow={flow} query={query} onOpen={openReview} onProject={openReviewCenter} /> : null}
      <section className="main-surface">
        <div className="workspace-path"><Breadcrumbs items={pathItems}/><HistoryButtons flow={flow} onTravel={travel}/><Button className="workspace-back" icon="left" aria-label="返回上一页" title={returnStack.length ? '返回来源页面' : canGoBack ? '返回上一级' : '暂无上一页'} disabled={!canGoBack} onClick={goBack}>返回</Button></div>
        <div className="workspace-content">
        {view === 'projects' && projectLevel === 'overview' ? <ProjectOverview flow={flow} onNewProject={openNewProject} onProjectDetail={() => enterProjectLevel('detail')} onTask={() => enterProjectLevel('task')} /> : null}
        {view === 'projects' && projectLevel === 'detail' ? <ProjectDetail flow={flow} onOverview={() => setProjectLevel('overview')} onTask={() => enterProjectLevel('task')} onNewTask={() => openNewTask('',flow.active.project?.id)} /> : null}
        {view === 'projects' && projectLevel === 'task' ? <TaskWorkspace flow={flow} rightPanel={rightPanel} setRightPanel={setRightPanel} openVersion={() => openVersion()} toast={notify} onOverview={() => setProjectLevel('overview')} onProjectDetail={() => setProjectLevel('detail')} onReview={() => openReview()} /> : null}
        {view === 'review' && reviewLevel === 'center' ? <ReviewCenter key={reviewScope} onAll={()=>setReviewScope('all')} scope={reviewScope} flow={flow} onOpen={openReview} onAddVersion={openVersion} onNewTask={projectId=>openNewTask('',projectId,true)} onNewProject={()=>openNewProject()} createdTarget={createdTarget} /> : null}
        {view === 'review' && reviewLevel === 'workspace' ? <ReviewWorkspace flow={flow} onGuardChange={setReviewGuard} onAddVersion={()=>openVersion()} onNewTask={()=>openNewTask()} onNewProject={()=>openNewProject()} onBack={() => { setReviewScope('all'); setReviewLevel('center'); }} onProject={id => { setReviewScope(id); setReviewLevel('center'); }} toast={notify} /> : null}
        {view === 'today' ? <TodayView flow={flow} onNewTask={()=>openNewTask(dateKey(),undefined,false)} onNewProject={openNewProject} onOpenTask={openTask} /> : null}
        {view === 'calendar' ? <CalendarView flow={flow} onNewProject={openNewProject} onNewTask={(date,projectId)=>openNewTask(date,projectId,false)} onOpenTask={openTask} onOpenProject={openProject} /> : null}
        {view === 'feedback' ? <FeedbackCenter flow={flow} onOpenTask={openTask} /> : null}
        {view === 'settings' ? <SettingsView flow={flow} toast={notify} /> : null}
        </div>
      </section>
    </div>
    <footer className="statusbar"><span>本地自动保存</span><span>{flow.db.projects.length} 个项目</span><span className="saved"><Icon name="check" size={14} />{flow.saveStatus}</span></footer>
    <input ref={backups.inputRef} hidden type="file" accept=".json" onChange={backups.receive}/>
    {creation?<CreationDialog request={creation} flow={flow} onClose={()=>setCreation(null)} onCreated={created}/>:null}
    {versionDialog?<VersionDialog request={versionDialog} flow={flow} onClose={()=>setVersionDialog(null)} onCreated={versionCreated}/>:null}
    {info?<Modal title={info==='about'?'关于创作流':'快捷键说明'} onClose={()=>setInfo(null)} footer={<Button onClick={()=>setInfo(null)}>知道了</Button>}>{info==='about'?<p>创作流 · CreativeFlow {APP_VERSION}<br/>面向视频创作者的个人项目、计划与审阅工作台。</p>:<div className="shortcut-guide"><p><kbd>Ctrl+Z</kbd> 撤销上一次工作数据操作</p><p><kbd>Ctrl+Shift+Z</kbd> 重做已撤销的操作</p><p>编辑文字时，快捷键优先处理输入框内的文字。弹窗打开时不会撤销外部工作数据。</p><p>保留本次运行中最近最多 50 次操作；大型操作会受容量限制。退出后清空历史，已保存的数据保留。导入备份或恢复示例会清空历史。</p><p>审阅视频：Space 播放/暂停 · M 添加意见 · ← / → 前后 5 秒。Ctrl+Enter 保存意见，Esc 取消，意见列表中 Delete 删除选中项。</p></div>}</Modal>:null}
    {flow.deletedItem ? <div className="undo-notice" role="status">修改意见已删除 <Button onClick={flow.undoDeleteItem}>撤销</Button></div> : null}
    {toast ? <div className={`toast ${toast.type}`}><Icon name={toast.type === 'ok' ? 'check' : 'close'} />{toast.message}{toast.action?<Button onClick={()=>{toast.action.run();setToast(null);}}>{toast.action.label}</Button>:null}</div> : null}
  </div></ColorProvider>;
}
