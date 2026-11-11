export function validDatabase(data) {
  const named = value => value && typeof value.id === 'string' && typeof value.name === 'string';
  const optionalString=(obj,key)=>obj[key]==null||typeof obj[key]==='string';
  return data?.schema === 2 && Array.isArray(data.projects) && data.projects.every(project => named(project) && Array.isArray(project.tasks) && project.tasks.every(task => named(task) && Array.isArray(task.versions) && task.versions.every(version => named(version) && Array.isArray(version.lists) && version.lists.every(list => named(list) && Array.isArray(list.items) && list.items.every(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean' && optionalString(item,'time'))))));
}
