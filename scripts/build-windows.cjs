const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,layout,absolute}=require('./project-paths.cjs');
const buildOnly=process.argv.includes('--build-only');
if(!buildOnly&&fs.existsSync(absolute('releaseArchive')))throw Error('当前交付批次已存在。请先在 config/project-layout.json 分配新的 buildId、buildRoot 和交付文件名，不覆盖已交付安装包。');
function run(executable,args){const result=spawnSync(executable,args,{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
const node=process.execPath,localDotnet=path.join(root,'collaboration-dev/.dotnet/dotnet.exe'),dotnet=fs.existsSync(localDotnet)?localDotnet:'dotnet';
fs.mkdirSync(absolute('publishedHost'),{recursive:true});
run(dotnet,['publish','collaboration-dev/server/CreativeFlow.Host/CreativeFlow.Host.csproj','-c','Release','-r','win-x64','--self-contained','true','--no-restore','-o',absolute('publishedHost')]);
run(node,['node_modules/vite/bin/vite.js','build']);
run(node,['node_modules/vite/bin/vite.js','build','--config','host-manager/vite.config.mjs']);
run(node,['scripts/prepare-desktop.cjs']);run(node,['scripts/prepare-host-manager.cjs']);
for(const project of layout.releaseKind==='unified'?[layout.desktopStaging]:[layout.desktopStaging,'host-manager'])run(node,['node_modules/electron-builder/out/cli/cli.js','--projectDir',project,'--win','nsis','portable','--x64']);
if(!buildOnly)run(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/assemble-storage-release.ps1']);
