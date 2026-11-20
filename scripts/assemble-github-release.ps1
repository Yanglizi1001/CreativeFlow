$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$layout=Get-Content -LiteralPath (Join-Path $root 'config/project-layout.json') -Raw|ConvertFrom-Json
if($layout.version -ne '0.7.1-beta'){throw 'Unexpected release version'}
$destination=Join-Path $root 'release/github'
if(Test-Path -LiteralPath $destination){throw 'Release staging already exists; refusing to overwrite'}
$bundle=Join-Path $destination $layout.releaseName
$client=Join-Path $bundle '客户端';$server=Join-Path $bundle '服务器';$manual=Join-Path $bundle '说明书';$evidence=Join-Path $bundle '验证记录'
New-Item -ItemType Directory -Force -Path $client,$server,$manual,$evidence|Out-Null
foreach($name in @('CreativeFlow-Setup-0.7.1-beta-win-x64.exe','CreativeFlow-Portable-0.7.1-beta-win-x64.exe')){Copy-Item -LiteralPath (Join-Path $root (Join-Path ($layout.buildRoot+'/client') $name)) -Destination $client}
foreach($name in @('CreativeFlow-HostManager-Setup-0.7.1-beta-win-x64.exe','CreativeFlow-HostManager-Portable-0.7.1-beta-win-x64.exe')){Copy-Item -LiteralPath (Join-Path $root (Join-Path ($layout.buildRoot+'/manager') $name)) -Destination $server}
Copy-Item -LiteralPath (Join-Path $root 'host-manager/resources/deployment') -Destination (Join-Path $server '离线维护工具') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/pdf/Deployment-Guide.pdf') -Destination (Join-Path $manual '部署与使用说明.pdf')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/pdf/HostManager-Guide.pdf') -Destination (Join-Path $manual '协作管理器使用说明.pdf')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/0.7.1-beta-版本管理更新说明.md') -Destination (Join-Path $manual '版本管理更新说明.md')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/0.7.1-beta-部署与使用说明.md'),(Join-Path $root 'docs/manuals/协作主机管理器-使用说明.md') -Destination $manual
Copy-Item -LiteralPath (Join-Path $root 'docs/releases/0.7.1-beta-validation.md') -Destination (Join-Path $evidence '本地界面验收说明.md')
Copy-Item -LiteralPath (Join-Path $root 'artifacts/ci-tests/service-tests.trx') -Destination (Join-Path $evidence 'CI服务端测试.trx')
@'
创作流 0.7.1 beta — 版本管理与局域网协作

服务器先更新协作管理器，再在“设置与维护”执行“升级现有主机”；沿用原程序与数据目录，升级前自动备份。不要重新建立公司空间。
员工完全退出旧客户端、托盘与小组件，再安装或运行新版客户端。已有视频无需重新上传。仅本地用户只需更新客户端。
首次部署和员工加入步骤见“说明书”。安装版与免安装版任选一种，管理器内含主机服务及独立运行环境。

本地与协作审阅中可在“版本操作”删除版本，在“版本回收站”恢复。协作删除/恢复要求联网及可管理权限；未保存草稿、意见更新或发布中的视频须先处理。
删除最后版本保留任务与排期，版本编号继续递增。原素材不删除，回收站视频仍占容量并受清理保护。
详细操作和升级顺序以“说明书/版本管理更新说明.md”为准。

本包由 GitHub Actions 从发布标签对应源码重新构建，服务端自动测试记录和本地界面验收说明分开附带。截图与示例均不包含真实公司资料。
SHA256SUMS.txt 可用于核对完整性。
'@|Set-Content -LiteralPath (Join-Path $bundle '先读这里.txt') -Encoding UTF8
$forbidden=@(Get-ChildItem -LiteralPath $bundle -Recurse -File|Where-Object {$_.Name -match '\.(db(?:-wal|-shm)?|sqlite|pfx|cer|cfspace|key)$|^appsettings\.Production\.json$'})
if($forbidden.Count){throw 'Environment data found in delivery'}
$sums=Get-ChildItem -LiteralPath $bundle -Recurse -File|Sort-Object FullName|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.FullName.Substring($bundle.Length+1))"}
$sums|Set-Content -LiteralPath (Join-Path $bundle 'SHA256SUMS.txt') -Encoding UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($bundle,(Join-Path $destination 'CreativeFlow-Full-0.7.1-beta-win-x64.zip'),[IO.Compression.CompressionLevel]::Optimal,$true)
Get-ChildItem -LiteralPath $client,$server -Filter '*.exe' -File|ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $destination}
Copy-Item -LiteralPath (Join-Path $root 'docs/releases/0.7.1-beta.md') -Destination (Join-Path $destination 'Release-Notes.md')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/0.7.1-beta-版本管理更新说明.md') -Destination (Join-Path $destination 'Version-Management-Guide.md')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/pdf/Deployment-Guide.pdf'),(Join-Path $root 'docs/manuals/pdf/HostManager-Guide.pdf') -Destination $destination
Get-ChildItem -LiteralPath $destination -File|Sort-Object Name|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"}|Set-Content -LiteralPath (Join-Path $destination 'SHA256SUMS.txt') -Encoding UTF8
Write-Host 'Complete release, four programs, manuals, and hashes prepared.'
