import { useBackups } from './useBackups';
import React, { useMemo, useRef, useState } from 'react';
import { APP_VERSION } from './version';
import { DesktopBehavior } from './DesktopBehavior';
import { ColorSettings } from './ColorSettings';
import { dateKey, weekBounds } from './dates';
import { validDatabase } from './validateDatabase';
import { Button, Check, Icon, Mark, StatusTag, TypeIcon } from './ui';

export function SettingsView({ flow, toast }) {
  const {inputRef,exportData,receive,importData}=useBackups(flow,toast);
  const openWidget = () => window.creativeFlowWindow?.openWidget ? window.creativeFlowWindow.openWidget() : window.location.hash = '#/widgets';
  const customGroups = [
    ['projectStatuses', '项目状态'],
    ['projectTypes', '项目类型'],
    ['taskStages', '任务阶段'],
  ];
  return <main className="page settings-page">
    <div className="page-heading"><div><h1>设置</h1><p>数据保存在当前电脑，可随时导出完整备份。</p></div></div>
    <DesktopBehavior toast={toast}/>
    <ColorSettings flow={flow}/>
    {flow.db.preferences?.recoveryAvailable ? <section className="settings-group"><div className="setting-row"><span><strong>已保留无法识别的原始数据</strong><small>可导出原始记录，便于恢复和检查。</small></span><Button onClick={async()=>{const raw=localStorage.getItem('creative-flow-db-v2-recovery');if(raw&&window.creativeFlowWindow?.exportBackup&&await window.creativeFlowWindow.exportBackup(raw))toast('原始数据已导出');}}>导出原始数据</Button></div></section> : null}
    <section className="settings-group"><h2>数据与备份</h2><div className="setting-row"><span><strong>导出备份</strong><small>包含所有项目、版本与修改意见。</small></span><Button icon="archive" onClick={exportData}>导出 JSON</Button></div><div className="setting-row"><span><strong>导入备份</strong><small>导入后将替换当前数据。</small></span><Button icon="upload" onClick={importData}>选择文件</Button><input ref={inputRef} hidden type="file" accept=".json" onChange={receive} /></div><div className="setting-row danger-row"><span><strong>恢复示例数据</strong><small>清除当前项目与撤销记录，恢复示例。请先导出备份。</small></span><Button onClick={() => confirm('恢复示例会清除当前项目与撤销记录，且不能撤销。请先导出备份。继续？') && flow.reset()}>恢复</Button></div></section>
    <section className="settings-group"><h2>自定义标签</h2>{customGroups.map(([kind, label]) => { const options = flow.db.preferences?.customOptions?.[kind] || []; return <div className="setting-row tag-setting-row" key={kind}><span><strong>{label}</strong><small>删除后不改变已经使用该标签的项目或任务。</small></span><div className="tag-manager">{options.map(value => <span key={value}>{value}<button aria-label={`删除标签 ${value}`} onClick={() => flow.removeCustomOption(kind, value)}><Icon name="close" size={12} /></button></span>)}{!options.length ? <em>暂无自定义标签</em> : null}</div></div>; })}</section>
    <section className="settings-group"><h2>桌面功能</h2><div className="setting-row"><span><strong>桌面小组件</strong><small>打开项目计划与修改意见的独立悬浮窗口。</small></span><Button icon="external" onClick={openWidget}>打开小组件</Button></div></section>
    <p className="version-info">创作流 {APP_VERSION} · Windows 11 x64 测试版</p>
  </main>;
}

export { WidgetPreview } from './Widgets';
