const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async({github,context,core})=>{
 const tag='0.7.1-beta',folder=path.resolve('release/github'),{owner,repo}=context.repo;
 if(require('../package.json').version!==tag)throw Error('Version mismatch');
 const files=fs.readdirSync(folder).filter(name=>fs.statSync(path.join(folder,name)).isFile());
 const required=['CreativeFlow-Full-'+tag+'-win-x64.zip','CreativeFlow-Setup-'+tag+'-win-x64.exe','CreativeFlow-Portable-'+tag+'-win-x64.exe','CreativeFlow-HostManager-Setup-'+tag+'-win-x64.exe','CreativeFlow-HostManager-Portable-'+tag+'-win-x64.exe','SHA256SUMS.txt','Release-Notes.md','Version-Management-Guide.md','Deployment-Guide.pdf','HostManager-Guide.pdf'];
 for(const name of required){if(!files.includes(name))throw Error('Missing asset '+name);if(/\.exe$/.test(name)&&fs.statSync(path.join(folder,name)).size<50000000)throw Error('Invalid executable '+name);}
 const checksum=fs.readFileSync(path.join(folder,'SHA256SUMS.txt'),'utf8').replace(/^\ufeff/,'');
 const expected=new Map(checksum.trim().split(/\r?\n/).map(line=>{const split=line.indexOf('  ');return [line.slice(split+2),line.slice(0,split)];}));
 for(const [name,digest]of expected){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(path.join(folder,name)))hash.update(chunk);if(hash.digest('hex')!==digest)throw Error('Checksum mismatch '+name);}
 const body=fs.readFileSync('docs/releases/0.7.1-beta.md','utf8');let release;
 try{release=(await github.rest.repos.getReleaseByTag({owner,repo,tag})).data;}catch(e){if(e.status!==404)throw e;}
 if(release&&!release.draft)throw Error('This release is already published; existing downloads will not be overwritten');
 if(!release)release=(await github.rest.repos.createRelease({owner,repo,tag_name:tag,target_commitish:context.sha,name:'创作流 0.7.1 beta · 局域网协作与版本管理',body,draft:true,prerelease:true})).data;
 const previous=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 for(const name of required){const old=previous.find(a=>a.name===name);if(old)await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:old.id});const data=fs.readFileSync(path.join(folder,name));await github.rest.repos.uploadReleaseAsset({owner,repo,release_id:release.id,name,data,headers:{'content-type':'application/octet-stream','content-length':data.length}});core.info('Uploaded '+name);}
 const uploaded=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 for(const name of required){const asset=uploaded.find(a=>a.name===name);if(!asset||asset.state!=='uploaded'||asset.size!==fs.statSync(path.join(folder,name)).size)throw Error('Asset verification failed '+name);if(asset.digest&&expected.has(name)&&asset.digest!=='sha256:'+expected.get(name))throw Error('GitHub digest mismatch '+name);}
 release=(await github.rest.repos.updateRelease({owner,repo,release_id:release.id,body,draft:false,prerelease:true})).data;
 await core.summary.addHeading('创作流 0.7.1 beta 已发布').addLink('打开发布页',release.html_url).addRaw('\n四个 Windows 程序、完整包、说明书和 SHA-256 已上传并核对。').write();
};
