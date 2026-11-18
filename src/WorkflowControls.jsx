import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon } from './ui';

export function PopupMenu({label,icon='more',children,items,className=''}) {
  const [open,setOpen]=useState(false),[position,setPosition]=useState({});
  const trigger=useRef(),menu=useRef();
  const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
  useEffect(()=>{if(!open)return;
    const place=()=>{const rect=trigger.current.getBoundingClientRect();const width=Math.min(310,window.innerWidth-24);setPosition({left:Math.min(Math.max(12,rect.left),window.innerWidth-width-12),top:rect.bottom+6,width,maxHeight:Math.max(120,window.innerHeight-rect.bottom-18)});};place();
    const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))close();};
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);window.addEventListener('resize',place);
    requestAnimationFrame(()=>menu.current?.querySelector('button:not(:disabled)')?.focus());
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',place);};
  },[open]);
  return <><Button className={'menu-trigger '+className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={e=>{trigger.current=e.currentTarget;setOpen(v=>!v);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();trigger.current=e.currentTarget;setOpen(true);}}} icon={icon}>{children}</Button>{open?createPortal(<div ref={menu} className="workflow-menu" style={position} role="menu" aria-label={label} onKeyDown={e=>{const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Tab')close();}}>{items.map((item,index)=>item.heading?<div className="menu-group-label" key={index}>{item.heading}</div>:<button key={index} role="menuitem" disabled={item.disabled} title={item.hint} onClick={()=>{close(true);item.action();}}><span>{item.icon?<Icon name={item.icon}/>:null}{item.label}</span>{item.shortcut?<kbd>{item.shortcut}</kbd>:null}{item.detail?<small>{item.detail}</small>:null}</button>)}</div>,document.body):null}</>;
}
export function CreateActions({onTask,onProject,review=false}) {
  return <div className="create-actions"><Button variant="primary" icon="plus" onClick={onTask}>{review?'新增视频任务':'新增任务'}</Button><PopupMenu label="更多创建操作" icon="down" items={[{label:'新建项目',icon:'folder',action:onProject}]}/></div>;
}
export function HistoryButtons({flow,onTravel}) {
  const undo=flow.history.past.at(-1)?.label,redo=flow.history.future.at(-1)?.label;
  return <div className="history-buttons" aria-label="撤销与重做"><Button icon="undo" aria-label="撤销操作" disabled={!undo} title={undo?`撤销：${undo} · Ctrl+Z`:'暂无可撤销操作'} onClick={()=>onTravel('undo')}/><Button icon="redo" aria-label="重做操作" disabled={!redo} title={redo?`重做：${redo} · Ctrl+Shift+Z`:'暂无可重做操作'} onClick={()=>onTravel('redo')}/></div>;
}
export function useWorkShortcuts(onTravel) {
  const callback=useRef(onTravel);callback.current=onTravel;
  useEffect(()=>{const key=e=>{
    if(e.defaultPrevented||e.isComposing||!(e.ctrlKey||e.metaKey)||e.altKey||e.key.toLowerCase()!=='z')return;
    const target=e.target;
    if(target?.closest?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"], [role="textbox"]'))return;
    // A modal owns its unfinished form; work-data undo must not change its context.
    if(document.querySelector('[role="dialog"]'))return;
    e.preventDefault();callback.current(e.shiftKey?'redo':'undo');
  };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
}
