import { useBackups } from './useBackups';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from './version';
import { DesktopBehavior } from './DesktopBehavior';
import { ColorSettings } from './ColorSettings';
import { dateKey, weekBounds } from './dates';
import { validDatabase } from './validateDatabase';
import { Button, Check, Icon, Mark, StatusTag, TypeIcon } from './ui';

export function SettingsView({ flow, toast, onConnections }) {
  const {inputRef,exportData,receive,importData}=useBackups(flow,toast);
  const openWidget = () => window.creativeFlowWindow?.openWidget ? window.creativeFlowWindow.openWidget() : window.location.hash = '#/widgets';
  const customGroups = [
    ['projectStatuses', '项目状态'],
    ['projectTypes', '项目类型'],
    ['taskStages', '任务阶段'],
  ];
  return <main className="page settings-page">
    <div className="page-heading"><div><h1>设置</h1><p>{flow.space?'当前为公司空间。导出仅包含你有权查看的项目资料；空间备份由协作主机管理。':'数据保存在当前电脑，可随时导出完整备份。'}</p></div></div>
    <DesktopBehavior toast={toast}/>
    <section className="settings-group"><h2>公司空间与连接</h2><div className="setting-row"><span><strong>{flow.space?`${flow.space.name} · ${flow.space.displayName}`:'当前使用本地项目'}</strong><small>导入公司接入文件、配置信任证书、检测连接和管理此设备的空间接入。</small></span><div className="header-actions"><Button onClick={onConnections}>管理公司连接</Button><Button onClick={()=>window.creativeFlowWindow?.openManager?.().catch(error=>toast(error.message,'error'))}>打开协作管理器</Button></div></div></section>
    {flow.space&&<CompanyCapacity space={flow.space}/>}
    <ColorSettings flow={flow}/>
    {flow.db.preferences?.recoveryAvailable ? <section className="settings-group"><div className="setting-row"><span><strong>已保留无法识别的原始数据</strong><small>可导出原始记录，便于恢复和检查。</small></span><Button onClick={async()=>{const raw=localStorage.getItem('creative-flow-db-v2-recovery');if(raw&&window.creativeFlowWindow?.exportBackup&&await window.creativeFlowWindow.exportBackup(raw))toast('原始数据已导出');}}>导出原始数据</Button></div></section> : null}
    <section className="settings-group"><h2>数据与备份</h2><div className="setting-row"><span><strong>{flow.space?'导出当前可见资料':'导出备份'}</strong><small>{flow.space?'仅包含当前身份可见的项目、版本与意见，不包含媒体或空间完整备份。':'包含所有项目、版本与修改意见。'}</small></span><Button icon="archive" onClick={exportData}>导出 JSON</Button></div>{!flow.space?<><div className="setting-row"><span><strong>导入备份</strong><small>导入后将替换当前数据。</small></span><Button icon="upload" onClick={importData}>选择文件</Button><input ref={inputRef} hidden type="file" accept=".json" onChange={receive} /></div><div className="setting-row danger-row"><span><strong>恢复示例数据</strong><small>清除当前项目与撤销记录，恢复示例。请先导出备份。</small></span><Button onClick={() => confirm('恢复示例会清除当前项目与撤销记录，且不能撤销。请先导出备份。继续？') && flow.reset()}>恢复</Button></div></>:null}</section>
    <section className="settings-group"><h2>自定义标签</h2>{customGroups.map(([kind, label]) => { const options = flow.db.preferences?.customOptions?.[kind] || []; return <div className="setting-row tag-setting-row" key={kind}><span><strong>{label}</strong><small>删除后不改变已经使用该标签的项目或任务。</small></span><div className="tag-manager">{options.map(value => <span key={value}>{value}<button aria-label={`删除标签 ${value}`} onClick={() => flow.removeCustomOption(kind, value)}><Icon name="close" size={12} /></button></span>)}{!options.length ? <em>暂无自定义标签</em> : null}</div></div>; })}</section>
    <section className="settings-group"><h2>桌面功能</h2><div className="setting-row"><span><strong>桌面小组件</strong><small>打开项目计划与修改意见的独立悬浮窗口。</small></span><Button icon="external" onClick={openWidget}>打开小组件</Button></div></section>
    <p className="version-info">创作流 {APP_VERSION} · Windows 11 x64 测试版</p>
  </main>;
}

function CompanyCapacity({space}){
 const [capacity,setCapacity]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setBusy(true);setError('');try{setCapacity(await window.creativeFlowWindow.collaboration.request(space.id,'storageGet'));}catch(e){setError('容量暂时无法读取，请检查连接，并确认主机已升级到配套版本。');}finally{setBusy(false)}}
 useEffect(()=>{setCapacity(null);refresh()},[space.id]);
 const gb=bytes=>(Number(bytes)/1024**3).toFixed(2)+' GB';
 return <section className="settings-group"><h2>协作空间容量</h2><div className="setting-row"><span><strong>{capacity?'当前可上传 '+gb(capacity.availableUploadBytes):'查询主机容量'}</strong><small>{capacity?.warning||'上传同时受空间上限和服务器磁盘余量保护。容量由协作管理器维护。'}</small>{capacity?.usage&&<small>已用 {gb(capacity.usage.usedBytes)} / {capacity.usage.configured?gb(capacity.usage.limitBytes):'上限待确认'} · 上传预留 {gb(capacity.usage.reservedBytes)} · 磁盘剩余 {gb(capacity.usage.diskFreeBytes)}</small>}{error&&<small role="alert">{error}</small>}</span><Button disabled={busy} onClick={refresh}>{busy?'正在读取…':'刷新容量'}</Button></div></section>;
}

export { WidgetPreview } from './Widgets';
