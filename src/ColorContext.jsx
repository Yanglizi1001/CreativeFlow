import React, { createContext, useContext } from 'react';
import { validColor } from './colors';
export const ColorContext = createContext({tagColors:{}});
export const useColors = () => useContext(ColorContext);
export function ColorProvider({flow,children}) {
  const setTagColor=(kind,value,color)=>flow.setDb(current=>{
    if(color!==null&&!validColor(color))return current;
    const map={...current.preferences?.tagColors,[kind]:{...current.preferences?.tagColors?.[kind]}};
    if(color===null)delete map[kind][value]; else map[kind]={...map[kind],[value]:color.toLowerCase()};
    return {...current,preferences:{...current.preferences,tagColors:map}};
  },'修改标签颜色');
  const resetTagColors=()=>flow.setDb(current=>({...current,preferences:{...current.preferences,tagColors:{}}}),'恢复全部标签默认颜色');
  return <ColorContext.Provider value={{tagColors:flow.db.preferences?.tagColors||{},setTagColor,resetTagColors}}>{children}</ColorContext.Provider>;
}
