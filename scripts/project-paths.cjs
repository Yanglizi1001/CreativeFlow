const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const layout=JSON.parse(fs.readFileSync(path.join(root,'config/project-layout.json'),'utf8'));
function absolute(key,...parts){
  if(typeof layout[key]!=='string')throw Error('Unknown project path: '+key);
  const target=path.resolve(root,layout[key],...parts);
  if(!target.startsWith(root+path.sep))throw Error('Project path escapes workspace: '+key);
  return target;
}
const relative=(key,...parts)=>path.relative(root,absolute(key,...parts));
module.exports={root,layout,absolute,relative};
