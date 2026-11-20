import React from 'react';
import {Button,Icon,StatusTag} from '../ui';
export function ReadonlyDetails({title,entry,onClose,onBack,children}) {
  return <><button className="drawer-scrim" aria-label={`关闭${title}`} onClick={onClose}/><aside className="detail-panel context-drawer"><header><h2>{title}</h2><div className="detail-header-actions">{onBack?<button aria-label="返回上一详情" onClick={onBack}><Icon name="left"/></button>:null}<button aria-label="关闭" onClick={onClose}><Icon name="close"/></button></div></header><div className="detail-form"><p>只读资料 · 由项目创建者或空间所有者维护。版本审阅和意见操作按该版本权限执行。</p><label>名称<strong>{entry.name}</strong></label><label>状态<StatusTag value={entry.status}/></label><label>类型<span>{entry.type}</span></label><label>排期<span>{entry.start||'未设开始'} → {entry.due||'未设截止'}</span></label>{entry.description?<label>说明<p>{entry.description}</p></label>:null}<label>备注<p style={{whiteSpace:'pre-wrap'}}>{entry.notes||'暂无备注'}</p></label>{children}</div></aside></>;
}
