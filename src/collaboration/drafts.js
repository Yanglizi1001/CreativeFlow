import {useCallback,useRef,useState} from 'react';
const prefix='creative-flow-draft-v1:';
function read(key){try{return JSON.parse(localStorage.getItem(prefix+key))?.draft||null;}catch{return null;}}
export function usePersistentDraft(key) {
  const [state,setState]=useState(()=>({key,value:read(key)})),[error,setError]=useState('');
  const value=state.key===key?state.value:read(key),latest=useRef(value);latest.current=value;
  const setValue=useCallback(updater=>{
    const next=typeof updater==='function'?updater(latest.current):updater;latest.current=next;
    try{if(next)localStorage.setItem(prefix+key,JSON.stringify({key,draft:next,at:new Date().toISOString()}));else localStorage.removeItem(prefix+key);setError('');}
    catch{setError('草稿无法自动保存到本机，请先复制文字并导出项目备份。');}
    setState({key,value:next});
  },[key]);
  return [value,setValue,error];
}
export function readDrafts(spaceId) {
  const result=[];for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);if(!key?.startsWith(prefix)||!key.includes(':'+spaceId+':'))continue;
    try{const data=JSON.parse(localStorage.getItem(key));if(data?.draft?.text?.trim())result.push(data);}catch{}
  }return result;
}
