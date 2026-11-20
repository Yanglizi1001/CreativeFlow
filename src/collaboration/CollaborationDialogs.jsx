import {VersionTrash} from '../VersionManagement';
import React,{useEffect,useState} from 'react';
import {Button,Modal} from '../ui';
import {PERMISSIONS,can} from './permissions';
import {readDrafts} from './drafts';
const api=()=>window.creativeFlowWindow.collaboration;
const fieldLabels={name:'名称',text:'意见内容',time:'时间点',done:'完成状态',status:'状态',type:'类型',description:'说明',notes:'备注',start:'开始日期',due:'截止日期',color:'颜色',defaultColor:'默认颜色',file:'视频文件',duration:'时长',customOptions:'自定义标签',tagColors:'标签颜色',archived:'归档状态',createdAt:'创建日期'};
const kindLabels={project:'项目',task:'任务',version:'视频版本',list:'意见清单',opinion:'修改意见',preferences:'空间设置'};
const text=value=>value===undefined||value===null?'未设置':typeof value==='boolean'?value?'是':'否':typeof value==='object'?value.source==='collaboration'?value.name:JSON.stringify(value,null,2):String(value);
export function PermissionDialog({flow,version,onClose}) {
  const [rows,setRows]=useState([]),[values,setValues]=useState({}),[busy,setBusy]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true;api().request(flow.space.id,'accessGet',{versionId:version.id}).then(data=>{if(live){setRows(data);setValues(Object.fromEntries(data.map(row=>[row.memberId,row.permission])));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[flow.space.id,version.id]);
  async function save(row) {
    setBusy(row.memberId);setError('');try{
      await api().request(flow.space.id,'accessSet',{versionId:version.id,memberId:row.memberId,permission:values[row.memberId],expectedPermission:row.permission});
      setRows(current=>current.map(item=>item.memberId===row.memberId?{...item,permission:values[row.memberId],effectivePermission:values[row.memberId]}:item));
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  return <Modal title={`版本成员权限 · ${version.name}`} onClose={busy?()=>{}:onClose} footer={<Button disabled={Boolean(busy)} onClick={onClose}>完成</Button>}>
    <p>权限只影响当前版本。空间所有者、项目创建者和版本创建者保留管理权限。未授权成员不能读取该版本的视频或意见。</p>
    <div className="permission-legend"><p><strong>仅查看</strong>：播放视频、阅读意见。</p><p><strong>可批注</strong>：另可添加、修改和删除自己的意见。</p><p><strong>可编辑</strong>：另可处理所有意见、修改版本、发布视频。</p><p><strong>可管理</strong>：另可分配成员权限、删除及恢复此版本。</p></div>
    <div className="permission-members">{rows.map(row=><div className="permission-member" key={row.memberId}><span><strong>{row.displayName}</strong><small>{row.role==='owner'?'空间所有者':row.role==='reviewer'?'审阅成员':'项目成员'}</small></span>{row.locked?<span>可管理 · 固定权限</span>:<><select aria-label={`${row.displayName}的版本权限`} disabled={Boolean(busy)} value={values[row.memberId]||'none'} onChange={e=>setValues({...values,[row.memberId]:e.target.value})}>{Object.entries(PERMISSIONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><Button disabled={Boolean(busy)||values[row.memberId]===row.permission} onClick={()=>save(row)}>{busy===row.memberId?'保存中…':'保存权限'}</Button></>}</div>)}</div>
    {error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}
export function MembersDialog({flow,onClose}) {
  const [name,setName]=useState(''),[role,setRole]=useState('reviewer'),[invitation,setInvitation]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const members=flow.sync?.data.members||[];
  async function invite(event){event.preventDefault();setBusy(true);setError('');try{setInvitation(await api().request(flow.space.id,'invite',{displayName:name.trim(),role}));}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function remove(member){if(!confirm(`移除“${member.displayName}”后，其所有设备将不能继续访问公司空间。确认移除？`))return;setBusy(true);setError('');try{await api().request(flow.space.id,'removeMember',{memberId:member.id});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function reinvite(member){setBusy(true);setError('');try{setInvitation(await api().request(flow.space.id,'memberInvite',{memberId:member.id}));}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="公司空间成员" onClose={busy?()=>{}:onClose} footer={<Button disabled={busy} onClick={onClose}>关闭</Button>}>
    <div className="permission-members">{members.map(member=><div className="permission-member" key={member.id}><span><strong>{member.displayName}</strong><small>{member.role==='owner'?'所有者':member.role==='reviewer'?'审阅成员':'项目成员'}</small></span>{flow.space.role==='owner'?<Button disabled={busy} onClick={()=>reinvite(member)}>新设备邀请码</Button>:null}{flow.space.role==='owner'&&member.role!=='owner'?<Button disabled={busy} onClick={()=>remove(member)}>移除成员</Button>:null}</div>)}</div>
    {flow.space.role==='owner'?<form className="space-join" onSubmit={invite}><h3>邀请同事</h3><label>同事姓名<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>成员类型<select aria-label="新成员类型" value={role} onChange={e=>setRole(e.target.value)}><option value="reviewer">审阅成员（按版本授权）</option><option value="member">项目成员（可建立项目）</option></select></label><Button variant="primary" type="submit" disabled={busy||!name.trim()}>生成一次性邀请码</Button></form>:<p>邀请码由空间所有者生成。加入空间后，仍需管理者为相应版本设置权限。</p>}
    {invitation?<div className="invitation-result"><label>一次性邀请码<input aria-label="生成的邀请码" value={invitation.invitationCode} readOnly onFocus={e=>e.target.select()}/></label><p>请让同事在“切换空间”中输入主机地址、邀请码和姓名。邀请码使用一次后失效，过期后请重新生成。</p></div>:null}
    {error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}
export function SyncDialog({flow,onClose}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const state=flow.sync;
  async function run(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!state)return null;
  const conflict=state.conflicts[0];
  const drafts=readDrafts(flow.space.id);
  return <Modal className="sync-dialog" title="协作同步中心" onClose={busy?()=>{}:onClose} footer={<><Button disabled={busy} onClick={()=>run(()=>api().exportPending(flow.space.id))}>导出离线草稿</Button><Button disabled={busy} onClick={()=>run(()=>api().sync(flow.space.id))}>立即同步</Button><Button disabled={busy} onClick={onClose}>关闭</Button></>}>
    <p role="status">{state.online?'已连接主机':'当前离线'} · {state.pendingCount} 项待同步 · {state.conflicts.length} 项冲突</p>
    <p>离线修改已保存在本机，关闭软件后仍保留，重连会继续同步。视频播放和权限管理需要连接主机。</p>
    {drafts.length?<section><h3>尚未提交的编辑草稿</h3><p>这些文字已自动保存在本机，但尚未点击保存，不会自动发给同事。</p>{drafts.map(draft=><div className="conflict-record" key={draft.key}><small>{draft.key.startsWith('widget:')?'小组件草稿':'审阅草稿'} · {new Date(draft.at).toLocaleString('zh-CN')}</small><pre style={{whiteSpace:'pre-wrap'}}>{draft.draft.text}</pre></div>)}<Button onClick={()=>run(()=>window.creativeFlowWindow.exportBackup(JSON.stringify({format:'creativeflow-unsent-drafts-v1',drafts},null,2)))}>导出未提交草稿</Button></section>:null}
    {state.updatedAt?<p>最近连接：{new Date(state.updatedAt).toLocaleString('zh-CN')}</p>:null}
    {conflict?<section className="sync-conflict"><h3>{conflict.label}</h3><p className="space-error">{conflict.error}</p>
      {conflict.batch.commands.map((command,index)=>{const host=state.serverEntities.find(row=>row.id===command.id);return <div key={index} className="conflict-record"><strong>{kindLabels[command.kind]||'项目内容'}{host?.fields.name?' · '+host.fields.name:''}</strong>{command.type==='update'?Object.keys(command.fields).map(key=><div key={key}><h4>{fieldLabels[key]||'修改内容'}</h4><div className="conflict-comparison"><span>修改前<pre>{text(command.expected?.[key])}</pre></span><span>我的修改<pre>{text(command.fields[key])}</pre></span><span>主机当前<pre>{text(host?.fields[key])}</pre></span></div></div>):<p>{command.type==='create'?'新增内容':'删除内容'}：{text(command.fields?.name||command.fields?.text||host?.fields.name||host?.fields.text||'记录已不存在')}</p>}</div>;})}
      <div className="sync-actions"><Button disabled={busy} onClick={()=>run(()=>api().resolve(flow.space.id,conflict.id,'retryOriginal'))}>重新尝试原操作</Button>
        {conflict.batch.epoch===state.data.epoch&&conflict.httpStatus===409&&conflict.batch.commands.every(c=>c.type==='update')?<Button disabled={busy} onClick={()=>{if(confirm('确认用上方“我的修改”替换所列主机字段？其他字段保持不变。'))run(()=>api().resolve(flow.space.id,conflict.id,'retry',state.serverEntities.filter(row=>conflict.batch.commands.some(c=>c.id===row.id))));}}>采用我的修改</Button>:null}
        <Button disabled={busy} onClick={()=>{if(confirm(`将放弃本机这笔及后续 ${Math.max(0,state.pendingCount-1)} 笔待同步操作，保留主机内容。建议先导出离线草稿。确认放弃？`))run(()=>api().resolve(flow.space.id,conflict.id,'discard'));}}>保留主机内容，放弃待同步修改</Button></div>
    </section>:<p>{state.pendingCount?'正在等待发送，重连后会自动继续。':'当前没有待同步的修改。'}</p>}
    {state.error&&state.error!==conflict?.error?<p className="space-error">{state.error}</p>:null}{error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}
export function LifecycleDialog({flow,onClose}) {
  const [deleted,setDeleted]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){if(!flow.space)return;try{setDeleted(await api().request(flow.space.id,'trash'));}catch(e){setError(e.message);}}
  useEffect(()=>{void load();},[flow.space?.id,flow.sync?.pendingCount]);
  async function archive(project,value){setBusy(true);setError('');try{const result=await flow.updateProjectAt(project.id,p=>({...p,archived:value}),value?'归档了项目':'取消了项目归档');if(result===null)throw Error('归档未保存，请查看同步状态');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function restore(project){setBusy(true);setError('');try{await api().request(flow.space.id,'restore',{projectId:project.id});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="项目归档与回收站" onClose={busy?()=>{}:onClose} footer={<Button disabled={busy} onClick={onClose}>关闭</Button>}>
    <VersionTrash flow={flow} onBusyChange={setBusy} blocked={busy}/>
    {flow.space?<><h3>项目归档</h3><p>归档后从日常项目、排期和小组件中收起，项目资料与视频保留，随时可以取消归档。</p>
    <div className="permission-members">{flow.allProjects.map(project=><div className="permission-member" key={project.id}><span><strong>{project.name}</strong><small>{project.archived?'已归档':'使用中'}</small></span>{can(flow,project,'manage')?<Button disabled={busy} onClick={()=>archive(project,!project.archived)}>{project.archived?'取消归档':'归档'}</Button>:null}</div>)}</div>
    <h3>回收站</h3><p>删除项目不会删除原共享盘文件。这里可以恢复同一次删除的项目、任务、版本和意见。独立删除的历史意见不会一并复活。</p>
    {deleted.map(project=><div className="permission-member" key={project.id}><span><strong>{project.name}</strong><small>{new Date(project.deletedAt).toLocaleString('zh-CN')}</small></span><Button disabled={busy||!project.canRestore} onClick={()=>restore(project)}>恢复项目</Button></div>)}{!deleted.length?<p>回收站中没有你可恢复的项目。</p>:null}
    </>:null}
    {error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}
