import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import appIcon from './assets/app-icon-c.png';
import { useColors } from './ColorContext';
import { defaultTagColor, tagColors, validColor } from './colors';
import { ColorPicker } from './ColorPicker';

const paths = {
  home: '<path d="M3 11 12 3l9 8v9H15v-7H9v7H3z"/>',
  folder: '<path d="M3 6h7l2 2h9v12H3z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>',
  comment: '<path d="M4 4h16v13H9l-5 4z"/><path d="M8 9h8m-8 4h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l2-1.2-2-3.4-2.2 1A8 8 0 0 0 14 5.3L13.8 3h-4L9.5 5.3A8 8 0 0 0 7 6.8l-2.2-1L2.8 9.3l2 1.2v3l-2 1.2 2 3.4 2.2-1a8 8 0 0 0 2.6 1.5l.2 2.4h4l.3-2.4a8 8 0 0 0 2.6-1.5l2.2 1 2-3.4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  ppt: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M9 11h4a2 2 0 1 1 0 4H9zm0 0v7"/>',
  upload: '<path d="M12 16V4m0 0L8 8m4-4 4 4M4 15v5h16v-5"/>',
  download: '<path d="M12 4v12m0 0-4-4m4 4 4-4M4 18v2h16v-2"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4 7h16m-10 4v6m4-6v6M7 7l1 14h8l1-14M9 7V4h6v3"/>',
  edit: '<path d="m4 16-1 5 5-1L19 9l-4-4zM13 7l4 4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  archive: '<path d="M4 7h16v14H4zM3 3h18v4H3zm6 5h6"/>',
  external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M18 13v7H4V6h7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="m9 6 10 6-10 6z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  volume: '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
};

export function Icon({ name, size = 18 }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }} />;
}

const escapeStack = [];
export function useEscape(onEscape, active = true) {
  const handlerRef = useRef(onEscape);
  useEffect(() => { handlerRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape' && escapeStack.at(-1) === handleKeyDown && !event.defaultPrevented) { event.preventDefault(); handlerRef.current?.(); }
    };
    escapeStack.push(handleKeyDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); const index=escapeStack.indexOf(handleKeyDown); if(index>=0) escapeStack.splice(index,1); };
  }, [active]);
}

export function Mark() { return <img className="mark app-mark" src={appIcon} alt="" aria-hidden="true" draggable="false" />; }

export function Button({ children, icon, variant = '', className = '', type = 'button', ...props }) {
  return <button type={type} className={`button ${variant} ${className}`.trim()} {...props}>{icon ? <Icon name={icon} /> : null}{children}</button>;
}

export function Check({ checked, onChange, label }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={onChange} aria-label={label} /><span>{checked ? <Icon name="check" size={14} /> : null}</span></label>;
}

const tones = {
  '计划中': 'blue', '前期策划': 'blue', '筹备中': 'blue',
  '中期拍摄': 'purple', '制作中': 'purple', '后期制作': 'violet',
  '修改中': 'orange', '内部审核': 'teal', '待审核': 'teal',
  '客户审核': 'green', '进行中': 'green', '已完成': 'green',
  '已交付': 'slate', '已暂停': 'slate', '未开始': 'slate',
};

const fallbackTones = ['blue', 'purple', 'violet', 'orange', 'teal', 'green'];
function toneFor(value) {
  if (tones[value]) return tones[value];
  const hash = [...String(value || '')].reduce((total, char) => total + char.charCodeAt(0), 0);
  return fallbackTones[hash % fallbackTones.length];
}

export function StatusTag({ value, kind = 'stage', compact = false }) {
  const colors=useColors();
  const custom=colors.tagColors?.[kind]?.[value];
  return <span style={validColor(custom)?tagColors(custom):undefined} data-tag-kind={kind} data-tag-value={value} className={`status-tag tone-${toneFor(value)} ${kind} ${compact ? 'compact' : ''}`}>{value}</span>;
}

export function TypeIcon({ type, size = 18 }) {
  return <Icon name={type === '图片' ? 'image' : type === 'PPT' ? 'ppt' : 'video'} size={size} />;
}

export function AcrylicSelect({ value, options, onChange, label, className = '', renderValue, creatable = false, onCreate, createLabel = '添加自定义标签' }) {
  const colors=useColors();
  const colorKind=({'项目状态':'project','版本状态':'version','项目类型':'type','任务类型':'type','项目阶段':'stage','任务阶段':'stage','当前阶段':'stage','筛选阶段':'stage'})[label];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const currentOption = options.map(option => typeof option === 'string' ? { value: option, label: option } : option).find(option => option.value === value);
  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = Math.min(330, options.length * 34 + (creatable ? 48 : 10));
      const below = window.innerHeight - rect.bottom;
      const top = below >= Math.min(estimatedHeight, 220) ? rect.bottom + 5 : Math.max(8, rect.top - estimatedHeight - 5);
      const width = Math.min(window.innerWidth - 16,Math.max(rect.width, creatable ? 230 : 160));
      setMenuStyle({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top, width, minWidth: width, maxWidth: window.innerWidth - 16 });
    };
    position();
    const close = event => { if (!event.target.closest('[data-color-editor]') && !rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape' && !event.target.closest('[data-color-editor]')) { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, options.length, creatable]);
  const create = () => {
    const next = draft.trim();
    if (!next) return;
    onCreate?.(next);
    setDraft('');
    setOpen(false);
  };
  const menu = open ? <div className="acrylic-menu acrylic-menu-portal" style={menuStyle} role="listbox" aria-label={label} ref={menuRef} onKeyDown={event => {
    if (event.target.tagName === 'INPUT') return;
    const buttons = [...menuRef.current.querySelectorAll('[role="option"]')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>
    {options.map(option => {
      const item = typeof option === 'string' ? { value: option, label: option } : option;
      const kind=item.kind||colorKind;
      const editable=kind&&colors.setTagColor&&item.value!=='全部阶段';
      return <div className="acrylic-option-row" key={item.value}><button type="button" role="option" aria-selected={item.value === value} className={item.value === value ? 'selected' : ''} onClick={() => { onChange(item.value); setOpen(false); triggerRef.current?.focus(); }}>
        {item.tag||kind ? <StatusTag value={item.label} kind={kind} /> : <span>{item.label}</span>}{item.value === value ? <Icon name="check" size={15} /> : null}
      </button>{editable?<ColorPicker compact label={`${item.label}标签颜色`} value={colors.tagColors?.[kind]?.[item.label]} defaultColor={defaultTagColor(item.label)} tag preview={item.label} onChange={color=>colors.setTagColor(kind,item.label,color)}/>:null}</div>;
    })}
    {creatable ? <div className="acrylic-create"><Icon name="plus" size={15} /><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create(); } }} placeholder={createLabel} aria-label={createLabel} /><button type="button" onClick={create} disabled={!draft.trim()} aria-label="确认添加"><Icon name="check" size={15} /></button></div> : null}
  </div> : null;
  return <div className={`acrylic-select ${open ? 'open' : ''} ${className}`} ref={rootRef}>
    <button ref={triggerRef} type="button" className="acrylic-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); setOpen(true);
        requestAnimationFrame(() => { const options = menuRef.current?.querySelectorAll('[role="option"]'); const selected = menuRef.current?.querySelector('[aria-selected="true"]'); (selected || options?.[event.key === 'ArrowUp' ? options.length - 1 : 0])?.focus(); });
      }
    }}>
      {renderValue ? renderValue(value) : currentOption?.tag||colorKind ? <StatusTag value={currentOption?.label??value} kind={currentOption?.kind||colorKind} compact /> : <span>{currentOption?.label ?? value}</span>}<Icon name="down" size={15} />
    </button>
    {menu ? createPortal(menu, document.body) : null}
  </div>;
}

export function Modal({ title, children, onClose, footer }) {
  useEscape(onClose);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    (dialog.querySelector('[autofocus], input, textarea, button') || dialog).focus();
    const trap = event => {
      if (event.target.closest('[data-color-editor]')) return;
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=nodes[0], last=nodes.at(-1);
      if(event.shiftKey && document.activeElement===first){ event.preventDefault(); last?.focus(); }
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    };
    dialog.addEventListener('keydown',trap);
    return () => { dialog.removeEventListener('keydown',trap); previous?.focus?.(); };
  }, []);
  return createPortal(<div className="modal-backdrop">
    <section ref={dialogRef} className="modal" role="dialog" aria-label={title} aria-modal="true" tabIndex="-1"><header><h2>{title}</h2><button onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header><div className="modal-body">{children}</div>{footer ? <footer>{footer}</footer> : null}</section>
  </div>, document.body);
}

export function Breadcrumbs({ items }) {
  return <nav className="breadcrumbs" aria-label="路径">{items.map((item, index) => <React.Fragment key={`${item.label}-${index}`}>
    {index ? <Icon name="chevron" size={13} /> : null}
    <button type="button" title={item.label} aria-current={item.current ? 'page' : undefined} className={item.current ? 'current' : ''} onClick={item.onClick} disabled={!item.onClick}>{item.label}</button>
  </React.Fragment>)}</nav>;
}

export function useResizableWidth(storageKey, initial = 252, min = 220, max = 360) {
  const clamp = value => Math.min(max, Math.max(min, value));
  const [width, setWidthState] = useState(() => {
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved) : initial;
  });
  const setWidth = value => setWidthState(current => {
    const next = clamp(typeof value === 'function' ? value(current) : value);
    window.localStorage.setItem(storageKey, String(next));
    return next;
  });
  const resetWidth = () => setWidth(initial);
  return { width, setWidth, resetWidth, min, max };
}

export function ExplorerPanel({ title, label, storageKey, actions, className = '', children }) {
  const [collapsed,setCollapsed]=useState(false);
  const size=useResizableWidth(storageKey,252,220,360);
  const toggleRef=useRef(null);
  const focusPending=useRef(false);
  const toggle=()=>{focusPending.current=true;setCollapsed(current=>!current);};
  useEffect(()=>{if(focusPending.current){toggleRef.current?.focus();focusPending.current=false;}},[collapsed]);
  if(collapsed)return <aside className={`explorer collapsed ${className}`.trim()} aria-label={title}><button ref={toggleRef} title={`展开${label}侧栏`} aria-label={`展开${label}侧栏`} aria-expanded={false} onClick={toggle}><Icon name="right"/></button></aside>;
  return <aside className={`explorer resizable-panel ${className}`.trim()} aria-label={title} style={{width:size.width}}><div className="explorer-heading"><strong>{title}</strong><div>{actions}<button ref={toggleRef} title={`收起${label}侧栏`} aria-label={`收起${label}侧栏`} aria-expanded={true} onClick={toggle}><Icon name="left"/></button></div></div>{children}<ResizeHandle {...size}/></aside>;
}

export function ResizeHandle({ width, setWidth, resetWidth, min, max, side = 'right', label = '调整侧栏宽度' }) {
  const start = event => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add('panel-resizing');
    const move = pointer => {
      const delta = side === 'left' ? startX - pointer.clientX : pointer.clientX - startX;
      setWidth(Math.min(max, Math.max(min, startWidth + delta)));
    };
    const finish = () => {
      document.body.classList.remove('panel-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
  };
  return <button type="button" className={`resize-handle ${side}`} aria-label={label} title="拖拽调整宽度，双击恢复默认" onPointerDown={start} onDoubleClick={resetWidth}><span /></button>;
}
