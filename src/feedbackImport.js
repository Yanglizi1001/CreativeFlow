export function parseFeedbackText(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const value = lines[i].trim();
    if (!value) continue;
    if (/^\d+$/.test(value) && lines[i + 1]?.includes('-->')) continue;
    const subtitle = value.match(/^(\d{2}:\d{2}:\d{2})[,.]\d+\s*-->/);
    if (subtitle) {
      const content=[];
      while (i+1<lines.length && lines[i+1].trim()) content.push(lines[++i].trim());
      if (content.length) result.push({time:subtitle[1].startsWith('00:') ? subtitle[1].slice(3) : subtitle[1],text:content.join(' ')});
      continue;
    }
    const clean=value.replace(/^(?:[-*•]\s*|\d+[.、)]\s+)/,'');
    const match=clean.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-—:：]?\s*(.+)$/);
    result.push({time:match?.[1] || '',text:match?.[2] || clean});
  }
  return result;
}
