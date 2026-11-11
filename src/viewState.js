import { useEffect, useState } from 'react';
const states = new Map(), scrolls = new Map();
export function useViewState(key, initial) {
  const [value, setValue] = useState(() => states.has(key) ? states.get(key) : typeof initial === 'function' ? initial() : initial);
  const set = next => setValue(previous => { const value = typeof next === 'function' ? next(previous) : next; states.set(key, value); return value; });
  return [value, set];
}
export function useScrollMemory(key) {
  useEffect(() => {
    const surface = document.querySelector('.main-surface');
    if (!surface) return;
    const nodes = [...surface.querySelectorAll('main, .project-detail-main, .review-center-main')];
    nodes.forEach((node,index)=>{node.scrollTop = scrolls.get(key+index) || 0;});
    const save = () => nodes.forEach((node,index)=>scrolls.set(key+index,node.scrollTop));
    surface.addEventListener('scroll',save,true);
    return ()=>surface.removeEventListener('scroll',save,true);
  }, [key]);
}
