import React,{useEffect,useRef,useState} from 'react';
import {AcrylicSelect,Button,Icon} from './ui';
import {normalizeOpinionSort,sortOpinions,opinionDate} from './opinionSort.mjs';
import {isGeneralOpinion} from './opinions';
export function useOpinionSorting(scope,space){
 const key=`creative-flow-opinion-sort-v1:${space?.id||'personal'}:${scope}`;
 const read=()=>{try{return normalizeOpinionSort(JSON.parse(localStorage.getItem(key))||{},scope);}catch{return normalizeOpinionSort({},scope);}};
 const [saved,setSaved]=useState(()=>({key,value:read()})),[error,setError]=useState('');
 const value=saved.key===key?saved.value:read();
 useEffect(()=>{setSaved({key,value:read()});setError('');const receive=e=>{if((e.type==='storage'?e.key:e.detail)===key)setSaved({key,value:read()});};window.addEventListener('storage',receive);window.addEventListener('creative-flow-sort-change',receive);return()=>{window.removeEventListener('storage',receive);window.removeEventListener('creative-flow-sort-change',receive);};},[key]);
 function set(next){const result=normalizeOpinionSort(typeof next==='function'?next(value):next,scope);setSaved({key,value:result});try{localStorage.setItem(key,JSON.stringify(result));setError('');window.dispatchEvent(new CustomEvent('creative-flow-sort-change',{detail:key}));}catch{setError('排序已应用，偏好暂未保存');}}
 return [value,set,error];
}
export function useOpinionSorter(settings,locked=false){
 const orders=useRef(new Map());
 return (entries,key='list',itemOf=value=>value)=>{
  const cache=orders.current.get(key);
  if(locked&&cache){const current=new Map(entries.map(e=>[itemOf(e).id,e]));return cache.map(id=>current.get(id)).filter(Boolean);}
  const result=sortOpinions(entries,settings,itemOf);orders.current.set(key,result.map(e=>itemOf(e).id));return result;
 };
}
export function OpinionSortControls({value,onChange,error,disabled=false,compact=false,scope='task'}){
 const changeMode=mode=>onChange({...value,mode,direction:mode==='created'||mode==='updated'?'desc':'asc'});
 return <div className={`opinion-sort-controls ${compact?'compact':''}`} aria-label="修改意见排序设置"><div className="opinion-sort-row">
  <AcrylicSelect label="意见排序" disabled={disabled} value={value.mode} options={[{value:'original',label:'原始顺序'},{value:'timeline',label:'视频时间码'},{value:'created',label:'意见创建时间'},{value:'updated',label:'最近修改时间'}]} onChange={changeMode}/>
  {value.mode!=='original'?<Button disabled={disabled} aria-label="切换意见排序方向" onClick={()=>onChange({...value,direction:value.direction==='asc'?'desc':'asc'})}>{value.mode==='timeline'?(value.direction==='asc'?'从前到后':'从后到前'):(value.direction==='desc'?'最新优先':'最早优先')}</Button>:null}
  <label title="按视频时间码排序时，在整体意见与时间点意见各组内生效"><input type="checkbox" checked={value.openFirst} disabled={disabled} aria-label="未完成优先" onChange={e=>onChange({...value,openFirst:e.target.checked})}/>未完成优先</label>
  {value.mode==='timeline'?<label><input type="checkbox" checked={value.generalFirst} disabled={disabled} aria-label="整体意见置顶" onChange={e=>onChange({...value,generalFirst:e.target.checked})}/>整体意见置顶</label>:null}
  <Button disabled={disabled} aria-label="恢复默认意见排序" onClick={()=>onChange(normalizeOpinionSort({},scope))}>重置</Button>
  </div>
  {error?<small role="status">{error}</small>:null}{disabled?<small className="opinion-sort-hint">编辑结束后更新排序</small>:null}
 </div>;
}
export function OpinionGroups({entries,value,onChange,itemOf=x=>x,disabled=false,children}){
 if(value.mode!=='timeline')return children(entries);
 const general=entries.filter(e=>isGeneralOpinion(itemOf(e))),timed=entries.filter(e=>!isGeneralOpinion(itemOf(e)));
 if(!general.length)return children(timed);
 const block=<section className="opinion-section opinion-section-general" aria-label="整体意见分组" key="general"><button type="button" className="opinion-general-heading" aria-label={`整体意见（${general.length}）`} disabled={disabled} aria-expanded={!value.hideGeneral} onClick={event=>{event.stopPropagation();onChange({...value,hideGeneral:!value.hideGeneral});}}><span className="opinion-heading-title"><Icon name={value.hideGeneral?'right':'down'} size={13}/><Icon name="comment" size={14}/><strong>整体意见（{general.length}）</strong></span><small>针对整部视频</small></button>{!value.hideGeneral?children(general):null}</section>;
 const timedBlock=timed.length?<section className="opinion-section opinion-section-timed" aria-label="时间点意见分组" key="timed"><header className="opinion-timed-heading"><span className="opinion-heading-title"><Icon name="clock" size={14}/><strong>时间点意见（{timed.length}）</strong></span><small>按视频位置处理</small></header>{children(timed)}</section>:null;
 return value.generalFirst?<>{block}{timedBlock}</>:<>{timedBlock}{block}</>;
}
export function opinionTimeTitle(item){const f=x=>opinionDate(x)===null?'未记录':new Date(x).toLocaleString('zh-CN',{hour12:false});return `创建时间：${f(item.createdAt)}\n最近修改：${f(item.updatedAt||item.createdAt)}`;}
export function OpinionStamp({item,value}){if(!['created','updated'].includes(value.mode))return null;const time=value.mode==='created'?item.createdAt:item.updatedAt||item.createdAt;return <small className="opinion-date" title={opinionTimeTitle(item)}>{opinionDate(time)===null?'时间未记录':new Date(time).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</small>;}
