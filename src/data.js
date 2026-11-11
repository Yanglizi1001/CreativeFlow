import { demoDatabase } from './demoData';
export const APP_STORAGE_KEY = 'creative-flow-db-v2';
export const seedData = demoDatabase();
export function cloneSeedData() { return demoDatabase(); }
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function countItems(target) {
  const lists = target?.items ? [target] : target?.lists ?? target?.versions?.flatMap(version => version.lists) ?? target?.tasks?.flatMap(task => task.versions.flatMap(version => version.lists)) ?? [];
  const items = lists.flatMap(entry => entry.items);
  return { done: items.filter(entry => entry.done).length, total: items.length };
}
