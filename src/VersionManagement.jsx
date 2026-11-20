import React,{useState} from 'react';
import {Button,Modal} from './ui';
import {can} from './collaboration/permissions';
import {versionSignature} from './versionLifecycle.mjs';
const clean=e=>String(e.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
export function DeleteVersionDialog({flow,target,onClose,onDeleted}){
 const [expected,setExpected]=useState(target.signature),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const project=flow.db.projects.find(p=>p.id===target.projectId),task=project?.tasks.find(t=>t.id===target.taskId),version=task?.versions.find(v=>v.id===target.versionId);
 const changed=!!version&&expected!==versionSignature(version),opinions=version?.lists.flatMap(l=>l.items)||[];
 const enabled=!!version&&can(flow,version,'manage')&&(!flow.space||flow.sync?.online&&!flow.sync?.pendingCount&&!flow.sync?.conflicts?.length);
 async function remove(){if(busy)return;if(changed){setExpected(versionSignature(version));setError('');return;}setBusy(true);setError('');try{await flow.deleteVersion({...target,signature:expected});onDeleted();onClose();}catch(e){setError(clean(e));}finally{setBusy(false);}}
 return <Modal title={`删除版本「${version?.name||target.name}」`} onClose={busy?()=>{}:onClose} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button className="danger-confirm" disabled={busy||!enabled} onClick={remove}>{busy?'正在确认删除…':changed?'重新核对删除信息':'删除版本'}</Button></>}>
  <p><strong>{project?.name||target.projectName} / {task?.name||target.taskName}</strong></p>
  {version?<><p>将移除此版本的审阅记录、{version.lists.length} 个意见列表及 {opinions.length} 条修改意见，其中 {opinions.filter(i=>!i.done).length} 条未完成。</p><p>{flow.space?'对所有成员生效。版本和协作视频引用保留在回收站，恢复时保留权限；回收站中的视频仍占用空间。':'版本移入本机回收站，退出软件后仍可恢复，也可使用 Ctrl+Z 撤销。'}</p><p>本地原视频和共享盘原文件不会被删除。</p>{task.versions.length===1?<p className="form-hint">{flow.space?'这是当前可见的最后一个版本。':'这是最后一个版本。'}删除后任务与日历排期保留，可随时建立新版本。</p>:<p className="form-hint">删除当前版本后，切换到最新的剩余版本；删除其他版本不打断当前审阅。</p>}</>:<p role="alert">该版本已删除或已无权访问，请关闭后重新选择。</p>}
  {changed?<p className="form-error" role="alert">版本或修改意见已更新。请核对上方最新数量，点击“重新核对删除信息”后再次确认。</p>:null}
  {version&&!can(flow,version,'manage')?<p className="form-error">需要此版本的“可管理”权限。</p>:null}
  {flow.space&&(!flow.sync?.online||flow.sync?.pendingCount>0||flow.sync?.conflicts?.length>0)?<p className="form-error">请连接主机并完成待同步修改、处理冲突后再删除。此操作不会排入离线队列。</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
 </Modal>;
}
export function VersionTrash({flow,onBusyChange,blocked=false}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 async function load(){setBusy(true);onBusyChange?.(true);setError('');try{setRows(await flow.listDeletedVersions());setLoaded(true);}catch(e){setError(clean(e));}finally{setBusy(false);onBusyChange?.(false);}}
 React.useEffect(()=>{void load();},[flow.space?.id,flow.db.versionTrash]);
 async function restore(row){setBusy(true);onBusyChange?.(true);setError('');try{await flow.restoreVersion(row.id);setRows(await flow.listDeletedVersions());}catch(e){setError(clean(e));}finally{setBusy(false);onBusyChange?.(false);}}
 return <section><div className="section-heading"><h3>版本回收站</h3><Button disabled={busy||blocked} onClick={load}>刷新版本回收站</Button></div><p>恢复版本、意见及视频关联。协作恢复保留原成员权限，并重新检查当前身份；原文件不会被删除。</p>{rows.map(row=><div className="permission-member" key={row.id}><span><strong>{row.name}</strong><small>{row.projectName} / {row.taskName}</small><small>{new Date(row.deletedAt).toLocaleString('zh-CN')} · {row.deletedBy}</small>{row.reason?<small>{row.reason}</small>:null}</span><Button disabled={busy||blocked||!row.canRestore} onClick={()=>restore(row)}>恢复版本</Button></div>)}{loaded&&!rows.length?<p>没有可查看的已删除版本。</p>:null}{error?<p role="alert" className="form-error">{error}</p>:null}</section>;
}
