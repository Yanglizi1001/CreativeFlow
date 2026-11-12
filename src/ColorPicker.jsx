import React, {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {COLOR_PALETTE,readableText,tagColors,validColor} from './colors';

export function ColorPicker({value,defaultColor='#3878cf',label='颜色',onChange,resetLabel='恢复默认',preview='项目计划',tag=false,compact=false}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(value||defaultColor),[error,setError]=useState(''),[position,setPosition]=useState({});
  const trigger=useRef(),panel=useRef();
  const current=validColor(value)?value:validColor(defaultColor)?defaultColor:COLOR_PALETTE[0];
  const close=()=>{setOpen(false);trigger.current?.focus();};
  useLayoutEffect(()=>{if(!open)return;
    setDraft(current);setError('');
    const place=()=>{const r=trigger.current.getBoundingClientRect();const width=Math.min(280,window.innerWidth-16);setPosition({width,left:Math.max(8,Math.min(r.left,window.innerWidth-width-8)),top:Math.max(8,Math.min(r.bottom+6,window.innerHeight-330))});};place();
    const outside=e=>{if(!panel.current?.contains(e.target)&&!trigger.current?.contains(e.target))setOpen(false);};
    const escape=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
      if(e.key==='Tab'){
        const nodes=[...panel.current.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length);
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
      }
    };
    document.addEventListener('pointerdown',outside);panel.current?.addEventListener('keydown',escape);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    const currentPanel=panel.current;currentPanel?.querySelector('button')?.focus();
    return()=>{document.removeEventListener('pointerdown',outside);currentPanel?.removeEventListener('keydown',escape);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  const apply=color=>{if(!validColor(color)){setError('请输入完整的 HEX 色值，例如 #3878cf');return;}onChange(color.toLowerCase());close();};
  return <span className={`color-picker ${compact?'compact':''}`}><button ref={trigger} type="button" className="color-trigger" aria-label={`设置${label}`} title={`设置${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}><i style={{background:current}}/>{compact?null:<><span>{validColor(value)&&(!validColor(defaultColor)||value.toLowerCase()!==defaultColor.toLowerCase())?'自定义颜色':'默认颜色'}</span><small>{current.toUpperCase()}</small></>}</button>{open?createPortal(<section ref={panel} className="color-popover" data-color-editor role="dialog" aria-label={`设置${label}`} style={position} onClick={e=>e.stopPropagation()}><header><strong>{label}</strong><button type="button" aria-label="关闭颜色设置" onClick={close}>×</button></header><div className="color-presets" role="group" aria-label="预设颜色">{COLOR_PALETTE.map(color=><button type="button" key={color} title={color} aria-label={`选择颜色 ${color}`} aria-pressed={color===current.toLowerCase()} style={{background:color,color:readableText(color)}} onClick={()=>apply(color)}>{color===current.toLowerCase()?'✓':''}</button>)}</div><div className="color-custom"><input type="color" aria-label="自定义颜色色板" value={validColor(draft)?draft:current} onChange={e=>{setDraft(e.target.value);setError('');}}/><input type="text" aria-label="HEX 色值" value={draft} spellCheck="false" maxLength={7} onChange={e=>{setDraft(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply(draft);}}}/><button type="button" onClick={()=>apply(draft)}>应用</button></div>{error?<p className="color-error" role="alert">{error}</p>:null}<div className="color-preview">预览 <span style={tag?tagColors(validColor(draft)?draft:current):{background:validColor(draft)?draft:current,color:readableText(validColor(draft)?draft:current)}}>{preview}</span></div><footer><button type="button" onClick={()=>{onChange(null);close();}}>{resetLabel}</button><small>仅修改颜色</small></footer></section>,document.body):null}</span>;
}
