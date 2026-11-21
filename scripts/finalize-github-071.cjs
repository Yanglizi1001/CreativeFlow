const fs=require('fs');
module.exports=async({github,context,core})=>{
 const plan=JSON.parse(fs.readFileSync('config/github-release-finalize.json','utf8')),{owner,repo}=context.repo;
 const sourceRun=(await github.rest.actions.getWorkflowRun({owner,repo,run_id:plan.runId})).data;
 if(sourceRun.head_sha!==plan.sourceSha)throw Error('Unexpected build source');
 const jobs=await github.paginate(github.rest.actions.listJobsForWorkflowRun,{owner,repo,run_id:plan.runId});
 const job=jobs.find(j=>j.name==='windows-release');
 for(const name of ['Test local data and synchronization','Restore and test service','Build self-contained host','Build client and manager','Package client installer and portable','Verify embedded manager and host payload','Assemble complete delivery and checksums'])if(!job?.steps.some(s=>s.name===name&&s.conclusion==='success'))throw Error('Build check missing: '+name);
 const compare=(await github.rest.repos.compareCommits({owner,repo,base:plan.sourceSha,head:context.sha})).data;
 if(compare.files.some(f=>!['scripts/publish-unified-github.cjs','scripts/finalize-github-071.cjs','.github/workflows/finalize-071.yml','config/github-release-finalize.json'].includes(f.filename)))throw Error('Product source changed since verified build');
 const release=(await github.rest.repos.getReleaseByTag({owner,repo,tag:'0.7.1-beta'})).data;
 if(!release.prerelease||release.immutable)throw Error('Unexpected release kind');
 const assets=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 if(plan.assets.length!==7)throw Error('Incomplete upload plan');
 for(const expected of plan.assets){const a=assets.find(a=>a.id===expected.id);if(!a||a.name!==expected.stagedName||a.state!=='uploaded'||a.size!==expected.size||a.digest!==expected.digest)throw Error('Staged upload mismatch: '+expected.name);}
 // If tag permissions fail, keep every existing public download untouched.
 await github.rest.git.updateRef({owner,repo,ref:'tags/0.7.1-beta',sha:context.sha,force:true});
 await github.rest.repos.updateRelease({owner,repo,release_id:release.id,draft:true});
 for(const item of plan.assets){const old=assets.find(a=>a.name===item.name);if(old)await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:old.id});await github.rest.repos.updateReleaseAsset({owner,repo,asset_id:item.id,name:item.name});}
 for(const old of assets.filter(a=>/^CreativeFlow-HostManager-/.test(a.name)||a.name==='HostManager-Guide.pdf'))await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:old.id});
 const final=await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:release.id});
 for(const item of plan.assets){const a=final.find(a=>a.name===item.name);if(!a||a.size!==item.size||a.digest!==item.digest)throw Error('Final digest mismatch');}
 const body=fs.readFileSync('docs/releases/0.7.1-beta.md','utf8')+'\n\n本次构建来源：['+plan.sourceSha.slice(0,7)+'](https://github.com/'+owner+'/'+repo+'/commit/'+plan.sourceSha+')；[构建检查记录](https://github.com/'+owner+'/'+repo+'/actions/runs/'+plan.runId+')。源码标签另包含本次发布流程的修正，产品源码与构建提交一致。\n';
 const result=(await github.rest.repos.updateRelease({owner,repo,release_id:release.id,name:'创作流 0.7.1 beta · 本地创作与内置协作管理',target_commitish:context.sha,body,draft:false,prerelease:true})).data;
 await core.summary.addHeading('0.7.1 beta 已完成替换').addLink('下载软件',result.html_url).addRaw('\n全部七个附件的大小和 SHA-256 已核对。').write();
};
