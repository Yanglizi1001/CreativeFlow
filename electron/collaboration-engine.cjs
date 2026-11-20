const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('crypto');
const {applyCommands,viewState,inverseCommands}=require('./collaboration-state.cjs');
const {isDeepStrictEqual}=require('node:util');
class CollaborationEngine {
  constructor(file,{getConnection,request,broadcast}) {
    this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS submitted(space TEXT,operation TEXT,payload TEXT,PRIMARY KEY(space,operation));');
    this.getConnection=getConnection;this.request=request;this.broadcast=broadcast;this.running=new Map();this.readSequence=new Map();
    this.active=this.db.prepare("SELECT value FROM settings WHERE id='active'").get()?.value||null;
    this.history=new Map();for(const row of this.db.prepare('SELECT id,state FROM spaces').all()){const state=JSON.parse(row.state);state.online=false;state.error='正在连接主机';this.save(row.id,state);}
  }
  load(id){const row=this.db.prepare('SELECT state FROM spaces WHERE id=?').get(id);return row?JSON.parse(row.state):null;}
  save(id,state){this.db.prepare('INSERT INTO spaces(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(id,JSON.stringify(state));}
  status(id=this.active) {
    if(!id)return {space:null,data:null,pendingCount:0,conflicts:[],history:{past:[],future:[]}};
    const connection=this.getConnection(id),state=this.load(id);
    if(!state)return {space:connection,data:null,pendingCount:0,conflicts:[],history:{past:[],future:[]}};
    const history=this.history.get(id)||{past:[],future:[]};
    return {...viewState(state,connection),space:connection,history:{past:history.past.map(({id,label})=>({id,label})),future:history.future.map(({id,label})=>({id,label}))}};
  }
  emit(){this.broadcast(this.status());}
  async select(id) {
    if(id){this.getConnection(id);if(!this.load(id))await this.refresh(id);}
    this.active=id||null;this.db.prepare("INSERT INTO settings(id,value) VALUES('active',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").run(id||null);this.emit();
    if(id)void this.pump(id);return this.status();
  }
  async refresh(id) {
    const ticket=(this.readSequence.get(id)||0)+1;this.readSequence.set(id,ticket);
    const data=await this.request(id,'snapshot');if(this.closed||this.readSequence.get(id)!==ticket)return;const previous=this.load(id);
    const state=previous||{server:data,pending:[]};
    if(state.pending.length&&state.server.epoch!==data.epoch){state.pending[0].status='conflict';state.pending[0].error='主机已恢复备份，旧空间中的离线修改需要人工核对。请导出草稿后放弃旧队列。';}
    state.server=data;state.online=true;state.authorized=true;state.updatedAt=new Date().toISOString();state.error='';this.save(id,state);if(id===this.active)this.emit();return state;
  }
  enqueue(id,batch,label='更新协作资料',{history=true}={}) {
    if(!batch||!Array.isArray(batch.commands)||!batch.commands.length||batch.commands.length>5000||Buffer.byteLength(JSON.stringify(batch),'utf8')>8*1024*1024)throw Error('本次资料过大，请拆分项目后分批上传（单次最多 5000 项、8 MB 文字资料）');
    const actor=this.getConnection(id),state=this.load(id);if(!state)throw Error('尚未同步此空间，无法离线编辑');
    const submitted=this.db.prepare('SELECT payload FROM submitted WHERE space=? AND operation=?').get(id,batch.operationId);
    if(submitted){if(submitted.payload!==JSON.stringify(batch))throw Error('重复操作标识对应了不同内容');return batch.operationId;}
    if(state.authorized===false)throw Error('身份已失效，请重新加入空间；离线草稿可从同步中心导出');
    if(state.pending.some(p=>p.status==='conflict'))throw Error('请先到同步中心处理冲突，当前草稿尚未提交');
    if(batch.epoch!==state.server.epoch)throw Error('空间已改变，请刷新后重新操作');
    const before=viewState(state,actor).data,after=applyCommands(before,batch.commands,{strict:true,actor});
    state.pending.push({batch,label,status:'pending'});
    this.db.exec('BEGIN IMMEDIATE');try{this.save(id,state);this.db.prepare('INSERT INTO submitted(space,operation,payload) VALUES(?,?,?)').run(id,batch.operationId,JSON.stringify(batch));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
    if(history){const h=this.history.get(id)||{past:[],future:[]},inverse=inverseCommands(before,batch.commands,after),forward=structuredClone(batch.commands);for(const command of forward)if(command.type==='delete')command.expected=structuredClone(before.entities.find(row=>row.id===command.id).fields);h.future=[];if(inverse)h.past.push({id:batch.operationId,label,inverse,forward});h.past=h.past.slice(-50);this.history.set(id,h);}
    if(id===this.active)this.emit();void this.pump(id);return batch.operationId;
  }
  pump(id) {
    if(this.running.has(id))return this.running.get(id);
    const task=(async()=>{
      try {
        await this.refresh(id);
        for(;;) {
          if(this.closed)return;
          let state=this.load(id),item=state.pending[0];if(!item||item.status==='conflict')break;
          if(item.batch.epoch!==state.server.epoch)break;
          await this.request(id,'commands',item.batch);
          // Keep the optimistic acknowledged state durable before the next GET.
          state=this.load(id);if(state.pending[0]?.batch.operationId!==item.batch.operationId)throw Error('同步队列发生变化');
          state.server=applyCommands(state.server,item.batch.commands,{actor:this.getConnection(id)});state.pending.shift();state.online=true;state.error='';this.save(id,state);if(id===this.active)this.emit();
        }
        await this.refresh(id);
      } catch(error) {
        if(this.closed)return;let refreshed;
        if([400,403,409,413].includes(error.status))try{refreshed=await this.request(id,'snapshot');}catch{}
        if(this.closed)return;const state=this.load(id);if(!state)return;
        state.online=false;state.error=error.message;
        if([400,403,409,413].includes(error.status)&&state.pending[0]){state.pending[0].status='conflict';state.pending[0].error=error.message;state.pending[0].httpStatus=error.status;state.online=true;if(refreshed)state.server=refreshed;}
        if(error.status===401){state.authorized=false;state.server={...state.server,entities:[],members:[]};if(state.pending[0]){state.pending[0].status='conflict';state.pending[0].error='身份已失效，请导出离线草稿后重新加入';}}
        this.save(id,state);if(id===this.active)this.emit();
      }
    })().finally(()=>this.running.delete(id));this.running.set(id,task);return task;
  }
  async resolve(id,operationId,choice,observed) {
    await this.pump(id);const state=this.load(id),item=state.pending[0];if(!item||item.batch.operationId!==operationId)throw Error('冲突记录已变化，请重新打开同步中心');
    if(choice==='discard'){state.pending=[];this.history.delete(id);}
    else if(choice==='retryOriginal'){if(item.batch.epoch!==state.server.epoch)throw Error('空间已恢复，请先导出草稿');item.status='pending';delete item.error;}
    else if(choice==='retry') {
      if(item.batch.epoch!==state.server.epoch)throw Error('恢复前的修改不能直接覆盖恢复后的空间，请先导出草稿');
      if(!item.batch.commands.every(c=>c.type==='update'))throw Error('新增或删除冲突不能强制覆盖，请导出草稿后重新操作');
      const rows=new Map(state.server.entities.map(row=>[row.id,row]));
      const current=state.server.entities.filter(row=>item.batch.commands.some(command=>command.id===row.id));
      if(!isDeepStrictEqual(current,observed))throw Error('主机内容又有变化，请核对最新对比后重新提交');
      for(const command of item.batch.commands){const row=rows.get(command.id);if(!row)throw Error('内容已删除或权限已收回，请保留草稿重新处理');command.expected=Object.fromEntries(Object.keys(command.fields).map(key=>[key,row.fields[key]??null]));command.revision=row.revision;}
      item.batch.operationId=randomUUID();item.status='pending';delete item.error;this.history.delete(id);
    } else throw Error('不支持的冲突处理方式');
    this.save(id,state);if(id===this.active)this.emit();void this.pump(id);
  }
  travel(id,direction,expectedId) {
    const h=this.history.get(id)||{past:[],future:[]},source=direction==='undo'?h.past:h.future,entry=source.at(-1);if(!entry||expectedId&&entry.id!==expectedId)return null;
    const state=this.load(id),commands=structuredClone(direction==='undo'?entry.inverse:entry.forward),rows=new Map(viewState(state,this.getConnection(id)).data.entities.map(row=>[row.id,row]));
    if(direction==='redo')for(const command of commands)if(command.type==='create'){command.type='restore';command.expected=structuredClone(command.fields);command.revision=2;}
    for(const command of commands)if(command.type==='delete'){const row=rows.get(command.id);if(!row)throw Error('内容已变化，无法撤销');}
    this.enqueue(id,{operationId:randomUUID(),epoch:state.server.epoch,commands},(direction==='undo'?'撤销：':'重做：')+entry.label,{history:false});
    source.pop();(direction==='undo'?h.future:h.past).push(entry);this.history.set(id,h);this.emit();return entry.label;
  }
  exportPending(id){return {format:'creativeflow-offline-drafts-v1',space:this.getConnection(id),exportedAt:new Date().toISOString(),pending:this.load(id)?.pending||[]};}
  start(){this.timer=setInterval(()=>{for(const row of this.db.prepare('SELECT id,state FROM spaces').all()){if(row.id===this.active||JSON.parse(row.state).pending.length)void this.pump(row.id);}},3000);this.timer.unref?.();if(this.active)void this.pump(this.active);}
  close(){this.closed=true;clearInterval(this.timer);this.db.close();}
}
module.exports={CollaborationEngine};
