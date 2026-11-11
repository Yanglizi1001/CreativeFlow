const video = new URL('./assets/demo-review.webm', import.meta.url).href;
const cover = new URL('./assets/demo-cover.png', import.meta.url).href;
export function mediaSource(file) {
  if (file?.demo === 'video') return video;
  if (file?.demo === 'cover') return cover;
  return file?.path && window.creativeFlowWindow?.toFileUrl ? window.creativeFlowWindow.toFileUrl(file.path) : '';
}
