$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$layout=Get-Content -LiteralPath (Join-Path $root 'config/project-layout.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($layout.version -ne '0.7.1-beta' -or $layout.releaseKind -ne 'unified'){throw 'Unexpected release kind/version'}
$destination=Join-Path $root 'release/github'
if(Test-Path -LiteralPath $destination){throw 'Release staging already exists'}
$bundle=Join-Path $destination $layout.releaseName
$client=Join-Path $bundle '客户端';$manual=Join-Path $bundle '说明书';$evidence=Join-Path $bundle '验证记录'
New-Item -ItemType Directory -Force -Path $client,$manual,$evidence|Out-Null
foreach($name in @('CreativeFlow-Setup-0.7.1-beta-win-x64.exe','CreativeFlow-Portable-0.7.1-beta-win-x64.exe')){Copy-Item -LiteralPath (Join-Path $root ($layout.buildRoot+'/client/'+$name)) -Destination $client}
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/pdf/Unified-Guide.pdf') -Destination (Join-Path $manual '部署与使用说明.pdf')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/0.7.1-beta-内置协作管理使用说明.md'),(Join-Path $root 'docs/manuals/0.7.1-beta-审阅布局优化说明.md'),(Join-Path $root 'docs/manuals/0.7.1-beta-版本管理更新说明.md') -Destination $manual
Copy-Item -LiteralPath (Join-Path $root 'docs/releases/0.7.1-beta-validation.md') -Destination (Join-Path $evidence '本地验证范围.md')
Copy-Item -LiteralPath (Join-Path $root 'artifacts/ci-tests/service-tests.trx') -Destination $evidence
Copy-Item -LiteralPath (Join-Path $root ($layout.qaRoot+'/integration/unified-payload/result.json')) -Destination (Join-Path $evidence 'CI统一资源检查.json')
@'
创作流 0.7.1 beta — 内置协作管理

选择“客户端”中的安装版或免安装版。两者均内置协作管理窗口、主机服务和独立运行环境，不再另装管理器。
主窗口应用菜单 → 协作管理器。员工选择“配置当前电脑接入”；服务器管理员选择“授权管理本机”，并确认 Windows 权限提示。
本地项目、视频审阅、修改意见、日历与桌面小组件保持原有使用方式。新增意见排序、整体意见分区及侧栏宽度保护。

已有主机：先更新创作流，内置管理器识别原服务；需要更新早期后台时选择“升级现有主机”，先自动备份。沿用原目录、证书、成员和数据，不要重新建立空间或卸载协作服务。
确认内置管理器正常工作后，只卸载旧的“创作流协作管理器”软件。关闭管理窗口或卸载创作流不会自动删除协作服务和公司数据。
升级客户端前从托盘完全退出旧程序及小组件。详见“说明书”。

本包由 GitHub Actions 从本次源码重新构建，与本地交付包的文件散列可能不同。验证记录区分本地界面验证与本次 CI 自动检查；不包含真实公司数据、证书或邀请码。
'@|Set-Content -LiteralPath (Join-Path $bundle '先读这里.txt') -Encoding UTF8
$forbidden=@(Get-ChildItem -LiteralPath $bundle -Recurse -File|Where-Object {$_.Name -match '\.(db(?:-wal|-shm)?|sqlite|pfx|cer|cfspace|key)$|^appsettings\.Production\.json$'})
if($forbidden.Count){throw 'Environment data found in delivery'}
Get-ChildItem -LiteralPath $bundle -Recurse -File|Sort-Object FullName|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.FullName.Substring($bundle.Length+1))"}|Set-Content -LiteralPath (Join-Path $bundle 'SHA256SUMS.txt') -Encoding UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($bundle,(Join-Path $destination 'CreativeFlow-Full-0.7.1-beta-win-x64.zip'),[IO.Compression.CompressionLevel]::Optimal,$true)
Get-ChildItem -LiteralPath $client -Filter '*.exe' -File|ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $destination}
Copy-Item -LiteralPath (Join-Path $root 'docs/releases/0.7.1-beta.md') -Destination (Join-Path $destination 'Release-Notes.md')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/pdf/Unified-Guide.pdf') -Destination (Join-Path $destination 'Deployment-Guide.pdf')
Copy-Item -LiteralPath (Join-Path $root 'docs/manuals/0.7.1-beta-版本管理更新说明.md') -Destination (Join-Path $destination 'Version-Management-Guide.md')
Get-ChildItem -LiteralPath $destination -File|Sort-Object Name|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"}|Set-Content -LiteralPath (Join-Path $destination 'SHA256SUMS.txt') -Encoding UTF8
Write-Host 'Unified complete delivery, two programs, guide and hashes prepared.'
