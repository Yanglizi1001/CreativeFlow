const {isDeepStrictEqual}=require('node:util');
const copy=value=>structuredClone(value);
const levels={none:0,view:1,comment:2,edit:3,manage:4};
const workFields=(kind,fields)=>{const result={...fields};if(kind==='version')delete result.duration;if(kind==='opinion')for(const key of ['createdAt','updatedAt','statusChangedAt','timeOrigin','inheritedFrom','sourceCreatedAt'])delete result[key];return result;};
function applyCommands(snapshot,commands,{strict=false,actor}={}) {
  const data=copy(snapshot),rows=new Map(data.entities.map(row=>[row.id,row]));
  for(const command of commands) {
    let row=rows.get(command.id),parent=rows.get(command.parentId);
    if(strict) {
      if(command.type==='create'||command.type==='restore') {
        if(row)throw Error('记录已存在，请刷新后重试');
        const required=command.kind==='project'?0:command.kind==='preferences'?4:['list','opinion'].includes(command.kind)?2:4;
        const available=command.type==='restore'?Math.max(levels[parent?.permission]||0,levels[command.permission]||0):levels[parent?.permission]||0;
        if(command.kind==='project'&&actor.role==='reviewer'||command.kind==='preferences'&&actor.role!=='owner'||required>0&&available<required&&command.kind!=='preferences')throw Error('没有创建此内容的权限');
      } else {
        if(!row)throw Error('内容已删除，请先复制草稿再重新选择');
        let required=['project','task','preferences'].includes(row.kind)?4:row.kind==='opinion'&&row.createdBy===actor.memberId?2:3;
        if(command.type==='delete'&&row.kind==='version')required=4;
        if((levels[row.permission]||0)<required||row.kind==='preferences'&&actor.role!=='owner')throw Error('没有修改此内容的权限');
        if(command.type==='delete'&&(command.expected?!isDeepStrictEqual(workFields(row.kind,command.expected),workFields(row.kind,row.fields)):command.revision!==row.revision))throw Error('内容已在其他窗口修改，请重新选择');
        if(command.type==='update')for(const [key,value] of Object.entries(workFields(row.kind,command.expected||{})))if(!isDeepStrictEqual(row.fields[key]??null,value)&&!isDeepStrictEqual(row.fields[key]??null,command.fields[key]??null))throw Error('内容已在其他窗口修改，草稿已保留，请核对后重试');
      }
    }
    if(command.type==='create'||command.type==='restore') {
      if(row || command.parentId&&!parent)continue;
      rows.set(command.id,{kind:command.kind,id:command.id,parentId:command.parentId??null,order:command.order||0,fields:copy(command.fields),revision:command.type==='restore'?(command.revision||0)+1:1,createdBy:command.createdBy||actor?.memberId||'',creatorName:command.creatorName||actor?.displayName||'',permission:['project','task','version','preferences'].includes(command.kind)?'manage':parent?.permission||'manage'});
    } else if(command.type==='delete')rows.delete(command.id);
    else if(row) {
      const fields={...row.fields};for(const [key,value] of Object.entries(command.fields||{})){if(value===null)delete fields[key];else fields[key]=copy(value);}
      rows.set(row.id,{...row,fields,revision:row.revision+1});
    }
  }
  // A concurrent parent deletion cannot leave orphan opinions in the view.
  let removed=true;while(removed){removed=false;for(const row of rows.values())if(row.parentId&&!rows.has(row.parentId)){rows.delete(row.id);removed=true;}}
  data.entities=[...rows.values()];return data;
}
function viewState(state,actor) {
  let data=copy(state.server);
  if(state.authorized!==false)for(const pending of state.pending)data=applyCommands(data,pending.batch.commands,{actor});
  else data={...data,entities:[],members:[]};
  const conflicts=state.pending.filter(p=>p.status==='conflict').map(p=>({id:p.batch.operationId,label:p.label,error:p.error,httpStatus:p.httpStatus,batch:p.batch}));
  return {data,pendingCount:state.pending.length,conflicts,serverEntities:state.server.entities.filter(row=>conflicts.some(c=>c.batch.commands.some(command=>command.id===row.id))),online:state.online===true,authorized:state.authorized!==false,error:state.error||'',updatedAt:state.updatedAt||null};
}
function inverseCommands(before,commands,after) {
  const old=new Map(before.entities.map(row=>[row.id,row])),current=new Map(after.entities.map(row=>[row.id,row]));
  const inverse=[];
  for(const command of [...commands].reverse()) {
    const previous=old.get(command.id),now=current.get(command.id);
    if((command.type==='create'||command.type==='restore')&&now)inverse.push({type:'delete',kind:command.kind,id:command.id,revision:now.revision,expected:copy(now.fields)});
    else if(command.type==='update'&&previous&&now) {
      const fields={},expected={};for(const key of Object.keys(command.fields)){fields[key]=previous.fields[key]??null;expected[key]=now.fields[key]??null;}
      inverse.push({type:'update',kind:command.kind,id:command.id,fields,expected,revision:now.revision});
    } else if(command.type==='delete'&&previous)inverse.push({type:'restore',kind:previous.kind,id:previous.id,parentId:previous.parentId,order:previous.order,fields:copy(previous.fields),expected:copy(previous.fields),revision:previous.revision+1,createdBy:previous.createdBy,creatorName:previous.creatorName,permission:previous.permission});
    else return null;
  }
  return inverse;
}
module.exports={applyCommands,viewState,inverseCommands};
