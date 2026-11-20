const copy=value=>structuredClone(value);
export const versionNumber=name=>Number.parseInt(String(name||'').replace(/\D/g,''),10)||0;
export function nextVersionNumber(task){return Math.max(task?.versionSequence||0,0,...(task?.versions||[]).map(v=>versionNumber(v.name)))+1;}
export function versionSignature(version){
 if(!version)return '';
 const file=version.file?{...version.file}:null;if(file)delete file.url;
 return JSON.stringify({id:version.id,name:version.name,status:version.status,createdAt:version.createdAt,file,lists:version.lists.map(l=>({id:l.id,name:l.name,items:l.items.map(i=>({id:i.id,text:i.text,time:i.time||'',done:i.done,status:i.status}))}))});
}
export function removeLocalVersion(db,{projectId,taskId,versionId,signature},at=new Date().toISOString()){
 const next=copy(db),p=next.projects.find(p=>p.id===projectId),t=p?.tasks.find(t=>t.id===taskId),index=t?.versions.findIndex(v=>v.id===versionId),v=t?.versions[index];
 if(!v)throw Error('版本已删除或不存在，请重新选择');
 if(signature!==versionSignature(v))throw Error('版本或修改意见已更新，请重新核对后再删除');
 t.versionSequence=Math.max(nextVersionNumber(t)-1,t.versionSequence||0);t.versions.splice(index,1);
 next.versionTrash=[{id:crypto.randomUUID(),projectId,projectName:p.name,taskId,taskName:t.name,version:v,index,deletedAt:at,deletedBy:'本机用户'},...(next.versionTrash||[])];
 return next;
}
export function restoreLocalVersion(db,id){
 const next=copy(db),record=next.versionTrash?.find(r=>r.id===id);if(!record)throw Error('该版本已经恢复或不存在');
 const t=next.projects.find(p=>p.id===record.projectId)?.tasks.find(t=>t.id===record.taskId);if(!t)throw Error('所属项目或任务不存在，请先撤销项目或任务的删除');
 if(t.versions.some(v=>v.id===record.version.id||v.name.trim().toLowerCase()===record.version.name.trim().toLowerCase()))throw Error('任务中存在相同版本或同名版本，请先重命名现有版本');
 t.versions.splice(Math.min(record.index,t.versions.length),0,record.version);t.versionSequence=Math.max(nextVersionNumber(t)-1,t.versionSequence||0);
 next.versionTrash=next.versionTrash.filter(r=>r.id!==id);return next;
}
