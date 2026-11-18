import { useRef } from 'react';
import { validDatabase } from './validateDatabase';
export function useBackups(flow,toast) {
  const inputRef=useRef();
  const exportData=async()=>{try{const json=JSON.stringify(await flow.flush(),null,2);if(window.creativeFlowWindow?.exportBackup){if(await window.creativeFlowWindow.exportBackup(json))toast('备份已导出');return;}const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='创作流备份-'+new Date().toLocaleDateString('sv-SE')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{toast('备份导出失败，请重试','error');}};
  const receive=async e=>{try{const text=e?.target?.files?.[0]?await e.target.files[0].text():await window.creativeFlowWindow?.importBackup?.();if(!text)return;const db=JSON.parse(text);if(!validDatabase(db))throw Error();if(confirm('导入将替换当前项目数据并清空撤销记录，建议先导出备份。继续导入？'))await flow.replaceDatabase(db);}catch{toast('备份无法导入，请检查文件和本地保存状态','error');}finally{if(inputRef.current)inputRef.current.value='';}};
  return {inputRef,exportData,receive,importData:()=>window.creativeFlowWindow?.importBackup?receive():inputRef.current?.click()};
}
