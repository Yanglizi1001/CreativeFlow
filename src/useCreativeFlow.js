import { useEffect, useMemo, useState } from 'react';
import { APP_STORAGE_KEY, cloneSeedData, uid } from './data';
import { validDatabase } from './validateDatabase';

function loadDatabase() {
  let stored;
  try {
    stored = localStorage.getItem(APP_STORAGE_KEY);
    if (!stored) return cloneSeedData();
    const parsed = JSON.parse(stored);
    if (!validDatabase(parsed)) throw new Error('invalid database');
    return { ...parsed, preferences: { ...parsed.preferences, customOptions: { projectStatuses: [], projectTypes: [], taskStages: [], ...(parsed.preferences?.customOptions || {}) } } };
  } catch {
    const next=cloneSeedData();
    if(stored) { try {localStorage.setItem(APP_STORAGE_KEY+'-recovery',stored);next.preferences.recoveryAvailable=true;} catch {} }
    return next;
  }
}

function activityTime() {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function appendActivity(project, text) {
  if (!text) return project;
  const entry = { id: uid('activity'), at: activityTime(), text };
  return { ...project, activities: [entry, ...(project.activities || [])].slice(0, 50) };
}

export function useCreativeFlow() {
  const [db, setDb] = useState(loadDatabase);
  const [deletedItem, setDeletedItem] = useState(null);
  const [saveStatus, setSaveStatus] = useState('已保存');
  const [selection, setSelection] = useState(() => {
    const project = db.projects[0];
    return { projectId: project?.id, taskId: project?.tasks[0]?.id, versionId: project?.tasks[0]?.versions.at(-1)?.id, listId: project?.tasks[0]?.versions.at(-1)?.lists.at(-1)?.id };
  });

  useEffect(() => {
    setSaveStatus('保存中');
    const save = () => {
      try { localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(db)); setSaveStatus('已保存'); }
      catch { setSaveStatus('保存失败，请导出备份'); }
    };
    save();
  }, [db]);

  useEffect(() => {
    const sync = event => { if (event.key === APP_STORAGE_KEY && event.newValue) { try { const next = JSON.parse(event.newValue); if(validDatabase(next)) setDb(next); } catch {} } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const active = useMemo(() => {
    const project = db.projects.find(entry => entry.id === selection.projectId) ?? db.projects[0];
    const task = project?.tasks.find(entry => entry.id === selection.taskId) ?? project?.tasks[0];
    const version = task?.versions.find(entry => entry.id === selection.versionId) ?? task?.versions.at(-1);
    const list = version?.lists.find(entry => entry.id === selection.listId) ?? version?.lists[0];
    return { project, task, version, list };
  }, [db, selection]);

  const chooseProject = projectId => {
    const project = db.projects.find(entry => entry.id === projectId);
    const task = project?.tasks[0];
    const version = task?.versions.at(-1);
    setSelection({ projectId, taskId: task?.id, versionId: version?.id, listId: version?.lists[0]?.id });
  };
  const chooseTask = taskId => {
    const task = active.project.tasks.find(entry => entry.id === taskId);
    const version = task?.versions.at(-1);
    setSelection(current => ({ ...current, taskId, versionId: version?.id, listId: version?.lists[0]?.id }));
  };
  const chooseVersion = versionId => {
    setSelection(current => {
      const project = db.projects.find(entry => entry.id === current.projectId);
      const task = project?.tasks.find(entry => entry.id === current.taskId);
      const version = task?.versions.find(entry => entry.id === versionId);
      return version ? { ...current, versionId, listId: version.lists[0]?.id } : current;
    });
  };
  const chooseList = listId => setSelection(current => ({ ...current, listId }));
  const selectPath = ({ projectId, taskId, versionId, listId }) => {
    const project = db.projects.find(entry => entry.id === projectId);
    const task = project?.tasks.find(entry => entry.id === taskId) ?? project?.tasks[0];
    const version = task?.versions.find(entry => entry.id === versionId) ?? task?.versions.at(-1);
    const list = version?.lists.find(entry => entry.id === listId) ?? version?.lists[0];
    setSelection({ projectId: project?.id, taskId: task?.id, versionId: version?.id, listId: list?.id });
  };

  const updateProjectAt = (projectId, updater, activityText = '') => setDb(current => ({
    ...current,
    projects: current.projects.map(project => project.id === projectId ? appendActivity(updater(project), activityText) : project)
  }));
  const updateProject = (updater, activityText = '') => updateProjectAt(active.project?.id, updater, activityText);
  const updateTask = (updater, activityText = '') => updateProject(project => ({ ...project, tasks: project.tasks.map(task => task.id === active.task?.id ? updater(task) : task) }), activityText);
  const updateVersion = (updater, activityText = '') => updateTask(task => ({ ...task, versions: task.versions.map(version => version.id === active.version?.id ? updater(version) : version) }), activityText);
  const updateList = (updater, activityText = '') => updateVersion(version => ({ ...version, lists: version.lists.map(list => list.id === active.list?.id ? updater(list) : list) }), activityText);
  const recordActivity = (text, projectId = active.project?.id) => updateProjectAt(projectId, project => project, text);

  const addProject = values => {
    const taskId = uid('task'); const versionId = uid('version');
    const project = { id: uid('project'), name: values.name, description: values.description || '', notes: '', status: values.projectStatus || '计划中', type: values.type || '视频', start: values.start || '', due: values.due || '', color: values.color || '#1677ff', activities: [{ id: uid('activity'), at: activityTime(), text: '创建了项目' }], tasks: [{ id: taskId, name: values.taskName || '首个任务', type: values.type || '视频', status: '前期策划', start: values.start || '', due: values.due || '', versions: [{ id: versionId, name: 'V1', status: '进行中', createdAt: new Date().toISOString().slice(0, 10), file: null, lists: [] }] }] };
    setDb(current => ({ ...current, projects: [...current.projects, project] }));
    setSelection({ projectId: project.id, taskId, versionId, listId: undefined });
  };
  const deleteProject = (projectId = active.project?.id) => {
    if (!projectId) return false;
    const remaining = db.projects.filter(project => project.id !== projectId);
    if (remaining.length === db.projects.length) return false;
    const fallbackProject = remaining[0];
    const fallbackTask = fallbackProject?.tasks[0];
    const fallbackVersion = fallbackTask?.versions.at(-1);
    setDb(current => ({ ...current, projects: current.projects.filter(project => project.id !== projectId) }));
    setSelection({ projectId: fallbackProject?.id, taskId: fallbackTask?.id, versionId: fallbackVersion?.id, listId: fallbackVersion?.lists[0]?.id });
    return true;
  };
  const addTask = values => {
    const versionId = uid('version');
    const task = { id: uid('task'), name: values.name, type: values.type || active.project.type, status: values.status || '前期策划', start: values.start || '', due: values.due || active.project.due, versions: [{ id: versionId, name: 'V1', status: '进行中', createdAt: new Date().toISOString().slice(0, 10), file: null, lists: [] }] };
    updateProject(project => ({ ...project, start:task.start && (!project.start || task.start<project.start)?task.start:project.start, due:task.due && (!project.due || task.due>project.due)?task.due:project.due, tasks: [...project.tasks, task] }), `添加了任务「${task.name}」`);
    setSelection(current => ({ ...current, taskId: task.id, versionId, listId: undefined }));
  };
  const deleteTask = (projectId = active.project?.id, taskId = active.task?.id) => {
    const project = db.projects.find(entry => entry.id === projectId);
    if (!project || !taskId || !project.tasks.some(task => task.id === taskId)) return false;
    const remaining = project.tasks.filter(task => task.id !== taskId);
    const fallbackTask = remaining[0];
    const fallbackVersion = fallbackTask?.versions.at(-1);
    updateProjectAt(projectId, current => ({ ...current, tasks: current.tasks.filter(task => task.id !== taskId) }), `删除了任务「${project.tasks.find(task => task.id === taskId)?.name || ''}」`);
    setSelection({ projectId, taskId: fallbackTask?.id, versionId: fallbackVersion?.id, listId: fallbackVersion?.lists[0]?.id });
    return true;
  };
  const addVersion = ({ inherit = true } = {}) => {
    const previous = active.version;
    const nextVersionNumber = Math.max(0, ...active.task.versions.map(entry => Number.parseInt(entry.name.replace(/\D/g, ''), 10) || 0)) + 1;
    const version = { id: uid('version'), name: `V${nextVersionNumber}`, status: '进行中', createdAt: new Date().toISOString().slice(0, 10), file: null, lists: inherit && previous ? previous.lists.map(source => ({ id: uid('list'), name: source.name, items: source.items.filter(row => !row.done).map(row => ({ ...row, id: uid('item') })) })) : [] };
    updateTask(task => ({ ...task, versions: [...task.versions, version] }), `创建了版本 ${version.name}`);
    setSelection(current => ({ ...current, versionId: version.id, listId: version.lists[0]?.id }));
  };
  const deleteVersion = (versionId = active.version?.id) => {
    const task = active.task;
    if (!task) return false;
    const deletingIndex = task.versions.findIndex(version => version.id === versionId);
    const deletingVersion = task.versions[deletingIndex];
    let remaining = task.versions.filter(version => version.id !== versionId);
    if (remaining.length === task.versions.length) return false;
    const nextVersion = remaining.at(-1);
    updateTask(current => ({ ...current, versions: remaining }), `删除了版本 ${deletingVersion?.name || ''}`.trim());
    setSelection(current => ({ ...current, versionId: nextVersion?.id, listId: nextVersion?.lists[0]?.id }));
    return true;
  };
  const addList = name => {
    const created = { id: uid('list'), name, items: [] };
    updateVersion(version => ({ ...version, lists: [...version.lists, created] }), `新建了修改清单「${name}」`);
    setSelection(current => ({ ...current, listId: created.id }));
  };
  const deleteList = (listId = active.list?.id) => {
    if (!listId || !active.version?.lists.some(list => list.id === listId)) return false;
    const remaining = active.version.lists.filter(list => list.id !== listId);
    const deleted = active.version.lists.find(list => list.id === listId);
    updateVersion(version => ({ ...version, lists: version.lists.filter(list => list.id !== listId) }), `删除了修改清单「${deleted?.name || ''}」`);
    setSelection(current => ({ ...current, listId: remaining[0]?.id }));
    return true;
  };
  const addItem = (text, time = '') => updateList(list => ({ ...list, items: [...list.items, { id: uid('item'), text, time, done: false, status: 'todo' }] }), '添加了修改意见');
  const toggleItem = itemId => {
    const item = active.list?.items.find(row => row.id === itemId);
    updateList(list => ({ ...list, items: list.items.map(row => row.id === itemId ? { ...row, done: !row.done, status: row.done ? 'todo' : 'done' } : row) }), item?.done ? '重新打开了修改意见' : '完成了修改意见');
  };
  const toggleItemAt = (projectId, taskId, versionId, listId, itemId) => {
    const item = db.projects.find(project => project.id === projectId)?.tasks.find(task => task.id === taskId)?.versions.find(version => version.id === versionId)?.lists.find(list => list.id === listId)?.items.find(row => row.id === itemId);
    updateProjectAt(projectId, project => ({
      ...project,
      tasks: project.tasks.map(task => task.id !== taskId ? task : ({
        ...task,
        versions: task.versions.map(version => version.id !== versionId ? version : ({
          ...version,
          lists: version.lists.map(list => list.id !== listId ? list : ({
            ...list,
            items: list.items.map(row => row.id !== itemId ? row : ({ ...row, done: !row.done, status: row.done ? 'todo' : 'done' }))
          }))
        }))
      }))
    }), item?.done ? '重新打开了修改意见' : '完成了修改意见');
  };
  const editItemAt = (projectId, taskId, versionId, listId, itemId, patch) => setDb(current => ({
    ...current,
    projects: current.projects.map(project => project.id !== projectId ? project : ({
      ...project,
      tasks: project.tasks.map(task => task.id !== taskId ? task : ({
        ...task,
        versions: task.versions.map(version => version.id !== versionId ? version : ({
          ...version,
          lists: version.lists.map(list => list.id !== listId ? list : ({
            ...list,
            items: list.items.map(row => row.id !== itemId ? row : ({ ...row, ...patch }))
          }))
        }))
      }))
    }))
  }));
  const editItem = (itemId, patch) => updateList(list => ({ ...list, items: list.items.map(row => row.id === itemId ? { ...row, ...patch } : row) }));
  const removeItem = itemId => {
    const index = active.list?.items.findIndex(item => item.id === itemId);
    if (index == null || index < 0) return;
    setDeletedItem({ projectId: active.project.id, taskId: active.task.id, versionId: active.version.id, listId: active.list.id, index, item: active.list.items[index] });
    updateList(list => ({ ...list, items: list.items.filter(row => row.id !== itemId) }), '删除了修改意见');
  };
  const undoDeleteItem = () => {
    if (!deletedItem) return;
    const { projectId, taskId, versionId, listId, index, item } = deletedItem;
    updateVersionAt(projectId, taskId, versionId, version => ({ ...version, lists: version.lists.map(list => {
      if (list.id !== listId || list.items.some(row => row.id === item.id)) return list;
      const items = [...list.items]; items.splice(Math.min(index, items.length), 0, item);
      return { ...list, items };
    }) }), '撤销删除修改意见');
    setDeletedItem(null);
  };
  useEffect(() => { if (!deletedItem) return; const timer = setTimeout(() => setDeletedItem(null), 10000); return () => clearTimeout(timer); }, [deletedItem]);
  const importItems = rows => updateList(list => ({ ...list, items: [...list.items, ...rows.map(row => ({ ...row, id: uid('item'), done: false, status: 'todo' }))] }), `导入了 ${rows.length} 条修改意见`);
  const setFile = file => updateVersion(version => ({ ...version, file, duration: undefined, reviewPosition: 0 }), `关联了版本文件「${file?.name || '未命名文件'}」`);
  const clearFile = () => {
    if (!active.version?.file) return false;
    updateVersion(version => ({ ...version, file: null }), `取消关联版本文件「${active.version.file.name}」`);
    return true;
  };
  const addCustomOption = (kind, value) => setDb(current => {
    const currentOptions = current.preferences?.customOptions?.[kind] || [];
    if (currentOptions.includes(value)) return current;
    return { ...current, preferences: { ...current.preferences, customOptions: { projectStatuses: [], projectTypes: [], taskStages: [], ...(current.preferences?.customOptions || {}), [kind]: [...currentOptions, value] } } };
  });
  const removeCustomOption = (kind, value) => setDb(current => {
    const currentOptions = current.preferences?.customOptions?.[kind] || [];
    return { ...current, preferences: { ...current.preferences, customOptions: { projectStatuses: [], projectTypes: [], taskStages: [], ...(current.preferences?.customOptions || {}), [kind]: currentOptions.filter(option => option !== value) } } };
  });
  const updateVersionAt = (projectId, taskId, versionId, updater, activityText = '') => updateProjectAt(projectId, project => ({ ...project, tasks: project.tasks.map(task => task.id !== taskId ? task : ({ ...task, versions: task.versions.map(version => version.id === versionId ? updater(version) : version) })) }), activityText);
  const addItemAt = (projectId, taskId, versionId, listId, text, time = '') => updateVersionAt(projectId, taskId, versionId, version => ({ ...version, lists: version.lists.map(list => list.id !== listId ? list : ({ ...list, items: [...list.items, { id: uid('item'), text, time, done: false, status: 'todo' }] })) }), '添加了修改意见');
  const addReviewItem = (projectId, taskId, versionId, listId, text, time = '') => {
    const createdListId = listId || uid('list');
    const createdItem = { id: uid('item'), text, time, done: false, status: 'todo' };
    updateVersionAt(projectId, taskId, versionId, version => listId ? ({ ...version, lists: version.lists.map(list => list.id !== listId ? list : ({ ...list, items: [...list.items, createdItem] })) }) : ({ ...version, lists: [...version.lists, { id: createdListId, name: '审阅意见', items: [createdItem] }] }), `${time ? `在 ${time} ` : ''}添加了审阅意见`);
    setSelection({ projectId, taskId, versionId, listId: createdListId });
  };
  const setReviewPosition = (projectId, taskId, versionId, seconds) => updateVersionAt(projectId, taskId, versionId, version => ({ ...version, reviewPosition: Math.max(0, Math.round(seconds)), reviewedAt: new Date().toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) }));
  const reset = () => { const next = cloneSeedData(); setDb(next); localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(next)); window.location.reload(); };
  const replaceDatabase = next => { setDb(next); localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(next)); window.location.reload(); };

  return { db, deletedItem, undoDeleteItem, saveStatus, setDb, selection, active, chooseProject, chooseTask, chooseVersion, chooseList, selectPath, updateProjectAt, updateProject, updateTask, updateVersion, updateVersionAt, recordActivity, addProject, deleteProject, addTask, deleteTask, addVersion, deleteVersion, addList, deleteList, addItem, addItemAt, addReviewItem, toggleItem, toggleItemAt, editItem, editItemAt, removeItem, importItems, setFile, clearFile, setReviewPosition, addCustomOption, removeCustomOption, reset, replaceDatabase };
}
