export const COLOR_PALETTE = ['#3878cf','#6555ba','#8b4eb6','#bd4975','#b34747','#ae572f','#b65f17','#8a7626','#397c39','#16836c','#087f8c','#687182'];
export const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export const projectColor = project => validColor(project?.color) ? project.color : COLOR_PALETTE[0];
export function legacyTaskColor(task) {
  const palette=['#2563c6','#8b4eb6','#087f8c','#b65f17','#bd4975','#397c39','#6555ba','#ae572f'];
  const hash=[...`${task.project?.id}/${task.id}`].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
  return palette[hash%palette.length];
}
export const defaultTaskColor = task => validColor(task?.defaultColor) ? task.defaultColor : COLOR_PALETTE[0];
export const scheduleColor = task => validColor(task?.color) ? task.color : defaultTaskColor(task);
export function allocateTaskColor(tasks = []) {
  const used=new Set(tasks.map(scheduleColor).map(color=>color.toLowerCase()));
  return COLOR_PALETTE.find(color=>!used.has(color)) || COLOR_PALETTE[tasks.length%COLOR_PALETTE.length];
}
export function readableText(color) {
  const rgb=color.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return luminance>.3 ? '#211e25' : luminance>.179 ? '#000000' : '#ffffff';
}
export function tagColors(color) {
  if(!validColor(color))return undefined;
  const rgb=color.slice(1).match(/../g).map(c=>parseInt(c,16));
  const mix=amount=>'#'+rgb.map(c=>Math.round(c+(255-c)*amount).toString(16).padStart(2,'0')).join('');
  // Tint the background; darken the foreground until normal text has >= 4.5:1 contrast.
  let text=color; const bg=mix(.91);
  const luminance=c=>c.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  for(let scale=.9;(luminance(bg)+.05)/(luminance(text)+.05)<4.5&&scale>=0;scale-=.1)text='#'+rgb.map(c=>Math.round(c*Math.max(0,scale)).toString(16).padStart(2,'0')).join('');
  return {backgroundColor:bg,color:text,borderColor:mix(.72)};
}
export const TAG_GROUPS = [
  {kind:'project',label:'项目状态',custom:'projectStatuses',values:['计划中','进行中','已暂停','已完成']},
  {kind:'type',label:'项目类型',custom:'projectTypes',values:['视频','图片','PPT']},
  {kind:'stage',label:'任务阶段',custom:'taskStages',values:['前期策划','中期拍摄','后期制作','修改中','内部审核','客户审核','已交付']},
  {kind:'version',label:'版本状态',values:['进行中','已完成']},
];
export function defaultTagColor(value) {
  if(['进行中','已完成','客户审核'].includes(value))return '#427c4d';
  if(['已交付','已暂停','未开始'].includes(value))return '#81768b';
  if(value==='修改中')return '#a36332';
  if(['内部审核','待审核'].includes(value))return '#397f77';
  if(['计划中','前期策划','筹备中'].includes(value))return '#386ba8';
  if(['中期拍摄','后期制作','制作中'].includes(value))return '#7956a7';
  return ['#386ba8','#7956a7','#7956a7','#a36332','#397f77','#427c4d'][[...value].reduce((n,c)=>n+c.charCodeAt(0),0)%6];
}
export function migrateColors(db, preserveExisting = true) {
  if(db.preferences?.colorSettingsVersion===2)return db;
  const previous=db.preferences?.colorSettingsVersion;
  return {...db,preferences:{...db.preferences,colorSettingsVersion:2},projects:db.projects.map(project=>{
    const allocated=[];
    return {...project,defaultColor:validColor(project.defaultColor)?project.defaultColor:projectColor(project),tasks:project.tasks.map(task=>{
      const fallback=allocateTaskColor(allocated);
      const color=validColor(task.color)?task.color:!preserveExisting?fallback:previous===1?projectColor(project):legacyTaskColor({...task,project});
      const next={...task,color,defaultColor:validColor(task.defaultColor)?task.defaultColor:color};allocated.push(next);return next;
    })};
  })};
}
