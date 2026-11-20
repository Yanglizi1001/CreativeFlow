$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$layout=Get-Content -LiteralPath (Join-Path $root 'config\project-layout.json') -Raw|ConvertFrom-Json
$delivery=Join-Path (Join-Path $root $layout.releaseRoot) $layout.releaseName
if((Test-Path -LiteralPath $delivery) -or (Test-Path -LiteralPath ($delivery+'.zip'))){throw '当前交付批次已存在。请先分配新批次，不覆盖已交付文件。'}
$client=Join-Path $delivery '客户端';$server=Join-Path $delivery '服务器';$docs=Join-Path $delivery '说明书';$qa=Join-Path $delivery '验证记录'
New-Item -ItemType Directory -Force -Path $client,$server,$docs,$qa|Out-Null
foreach($name in @('CreativeFlow-Setup-0.7.1-beta-win-x64.exe','CreativeFlow-Portable-0.7.1-beta-win-x64.exe')){Copy-Item -LiteralPath (Join-Path $root (Join-Path (Join-Path $layout.buildRoot 'client') $name)) -Destination $client -Force}
Copy-Item -LiteralPath (Join-Path $root (Join-Path $layout.buildRoot 'manager\CreativeFlow-HostManager-Setup-0.7.1-beta-win-x64.exe')) -Destination $server -Force
Copy-Item -LiteralPath (Join-Path $root (Join-Path $layout.buildRoot 'manager\CreativeFlow-HostManager-Portable-0.7.1-beta-win-x64.exe')) -Destination $server -Force
$resources=Join-Path $root 'host-manager\resources'
$forbidden=@(Get-ChildItem -LiteralPath $resources -Recurse -File | Where-Object {$_.Name -match '\.(db(?:-wal|-shm)?|sqlite|pfx|cer|cfspace|key)$|^appsettings\.Production\.json$'})
if($forbidden.Count){throw '服务器发布资源中包含环境数据或证书，停止交付。'}
$maintenance=Join-Path $server '离线维护工具';New-Item -ItemType Directory -Force -Path $maintenance|Out-Null
Copy-Item -Path (Join-Path $resources 'deployment\*') -Destination $maintenance -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'output\pdf\创作流0.7.1beta-部署与使用说明.pdf') -Destination (Join-Path $docs '部署与使用说明.pdf') -Force
Copy-Item -LiteralPath (Join-Path $root 'output\pdf\创作流协作主机管理器-使用说明.pdf') -Destination (Join-Path $docs '协作管理器使用说明.pdf') -Force
Copy-Item -LiteralPath (Join-Path $root 'docs\manuals\0.7.1-beta-部署与使用说明.md'),(Join-Path $root 'docs\manuals\协作主机管理器-使用说明.md') -Destination $docs -Force
Copy-Item -LiteralPath (Join-Path $root 'docs\manuals\0.7.1-beta-版本管理更新说明.md') -Destination (Join-Path $docs '版本管理更新说明.md')
$reports=@{
    '主机服务打包一致性验证.json'=(Join-Path $layout.qaRoot 'manager\service-payload-result.json')
    '版本管理完整交互验证.json'=(Join-Path $layout.qaRoot 'integration\version-management\result.json')
    '协作视频缩略图验证.json'=(Join-Path $layout.qaRoot 'integration\thumbnail-qa\result.json')
    '管理器窗口校验验证.json'=(Join-Path $layout.qaRoot 'manager\window-trust\result.json')
    '容量并发与回归测试.json'=(Join-Path $layout.qaRoot 'service-tests\result.json')
    '容量真实接口验证.json'=(Join-Path $layout.qaRoot 'storage-http\result.json')
    '容量界面交互验证.json'=(Join-Path $layout.qaRoot 'manager\storage-ui\result.json')
    '管理器自启验证.json'=(Join-Path $layout.qaRoot 'manager\startup-result.json')
    '客户端完整流程.json'=(Join-Path $layout.qaRoot 'integration\full-qa\result.json')
    '客户端打包验证.json'=(Join-Path $layout.qaRoot 'integration\package-qa\result.json')
    '员工接入验证.json'=(Join-Path $layout.qaRoot 'employee-access\result.json')
    '管理器界面验证.json'=(Join-Path $layout.qaRoot 'manager\ui\result.json')
    '卸载数据选项验证.json'=(Join-Path $layout.qaRoot 'manager\uninstall-choice-result.json')
    '备份迁移恢复验证.json'=(Join-Path $layout.qaRoot 'manager\maintenance-result.json')
}
Copy-Item -LiteralPath (Join-Path $root (Join-Path $layout.qaRoot 'service-tests\version-management.trx')) -Destination (Join-Path $qa 'version-management.trx')
foreach($name in $reports.Keys){$source=Join-Path $root $reports[$name];$result=Get-Content -LiteralPath $source -Raw|ConvertFrom-Json;if(!$result.passed){throw "验证未通过：$name"};Copy-Item -LiteralPath $source -Destination (Join-Path $qa $name) -Force}
@'
创作流 0.7.1 beta — 版本管理完整安装包
更新日期：2026-11-20

本次新增统一的版本删除入口、版本回收站、恢复、并发确认与在线协作删除。此前缩略图、窗口校验、容量和自启功能保留。

重要升级顺序：先在公司服务器安装或运行本包新版协作管理器，在“设置与维护”点击“升级现有主机”（沿用原路径，自动完整备份），再更新员工客户端。请勿卸载协作服务或新建公司空间。仅本地用户只需更新客户端。
原证书、成员、项目、视频、意见和排期保留。仅更新管理器界面并不等于服务已升级，必须执行“升级现有主机”。

新操作：审阅页或审阅中心预览的“版本操作 → 删除当前版本”；任务详情保留“删除版本”。应用菜单与版本操作中可打开“版本回收站”。
协作删除仅可管理成员执行，必须联网且完成待同步修改；主机确认前不显示删除成功。未保存草稿、意见更新及发布中的视频会提示先处理。
本地和共享盘原文件不删除，协作视频在回收站仍占空间并受清理保护。删除最后版本不删除任务与排期，版本编号继续递增。
详细步骤及恢复规则见“说明书 / 版本管理更新说明.md”。
本轮客户端与服务端均已更新并完成独立空间验证，其余未改动的维护适配器证据沿用基线，见验证范围.txt。

本包包含员工客户端（安装版和免安装版）、协作管理器（安装版和免安装版）、主机协作服务、服务器离线运行环境、维护工具和两份使用说明。服务器无需另行安装 .NET；员工无需手工安装 Windows 证书。

一、在真正的公司服务器电脑上
运行“服务器 / CreativeFlow-HostManager-Setup-0.7.1-beta-win-x64.exe”，安装并打开协作管理器。
管理器不想安装时，可以运行同文件夹中的 HostManager-Portable 免安装版，同样包含主机服务及运行环境，并需要管理员授权。
首次部署：选择“安装协作主机”，填写公司与管理员名称，选择服务器程序路径和协作空间数据路径。
已经有公司空间：先接管，在管理器中使用“升级现有主机”，升级前自动完整备份。新主机程序才会执行容量限制；不要重复新建空间。
已有空间升级后到“存储用量”确认并保存容量上限。新空间默认上限 100 GB、最低磁盘余量 20 GB，不会提前占用这些容量。
服务已卸载但原数据仍保留：使用“重新注册已有主机”，选择原程序和原数据目录。
在“员工接入中心”导出公司协作空间.cfspace，通过公司可信渠道发送给员工，再为每人单独生成邀请码。

二、在员工电脑上
完全退出旧客户端（应用菜单“退出应用”，或托盘菜单“退出创作流”），运行“客户端”中的 Setup 安装版，或运行 Portable 便携版，两者任选一种。
选择“加入公司协作空间”，导入管理员提供的 .cfspace 文件，确认公司名称、地址和证书指纹，配置信任，再填写姓名和六位邀请码加入。
证书信任仅用于创作流协作连接，不要求手工安装到 Windows 系统证书库。客户端会保存已确认的公司证书，重启后继续使用；主机名称、证书指纹和有效期仍须匹配。
安装版支持双击接入文件打开向导；便携版可在软件里导入。旧电脑已有接入身份时可继续使用，无需重复加入。
邀请码单次使用、10 分钟有效；过期后在管理器生成新码，没有固定默认邀请码。
“设置 / 公司空间与连接”可以检测连接、导出报告、重新导入接入文件及退出本机连接。退出连接前请切回“我的项目”并处理待同步修改。

三、卸载协作服务的新操作
管理器中点击“卸载协作服务”，弹窗选择“保留数据”或“删除协作数据”，默认保留。
保留数据：移除服务和相关规则，原公司项目、视频、成员、意见和证书保留，以后可重新注册原空间。
删除数据：输入“删除协作数据”，并在最终窗口核对目录后确认。永久清理协作数据库、已发布视频、成员权限、排期、审阅意见、服务器证书及原服务配置。
服务器程序、独立备份、原共享盘和数据目录中的其他文件保留。删除数据不能撤销，请先保存需要的完整备份。
从 Windows 卸载管理器本身不会自动卸载协作服务。

四、自启与容量保护
在设置与维护中，“随 Windows 启动协作服务”和“登录 Windows 后打开协作管理器”分别设置。前者默认开启，后者默认关闭。管理器窗口关闭不影响后台服务。
免安装版要放在固定位置后再启用登录自启。移动或更新管理器后，重新启用或更新自启入口。自启仅用于当前管理员登录，任务不保存管理员密码。
存储用量页面可设置空间上限和最低磁盘余量，查看视频、数据库、目录内备份、历史留存及上传预留。80% 和 90% 提醒，容量不足时停止新增视频上传；已有视频和轻量审阅修改保留。
归档和回收站仍计入占用；只允许在清理入口删除已被替换且不被任何版本或回收站引用的视频。需要输入“清理无引用视频”，并再次确认。不会因超限自动删除资料。
备份和迁移会检查目标磁盘余量。迁移保留容量设置，恢复备份保留当前容量设置。

五、说明与验证范围
详细图文操作见“说明书”中的两份 PDF。
本包已在 Windows x64 隔离环境验证真实 HTTPS 接入、打包客户端视频与重启恢复、多人审阅权限、离线同步、小组件，以及卸载数据选择和维护文件操作。
卸载、备份等测试使用临时数据与服务适配器，没有卸载实际公司服务或删除实际公司资料。真实跨电脑网络仍需在公司局域网完成接入检查。
原本地项目继续保留，不会因加入空间自动上传。首次升级前建议先导出本地 JSON 备份。
“离线维护工具”供管理员备用；日常部署请优先使用图形协作管理器。
文件完整性校验清单：SHA256SUMS.txt。
自启任务和服务维护在隔离适配器中验证，未重启你的电脑或更改真实开机任务；请在部署机器首次启用后确认登录启动效果。
'@|Set-Content -LiteralPath (Join-Path $delivery '先读这里.txt') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root (Join-Path $layout.qaRoot 'BASELINE-SCOPE.txt')) -Destination (Join-Path $qa '验证范围.txt')
$forbidden=@(Get-ChildItem -LiteralPath $delivery -Recurse -File | Where-Object {$_.Name -match '\.(db(?:-wal|-shm)?|sqlite|pfx|cer|cfspace|key)$|^appsettings\.Production\.json$'})
if($forbidden.Count){throw '交付目录中意外存在环境数据或证书，停止打包。'}
$hashes=Get-ChildItem -LiteralPath $delivery -Recurse -File|Where-Object Name -ne 'SHA256SUMS.txt'|Sort-Object FullName|ForEach-Object {"$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.FullName.Substring($delivery.Length+1))"}
$hashes|Set-Content -LiteralPath (Join-Path $delivery 'SHA256SUMS.txt') -Encoding UTF8
$zip=$delivery+'.zip';if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip -Force}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($delivery,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
"$((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower())  $([IO.Path]::GetFileName($zip))"|Set-Content -LiteralPath ($zip+'.sha256.txt') -Encoding UTF8
Get-Item -LiteralPath $zip|Select-Object Name,Length,LastWriteTime
