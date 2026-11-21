const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,layout,absolute}=require('./project-paths.cjs');
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function payload(relative){const file=path.join(root,relative),stat=fs.statSync(file);return {path:relative,bytes:stat.size,sha256:digest(file)};}
const versions=[
  {version:layout.version,buildId:layout.buildId,status:'current',label:'创作流内置协作管理窗口，统一安装与免安装交付',directory:layout.releaseRoot+'/'+layout.releaseName,archive:layout.releaseArchive},
  {version:'0.7.1-beta',buildId:'2026-11-21-opinion-layout',status:'historical',label:'审阅布局与整体意见分区',directory:'release/history/0.7.1-beta/2026-11-21-opinion-layout/CreativeFlow-0.7.1-beta-20261121-审阅布局优化完整包',archive:'release/history/0.7.1-beta/2026-11-21-opinion-layout/CreativeFlow-0.7.1-beta-20261121-审阅布局优化完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-21-opinion-sorting',status:'historical',label:'意见排序与时间记录',directory:'release/history/0.7.1-beta/2026-11-21-opinion-sorting/CreativeFlow-0.7.1-beta-20261121-意见排序完整包',archive:'release/history/0.7.1-beta/2026-11-21-opinion-sorting/CreativeFlow-0.7.1-beta-20261121-意见排序完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-20-version-management',status:'historical',label:'版本删除与回收站、并发保护',directory:'release/history/0.7.1-beta/2026-11-20-version-management/CreativeFlow-0.7.1-beta-20261120-版本管理完整包',archive:'release/history/0.7.1-beta/2026-11-20-version-management/CreativeFlow-0.7.1-beta-20261120-版本管理完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-20-video-thumbnails',status:'historical',label:'协作视频缩略图修复',directory:'release/history/0.7.1-beta/2026-11-20-video-thumbnails/CreativeFlow-0.7.1-beta-20261120-协作视频缩略图修复完整包',archive:'release/history/0.7.1-beta/2026-11-20-video-thumbnails/CreativeFlow-0.7.1-beta-20261120-协作视频缩略图修复完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-20-window-trust',status:'historical',label:'管理器窗口信任校验修复',directory:'release/history/0.7.1-beta/2026-11-20-window-trust/CreativeFlow-0.7.1-beta-20261120-窗口校验修复完整包',archive:'release/history/0.7.1-beta/2026-11-20-window-trust/CreativeFlow-0.7.1-beta-20261120-窗口校验修复完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-20-storage',status:'historical',label:'容量与自启更新',directory:'release/history/0.7.1-beta/2026-11-20-storage/CreativeFlow-0.7.1-beta-20261120-容量与自启完整包',archive:'release/history/0.7.1-beta/2026-11-20-storage/CreativeFlow-0.7.1-beta-20261120-容量与自启完整包.zip'},
  {version:'0.7.1-beta',buildId:'2026-11-20-onboarding',status:'historical',label:'员工接入向导、应用内证书信任与卸载数据选择',directory:'release/history/0.7.1-beta/2026-11-20-onboarding'},
  {version:'0.7.1-beta',buildId:'2026-11-19-lan-fix',status:'historical',label:'局域网代理连接修复客户端',directory:'release/history/0.7.1-beta/2026-11-19-lan-fix'},
  {version:'0.7.1-beta',buildId:'2026-11-19-host-manager',status:'historical',label:'图形主机管理器初版',directory:'release/history/0.7.1-beta/2026-11-19-host-manager'},
  {version:'0.7.1-beta',buildId:'2026-11-19-integrated',status:'historical',label:'本地与局域网协作集成初版',directory:'release/history/0.7.1-beta/2026-11-19-integrated'},
  {version:'0.7.0-beta.3',buildId:'local-beta3',status:'historical',label:'本地交互优化及小组件更新；协作集成的基线',directory:'release/history/0.7.0-beta.3'},
  {version:'0.7.0-beta.2',buildId:'local-beta2',status:'historical',label:'本地更新测试版',directory:'release/history/0.7.0-beta.2'},
  {version:'0.7.0-beta.1',buildId:'local-beta1',status:'historical',label:'本地首测版',directory:'release/history/0.7.0-beta.1'},
  {version:'0.2.0–0.2.1',buildId:'standalone-collaboration-prototype',status:'archived-prototype',label:'早期独立协作桌面原型，与当前产品版本分开',directory:'archive/legacy-collaboration/0.2.x'},
];
for(const entry of versions){if(!fs.statSync(path.join(root,entry.directory)).isDirectory())throw Error('Missing release '+entry.directory);}
const current=versions[0];
current.archiveFile=payload(current.archive);
current.programs=[
  ['client-installer',`客户端/CreativeFlow-Setup-${layout.version}-win-x64.exe`],
  ['client-portable',`客户端/CreativeFlow-Portable-${layout.version}-win-x64.exe`],
  ['manager-installer',`服务器/CreativeFlow-HostManager-Setup-${layout.version}-win-x64.exe`],
  ['manager-portable',`服务器/CreativeFlow-HostManager-Portable-${layout.version}-win-x64.exe`],
].filter(([kind])=>layout.releaseKind!=='unified'||kind.startsWith('client-')).map(([kind,name])=>({kind,...payload(current.directory+'/'+name)}));
const catalog={updated:'2026-11-21',productVersion:layout.version,currentBuildId:layout.buildId,sourceOfTruth:'local workspace payloads; remote tags or releases are not inferred',versions};
fs.writeFileSync(path.join(root,'config/releases.json'),JSON.stringify(catalog,null,2)+'\n');
const relative=file=>path.relative(path.join(root,'docs/versions'),path.join(root,file)).replaceAll('\\','/');
const rows=versions.map(entry=>`| ${entry.version} | ${entry.buildId} | ${entry.label} | ${entry.status==='current'?'**当前推荐**':entry.status==='archived-prototype'?'原型归档':'历史保留'} | [目录](${relative(entry.directory)}) |`).join('\n');
const text=`# 版本索引\n\n当前产品版本：**${layout.version}**。当前推荐批次：**${layout.buildId}**。\n\n[当前完整安装包](${relative(current.archive)}) · [项目目录说明](../PROJECT_STRUCTURE.md) · [更新记录](../../CHANGELOG.md)\n\n## 产品版本与交付批次\n\n| 产品版本 | 批次或阶段 | 功能范围 | 状态 | 文件位置 |\n| --- | --- | --- | --- | --- |\n${rows}\n\n0.7.1 beta 在开发过程中多次保持产品版本号重新交付，因此用批次区分。最新推荐的是内置协作管理统一软件（保留审阅布局、意见排序与版本管理）（包含此前缩略图、窗口校验修复及容量与自启功能），不是员工接入包、代理修复包或主机管理器初版。历史文件保留原版本号，不重新编号。\n\n0.2.0–0.2.1 属于早期独立协作原型；其中网页前端还留有 0.1.0-dev 元数据，均不作为当前产品入口。\n\n## 当前批次的交付程序\n\n${current.programs.map(file=>'- ['+path.basename(file.path)+']('+relative(file.path)+')').join('\n')}\n\n完整包 SHA-256：\n\n\`${current.archiveFile.sha256}\`\n\n完整包为 ${current.archiveFile.bytes.toLocaleString('en-US')} 字节；展开目录保留原 SHA256SUMS.txt。历史批次移动存放位置时保留内容和原始校验值。机器可读索引见 [releases.json](../../config/releases.json)。\n\n## 源码与记录\n\n- 当前客户端、管理器及服务端为 0.7.1 beta；源码入口见根目录 README。\n- 集成前的本地 0.7.0 beta3 源码基线保存在 [源码快照](../../backups/source-snapshots/0.7.0-beta.3-before-integration/)。\n- [beta1 说明](0.7.0-beta.1.md)、[beta2 说明](0.7.0-beta.2.md)、[beta3 说明](0.7.0-beta.3.md) 保留此前功能记录。\n- 样式模块沿用的 release061.css 等文件名不代表当前产品版本。\n- 本索引依据本机现存文件与版本元数据建立，不据此认定远程 GitHub 标签或发布状态。\n\n## 后续交付规则\n\n1. 产品版本在根 package.json 与服务端项目中保持一致；打包准备脚本同步桌面暂存和管理器元数据。\n2. 同版本新交付分配唯一 buildId、buildRoot 和 releaseName；不得覆盖已交付包。\n3. 构建放 artifacts/builds，运行时放 artifacts/published，验证放 artifacts/qa，最终交付放 release/current。\n4. 更换当前批次时，将上一批次归入 release/history，并更新 config/releases.json 和本索引。\n`;
fs.writeFileSync(path.join(root,'docs/versions/INDEX.md'),text);
console.log('Release index generated: '+versions.length+' versions/batches; current programs hashed.');
