// Work-data patches preserve unrelated fields such as playback position and activity logs.
const volatile = new Set(['versionSequence','activities', 'reviewPosition', 'reviewedAt', 'duration']);
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function diffWork(before, after, path = []) {
  if (same(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after) && [...before, ...after].every(v => v && typeof v === 'object' && typeof v.id === 'string')) {
    const patches = [];
    for (const value of before) if (!after.some(v => v.id === value.id)) patches.push({path:[...path,{id:value.id}],before:copy(value),beforeExists:true,afterExists:false,index:before.indexOf(value)});
    for (const value of after) {
      const previous = before.find(v => v.id === value.id);
      if (!previous) patches.push({path:[...path,{id:value.id}],after:copy(value),beforeExists:false,afterExists:true,index:after.indexOf(value)});
      else patches.push(...diffWork(previous,value,[...path,{id:value.id}]));
    }
    return patches;
  }
  if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
    return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!volatile.has(key)).flatMap(key=>diffWork(before[key],after[key],[...path,key]));
  }
  return [{path,before:copy(before),after:copy(after),beforeExists:before!==undefined,afterExists:after!==undefined}];
}
export function applyWork(db, patches, direction = 'redo') {
  const next=copy(db);
  for (const patch of direction==='undo' ? [...patches].reverse() : patches) {
    let parent=next;
    for (const segment of patch.path.slice(0,-1)) {
      parent=typeof segment==='object'?parent?.find(v=>v.id===segment.id):parent?.[segment];
      if (!parent) break;
    }
    if (!parent) continue;
    const key=patch.path.at(-1), exists=patch[direction==='undo'?'beforeExists':'afterExists'];
    const value=copy(patch[direction==='undo'?'before':'after']);
    if (typeof key==='object') {
      const index=parent.findIndex(v=>v.id===key.id);
      if (!exists && index>=0) parent.splice(index,1);
      else if (exists && index>=0) parent[index]=value;
      else if (exists) parent.splice(Math.min(patch.index??parent.length,parent.length),0,value);
    } else if (exists) parent[key]=value;
    else delete parent[key];
  }
  return next;
}
export function addHistory(history, before, after, label, token) {
  const patches=diffWork(before,after);
  if (!patches.length) return history;
  const past=[...history.past,{id:token,label,patches}].slice(-50);
  // Bound memory and local storage even when deleting projects with many opinions.
  while (past.length && JSON.stringify(past).length>750000) past.shift();
  return {...history,past,future:[],notice:past.length?'':'本次操作超出撤销容量，未记录撤销历史'};
}
