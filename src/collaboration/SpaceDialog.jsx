import React,{useEffect,useState} from 'react';
import {Button,Modal} from '../ui';
import {workspaceStore} from './workspaceStore';
import {prepareProjectUpload} from './model.mjs';
const message=error=>String(error?.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');

export function SpaceDialog({flow,onClose,onSwitch,notify,accessProfile,onAccessConsumed,initialHost=''}) {
  const [connections,setConnections]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({host:initialHost,invitationCode:'',displayName:''});
  useEffect(()=>{if(initialHost)setForm(old=>({...old,host:initialHost,invitationCode:''}));},[initialHost]);
  const [profile,setProfile]=useState(null),[trusted,setTrusted]=useState(false),[report,setReport]=useState(null);
  const access=window.creativeFlowWindow?.employeeAccess;
  function useProfile(value){if(!value)return;setProfile(value);setTrusted(value.trusted===true);setReport(null);setError('');setForm(old=>({...old,host:value.host,invitationCode:''}));onAccessConsumed?.();}
  useEffect(()=>{if(accessProfile)useProfile(accessProfile);},[accessProfile]);
  async function action(work){setBusy(true);setError('');try{return await work();}catch(e){setError(message(e));}finally{setBusy(false);}}
  useEffect(()=>{let live=true;workspaceStore.list().then(rows=>{if(live)setConnections(rows);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  async function join(event) {
    event.preventDefault();setBusy(true);setError('');
    try {if(profile&&!trusted)throw Error('请先确认公司主机并配置信任证书');const connection=await workspaceStore.join({...form,accessProfileId:profile?.id});setConnections(await workspaceStore.list());setForm({...form,invitationCode:''});notify('已加入公司空间');onSwitch(connection);}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <Modal className="access-dialog" title="切换空间" onClose={busy?()=>{}:onClose} footer={<Button disabled={busy} onClick={onClose}>关闭</Button>}>
    <div className="space-connections"><Button disabled={busy} onClick={()=>onSwitch(null)}>我的项目{!flow.space?' · 当前':''}</Button>
      {connections.map(connection=><div className="connection-row" key={connection.id}><Button disabled={busy} onClick={()=>onSwitch(connection)}>{connection.name} · {connection.displayName}{flow.space?.id===connection.id?' · 当前':''}</Button><Button disabled={busy} onClick={()=>{setProfile(null);setForm(old=>({...old,host:connection.host}));action(async()=>setReport(await access.diagnose(connection.host)));}}>检测</Button><Button disabled={busy||flow.space?.id===connection.id} onClick={()=>action(async()=>{const r=await window.creativeFlowWindow.collaboration.disconnect(connection.id);if(!r.cancelled)setConnections(await workspaceStore.list());})}>退出连接</Button></div>)}
    </div>
    <p>“我的项目”保存在当前电脑。公司空间中的项目、排期和意见由协作主机保存。切换时主窗口和小组件会一起切换，有未保存内容时会先提示处理。</p>
    <form className="space-join" onSubmit={join}><h3>加入公司空间</h3>
      <p className="access-steps">① 导入公司信息　② 配置信任并检查连接　③ 验证加入</p>
      {access&&<Button type="button" disabled={busy} onClick={()=>action(async()=>useProfile(await access.importFile()))}>导入公司接入文件</Button>}
      {profile&&<section className="access-summary"><strong>{profile.workspaceName}</strong><p>服务器：{profile.serverName}</p><p>证书有效期：{new Date(profile.expiresAt).toLocaleDateString()}</p><small>SHA-256：{profile.fingerprintSha256}</small><p>请确认此文件来自公司管理员。信任仅用于创作流，无需手动安装系统证书。</p><Button type="button" disabled={busy||trusted} onClick={()=>action(async()=>{const r=await access.trust(profile.id);if(!r.cancelled){setTrusted(true);setReport(await access.diagnose(profile.host));}})}>{trusted?'已配置信任证书':'确认公司主机并配置信任证书'}</Button></section>}
      <label>协作主机地址<input required type="url" placeholder="也可手动输入 https://服务器名:47840" value={form.host} onChange={e=>{setProfile(null);setTrusted(false);setReport(null);setForm({...form,host:e.target.value});}}/></label>
      {access&&<div className="sync-actions"><Button type="button" disabled={busy||!form.host} onClick={()=>action(async()=>setReport(await access.diagnose(form.host)))}>检测连接</Button>{report&&<Button type="button" disabled={busy} onClick={()=>action(()=>access.exportReport(report))}>导出检测报告</Button>}</div>}
      {report&&<div className="access-checks" role="status">{report.checks.map(check=><p key={check.name} className={check.ok?'access-ok':'space-error'}>{check.ok?'✓':'!'} {check.name}：{check.detail}</p>)}</div>}
      <label>邀请码<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={form.invitationCode} onChange={e=>setForm({...form,invitationCode:e.target.value})}/></label>
      <label>我的姓名<input required maxLength={40} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>
      <Button variant="primary" disabled={busy||Boolean(profile&&!trusted)} type="submit">{busy?'正在处理…':'验证并加入'}</Button>
    </form>{error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}

export function UploadProjectDialog({flow,onClose,notify}) {
  const [connections,setConnections]=useState([]),[destination,setDestination]=useState(''),[projectId,setProjectId]=useState(flow.active.project?.id||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const [includeMedia,setIncludeMedia]=useState(false);
  useEffect(()=>{workspaceStore.list().then(setConnections).catch(e=>setError(e.message));},[]);
  const project=flow.db.projects.find(row=>row.id===projectId);
  const mediaCount=project?prepareProjectUpload(project).missingMedia.length:0;
  async function upload() {
    if(!project||!destination)return;setBusy(true);setError('');
    try {await workspaceStore.upload(connections.find(row=>row.id===destination),project,includeMedia);setDone(true);notify('项目已提交，本地原项目已保留，可在同步中心查看进度');}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <Modal title="上传项目资料至协作空间" onClose={busy?()=>{}:onClose} footer={<><Button disabled={busy} onClick={onClose}>{done?'完成':'取消'}</Button>{!done?<Button variant="primary" disabled={busy||!project||!destination} onClick={upload}>{busy?'正在上传…':'确认上传资料'}</Button>:null}</>}>
    {done?<p role="status">上传成功提交。本机已保存待同步操作，联网后同步到主机。切换到公司空间后可查看项目与同步状态。本地原项目保留。</p>:<div className="space-join">
      <label>本地项目<select aria-label="本地项目" value={projectId} disabled={busy} onChange={e=>setProjectId(e.target.value)}><option value="">请选择项目</option>{flow.db.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>目标空间<select aria-label="目标空间" value={destination} disabled={busy} onChange={e=>setDestination(e.target.value)}><option value="">请选择已加入的空间</option>{connections.map(c=><option key={c.id} value={c.id}>{c.name} · {c.displayName}</option>)}</select></label>
      <p>上传项目、任务、版本、排期、备注和修改意见，并保留本地原项目。发布视频需要联网，新建协作版本默认仅管理者可见，请在审阅页设置成员权限。</p>
      {mediaCount?<><label><input type="checkbox" checked={includeMedia} disabled={busy} onChange={e=>setIncludeMedia(e.target.checked)}/>同时发布已关联的本地视频文件</label><p>有 {mediaCount} 个关联文件。仅发布本机可读取的 MP4、M4V、WebM、MOV 视频；内置示例和其他文件类型需另行关联。发布前会显示文件路径供核对。</p></>:null}
      {!connections.length?<p>请先通过“切换空间”加入公司空间。</p>:null}
    </div>}{error?<p className="space-error" role="alert">{error}</p>:null}
  </Modal>;
}
