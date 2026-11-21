$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$layout=Get-Content -LiteralPath (Join-Path $root 'config\project-layout.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($layout.releaseKind -ne 'unified'){throw 'This assembler only handles unified desktop releases'}
$delivery=Join-Path (Join-Path $root $layout.releaseRoot) $layout.releaseName
if((Test-Path -LiteralPath $delivery) -or (Test-Path -LiteralPath ($delivery+'.zip'))){throw 'Delivery already exists; assign a new batch instead of overwriting'}
$client=Join-Path $delivery '客户端';$docs=Join-Path $delivery '说明书';$qa=Join-Path $delivery '验证记录'
New-Item -ItemType Directory -Force -Path $client,$docs,$qa|Out-Null
foreach($name in @('CreativeFlow-Setup-0.7.1-beta-win-x64.exe','CreativeFlow-Portable-0.7.1-beta-win-x64.exe')){Copy-Item -LiteralPath (Join-Path $root (Join-Path (Join-Path $layout.buildRoot 'client') $name)) -Destination $client}
Copy-Item -LiteralPath (Join-Path $root 'output\pdf\创作流-内置协作管理使用说明.pdf') -Destination (Join-Path $docs '部署与使用说明.pdf')
Copy-Item -LiteralPath (Join-Path $root 'docs\manuals\0.7.1-beta-内置协作管理使用说明.md') -Destination (Join-Path $docs '部署与使用说明.md')
Copy-Item -LiteralPath (Join-Path $root 'docs\manuals\0.7.1-beta-审阅布局优化说明.md') -Destination $docs
$reports=@{
 '内置管理窗口交互验证.json'='integration\unified-manager\result.json'
 '免安装程序实际启动验证.json'='integration\unified-portable\result.json'
 '统一程序资源完整性验证.json'='integration\unified-payload\result.json'
 '本地与协作排序布局验证.json'='integration\opinion-sorting\result.json'
 '多人协作完整流程.json'='integration\full-qa\result.json'
 '打包客户端协作验证.json'='integration\package-qa\result.json'
 '版本管理完整流程.json'='integration\version-management\result.json'
 '管理功能回归.json'='manager\ui\result.json'
 '窗口信任校验.json'='manager\window-trust\result.json'
 '客户端基础测试.json'='unit-tests.json'
 '备份恢复迁移回归.json'='manager\maintenance-result.json'
}
foreach($name in $reports.Keys){$source=Join-Path $root (Join-Path $layout.qaRoot $reports[$name]);$value=Get-Content -LiteralPath $source -Raw -Encoding UTF8|ConvertFrom-Json;if(!$value.passed){throw ('Verification failed: '+$name)};Copy-Item -LiteralPath $source -Destination (Join-Path $qa $name)}
@'
创作流 0.7.1 beta - 内置协作管理完整包
批次：2026-11-21-integrated-manager

只需选择“客户端”中的安装版或免安装版。两者都包含协作管理界面、主机服务安装资源、服务器离线运行环境和使用说明，不再安装独立管理器。

打开软件后：应用菜单 → 协作管理器；或设置 → 公司空间与连接 → 打开协作管理器。
员工选择“配置当前电脑接入”；服务器管理员在真正的服务器电脑选择“授权管理本机”。Windows 管理员授权需要本人确认，日常主窗口继续使用普通权限。
管理器独立显示、重复点击只唤起一个窗口，保留原有七个管理页面。管理对象固定为当前电脑上的服务，不会因为连接了公司空间就获得远程主机管理权限。

已部署主机：识别或接管原有服务，保留原程序位置、数据位置、证书、成员和备份设置。确认内置管理器工作正常后，可卸载旧的“创作流协作管理器”软件。不要点击“卸载协作服务”，也不要重新建立公司空间。
本次后台主机程序与此前意见排序批次一致，已升级过的主机不需要重复替换或重启。需要升级早期主机时，内置管理器仍提供先完整备份再升级的功能。

升级前完全退出旧创作流，再安装新版或运行新版免安装程序。原有本地功能、审阅排序、整体意见分区、多人权限、离线同步、日历与小组件保留。
卸载创作流本身不会自动卸载已部署的主机服务，也不会删除公司数据。删除协作服务或永久删除空间数据必须在管理窗口中明确选择并确认。

操作步骤见“说明书 / 部署与使用说明.pdf”。验证记录说明各自真实范围；测试使用隔离示例资料，不代表所有公司员工电脑已经完成接入。软件缩放与窗口尺寸已检查，真实跨电脑网络仍需部署环境确认。
本包不包含公司数据库、证书私钥或邀请码。文件完整性见 SHA256SUMS.txt。
'@|Set-Content -LiteralPath (Join-Path $delivery '先读这里.txt') -Encoding UTF8
$bad=@(Get-ChildItem -LiteralPath $delivery -Recurse -File|Where-Object {$_.Name -match '\.(db(?:-wal|-shm)?|sqlite|pfx|cer|cfspace|key)$|^appsettings\.Production\.json$'})
if($bad.Count){throw 'Deployed data or certificates unexpectedly present'}
Get-ChildItem -LiteralPath $delivery -Recurse -File|Sort-Object FullName|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.FullName.Substring($delivery.Length+1))"}|Set-Content -LiteralPath (Join-Path $delivery 'SHA256SUMS.txt') -Encoding UTF8
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($delivery,($delivery+'.zip'),[IO.Compression.CompressionLevel]::Optimal,$true)
"$((Get-FileHash -LiteralPath ($delivery+'.zip') -Algorithm SHA256).Hash.ToLower())  $([IO.Path]::GetFileName($delivery+'.zip'))"|Set-Content -LiteralPath ($delivery+'.zip.sha256.txt') -Encoding UTF8
Get-Item -LiteralPath ($delivery+'.zip')|Select-Object Name,Length
