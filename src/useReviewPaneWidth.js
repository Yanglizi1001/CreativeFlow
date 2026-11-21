import {useEffect,useRef,useState} from 'react';
import {useResizableWidth} from './ui';
const key='creative-flow-review-notes-width';
export function useReviewPaneWidth(versionId){
 const container=useRef(null),[available,setAvailable]=useState(0);
 const saved=useResizableWidth(key,600,560,720);
 useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setAvailable(Math.round(entry.contentRect.width)));observer.observe(node);return()=>observer.disconnect();},[versionId]);
 useEffect(()=>{try{localStorage.setItem(key,String(saved.width));}catch{}},[saved.width]);
 const stacked=available>0&&available<880;
 const max=stacked||!available?720:Math.min(720,available-320);
 return {container,stacked,size:{...saved,width:Math.min(saved.width,max),max,resetWidth:()=>saved.setWidth(Math.min(600,max))}};
}
