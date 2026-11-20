import React, { useEffect, useRef, useState } from 'react';
import { HistoryButtons } from './WorkflowControls';
import { dateKey } from './dates';
import { projectColor, scheduleColor } from './colors';
import { overlaps, periodBounds } from './Schedule';
import { Button, Check, Icon, Mark, Modal, StatusTag } from './ui';
import {can,canEditOpinion} from './collaboration/permissions';
import {usePersistentDraft} from './collaboration/drafts';
export function WidgetPreview({flow,onTravel,onGuardChange,onSync}) {
 const [tab,setTab]=useState('plan'),[mode,setMode]=useState('week'),[closed,setClosed]=useState({}),[completed,setCompleted]=useState(new Set()),[today,setToday]=useState(dateKey());
 useEffect(()=>{const id=setInterval(()=>setToday(dateKey()),30000);return()=>clearInterval(id);},[]);
 const [editor,setEditor,draftError]=usePersistentDraft(`widget:${flow.space?.id||'personal'}:opinions`);
 const [storedError,setError]=useState(''),[pendingAction,setPendingAction]=useState(null),[busy,setBusy]=useState(false),[pinned,setPinned]=useState(true),[pinBusy,setPinBusy]=useState(false);
 const error=storedError||draftError;
 const textarea=useRef(),saving=useRef(false),guardRef=useRef();
 const dirty=Boolean(editor&&editor.text!==editor.original);
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const clearEditor=()=>{dirtyRef.current=false;setEditor(null);};
 const closeWindow=()=>window.creativeFlowWindow?.confirmWidgetClose?window.creativeFlowWindow.confirmWidgetClose():window.location.hash='';
 const guard=(action,onCancel)=>{if(saving.current){onCancel?.();return;}if(dirtyRef.current){const pending=()=>action();pending.cancel=onCancel;setPendingAction(()=>pending);}else{clearEditor();setError('');action();}};
 guardRef.current=guard;
 useEffect(()=>{onGuardChange?.((action,cancel)=>guardRef.current(action,cancel));return()=>onGuardChange?.(null);},[onGuardChange]);
 useEffect(()=>{
   const api=window.creativeFlowWindow;
   let alive=true;
   api?.getDesktopPreferences?.().then(p=>{if(alive)setPinned(p.widgetAlwaysOnTop!==false);}).catch(()=>{});
   const off=api?.onDesktopPreferencesChanged?.(p=>setPinned(p.widgetAlwaysOnTop!==false));
   const offClose=api?.onWidgetCloseRequested?.(()=>guardRef.current(closeWindow));
   return()=>{alive=false;off?.();offClose?.();};
 },[]);
 useEffect(()=>{if(editor){textarea.current?.focus();textarea.current?.scrollIntoView({block:'nearest'});}},[editor?.id]);
 const togglePin=async()=>{if(pinBusy)return;setPinBusy(true);try{const p=await window.creativeFlowWindow?.setDesktopPreferences?.({widgetAlwaysOnTop:!pinned});if(p)setPinned(p.widgetAlwaysOnTop);else setError('请在桌面应用中设置置顶。');}catch{setError('置顶设置未保存，请重试。');}finally{setPinBusy(false);}};
 const findItem=(db,e)=>db.projects.find(p=>p.id===e.projectId)?.tasks.find(t=>t.id===e.taskId)?.versions.find(v=>v.id===e.versionId)?.lists.find(l=>l.id===e.listId)?.items.find(i=>i.id===e.id);
 const edit=(project,task,version,list,item)=>{if(editor?.id===item.id||!canEditOpinion(flow,version,item))return;guard(()=>{setEditor({projectId:project.id,taskId:task.id,versionId:version.id,listId:list.id,id:item.id,original:item.text,text:item.text});setError('');});};
 const save=async()=>{
   if(!editor||saving.current)return false;
   if(!editor.text.trim()){setError('请输入修改意见。');textarea.current?.focus();return false;}
   saving.current=true;setBusy(true);setError('');
   try{
     const latest=await flow.flush(),item=findItem(latest,editor);
     if(!item){setError('该意见已在其他界面删除。请取消编辑，草稿可先复制保留。');return false;}
     if(item.text!==editor.original){setError('该意见已在其他界面更新。请复制草稿并取消，重新打开最新内容后编辑。');return false;}
     if(dirty){const result=await flow.editItemAt(editor.projectId,editor.taskId,editor.versionId,editor.listId,editor.id,{text:editor.text.trim()},editor.original);if(result===null){setError('保存失败，请重试。');return false;}if(result===undefined){setError('该意见已变化，请取消后重新打开。');return false;}}
     clearEditor();return true;
   }catch{setError('保存失败，请重试。');return false;}finally{saving.current=false;setBusy(false);}
 };
 const renderEditor=()=><form className="widget-opinion-editor" onSubmit={async e=>{e.preventDefault();await save();}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();guard(clearEditor);}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.requestSubmit();}}}><textarea ref={textarea} aria-label="修改意见内容" rows={3} value={editor.text} disabled={busy} onChange={e=>{setEditor(v=>({...v,text:e.target.value}));setError('');}}/><div><Button disabled={busy} onClick={()=>guard(clearEditor)}>取消</Button><Button variant="primary" disabled={busy} type="submit">{busy?'保存中…':'保存'}</Button></div></form>;
 const [start,end]=periodBounds(today,mode);
 const toggle=id=>guard(()=>setClosed(v=>({...v,[id]:!v[id]})));
 const pending=task=>task.versions.flatMap(version=>version.lists.flatMap(list=>list.items.filter(item=>!item.done||completed.has(item.id)||editor?.id===item.id).map(item=>({item,version,list}))));
 const projects=tab==='plan'?flow.db.projects.filter(p=>overlaps(p,start,end)||(p.due&&p.due<today&&p.status!=='已完成')):flow.db.projects.filter(p=>p.tasks.some(t=>pending(t).length));
 return <main className="widget-root"><section className="widget-surface"><header><span><Mark/><strong>创作流</strong></span>{onTravel?<HistoryButtons flow={flow} onTravel={onTravel}/>:null}<button className={`widget-pin ${pinned?'active':''}`} aria-label={pinned?'取消置顶':'置顶'} aria-pressed={pinned} title={pinned?'取消置顶':'置顶'} disabled={pinBusy} onClick={togglePin}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5-4 2-3 5-1 3-7-7 3-1 5-3zM9 15l-6 6"/></svg></button><button aria-label="关闭小组件" onClick={()=>guard(closeWindow)}><Icon name="close"/></button></header><nav>{[['plan','calendar','项目计划'],['feedback','comment','修改意见']].map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>guard(()=>setTab(id))}><Icon name={icon}/>{label}</button>)}</nav><div className="widget-toolbar">{tab==='plan'?<><div className="segmented">{[['month','月'],['week','周'],['day','日']].map(([id,label])=><button key={id} className={mode===id?'active':''} onClick={()=>setMode(id)}>{label}</button>)}</div><strong>{start} — {end}</strong></>:<><strong>待处理修改意见</strong><span>{flow.db.projects.reduce((n,p)=>n+p.tasks.reduce((n,t)=>n+pending(t).filter(r=>!r.item.done).length,0),0)} 项</span></>}</div>{error?<p className="widget-error" role="alert">{error}</p>:null}<div className="widget-groups">{editor&&!findItem(flow.db,editor)?<div className="widget-orphan-draft"><p>原意见已删除，草稿仍保留，可复制后取消。</p>{renderEditor()}</div>:null}{projects.map(project=>{
 const tasks=tab==='plan'?project.tasks:project.tasks.filter(t=>pending(t).length);const overdue=project.due&&project.due<today&&project.status!=='已完成';
 return <section className="widget-project-group" key={project.id}><button className="widget-group-title" style={{borderLeft:`3px solid ${projectColor(project)}`}} onClick={()=>toggle(project.id)}><Icon name={closed[project.id]?'right':'down'} size={15}/><strong>{project.name}</strong>{tab==='plan'?<StatusTag value={overdue?'已逾期':project.status} kind="project" compact/>:<small>{tasks.reduce((n,t)=>n+pending(t).filter(r=>!r.item.done).length,0)} 项未完成</small>}</button>{!closed[project.id]?<><p className="widget-period">{project.start || '未设开始日期'} → {project.due || '未设截止日期'}</p>{tasks.map(task=><section className="widget-task-group" key={task.id}>{tab==='plan'?<div className="widget-plan-task" style={{borderLeft:`3px solid ${scheduleColor({...task,project})}`,paddingLeft:8}}><Check disabled={!can(flow,task,'manage')} checked={task.status==='已交付'} label={task.name} onChange={()=>flow.updateProjectAt(project.id,p=>({...p,tasks:p.tasks.map(t=>t.id===task.id?{...t,status:t.status==='已交付'?'前期策划':'已交付'}:t)}),'修改了任务交付状态')}/><span><strong>{task.name}</strong><small>{task.start || '未设开始'} → {task.due || '未设截止'}</small></span><StatusTag value={task.status} compact/></div>:<><button className="widget-task-title" style={{borderLeft:`3px solid ${scheduleColor({...task,project})}`}} onClick={()=>toggle(task.id)}><Icon name={closed[task.id]?'right':'down'} size={13}/><strong>{task.name}</strong><StatusTag value={task.status} compact/><small>{pending(task).filter(r=>!r.item.done).length}</small></button>{!closed[task.id]?pending(task).map(({item,version,list})=><div key={item.id} className={`widget-feedback-row ${item.done?'done':''}`}><Check disabled={!canEditOpinion(flow,version,item)} checked={item.done} label={item.text} onChange={()=>{setCompleted(v=>new Set([...v,item.id]));flow.toggleItemAt(project.id,task.id,version.id,list.id,item.id);}}/><time>{item.time || '整体'}</time><span>{editor?.id===item.id?renderEditor():<strong className="widget-opinion-text" tabIndex={0} title="双击编辑修改意见" onDoubleClick={()=>edit(project,task,version,list,item)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();edit(project,task,version,list,item);}}}>{item.text}</strong>}<small>{version.name} · {list.name}</small></span></div>):null}</>}</section>)}{!tasks.length?<p className="inline-empty">项目暂无任务</p>:null}</>:null}</section>;
 })}{!projects.length?<p className="inline-empty">{tab==='plan'?'当前周期没有项目安排':'暂无待处理修改意见'}</p>:null}</div>{flow.space?<div className="widget-space-status"><span>{flow.space.name}</span><button className="sync-status-button" onClick={onSync}>{flow.saveStatus}</button></div>:null}</section>{pendingAction?<Modal title="有未保存的修改意见" onClose={()=>{pendingAction.cancel?.();setPendingAction(null);}} footer={<><Button disabled={busy} onClick={()=>{pendingAction.cancel?.();setPendingAction(null);}}>继续编辑</Button><Button disabled={busy} onClick={()=>{const action=pendingAction;setPendingAction(null);clearEditor();setError('');action();}}>放弃修改</Button><Button variant="primary" disabled={busy} onClick={async()=>{const action=pendingAction;if(await save()){setPendingAction(null);action();}else{pendingAction.cancel?.();setPendingAction(null);}}}>保存并继续</Button></>}><p>修改意见尚未保存，请选择如何处理。</p></Modal>:null}</main>;
}
