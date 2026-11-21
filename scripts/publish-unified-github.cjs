const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async({github,context,core,folder=path.resolve('release/github')})=>{
 const tag='0.7.1-beta',{owner,repo}=context.repo;
 if(require('../package.json').version!==tag)throw Error('Version mismatch');
 const names=[`CreativeFlow-Full-${tag}-win-x64.zip`,`CreativeFlow-Setup-${tag}-win-x64.exe`,`CreativeFlow-Portable-${tag}-win-x64.exe`,'Deployment-Guide.pdf','Version-Management-Guide.md','Release-Notes.md','SHA256SUMS.txt'];
 const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
 const sums=new Map(fs.readFileSync(path.join(folder,'SHA256SUMS.txt'),'utf8').replace(/^\ufeff/,'').trim().split(/\r?\n/).map(line=>{const at=line.indexOf('  ');return [line.slice(at+2),line.slice(0,at)];}));
 const payloads=names.map(name=>{const data=fs.readFileSync(path.join(folder,name));if(name!=='SHA256SUMS.txt'&&sums.get(name)!==hash(data))throw Error('Checksum mismatch: '+name);if(name.endsWith('.exe')&&(data.length<50000000||data.subarray(0,2).toString()!=='MZ'))throw Error('Invalid executable: '+name);return {name,data,digest:hash(data)};});
 const body=fs.readFileSync('docs/releases/0.7.1-beta.md','utf8');
 let release=(await github.rest.repos.getReleaseByTag({owner,repo,tag})).data;
 if(!release.prerelease||release.immutable)throw Error('Only the mutable beta release can be replaced');
 const oldAssets=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 const suffix='incoming-'+context.runId+'-';const staged=[];
 // Upload and verify every new file before touching any existing download.
 for(const payload of payloads){
  const name=suffix+payload.name;
  const stale=oldAssets.find(a=>a.name===name);if(stale)await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:stale.id});
  const asset=(await github.rest.repos.uploadReleaseAsset({owner,repo,release_id:release.id,name,data:payload.data,headers:{'content-type':'application/octet-stream','content-length':payload.data.length}})).data;
  if(asset.state!=='uploaded'||asset.size!==payload.data.length||asset.digest!=='sha256:'+payload.digest)throw Error('Upload verification failed: '+payload.name);
  staged.push({...payload,id:asset.id});core.info('Verified '+payload.name);
 }
 // Preserve prior sources in an archive branch before requesting replacement.
 // Point the tag at this workflow's exact source before changing downloads.
 await github.rest.git.updateRef({owner,repo,ref:'tags/'+tag,sha:context.sha,force:true});
 await github.rest.repos.updateRelease({owner,repo,release_id:release.id,draft:true});
 for(const item of staged){
  const existing=oldAssets.find(a=>a.name===item.name);if(existing)await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:existing.id});
  await github.rest.repos.updateReleaseAsset({owner,repo,asset_id:item.id,name:item.name});
 }
 // The standalone manager is superseded by the manager embedded in both clients.
 for(const asset of oldAssets.filter(a=>/^CreativeFlow-HostManager-/.test(a.name)||a.name==='HostManager-Guide.pdf'))await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:asset.id});
 const final=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 for(const item of staged){const a=final.find(a=>a.name===item.name);if(!a||a.size!==item.data.length||a.digest!=='sha256:'+item.digest)throw Error('Final asset verification failed: '+item.name);}
 release=(await github.rest.repos.updateRelease({owner,repo,release_id:release.id,target_commitish:context.sha,name:'创作流 0.7.1 beta · 本地创作与内置协作管理',body,draft:false,prerelease:true})).data;
 await core.summary.addHeading('创作流 0.7.1 beta 已替换更新').addLink('打开发布页',release.html_url).addRaw('\n安装版、免安装版、完整包、使用说明与 SHA-256 已上传并核对；管理器和主机运行资源已内置。').write();
};
