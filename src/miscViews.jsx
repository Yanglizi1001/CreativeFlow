import React, { useMemo, useRef, useState } from 'react';
import { APP_VERSION } from './version';
import { dateKey, weekBounds } from './dates';
import { validDatabase } from './validateDatabase';
import { Button, Check, Icon, Mark, StatusTag, TypeIcon } from './ui';

export function SettingsView({ flow, toast }) {
  const inputRef = useRef();
  const exportData = async () => {
    const json = JSON.stringify(flow.db, null, 2);
    if (window.creativeFlowWindow?.exportBackup) { if (await window.creativeFlowWindow.exportBackup(json)) toast('备份已导出'); return; }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `创作流备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importData = async event => {
    try {
      const file = event.target?.files?.[0];
      const text = file ? await file.text() : await window.creativeFlowWindow?.importBackup?.();
      if (!text) return;
      const data = JSON.parse(text);
      if (!validDatabase(data)) throw new Error('invalid');
      if (confirm('导入将替换当前项目数据，建议先导出备份。继续导入？')) flow.replaceDatabase(data);
    } catch { toast('备份文件无法识别', 'error'); }
  };
  const openWidget = () => window.creativeFlowWindow?.openWidget ? window.creativeFlowWindow.openWidget() : window.location.hash = '#/widgets';
  const customGroups = [
    ['projectStatuses', '项目状态'],
    ['projectTypes', '项目类型'],
    ['taskStages', '任务阶段'],
  ];
  return <main className="page settings-page">
    <div className="page-heading"><div><h1>设置</h1><p>数据保存在当前电脑，可随时导出完整备份。</p></div></div>
    {flow.db.preferences?.recoveryAvailable ? <section className="settings-group"><div className="setting-row"><span><strong>已保留无法识别的原始数据</strong><small>可导出原始记录，便于恢复和检查。</small></span><Button onClick={async()=>{const raw=localStorage.getItem('creative-flow-db-v2-recovery');if(raw&&window.creativeFlowWindow?.exportBackup&&await window.creativeFlowWindow.exportBackup(raw))toast('原始数据已导出');}}>导出原始数据</Button></div></section> : null}
    <section className="settings-group"><h2>数据与备份</h2><div className="setting-row"><span><strong>导出备份</strong><small>包含所有项目、版本与修改意见。</small></span><Button icon="archive" onClick={exportData}>导出 JSON</Button></div><div className="setting-row"><span><strong>导入备份</strong><small>导入后将替换当前数据。</small></span><Button icon="upload" onClick={() => window.creativeFlowWindow?.importBackup ? importData({}) : inputRef.current.click()}>选择文件</Button><input ref={inputRef} hidden type="file" accept=".json" onChange={importData} /></div><div className="setting-row danger-row"><span><strong>恢复示例数据</strong><small>清除当前本地数据并恢复初始内容。</small></span><Button onClick={() => confirm('确定恢复示例数据吗？') && flow.reset()}>恢复</Button></div></section>
    <section className="settings-group"><h2>自定义标签</h2>{customGroups.map(([kind, label]) => { const options = flow.db.preferences?.customOptions?.[kind] || []; return <div className="setting-row tag-setting-row" key={kind}><span><strong>{label}</strong><small>删除后不改变已经使用该标签的项目或任务。</small></span><div className="tag-manager">{options.map(value => <span key={value}>{value}<button aria-label={`删除标签 ${value}`} onClick={() => flow.removeCustomOption(kind, value)}><Icon name="close" size={12} /></button></span>)}{!options.length ? <em>暂无自定义标签</em> : null}</div></div>; })}</section>
    <section className="settings-group"><h2>桌面功能</h2><div className="setting-row"><span><strong>桌面小组件</strong><small>打开项目计划与修改意见的独立悬浮窗口。</small></span><Button icon="external" onClick={openWidget}>打开小组件</Button></div></section>
    <p className="version-info">创作流 {APP_VERSION} · Windows 11 x64 测试版</p>
  </main>;
}

export { WidgetPreview } from './Widgets';
