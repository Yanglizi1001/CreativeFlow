import { Thumbnail } from './Thumbnail';
import { mediaSource } from './demoMedia';
import { useViewState } from './viewState';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AcrylicSelect, Breadcrumbs, Button, Check, Icon, Modal, ResizeHandle, StatusTag, TypeIcon, useEscape, useResizableWidth } from './ui';
import { countItems } from './data';

const phaseOptions = ['全部阶段', '前期策划', '中期拍摄', '后期制作', '修改中', '内部审核', '客户审核'].map(value => ({ value, label: value, tag: value !== '全部阶段' }));

function latestReviewRows(projects, selections = {}) {
  return projects.flatMap(project => project.tasks.filter(task => task.type === '视频').map(task => {
    const version = task.versions.find(item => item.id === selections[task.id]) || task.versions.at(-1);
    const progress = countItems(version);
    return { project, task, version, progress, unfinished: progress.total - progress.done };
  })).filter(row => row.version);
}

function parseTime(value = '') {
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : (parts[0] || 0) * 60 + (parts[1] || 0);
}

function formatTime(value) {
  const seconds = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function ReviewExplorer({ flow, query, onOpen, onProject }) {
  const size = useResizableWidth('creative-flow-review-explorer-width', 252, 220, 360);
  const projects = flow.db.projects.filter(project => project.tasks.some(task => task.type === '视频') && (!query || `${project.name} ${project.tasks.map(task => task.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return <aside className="explorer review-explorer resizable-panel" style={{ width: size.width }}><div className="explorer-heading"><strong>审阅项目</strong><Icon name="video" /></div><div className="explorer-list">{projects.map(project => <section key={project.id} className={flow.active.project?.id === project.id ? 'current' : ''}><button className="project-row" onClick={() => {flow.chooseProject(project.id);onProject(project.id);}}><i style={{ background: project.color }} /><Icon name="folder" /><strong>{project.name}</strong><span>{project.tasks.filter(task => task.type === '视频').length}</span></button>{flow.active.project?.id === project.id ? <div className="task-tree">{project.tasks.filter(task => task.type === '视频').map(task => { const version = task.versions.at(-1); return <button key={task.id} className={flow.active.task?.id === task.id ? 'active' : ''} onClick={() => onOpen(project.id, task.id, version?.id)} onDoubleClick={() => onOpen(project.id, task.id, version?.id)}><TypeIcon type="视频" /><span>{task.name}</span><em>{version?.name}</em></button>; })}</div> : null}</section>)}</div><p className="explorer-hint">点击任务进入审阅</p><ResizeHandle {...size} /></aside>;
}

export function ReviewCenter({ flow, onOpen, onAll, scope = 'all' }) {
  const [selectedVersions, setSelectedVersions] = useViewState('ReviewCenter-selectedVersions', {});
  const rows = useMemo(() => latestReviewRows(flow.db.projects, selectedVersions), [flow.db.projects, selectedVersions]);
  const [projectFilter, setProjectFilter] = useViewState('ReviewCenter-projectFilter-'+scope, scope);
  const [phaseFilter, setPhaseFilter] = useViewState('ReviewCenter-phaseFilter', '全部阶段');
  const [onlyOpen, setOnlyOpen] = useViewState('ReviewCenter-onlyOpen', false);
  const [query, setQuery] = useViewState('ReviewCenter-query', '');
  const [expanded, setExpanded] = useViewState('ReviewCenter-expanded', () => flow.active.task?.id || rows[0]?.task.id);
  const [contextOpen, setContextOpen] = useState(false);
  useEscape(() => setContextOpen(false), contextOpen);
  useEffect(() => {
    const removeReviewTask = event => flow.deleteTask(event.detail.projectId, event.detail.taskId);
    document.addEventListener('delete-review-task', removeReviewTask);
    return () => document.removeEventListener('delete-review-task', removeReviewTask);
  }, [flow]);
  const filtered = rows.filter(row => (projectFilter === 'all' || row.project.id === projectFilter) && (phaseFilter === '全部阶段' || row.task.status === phaseFilter) && (!onlyOpen || row.unfinished > 0) && (!query || `${row.project.name} ${row.task.name} ${row.version.name} ${row.version.file?.name || ''}`.toLowerCase().includes(query.toLowerCase())));
  const selected = filtered.find(row => row.task.id === expanded) || filtered[0];
  const choose = row => { flow.selectPath({ projectId: row.project.id, taskId: row.task.id, versionId: row.version.id }); setExpanded(current => current === row.task.id ? null : row.task.id); };
  const chooseVersion = (row, versionId) => { setSelectedVersions(current => ({ ...current, [row.task.id]: versionId })); flow.selectPath({ projectId: row.project.id, taskId: row.task.id, versionId }); };
  return <main className="review-center-page"><section className="review-center-main"><div className="level-heading review-heading"><div><h1>审阅中心</h1><p>集中查看需要看片和处理反馈的版本</p></div><div className="header-actions">{selected ? <Button variant="primary" icon="play" onClick={() => onOpen(selected.project.id, selected.task.id, selected.version.id)}>开始审阅</Button> : null}{selected ? <Button icon="list" onClick={() => setContextOpen(true)}>审阅信息</Button> : null}</div></div><div className="review-metrics"><div><Icon name="clock" /><span><small>待审阅任务</small><strong>{rows.filter(row => row.unfinished > 0).length}</strong></span></div><div><Icon name="comment" /><span><small>未完成意见</small><strong>{rows.reduce((total, row) => total + row.unfinished, 0)}</strong></span></div><div><Icon name="calendar" /><span><small>今天到期</small><strong>{rows.filter(row => row.task.due === new Date().toLocaleDateString('sv-SE')).length}</strong></span></div><div><Icon name="check" /><span><small>已完成审阅</small><strong>{rows.filter(row => row.progress.total > 0 && !row.unfinished).length}</strong></span></div></div><div className="review-filters"><AcrylicSelect value={projectFilter} label="筛选项目" options={[{ value: 'all', label: '全部项目' }, ...flow.db.projects.map(project => ({ value: project.id, label: project.name }))]} onChange={setProjectFilter} /><AcrylicSelect value={phaseFilter} label="筛选阶段" options={phaseOptions} onChange={setPhaseFilter} /><label><Check checked={onlyOpen} onChange={event => setOnlyOpen(event.target.checked)} label="仅看有未完成意见" />仅看有未完成意见</label><div className="review-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索任务或版本…" /></div></div><section className="review-table"><div className="review-table-head"><span>项目与任务</span><span>版本</span><span>文件</span><span>项目状态</span><span>当前阶段</span><span>未完成意见</span><span>最近审阅</span><span>操作</span></div>{filtered.map(row => <React.Fragment key={row.task.id}><div role="button" tabIndex="0" className={`review-row ${expanded === row.task.id ? 'selected' : ''}`} onClick={() => choose(row)} onDoubleClick={() => onOpen(row.project.id, row.task.id, row.version.id)} onKeyDown={event => event.key === 'Enter' && choose(row)}><span className="review-task-cell"><i style={{ background: row.project.color }} /><Thumbnail file={row.version.file} className="file-preview-icon"/><span><strong>{row.project.name}</strong><small>{row.task.name}</small></span></span><span onClick={event => event.stopPropagation()}><AcrylicSelect className="compact-version-select" value={row.version.id} options={row.task.versions.map(version => ({ value: version.id, label: version.name }))} label="选择审阅版本" onChange={value => chooseVersion(row, value)} /></span><span className="review-file">{row.version.file?.name || `${row.task.name}_${row.version.name}.mp4`}</span><StatusTag value={row.project.status} kind="project" compact /><StatusTag value={row.task.status} compact /><strong className={row.unfinished ? 'unfinished' : ''}>{row.unfinished}条</strong><time>{row.version.reviewedAt || '尚未审阅'}</time><span className="review-action" onClick={event => event.stopPropagation()}><Button variant="primary" onClick={() => onOpen(row.project.id, row.task.id, row.version.id)}>进入审阅</Button></span></div>{expanded === row.task.id ? <ReviewInlinePreview row={row} onOpen={() => onOpen(row.project.id, row.task.id, row.version.id)} /> : null}</React.Fragment>)}{filtered.length === 0 ? <div className="inline-empty">没有符合条件的审阅任务</div> : null}</section></section>{contextOpen && selected ? <ReviewContext row={selected} onClose={() => setContextOpen(false)} /> : null}</main>;
}

function ReviewInlinePreview({ row, onOpen }) {
  const markers = row.version.lists.flatMap(list => list.items.filter(item => item.time)).slice(-2);
  return <div className="review-inline"><div className="review-inline-media"><Thumbnail file={row.version.file} className="large-thumb"/></div><div className="review-inline-meta"><strong>{row.version.file?.name || `${row.task.name}_${row.version.name}.mp4`}</strong><small>{row.version.duration ? formatTime(row.version.duration) : '时长待读取'}　|　{row.version.file?.size || '大小未知'}</small><p>已审阅至 <b>{formatTime(row.version.reviewPosition || 0)}</b></p><div className="review-progress"><i style={{ width: `${((row.version.reviewPosition || 0) / (row.version.duration || 1)) * 100}%` }} /></div><StatusTag value={row.version.status} compact /></div><div className="review-recent"><header><strong>最近意见</strong><button onClick={onOpen}>查看全部 <Icon name="chevron" size={13} /></button></header>{markers.map(item => <p key={item.id}><b>{item.time}</b><span>{item.text}</span></p>)}<small><Icon name="clock" size={14} />双击任务进入审阅工作区</small></div></div>;
}

function ReviewContext({ row, onClose }) {
  const activities = (row.project.activities || []).slice(0, 5);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const confirmDelete = () => {
    document.dispatchEvent(new CustomEvent('delete-review-task', { detail: { projectId: row.project.id, taskId: row.task.id } }));
    setDeleteOpen(false);
    onClose();
  };
  return <>
    <button className="drawer-scrim" aria-label="关闭审阅信息" onClick={onClose} />
    <aside className="review-context context-drawer">
      <header><h2>审阅信息</h2><button onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header>
      <div className="review-context-title"><Thumbnail file={row.version.file} className="file-preview-icon"/><span><strong>{row.project.name}</strong><small>{row.task.name}</small></span></div>
      <dl><div><dt>当前版本</dt><dd>{row.version.name}</dd></div><div><dt>文件名称</dt><dd>{row.version.file?.name || '尚未关联文件'}</dd></div><div><dt>项目状态</dt><dd><StatusTag value={row.project.status} kind="project" compact /></dd></div><div><dt>当前阶段</dt><dd><StatusTag value={row.task.status} compact /></dd></div><div><dt>截止日期</dt><dd>{row.task.due || '未设置'}</dd></div></dl>
      <section><h3>当前审阅列表</h3>{row.version.lists.map(list => { const progress = countItems(list); return <p key={list.id}><i /><span>{list.name}</span><b>{progress.done}/{progress.total}</b></p>; })}</section>
      <section><h3>最近动态</h3>{activities.length ? activities.map(entry => <p key={entry.id}><i /><span>{entry.text}</span><small>{entry.at}</small></p>) : <div className="review-activity-empty">完成操作后，动态会显示在这里。</div>}</section>
      <div className="review-delete-zone"><Button className="danger-action" icon="trash" onClick={() => setDeleteOpen(true)}>删除审阅任务</Button><small>会同步从项目、日历和修改意见中心删除</small></div>
    </aside>
    {deleteOpen ? <Modal title={`删除审阅任务「${row.task.name}」`} onClose={() => setDeleteOpen(false)} footer={<><Button onClick={() => setDeleteOpen(false)}>取消</Button><Button className="danger-confirm" icon="trash" onClick={confirmDelete}>确认删除任务</Button></>}><div className="delete-version-copy"><span className="delete-version-icon"><Icon name="trash" size={22} /></span><div><strong>这是项目中的实际任务</strong><p>删除后，此任务的全部版本和修改意见也会一并移除；电脑中的原始视频文件不会被删除。</p></div></div><p className="form-hint">此操作无法撤销。</p></Modal> : null}
  </>;
}

export function ReviewWorkspace({ flow, onBack, onProject, toast }) {
  const { project, task, version } = flow.active;
  const [current, setCurrent] = useState(version?.reviewPosition || 0);
  const [duration, setDuration] = useState(version?.duration || 0);
  const [composerOpen,setComposerOpen]=useState(false);
  const [mediaError,setMediaError]=useState('');
  const loopCenter=useRef(0);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [draft, setDraft] = useState('');
  const [speed, setSpeed] = useState(1);
  const [notesOpen, setNotesOpen] = useState(true);
  const notesSize = useResizableWidth('creative-flow-review-notes-width', 390, 330, 560);
  const playerRef = useRef(null);
  const inputRef = useRef(null);
  const currentRef = useRef(current);
  const file = version?.file;
  const source = mediaSource(file);
  const lists = version?.lists || [];
  const activeList = flow.active.list || lists[0];
  const markers = useMemo(() => lists.flatMap((list, listIndex) => list.items.filter(item => item.time).map(item => ({ ...item, listId: list.id, listName: list.name, listIndex, seconds: parseTime(item.time) }))).sort((a, b) => a.seconds - b.seconds), [lists]);
  const progress = countItems(version);
  const openMarkers = lists.flatMap(list=>list.items.filter(item=>!item.done).map(item=>({...item,listId:list.id,seconds:item.time?parseTime(item.time):null}))).sort((a,b)=>(a.seconds ?? Infinity)-(b.seconds ?? Infinity));
  const seek = seconds => { const next = Math.max(0, Math.min(duration || 68, seconds)); setCurrent(next); if (playerRef.current && source) playerRef.current.currentTime = next; };
  const togglePlay = async () => {
    if (source && playerRef.current) {
      if (playerRef.current.paused) { try { await playerRef.current.play(); setPlaying(true); } catch { toast('视频无法播放，请检查文件或使用系统播放器', 'error'); } } else { playerRef.current.pause(); setPlaying(false); }
    } else toast('请先关联本地视频文件');
  };
  const focusOpinion = () => {
    setPlaying(false);
    setNotesOpen(true);
    setComposerOpen(true);
    playerRef.current?.pause();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => inputRef.current?.focus()));
  };
  const chooseItem = (listId, item) => { flow.chooseList(listId); setSelectedItem({...item,listId}); if(item.time){loopCenter.current=parseTime(item.time);seek(parseTime(item.time));} playerRef.current?.pause(); setPlaying(false); };
  const moveOpen = direction => {
    if (!openMarkers.length) return;
    const activeIndex = openMarkers.findIndex(item => item.id === selectedItem?.id && item.listId === selectedItem?.listId);
    const nextIndex = activeIndex < 0 ? (direction > 0 ? 0 : openMarkers.length - 1) : (activeIndex + direction + openMarkers.length) % openMarkers.length;
    const item = openMarkers[nextIndex];
    chooseItem(item.listId, item);
  };
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => {
    if (!source || !version) return;
    const timer = setTimeout(() => flow.setReviewPosition(project.id, task.id, version.id, current), 600);
    return () => clearTimeout(timer);
  }, [Math.floor(current), source, version?.id]);
  useEffect(() => {
    setCurrent(version?.reviewPosition || 0);
    setSelectedItem(null);
    setDuration(version?.duration || 0); setMediaError(''); setDraft(''); setComposerOpen(false);
    setPlaying(false);
  }, [version?.id, source]);
  useEffect(() => () => { if (project && task && version) flow.setReviewPosition(project.id, task.id, version.id, currentRef.current); }, [project?.id, task?.id, version?.id]);
  useEffect(() => {
    const keys = event => {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName) || document.querySelector('[role=dialog]')) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      if (event.key === 'ArrowLeft') seek(current - 5);
      if (event.key === 'ArrowRight') seek(current + 5);
      if (event.key.toLowerCase() === 'm') focusOpinion();
      if (event.key.toLowerCase() === 'f') document.querySelector('.review-player')?.requestFullscreen?.();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [current, playing, notesOpen]);
  if (!project || !task || !version) return <main className="page"><div className="empty-state"><h2>这个任务尚无可审阅版本</h2><p>请在项目中建立版本并关联视频。</p><Button onClick={onBack}>返回审阅中心</Button></div></main>;
  const add = event => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    flow.addReviewItem(project.id, task.id, version.id, activeList?.id, text, formatTime(current));
    setDraft(''); setComposerOpen(false);
    toast('修改意见已同步到当前版本');
  };
  const versionOptions = task.versions.map(item => ({ value: item.id, label: item.name }));
  return <main className={`review-workspace ${notesOpen ? '' : 'notes-closed'}`} style={{ '--review-notes-width': `${notesSize.width}px` }}>
    <header className="review-workspace-head">
      <div>
        
        <div className="review-file-heading">
          <Thumbnail file={file} className="file-preview-icon"/>
          <span><h1>{file?.name || `${task.name}_${version.name}.mp4`}</h1><small>{duration ? formatTime(duration) : '时长待读取'}　|　{file?.size || '尚未关联本地文件'}</small></span>
          <span className="review-version-control"><small>版本</small><AcrylicSelect className="workspace-version-select" value={version.id} options={versionOptions} label="选择审阅版本" onChange={flow.chooseVersion} /></span>
          <StatusTag value={project.status} kind="project" />
          <StatusTag value={task.status} />
        </div>
      </div>
      <div className="review-head-actions"><Button icon="upload" onClick={async()=>{const selected=await window.creativeFlowWindow?.selectFile?.();if(selected)flow.setFile(selected);}}>关联视频</Button>{!notesOpen ? <Button icon="comment" onClick={() => setNotesOpen(true)}>修改意见</Button> : null}<Button icon="external" onClick={() => mediaSource(file) ? window.creativeFlowWindow?.openPath?.(mediaSource(file)) : toast('请在任务中关联本地视频文件')}>使用系统播放器打开</Button></div>
    </header>
    <section className="review-player-column"><div className="review-player">{source ? <video ref={playerRef} src={source} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)} onError={()=>{setPlaying(false);setMediaError('文件不存在或格式不支持。请重新关联文件，或使用系统播放器。');}} onTimeUpdate={event => {const video=event.currentTarget;if(looping && video.currentTime>=loopCenter.current+3) video.currentTime=Math.max(0,loopCenter.current-2);setCurrent(video.currentTime);}} onLoadedMetadata={event => {const video=event.currentTarget;const length=Number.isFinite(video.duration)?video.duration:(version.duration || 0);setDuration(length);video.currentTime=Math.min(version.reviewPosition || 0,length);flow.updateVersionAt(project.id,task.id,version.id,v=>({...v,duration:length}));}} onEnded={() => setPlaying(false)} /> : <div className="media-placeholder"><Icon name="video" size={42}/><strong>尚未关联本地视频</strong><span>在任务版本中关联视频后即可播放和标注意见</span></div>}{mediaError ? <div className="media-placeholder media-error">{mediaError}</div> : null}<div className="review-player-controls"><button onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}><Icon name={playing ? 'pause' : 'play'} /></button><time>{formatTime(current)} / {formatTime(duration)}</time><input type="range" min="0" max={duration} step=".1" value={current} onChange={event => seek(Number(event.target.value))} /><button aria-label="切换静音" onClick={()=>{if(playerRef.current)playerRef.current.muted=!playerRef.current.muted;}}><Icon name="volume" /></button><select value={speed} onChange={event => { const next = Number(event.target.value); setSpeed(next); if (playerRef.current) playerRef.current.playbackRate = next; }}><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1">1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select><button onClick={() => document.querySelector('.review-player')?.requestFullscreen?.()} aria-label="全屏"><Icon name="fullscreen" /></button></div></div><div className="review-timeline"><div className="timeline-track" onDoubleClick={event => { const rect = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - rect.left) / rect.width) * duration); focusOpinion(); }}><i className="timeline-fill" style={{ width: `${current / (duration || 1) * 100}%` }} /><span className="timeline-playhead" style={{ left: `${current / (duration || 1) * 100}%` }}><b>{formatTime(current)}</b></span>{markers.map(marker => <button key={`${marker.listId}-${marker.id}`} className={`timeline-marker marker-${marker.listIndex % 4} ${marker.done ? 'done' : ''} ${selectedItem?.id === marker.id ? 'active' : ''}`} style={{ left: `${Math.min(100, marker.seconds / (duration || 1) * 100)}%` }} onClick={() => chooseItem(marker.listId, marker)} aria-label={`${marker.time} ${marker.text}`} />)}</div><div className="timeline-labels">{[0,.2,.4,.6,.8,1].map(f=><span key={f}>{formatTime(duration*f)}</span>)}</div></div><div className="review-player-actions"><Button variant="primary" icon="plus" onClick={focusOpinion}>添加修改意见</Button><Button icon="repeat" className={looping ? 'active-loop' : ''} onClick={() => {loopCenter.current=current;setLooping(value => !value);}}>循环此处</Button><small>Space 播放/暂停　·　M 添加意见　·　方向键前后 5 秒</small></div><div className="review-progress-strip"><strong>本版本　{progress.done}/{progress.total} 已处理</strong><span className="progress-track"><i style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></span>{lists.slice(0, 3).map((list, index) => <span className={`list-count count-${index}`} key={list.id}>{list.name.replace('第一轮反馈', '')} <b>{list.items.filter(item => !item.done).length}</b></span>)}<span className="last-position"><Icon name="clock" size={14} />上次 <b>{formatTime(version.reviewPosition || 0)}</b></span><span className="review-step-buttons"><Button icon="left" onClick={() => moveOpen(-1)}>上一条未完成</Button><Button icon="right" onClick={() => moveOpen(1)}>下一条未完成</Button></span></div></section>
    {notesOpen ? <aside className="review-notes"><ResizeHandle {...notesSize} side="left" label="调整修改意见栏宽度" /><header><h2>修改意见</h2><div><span>{progress.total-progress.done} 条未完成</span><button onClick={() => setNotesOpen(false)} aria-label="收起修改意见"><Icon name="right" /></button></div></header><div className="review-list-tabs">{lists.map(list => { const listProgress = countItems(list); return <button key={list.id} className={activeList?.id === list.id ? 'active' : ''} onClick={() => flow.chooseList(list.id)}>{list.name}<em>{listProgress.done}/{listProgress.total}</em></button>; })}</div><div className="review-note-list">{(activeList?.items || []).map((item, index) => <div role="button" tabIndex="0" key={item.id} className={`review-note-row ${item.done ? 'done' : ''} ${selectedItem?.id === item.id ? 'selected' : ''}`} onClick={() => chooseItem(activeList.id, item)} onKeyDown={event => event.key === 'Enter' && chooseItem(activeList.id, item)}><Check checked={item.done} onChange={event => { event.stopPropagation(); flow.toggleItemAt(project.id, task.id, version.id, activeList.id, item.id); }} label={item.text} /><span>{index + 1}</span><time>{item.time || '—'}</time><strong>{item.text}</strong><StatusTag value={item.done ? '已完成' : '未完成'} compact /></div>)}{!activeList?.items?.length ? <div className="inline-empty">当前列表还没有修改意见</div> : null}</div>{composerOpen ? <form className="review-add" onSubmit={add}><span>{formatTime(current)}</span><input ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} placeholder="输入修改意见…" /><Button variant="primary" type="submit">添加</Button></form> : null}<p className="review-add-hint">意见同步到任务与修改意见中心 · 点击“添加修改意见”录入</p></aside> : null}
  </main>;
}
