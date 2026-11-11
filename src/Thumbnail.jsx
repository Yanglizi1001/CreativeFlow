import React, { useEffect, useState } from 'react';
import { TypeIcon } from './ui';
import { mediaSource } from './demoMedia';
const frames = new Map();
export function videoFrame(path) {
  if (!path || !window.creativeFlowWindow?.toFileUrl) return Promise.resolve('');
  if (frames.has(path)) return frames.get(path);
  const promise = new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true; video.preload = 'auto';
    const finish = value => { clearTimeout(timer);video.onloadeddata=null;video.onseeked=null;video.onerror=null;video.removeAttribute('src');video.load();resolve(value); };
    const capture = () => { try {const canvas=document.createElement('canvas');canvas.width=240;canvas.height=Math.max(1,Math.round(240*video.videoHeight/video.videoWidth));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);finish(canvas.toDataURL('image/jpeg',.65));}catch{finish('');} };
    const timer=setTimeout(()=>finish(''),12000);
    video.onloadeddata=()=>{if(Number.isFinite(video.duration)&&video.duration>.2){video.onseeked=capture;video.currentTime=Math.min(1,video.duration/3);}else capture();};
    video.onerror=()=>finish('');video.src=/^(file:|https?:|blob:)/.test(path)?path:window.creativeFlowWindow.toFileUrl(path);
  });
  frames.set(path,promise);return promise;
}
export function Thumbnail({ file, type='视频', className='' }) {
  const [image,setImage]=useState('');
  useEffect(()=>{let active=true;setImage('');if(type==='图片')setImage(mediaSource(file));else if(type==='视频'&&mediaSource(file))videoFrame(mediaSource(file)).then(value=>{if(active)setImage(value);});return()=>{active=false;};},[file?.path,file?.demo,type]);
  return <span className={`media-thumb ${className}`}>{image ? <img src={image} alt="视频缩略图"/> : <TypeIcon type={type} size={22}/>}</span>;
}
