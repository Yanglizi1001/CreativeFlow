const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {root,layout,absolute}=require('./project-paths.cjs');
const checks=[];const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\ufeff/,''));
const source=read(path.join(root,'package.json')),client=read(absolute('desktopStaging','package.json')),manager=read(path.join(root,'host-manager/package.json'));
for(const value of [source.version,client.version,manager.version])assert.equal(value,layout.version);
const server=fs.readFileSync(absolute('serviceSource','CreativeFlow.Host.csproj'),'utf8');assert.ok(server.includes('<Version>'+layout.version+'</Version>'));checks.push('current client, packaging, manager and server versions agree');
for(const key of ['desktopStaging','buildRoot','publishedHost','qaRoot','releaseRoot','historyRoot','manualRoot'])assert.ok(fs.statSync(absolute(key)).isDirectory(),key);
assert.ok(fs.existsSync(path.resolve(absolute('desktopStaging'),client.build.electronDist,'electron.exe')));assert.ok(fs.existsSync(absolute('publishedHost','coreclr.dll')));assert.ok(fs.existsSync(absolute('desktopStaging','dist/index.html')));checks.push('staging, Electron distribution, service runtime and QA paths resolve');
assert.equal(path.resolve(absolute('desktopStaging'),client.build.directories.output),absolute('buildRoot','client'));
assert.equal(path.resolve(root,'host-manager',manager.build.directories.output),absolute('buildRoot','manager'));checks.push('packaging metadata uses configured build directories');
for(const file of fs.readdirSync(path.join(root,'scripts')).filter(name=>name.endsWith('.cjs'))){const result=spawnSync(process.execPath,['--check',path.join(root,'scripts',file)],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,file+': '+result.stderr);}checks.push('all active CommonJS scripts parse');
function allMarkdown(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?allMarkdown(path.join(folder,item.name)):item.name.endsWith('.md')?[path.join(folder,item.name)]:[]);}
const broken=[];
for(const file of [path.join(root,'README.md'),path.join(root,'CHANGELOG.md'),path.join(root,'release/README.md'),path.join(root,'scripts/README.md'),path.join(root,'collaboration-dev/README.md'),...allMarkdown(path.join(root,'docs'))]){
  const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)){let target=match[1].trim().replace(/^<|>$/g,'');if(/^[a-zA-Z][\w+.-]*:/.test(target)||target.startsWith('#'))continue;target=target.split('#')[0];if(!fs.existsSync(path.resolve(path.dirname(file),target)))broken.push(path.relative(root,file)+' -> '+target);}
}
assert.deepEqual(broken,[],'Broken local documentation links');checks.push('local links in maintained documentation resolve');
const catalog=read(path.join(root,'config/releases.json'));assert.equal(catalog.currentBuildId,layout.buildId);const current=catalog.versions.find(entry=>entry.status==='current');assert.equal(current.archive,layout.releaseArchive);
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
for(const payload of [current.archiveFile,...current.programs]){const file=path.join(root,payload.path);assert.equal(fs.statSync(file).size,payload.bytes);assert.equal(hash(file),payload.sha256,payload.path);}
const record=read(path.join(root,'docs/maintenance/organization-moves-2026-11-20.json'));
assert.ok(record.moves.every(item=>item.verified));const movedArchive=record.moves.find(item=>item.to===layout.releaseArchive);if(movedArchive)assert.equal(movedArchive.signature.toLowerCase(),current.archiveFile.sha256);else {const previous=catalog.versions.find(entry=>entry.buildId==='2026-11-20-storage');const original=record.moves.find(item=>item.to.endsWith('容量与自启完整包.zip'));assert.equal(hash(path.join(root,previous.archive)),original.signature.toLowerCase());};checks.push('historical archive retains its hash and all current programs match the catalog');
assert.ok(!fs.existsSync(path.join(root,'package-desktop')));assert.ok(!fs.existsSync(path.join(root,'collaboration-dev/client-app')));assert.ok(!fs.existsSync(path.join(root,'.github/workflows/release.yml')));checks.push('retired staging, prototype client and legacy automatic release entry are archived');
const result={passed:true,checkedAt:new Date().toISOString(),productVersion:layout.version,buildId:layout.buildId,moves:record.moves.length,checks};
fs.mkdirSync(absolute('qaRoot','maintenance'),{recursive:true});fs.writeFileSync(absolute('qaRoot','maintenance/layout-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
