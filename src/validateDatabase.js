export function validDatabase(data) {
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const colors=data?.preferences?.tagColors;
  if(colors!==undefined&&(!object(colors)||!Object.values(colors).every(map=>object(map)&&Object.values(map).every(color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)))))return false;
  const named = value => value && typeof value.id === 'string' && typeof value.name === 'string';
  const optionalString=(obj,key)=>obj[key]==null||typeof obj[key]==='string';
  return data?.schema === 2 && Array.isArray(data.projects) && data.projects.every(project => named(project) && Array.isArray(project.tasks) && project.tasks.every(task => named(task) && Array.isArray(task.versions) && task.versions.every(version => named(version) && Array.isArray(version.lists) && version.lists.every(list => named(list) && Array.isArray(list.items) && list.items.every(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean' && optionalString(item,'time'))))));
}
