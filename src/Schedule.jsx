import React, { useEffect, useRef, useState } from 'react';
import { dateKey, parseDate, monthCells, weekBounds } from './dates';
import { Button, Icon, StatusTag } from './ui';
export function periodBounds(value,mode) {
  if(mode==='day')return [value,value];
  if(mode==='week')return weekBounds(value);
  const days=monthCells(value).filter(Boolean);return [days[0],days.at(-1)];
}
export const overlaps=(entry,start,end)=>Boolean(entry.due && (entry.start || entry.due)<=end && entry.due>=start);
export function DateFields({ entry, onChange }) {
  return <><label>开始日期<input aria-label="开始日期" type="date" value={entry.start || ''} max={entry.due || undefined} onChange={e=>onChange('start',e.target.value)}/></label><label>截止日期<input aria-label="截止日期" type="date" value={entry.due || ''} min={entry.start || undefined} onChange={e=>onChange('due',e.target.value)}/></label></>;
}
export function MonthCell({ day,tasks,selected,onDay,onDetail }) {
  // Reserve space for date and the more button. Two compact rows fit the minimum cell height.
  const visible=tasks.slice(0,2);
  return <div role={day?'button':undefined} tabIndex={day?0:undefined} className={`${day===dateKey()?'today':''} ${day===selected?'selected-day':''} ${!day?'outside':''}`} onClick={()=>day&&onDay(day)} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'&&day)onDay(day);}}><span>{day?Number(day.slice(-2)):''}</span><div className="calendar-cell-items">{visible.map(task=><button key={task.id} className="calendar-event" title={`${task.name} · ${task.project.name} · ${task.status}`} style={{'--task-color':task.project.color}} onClick={e=>{e.stopPropagation();onDetail(task);}}><strong>{task.name}</strong><span><StatusTag value={task.project.status} compact/><StatusTag value={task.status} compact/></span></button>)}</div>{tasks.length>2?<button className="calendar-more" onClick={e=>{e.stopPropagation();onDay(day);}}>还有 {tasks.length-2} 项</button>:null}</div>;
}
export function Gantt({projects,date,onProject,onTask,onOpenTask}) {
  const clickTimer=useRef();
  useEffect(()=>()=>clearTimeout(clickTimer.current),[]);
  const clickTask=(project,task)=>{clearTimeout(clickTimer.current);clickTimer.current=setTimeout(()=>onTask(project,task),240);};
  const enterTask=(project,task)=>{clearTimeout(clickTimer.current);onOpenTask(project.id,task.id);};
  const [zoom,setZoom]=useState('month'),[closed,setClosed]=useState({});
  const [start,end]=periodBounds(date,zoom);
  const days=[];for(let d=parseDate(start);dateKey(d)<=end;d.setDate(d.getDate()+1))days.push(dateKey(d));
  const cell=zoom==='week'?88:38;
  const rows=projects.filter(p=>overlaps(p,start,end)||p.tasks.some(t=>overlaps(t,start,end))).flatMap(project=>[{entry:project,project,isProject:true},...(closed[project.id]?[]:project.tasks.map(task=>({entry:task,project,isProject:false})))]);
  const offset=value=>Math.round((parseDate(value)-parseDate(start))/86400000);
  return <section className="gantt-section"><div className="gantt-tools"><span>项目周期与任务排期 · {start} — {end}</span><div className="segmented">{[['week','周'],['month','月']].map(([id,label])=><button key={id} className={zoom===id?'active':''} onClick={()=>setZoom(id)}>{label}</button>)}</div></div><div className="gantt-scroll"><div className="gantt-grid" style={{width:260+days.length*cell,gridTemplateColumns:`260px ${days.length*cell}px`}}><div className="gantt-name gantt-head">项目 / 任务</div><div className="gantt-dates" style={{gridTemplateColumns:`repeat(${days.length},${cell}px)`}}>{days.map(day=><span className={day===dateKey()?'is-today':([0,6].includes(parseDate(day).getDay())?'is-weekend':'')} key={day}>{day.slice(5)}</span>)}</div>{rows.map(({entry,project,isProject})=>{const from=entry.start||entry.due;const left=from?Math.max(0,offset(from)):0;const right=entry.due?Math.min(days.length-1,offset(entry.due)):-1;const show=from&&entry.due&&right>=left&&offset(from)<days.length;const open=()=>isProject?onProject(project):clickTask(project,entry);return <React.Fragment key={entry.id}><div className={`gantt-name ${isProject?'project':'task'}`}>{isProject?<button aria-label={`${closed[entry.id]?'展开':'折叠'} ${entry.name}`} onClick={()=>setClosed(v=>({...v,[entry.id]:!v[entry.id]}))}><Icon name={closed[entry.id]?'right':'down'} size={14}/></button>:null}<button onClick={open} onDoubleClick={()=>!isProject&&enterTask(project,entry)} title={entry.name}>{entry.name}</button><StatusTag value={isProject?project.status:entry.status} compact/></div><div className="gantt-track" style={{backgroundSize:`${cell}px 100%`}}>{days.map((day,index)=>[0,6].includes(parseDate(day).getDay())?<i key={day} className="gantt-weekend" style={{left:index*cell,width:cell}}/>:null)}{days.includes(dateKey())?<i className="gantt-today" style={{left:offset(dateKey())*cell+cell/2}}/>:null}{show?<button className={`gantt-bar ${isProject?'project':'task'} ${!entry.start?'milestone':''}`} style={{left:left*cell+3,width:Math.max(18,(right-left+1)*cell-6),background:project.color}} title={`${entry.name}\n${entry.start||'未设开始日期'} → ${entry.due}\n${entry.start?offset(entry.due)-offset(entry.start)+1+' 天':'截止日标记'}`} onClick={open} onDoubleClick={()=>!isProject&&enterTask(project,entry)}>{entry.name}</button>:<span className="gantt-unscheduled">{!entry.due?'未设置日期':'当前周期外'}</span>}</div></React.Fragment>;})}{!rows.length?<div className="inline-empty">当前周期没有项目安排</div>:null}</div></div></section>;
}
