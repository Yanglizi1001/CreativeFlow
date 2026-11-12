const fs = require('fs');
const path = require('path');
const defaults = { closeToTray: true, askBeforeClose: true };
function readPreferences(folder) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(folder, 'desktop-preferences.json'), 'utf8'));
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof data[key] === 'boolean' ? data[key] : fallback]));
  } catch { return { ...defaults }; }
}
function writePreferences(folder, current, patch) {
  const next = { ...current };
  for (const key of Object.keys(defaults)) if (typeof patch?.[key] === 'boolean') next[key] = patch[key];
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, 'desktop-preferences.json');
  fs.writeFileSync(target + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(target + '.tmp', target);
  return next;
}
module.exports = { readPreferences, writePreferences };
