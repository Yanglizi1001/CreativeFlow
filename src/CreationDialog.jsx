import React, { useRef, useState } from 'react';
import { AcrylicSelect, Button, Check, Modal, StatusTag } from './ui';
import { dateKey } from './dates';

function FileChoice({file,onChange}) {
  const input=useRef(),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const choose=async()=>{setError('');setPending(true);try{if(window.creativeFlowWindow?.selectFile){const selected=await window.creativeFlowWindow.selectFile();if(selected)onChange(selected);}else input.current.click();}catch{setError('文件选择未完成，请重试。');}finally{setPending(false);}};
  return <><div className="creation-file"><Button icon="upload" disabled={pending} onClick={choose}>选择文件</Button><span title={file?.name}>{file?.name || '可稍后关联视频文件'}</span>{file?<Button aria-label="移除待关联文件" icon="close" onClick={()=>onChange(null)}/>:null}<input ref={input} hidden type="file" accept="video/*" onChange={e=>{const selected=e.target.files?.[0];if(selected)onChange({name:selected.name,path:selected.path||'',size:(selected.size/1048576).toFixed(1)+' MB'});}}/></div>{error?<p className="form-error" role="alert">{error}</p>:null}</>;
}
export function CreationDialog({request,flow,onClose,onCreated}) {
  const [form,setForm]=useState({name:'',taskName:'',type:'视频',start:request.date||'',due:request.date||dateKey(),description:'',status:'前期策划',projectStatus:'计划中',projectId:request.projectId||'',file:null});
  const [nested,setNested]=useState(false),[nestedName,setNestedName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  const project=flow.db.projects.find(p=>p.id===form.projectId),isProject=request.mode==='project';
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  const options=(base,kind)=>[...new Set([...base,...(flow.db.preferences?.customOptions?.[kind]||[])])];
  const close=()=>{if(!pending.current)onClose();};
  const submit=async event=>{
    event.preventDefault();if(pending.current)return;setError('');
    const name=(nested?nestedName:form.name).trim();if(!name)return;
    if(!nested&&!isProject&&!project){setError('请选择所属项目，或先新建项目。');return;}
    if(!nested&&form.start&&form.due&&form.start>form.due){setError('开始日期不能晚于截止日期');return;}
    if(!nested&&!isProject&&((form.start&&project.start&&form.start<project.start)||(form.due&&project.due&&form.due>project.due))&&!confirm('任务超出项目周期，是否扩展项目周期并创建？'))return;
    pending.current=true;setBusy(true);
    try {
      if(nested){const created=await flow.addProject({name,empty:true,type:'视频',projectStatus:'计划中'});if(!created)throw Error();set('projectId',created.id);setNested(false);setNestedName('');}
      else {const result=isProject?await flow.addProject({...form,name}):await flow.addTask({...form,name});if(!result)throw Error();onCreated(result);onClose();}
    }catch{setError('创建未完成，请检查本地保存状态后重试。');}
    finally{pending.current=false;setBusy(false);}
  };
  return <Modal title={nested?'新建所属项目':isProject?'新建项目':request.video?'新增视频任务':'新增任务'} onClose={close} footer={<><Button disabled={busy} onClick={()=>nested?setNested(false):close()}>{nested?'返回任务':'取消'}</Button><Button disabled={busy} variant="primary" type="submit" form="creation-form">{busy?'正在创建…':'创建'}</Button></>}>
    <form id="creation-form" className="form-grid" onSubmit={submit}>
      {nested?<><label className="span-2">项目名称<input autoFocus required value={nestedName} onChange={e=>setNestedName(e.target.value)}/></label><p className="form-hint span-2">创建后返回当前任务，已填写内容会保留。新项目创建后会独立保存。</p></>:<>
        {!isProject?<div className="span-2 creation-project"><label>所属项目<AcrylicSelect value={form.projectId} label="所属项目" options={[{value:'',label:'请选择项目'},...flow.db.projects.map(p=>({value:p.id,label:p.name}))]} onChange={value=>set('projectId',value)}/></label><Button icon="plus" onClick={()=>setNested(true)}>新建项目</Button></div>:null}
        <label className="span-2">{isProject?'项目名称':'任务名称'}<input autoFocus required value={form.name} onChange={e=>set('name',e.target.value)} placeholder={isProject?'例如：新品宣传片':'例如：30 秒主宣传片'}/></label>
        {isProject?<label className="span-2">首个任务<input value={form.taskName} onChange={e=>set('taskName',e.target.value)} placeholder="例如：30 秒主宣传片"/></label>:null}
        <label className="span-2">类型<AcrylicSelect value={form.type} label="任务类型" options={options(['视频','图片','PPT'],'projectTypes')} creatable createLabel="输入新类型…" onCreate={value=>{flow.addCustomOption('projectTypes',value);set('type',value);}} onChange={value=>{set('type',value);if(value!=='视频')set('file',null);}}/></label>
        <label>开始日期<input type="date" value={form.start} max={form.due||undefined} onChange={e=>set('start',e.target.value)}/></label><label>截止日期<input type="date" value={form.due} min={form.start||undefined} onChange={e=>set('due',e.target.value)}/></label>
        {isProject?<><label className="span-2">项目状态<AcrylicSelect label="项目状态" value={form.projectStatus} options={options(['计划中','进行中','已暂停','已完成'],'projectStatuses')} creatable createLabel="输入新项目状态…" onCreate={value=>{flow.addCustomOption('projectStatuses',value);set('projectStatus',value);}} onChange={value=>set('projectStatus',value)}/></label><label className="span-2">项目说明<textarea value={form.description} onChange={e=>set('description',e.target.value)}/></label></>:<><label className="span-2">当前阶段<AcrylicSelect label="当前阶段" value={form.status} options={options(['前期策划','中期拍摄','后期制作','修改中','内部审核','客户审核'],'taskStages')} creatable createLabel="输入新任务阶段…" onCreate={value=>{flow.addCustomOption('taskStages',value);set('status',value);}} onChange={value=>set('status',value)}/></label>{form.type==='视频'?<div className="span-2"><span className="field-label">首个版本的视频（可选）</span><FileChoice file={form.file} onChange={value=>set('file',value)}/></div>:null}</>}
      </>}{error?<p className="form-error span-2" role="alert">{error}</p>:null}
    </form>
  </Modal>;
}
export function VersionDialog({request,flow,onClose,onCreated}) {
  const project=flow.db.projects.find(p=>p.id===request.projectId),task=project?.tasks.find(t=>t.id===request.taskId);
  const number=Math.max(0,...(task?.versions||[]).map(v=>Number.parseInt(v.name.replace(/\D/g,''),10)||0))+1;
  const [name,setName]=useState('V'+number),[inherit,setInherit]=useState(false),[source,setSource]=useState(request.versionId||task?.versions.at(-1)?.id||''),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false),close=()=>{if(!pending.current)onClose();};
  const submit=async event=>{event.preventDefault();if(pending.current)return;setError('');if(!task){setError('当前任务已不存在，请关闭后重新选择。');return;}if(task.versions.some(v=>v.name.trim().toLowerCase()===name.trim().toLowerCase())){setError('版本名称已存在，请使用其他名称。');return;}
    pending.current=true;setBusy(true);try{const version=await flow.addVersion({projectId:project.id,taskId:task.id,sourceVersionId:source,inherit,name,file});if(!version)throw Error();onCreated(version);onClose();}catch{setError('版本创建未完成，请重试。');}finally{pending.current=false;setBusy(false);}
  };
  return <Modal title="新增版本" onClose={close} footer={<><Button disabled={busy} onClick={close}>取消</Button><Button disabled={busy||!task} variant="primary" type="submit" form="version-form">{busy?'正在创建…':'创建版本'}</Button></>}><form id="version-form" className="form-grid" onSubmit={submit}>
    <div className="span-2 creation-context"><small>所属任务</small><strong>{project?.name} / {task?.name || '任务已删除'}</strong></div>
    <label className="span-2">版本名称<input autoFocus required value={name} onChange={e=>setName(e.target.value)} maxLength={60}/></label>
    <div className="span-2"><span className="field-label">新版本视频（可选）</span><FileChoice file={file} onChange={setFile}/></div>
    <label className="span-2 inherit-choice"><Check checked={inherit} onChange={e=>setInherit(e.target.checked)} label="继承未完成意见"/>继承未完成意见</label>
    {inherit?<label className="span-2">继承来源<AcrylicSelect label="继承来源版本" value={source} options={(task?.versions||[]).map(v=>({value:v.id,label:v.name}))} onChange={setSource}/></label>:null}
    <p className="form-hint span-2">{inherit?'仅复制所选版本的未完成意见；新旧版本各自独立。':'默认建立空版本，不复制旧版本的文件和意见。'}创建后仍停留在当前界面。</p>
    {error?<p className="form-error span-2" role="alert">{error}</p>:null}
  </form></Modal>;
}
