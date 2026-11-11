import { dateKey, parseDate, weekBounds } from './dates';
export const taskPeriod = task => ({start:task.start || task.project?.start || task.due || task.project?.due, end:task.due || task.project?.due});
export const taskOnDate = (task,day) => {const {start,end}=taskPeriod(task);return Boolean(day&&start&&end&&start<=day&&end>=day);};
export function taskColor(task) {
  const palette=['#2563c6','#8b4eb6','#087f8c','#b65f17','#bd4975','#397c39','#6555ba','#ae572f'];
  const hash=[...`${task.project?.id}/${task.id}`].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
  return palette[hash%palette.length];
}
export function calendarWeeks(value,tasks) {
 const first=value.slice(0,8)+'01',firstDay=weekBounds(first)[0];const last=new Date(parseDate(first));last.setMonth(last.getMonth()+1);last.setDate(0);
 const finalDay=weekBounds(dateKey(last))[1];const dates=[];for(let d=parseDate(firstDay);dateKey(d)<=finalDay;d.setDate(d.getDate()+1))dates.push(dateKey(d));
 const scheduled=tasks.map(task=>({task,...taskPeriod(task)})).filter(t=>t.start&&t.end&&t.start<=t.end&&t.start<=finalDay&&t.end>=firstDay).sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end)||a.task.id.localeCompare(b.task.id));
 const lanes=[];for(const item of scheduled){let lane=lanes.findIndex(end=>end<item.start);if(lane<0)lane=lanes.length;lanes[lane]=item.end;item.lane=lane;}
 return Array.from({length:dates.length/7},(_,week)=>{const days=dates.slice(week*7,week*7+7);return {days,segments:scheduled.filter(t=>t.start<=days[6]&&t.end>=days[0]).map(item=>({...item,left:Math.max(0,days.findIndex(day=>day>=item.start)),right:item.end>=days[6]?6:days.findLastIndex(day=>day<=item.end)})),hidden:days.map(day=>scheduled.filter(t=>t.lane>=3&&t.start<=day&&t.end>=day).length)};});
}
