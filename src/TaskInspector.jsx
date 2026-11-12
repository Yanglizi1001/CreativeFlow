import { DateFields } from './Schedule';
import { ColorPicker } from './ColorPicker';
import { defaultTaskColor } from './colors';
import React from 'react';
import { AcrylicSelect, Button, Icon, StatusTag, useEscape } from './ui';

export function TaskInspector({ flow, onClose, onProject, onBack }) {
  const { project, task } = flow.active;
  useEscape(onClose);
  const stages = [...new Set(['前期策划', '中期拍摄', '后期制作', '修改中', '内部审核', '客户审核', '已交付', ...(flow.db.preferences?.customOptions?.taskStages || [])])];
  const update = (key, value, label) => {
 if(['start','due'].includes(key)) {
   const next={...task,[key]:value};
   if(next.start && next.due && next.start>next.due){alert('开始日期不能晚于截止日期');return;}
   if((next.start && project.start && next.start<project.start)||(next.due && project.due && next.due>project.due)) {
     if(!confirm('任务超出项目周期，是否扩展项目周期并保存？'))return;
     flow.updateProjectAt(project.id,p=>({...p,start:next.start&&(!p.start||next.start<p.start)?next.start:p.start,due:next.due&&(!p.due||next.due>p.due)?next.due:p.due,tasks:p.tasks.map(t=>t.id===task.id?next:t)}),'扩展项目周期并更新任务日期');return;
   }
 }
 flow.updateTask(current => ({ ...current, [key]: value }), '更新任务「'+task.name+'」的'+label);
};
  return <><button className="drawer-scrim" aria-label="关闭任务详情" onClick={onClose} /><aside className="detail-panel context-drawer"><header><h2>任务详情</h2><div className="detail-header-actions">{onBack?<button aria-label="返回上一详情" title="返回上一详情" onClick={onBack}><Icon name="left"/></button>:null}<button aria-label="关闭" onClick={onClose}><Icon name="close" /></button></div></header><div className="detail-form"><label>任务名称<input key={task.id} defaultValue={task.name} onBlur={event => { const name = event.target.value.trim(); if (name && name !== task.name) update('name', name, '名称'); }} /></label><label>任务颜色<ColorPicker key={task.id} label="任务颜色" value={task.color} defaultColor={defaultTaskColor(task)} resetLabel="恢复默认颜色" preview={task.name} onChange={color=>update('color',color||defaultTaskColor(task),'颜色')}/><small className="color-help">仅调整这个任务在日历、甘特图和小组件中的颜色。</small></label><label>所属项目<Button onClick={onProject}>{project.name} · 查看项目</Button></label><DateFields entry={task} onChange={(key,value)=>update(key,value,key==='start'?'开始日期':'截止日期')}/><label>任务阶段<AcrylicSelect value={task.status} options={stages} label="任务阶段" creatable onCreate={value=>{flow.addCustomOption('taskStages',value);update('status',value,'阶段');}} onChange={value => update('status', value, '阶段')} renderValue={value => <StatusTag value={value} />} /></label><label>任务类型<AcrylicSelect value={task.type} options={[...new Set(['视频', '图片', 'PPT', ...(flow.db.preferences?.customOptions?.projectTypes || [])])]} label="任务类型" creatable onCreate={value=>{flow.addCustomOption('projectTypes',value);update('type',value,'类型');}} onChange={value => update('type', value, '类型')} /></label><label>任务备注<textarea defaultValue={task.notes || ''} placeholder="输入备注，离开输入框自动保存" onBlur={e=>{if(e.target.value!==(task.notes || ''))update('notes',e.target.value,'备注');}}/></label></div></aside></>;
}
