export const isGeneralOpinion = item => !item?.time;
export function orderedOpinions(items = []) {
  return [...items.filter(isGeneralOpinion),...items.filter(item=>!isGeneralOpinion(item))];
}
export function parseOpinionTime(value) {
  if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.trim()))return null;
  const parts=value.trim().split(':').map(Number);
  if(parts.at(-1)>59 || (parts.length===3&&parts[1]>59))return null;
  return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];
}
export function opinionPayload(kind,text,time,duration=0) {
  if(!text.trim())return {error:'请输入修改意见。'};
  if(kind==='general')return {value:{text:text.trim(),time:'',kind:'general'}};
  const seconds=parseOpinionTime(time);
  if(seconds===null)return {error:'请输入有效时间码，例如 00:32 或 01:02:03。'};
  if(duration>0 && seconds>Math.ceil(duration))return {error:'时间码不能超过视频时长。'};
  return {value:{text:text.trim(),time:time.trim(),kind:'time'}};
}
