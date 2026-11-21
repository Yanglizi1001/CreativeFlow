const fs=require('node:fs'),path=require('node:path');
const {layout,absolute}=require('./project-paths.cjs');
const root=path.resolve(__dirname,'..'),target=path.join(root,'host-manager/resources');
fs.mkdirSync(target,{recursive:true});
function copy(source,destination){const stat=fs.statSync(source);if(stat.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const item of fs.readdirSync(source))copy(path.join(source,item),path.join(destination,item));}else{fs.mkdirSync(path.dirname(destination),{recursive:true});if(source.endsWith('.ps1'))fs.writeFileSync(destination,'\ufeff'+fs.readFileSync(source,'utf8').replace(/^\ufeff/,''));else fs.copyFileSync(source,destination);}}
copy(path.join(root,'host-manager/scripts'),path.join(target,'scripts'));
copy(path.join(root,'deployment/0.7.1'),path.join(target,'deployment'));
copy(absolute('publishedHost'),path.join(target,'deployment/host'));
const guide=path.join(root,layout.releaseKind==='unified'?'docs/manuals/0.7.1-beta-内置协作管理使用说明.md':'docs/manuals/协作主机管理器-使用说明.md');if(fs.existsSync(guide))copy(guide,path.join(target,'使用说明.md'));
const localPdf=path.join(root,layout.releaseKind==='unified'?'output/pdf/创作流-内置协作管理使用说明.pdf':'output/pdf/创作流协作主机管理器-使用说明.pdf');const pdf=fs.existsSync(localPdf)?localPdf:path.join(root,layout.releaseKind==='unified'?'docs/manuals/pdf/Unified-Guide.pdf':'docs/manuals/pdf/HostManager-Guide.pdf');if(fs.existsSync(pdf))copy(pdf,path.join(target,'使用说明.pdf'));
for(const file of fs.readdirSync(path.join(target,'deployment/host'))){if(/\.db(?:-wal|-shm)?$|\.pfx$|^appsettings\.Production\.json$/.test(file))throw Error('服务器发布目录包含环境数据');}
console.log('主机管理器运行资源已准备。');
const metadataPath=path.join(root,'host-manager/package.json'),metadata=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
metadata.version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
metadata.build.directories.output=path.relative(path.join(root,'host-manager'),absolute('buildRoot','manager')).replaceAll('\\','/');
fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n');
