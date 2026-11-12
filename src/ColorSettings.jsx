import React from 'react';
import { useColors } from './ColorContext';
import { ColorPicker } from './ColorPicker';
import { TAG_GROUPS, defaultTagColor } from './colors';
import { Button, StatusTag } from './ui';

export function ColorSettings({flow}) {
  const colors=useColors();
  const used={
    project:flow.db.projects.map(p=>p.status),
    type:flow.db.projects.flatMap(p=>[p.type,...p.tasks.map(t=>t.type)]),
    stage:flow.db.projects.flatMap(p=>p.tasks.map(t=>t.status)),
    version:flow.db.projects.flatMap(p=>p.tasks.flatMap(t=>t.versions.map(v=>v.status))),
  };
  return <section className="settings-group color-settings"><div className="color-settings-heading"><div><h2>标签与颜色</h2><p>同一类词条的颜色会同步到所有页面。排期按任务独立设色，可在任务详情或项目的任务列表中设置。</p></div><Button onClick={colors.resetTagColors}>恢复全部标签默认颜色</Button></div>{TAG_GROUPS.map(group=>{
    const values=[...new Set([...group.values,...(flow.db.preferences?.customOptions?.[group.custom]||[]),...used[group.kind],...Object.keys(colors.tagColors[group.kind]||{})])].filter(Boolean);
    return <div className="color-setting-group" key={group.kind}><h3>{group.label}</h3><div className="color-tag-grid">{values.map(value=><div className="color-tag-entry" key={value}><StatusTag value={value} kind={group.kind}/><ColorPicker compact label={`${group.label}「${value}」颜色`} value={colors.tagColors[group.kind]?.[value]} defaultColor={defaultTagColor(value)} tag preview={value} onChange={color=>colors.setTagColor(group.kind,value,color)}/></div>)}</div></div>;
  })}</section>;
}
