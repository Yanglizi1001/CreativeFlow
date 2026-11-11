export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const parseDate = value => new Date(`${value}T12:00:00`);
export function weekBounds(value) {
  const start = parseDate(value);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return [dateKey(start), dateKey(end)];
}
export function monthCells(value) {
  const date = parseDate(value), year = date.getFullYear(), month = date.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => i >= offset && i < offset + length ? dateKey(new Date(year, month, i - offset + 1)) : null);
}
export function shiftDate(value, mode, direction) {
  const date = parseDate(value);
  if (mode === 'month') { date.setDate(1); date.setMonth(date.getMonth() + direction); }
  else date.setDate(date.getDate() + direction * (mode === 'week' ? 7 : 1));
  return dateKey(date);
}
