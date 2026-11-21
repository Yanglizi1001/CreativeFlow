from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parent.parent
layout=json.loads((root/'config/project-layout.json').read_text(encoding='utf-8-sig'))
folder=root/layout['releaseRoot']/layout['releaseName']
archive=Path(str(folder)+'.zip')
with zipfile.ZipFile(archive) as z:
 prefix=folder.name+'/'
 files={i.filename[len(prefix):].replace('\\','/'):i for i in z.infolist() if not i.is_dir()}
 manifest=z.read(prefix+'SHA256SUMS.txt').decode('utf-8-sig')
 checked=0
 for line in manifest.splitlines():
  expected,relative=line.split('  ',1);relative=relative.replace('\\','/')
  assert relative in files,relative
  digest=hashlib.sha256()
  with z.open(files[relative]) as stream:
   for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
  assert digest.hexdigest()==expected,relative
  checked+=1
 assert checked+1==len(files),(checked,len(files))
 for relative in files:
  assert not relative.lower().endswith(('.pfx','.cer','.cfspace','.db','.sqlite','.key')),relative
 programs=['客户端/CreativeFlow-Setup-0.7.1-beta-win-x64.exe','客户端/CreativeFlow-Portable-0.7.1-beta-win-x64.exe']
 if layout.get('releaseKind')!='unified':programs+=['服务器/CreativeFlow-HostManager-Setup-0.7.1-beta-win-x64.exe','服务器/CreativeFlow-HostManager-Portable-0.7.1-beta-win-x64.exe','服务器/离线维护工具/host/CreativeFlow.Host.exe']
 for relative in programs:
  with z.open(files[relative]) as stream:assert stream.read(2)==b'MZ',relative
 if layout.get('releaseKind')=='unified':
  assert not any('HostManager-' in name for name in files)
  assert json.loads(z.read(files['验证记录/统一程序资源完整性验证.json']).decode('utf-8-sig'))['passed']
 else:assert '服务器/离线维护工具/host/coreclr.dll' in files
 for relative in files:
  if relative.startswith('验证记录/') and relative.endswith('.json'):assert json.loads(z.read(files[relative]).decode('utf-8-sig'))['passed'],relative
report={'passed':True,'archive':archive.name,'sizeBytes':archive.stat().st_size,'verifiedFiles':checked,'checks':['every file hash matches manifest after compression','installer and portable executable present','integrated management and self-contained runtime payload verified' if layout.get('releaseKind')=='unified' else 'separate manager and self-contained runtime present','no deployed certificate private key or workspace database included','all bundled functional verification reports passed']}
(root/layout['qaRoot']/'delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))

