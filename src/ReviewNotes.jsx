import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Check, Icon, Modal, StatusTag } from './ui';
import { isGeneralOpinion, orderedOpinions, opinionPayload } from './opinions';
import {can,canEditOpinion} from './collaboration/permissions';
import {usePersistentDraft} from './collaboration/drafts';

export const ReviewNotes=forwardRef(function ReviewNotes({flow,project,task,version,current,duration,formatTime,selected,onSelect,onGuardChange,toast},ref){
  const [editor,setEditor,draftError]=usePersistentDraft(`review:${flow.space?.id||'personal'}:${version.id}`);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[context,setContext]=useState(null);
  const textarea=useRef(),container=useRef(),menu=useRef(),saving=useRef(false);
  const activeList=flow.active.list || version.lists[0];
  const dirty=Boolean(editor&&(editor.id?editor.text!==editor.original.text||editor.time!==editor.original.time||editor.kind!==editor.original.kind:editor.text.trim()));
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const editorRef=useRef(editor);editorRef.current=editor;
  const guard=(action,onCancel)=>{setContext(null);if(saving.current){onCancel?.();return;}if(dirtyRef.current)setPending({run:action,cancel:onCancel});else{setEditor(null);setError('');action();}};
  const focus=()=>requestAnimationFrame(()=>{textarea.current?.focus();textarea.current?.closest('form')?.scrollIntoView({block:'nearest'});});
  const startNew=time=>{if(!can(flow,version,'comment')){toast('当前版本为仅查看权限，不能添加批注','error');return;}guard(()=>{setEditor({id:null,listId:activeList?.id,kind:'time',time:formatTime(time),text:'',autoTime:true});setError('');focus();});};
  const edit=(list,item)=>{if(!canEditOpinion(flow,version,item)){onSelect(list.id,item);return;}guard(()=>{const original={text:item.text,time:item.time||'',kind:isGeneralOpinion(item)?'general':'time'};onSelect(list.id,item);setEditor({id:item.id,listId:list.id,...original,original});setError('');focus();});};
  const locate=(listId,item)=>guard(()=>onSelect(listId,item));
  const cancel=()=>guard(()=>{setEditor(null);setError('');});
  const save=async(closeAfter=false)=>{
    const value=editorRef.current;if(!value||saving.current)return false;
    if(value.id&&!dirtyRef.current){setEditor(null);return true;}
    const parsed=opinionPayload(value.kind,value.text,value.time,duration);if(parsed.error){setError(parsed.error);focus();return false;}
    const currentList=version.lists.find(l=>l.id===value.listId);
    if(value.id&&!currentList?.items.some(i=>i.id===value.id)){setError('该意见已被删除，请取消后重新选择。');return false;}
    saving.current=true;setBusy(true);setError('');
    try{
      let result;
      if(value.id)result=await flow.editItemAt(project.id,task.id,version.id,value.listId,value.id,parsed.value,{text:value.original.text,time:value.original.time});
      else result=await flow.addReviewItem(project.id,task.id,version.id,value.listId,parsed.value.text,parsed.value.time);
      if(result===null||value.id&&result===undefined)throw Error('意见已在其他窗口改变，请保留草稿核对');
      if(value.id||closeAfter)setEditor(null);else{setEditor({...value,text:'',time:formatTime(current),autoTime:true,listId:result?.listId||value.listId});focus();}
      dirtyRef.current=false;toast(value.id?'修改意见已保存':'修改意见已添加');return true;
    }catch{setError('未能保存，请重试。');return false;}finally{saving.current=false;setBusy(false);}
  };
  const remove=(list,item)=>{if(!canEditOpinion(flow,version,item))return;guard(async()=>{const result=await flow.removeItemAt(project.id,task.id,version.id,list.id,item.id);if(result!==null){setEditor(null);onSelect(null,null);toast('修改意见已删除，可使用 Ctrl+Z 撤销');}});};
  useImperativeHandle(ref,()=>({startNew,guard,locate}),[editor,activeList,current,version,dirty,busy]);
  // The parent uses this stable bridge for navigation, version changes and app actions.
  const guardRef=useRef(guard);guardRef.current=guard;
  useEffect(()=>{onGuardChange?.((action,cancel)=>guardRef.current(action,cancel));return()=>onGuardChange?.(null);},[onGuardChange]);
  useEffect(()=>{setEditor(value=>value&&!value.id&&value.autoTime&&value.kind==='time'&&!value.text.trim()&&value.time!==formatTime(current)?{...value,time:formatTime(current)}:value);},[current]);
  useEffect(()=>{if(!editor)return;const resized=()=>requestAnimationFrame(()=>textarea.current?.closest('form')?.scrollIntoView({block:'nearest'}));window.addEventListener('resize',resized);return()=>window.removeEventListener('resize',resized);},[Boolean(editor)]);
  useEffect(()=>{if(!editor)return;const item=version.lists.find(l=>l.id===editor.listId)?.items.find(i=>i.id===editor.id);if(editor.id&&!item){if(dirtyRef.current)setError('该意见已删除或访问权限已改变，草稿已保留，请复制后取消编辑。');else{setEditor(null);setError('');}}},[version.lists]);
  useEffect(()=>{const key=e=>{if(e.defaultPrevented||document.querySelector('[role="dialog"]'))return;if(e.key==='Escape'&&(editor||context)){e.preventDefault();e.stopPropagation();context?setContext(null):cancel();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[editor,context,dirty]);
  useEffect(()=>{if(!context)return;const outside=e=>{if(!menu.current?.contains(e.target))setContext(null);};document.addEventListener('pointerdown',outside);requestAnimationFrame(()=>menu.current?.querySelector('button')?.focus());return()=>document.removeEventListener('pointerdown',outside);},[context]);
  const rows=orderedOpinions(activeList?.items);
  return <>
    <div className="review-list-tabs">{version.lists.map(list=>{const done=list.items.filter(i=>i.done).length;return <button key={list.id} className={activeList?.id===list.id?'active':''} onClick={()=>guard(()=>flow.chooseList(list.id))}>{list.name}<em>{done}/{list.items.length}</em></button>;})}</div>
    <div className="review-note-list" ref={container} role="list" aria-label="修改意见列表" onClick={e=>{if(!e.target.closest('.review-note-row')&&!dirty&&!busy){setEditor(null);onSelect(null,null);}}} onKeyDown={e=>{if(e.key==='Delete'&&!document.querySelector('[role="dialog"]')&&e.target.closest('.review-note-row')&&!e.target.closest('input,textarea,button') ){const id=e.target.closest('.review-note-row').dataset.opinionId;const list=activeList,item=list?.items.find(i=>i.id===id);if(item){e.preventDefault();remove(list,item);}}}}>
      {rows.map((item,index)=><div role="listitem" tabIndex="0" data-opinion-id={item.id} key={item.id} onFocus={e=>{if(e.target===e.currentTarget)onSelect(activeList.id,item,false);}} className={`review-note-row ${item.done?'done':''} ${selected?.id===item.id?'selected':''}`} onClick={()=>edit(activeList,item)} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget){e.preventDefault();edit(activeList,item);}}} onContextMenu={e=>{e.preventDefault();const open=()=>{onSelect(activeList.id,item,false);setContext({item,list:activeList,x:Math.min(e.clientX,window.innerWidth-190),y:Math.min(e.clientY,window.innerHeight-95)});};if(editor?.id!==item.id&&dirty)guard(open);else open();}}>
        <span className="opinion-check" onClick={e=>e.stopPropagation()}><Check disabled={!canEditOpinion(flow,version,item)} checked={item.done} label={item.text} onChange={()=>{if(canEditOpinion(flow,version,item))flow.toggleItemAt(project.id,task.id,version.id,activeList.id,item.id);}}/></span><span>{index+1}</span>
        <button className={'review-opinion-time '+(isGeneralOpinion(item)?'general-opinion':'')} title={isGeneralOpinion(item)?'针对整部视频的意见':'定位视频时间'} onClick={e=>{e.stopPropagation();locate(activeList.id,item);}}>{item.time||'整体'}</button>
        <strong>{item.text}</strong><StatusTag value={item.done?'已完成':'未完成'} kind="opinion" compact/>
      </div>)}
      {!rows.length?<div className="inline-empty">当前列表还没有修改意见</div>:null}
    </div>
    {editor?<form className="review-add review-composer" onSubmit={e=>{e.preventDefault();save();}} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();save();}}}>
      <div className="composer-heading"><strong>{editor.id?'编辑修改意见':'新增修改意见'}</strong><small>{editor.id?'保存后同步到所有面板':'Ctrl+Enter 添加 · Esc 取消'}</small></div>
      <div className="composer-options"><div className="segmented" role="group" aria-label="意见类型">{[['time','时间点意见'],['general','整体意见']].map(([kind,label])=><button key={kind} type="button" aria-pressed={editor.kind===kind} className={editor.kind===kind?'active':''} onClick={()=>setEditor({...editor,kind,time:kind==='time'&&!editor.time?formatTime(current):editor.time})}>{label}</button>)}</div>{editor.kind==='time'?<label>时间码<input aria-label="意见时间码" value={editor.time} disabled={busy} onChange={e=>setEditor({...editor,time:e.target.value,autoTime:false})}/></label>:<small>针对整部视频，不绑定时间点</small>}</div>
      <textarea ref={textarea} aria-label="修改意见内容" placeholder="输入修改意见…" value={editor.text} disabled={busy} onChange={e=>setEditor({...editor,text:e.target.value})}/>
      {error||draftError?<p className="form-error" role="alert">{error||draftError}</p>:null}
      <div className="composer-footer"><Button disabled={busy} onClick={cancel}>取消</Button><Button disabled={busy||!editor.text.trim()} variant="primary" type="submit">{busy?'正在保存…':editor.id?'保存修改':'添加'}</Button></div>
    </form>:null}
    <p className="review-add-hint">点击正文编辑 · 右键编辑或删除 · 选中后 Delete 删除</p>
    {context?createPortal(<div className="opinion-context-menu workflow-menu" ref={menu} style={{left:Math.max(8,context.x),top:Math.max(8,context.y),width:180}} role="menu" aria-label="修改意见操作" onKeyDown={e=>{const buttons=[...menu.current.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}if(e.key==='Escape'){e.preventDefault();setContext(null);requestAnimationFrame(()=>container.current?.querySelector('[data-opinion-id="'+CSS.escape(context.item.id)+'"]')?.focus());}}}><button role="menuitem" disabled={!canEditOpinion(flow,version,context.item)} onClick={()=>edit(context.list,context.item)}><span><Icon name="edit"/>编辑</span></button><button role="menuitem" disabled={!canEditOpinion(flow,version,context.item)} onClick={()=>remove(context.list,context.item)}><span><Icon name="trash"/>删除</span><kbd aria-hidden="true">Delete</kbd></button></div>,document.body):null}
    {pending?<Modal title="有未保存的修改意见" onClose={()=>{pending.cancel?.();setPending(null);}} footer={<><Button onClick={()=>{pending.cancel?.();setPending(null);}}>继续编辑</Button><Button onClick={()=>{const action=pending.run;setPending(null);setEditor(null);dirtyRef.current=false;action();}}>放弃修改</Button><Button variant="primary" disabled={busy||!editor?.text.trim()} onClick={async()=>{const action=pending.run;if(await save(true)){setPending(null);action();}}}>保存并继续</Button></>}><p>当前修改尚未保存。请选择保存、放弃，或返回继续编辑。</p></Modal>:null}
  </>;
});
