#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$ServerName,[string]$WorkspaceName='公司协作空间',[string]$OwnerName='空间管理员',[string]$InstallDirectory='C:\Program Files\CreativeFlow Host',[string]$DataDirectory='C:\ProgramData\CreativeFlow Host',[int]$Port=47840)
$ErrorActionPreference='Stop'
if(Get-Service CreativeFlowHost -ErrorAction SilentlyContinue){throw '主机服务已存在，请使用 Upgrade-Host.ps1 升级，不能重复初始化。'}
if($ServerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$'){throw '请输入有效的服务器计算机名，例如 VIDEO-SERVER。'}
if($Port -lt 1024 -or $Port -gt 65535){throw '端口无效'}
$program=[IO.Path]::GetFullPath($InstallDirectory);$data=[IO.Path]::GetFullPath($DataDirectory)
if($program -eq [IO.Path]::GetPathRoot($program) -or $data -eq [IO.Path]::GetPathRoot($data) -or $program.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or $data.StartsWith($program+'\',[StringComparison]::OrdinalIgnoreCase) -or $program -eq $data){throw '程序目录与数据目录必须独立，不能使用磁盘根目录。'}
if(Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db')){throw '数据目录已有公司空间。请备份并使用升级或恢复流程，不会覆盖现有数据库。'}
if((Test-Path -LiteralPath $data) -and @(Get-ChildItem -LiteralPath $data -Force).Count){throw '新部署请选择空的协作数据目录。已有资料请使用接管、重新注册或恢复流程。'}
$source=Join-Path $PSScriptRoot 'host'
if(!(Test-Path -LiteralPath (Join-Path $source 'CreativeFlow.Host.exe'))){throw '交付包不完整：缺少 host 文件夹。'}
New-Item -ItemType Directory -Force -Path $program,$data | Out-Null
& icacls.exe $program /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw '程序目录权限保护失败，安装中止。'}
Copy-Item -Path (Join-Path $source '*') -Destination $program -Recurse -Force
$cert=New-SelfSignedCertificate -DnsName $ServerName,'localhost' -CertStoreLocation Cert:\LocalMachine\My -FriendlyName 'CreativeFlow Host 0.7.1' -NotAfter (Get-Date).AddYears(2)
$bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
$password=[Convert]::ToBase64String($bytes);$pfx=Join-Path $data 'host.pfx';$public=Join-Path $data 'CreativeFlow-Host.cer'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
Export-Certificate -Cert $cert -FilePath $public | Out-Null
@{Host=@{DataDirectory=$data;TlsPath=$pfx;TlsPassword=$password;TlsPort=$Port}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $program 'appsettings.Production.json') -Encoding UTF8
& icacls.exe $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw '数据目录权限设置失败，安装中止。'}
& icacls.exe (Join-Path $program 'appsettings.Production.json') /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if($LASTEXITCODE -ne 0){throw '主机凭据保护失败，安装中止。'}
$materials=Join-Path $PSScriptRoot '员工接入材料';New-Item -ItemType Directory -Path $materials -Force | Out-Null
Copy-Item -LiteralPath $public -Destination (Join-Path $materials 'CreativeFlow-Host.cer')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Trust-Host.ps1'),(Join-Path $PSScriptRoot '信任主机证书.cmd') -Destination $materials
@("公司主机：https://${ServerName}:$Port","证书指纹：$($cert.Thumbprint)",'请把本文件夹交给同事；不要发送主机数据目录里的 PFX 或配置文件。') | Set-Content -LiteralPath (Join-Path $materials '连接信息.txt') -Encoding UTF8
& (Join-Path $program 'CreativeFlow.Host.exe') --contentRoot $program --Host:DataDirectory $data --initialize-workspace --Setup:WorkspaceName $WorkspaceName --Setup:OwnerName $OwnerName
if($LASTEXITCODE -ne 0){throw '公司空间初始化失败，服务尚未建立，请保留数据联系维护。'}
New-Service -Name CreativeFlowHost -DisplayName 'CreativeFlow Host' -BinaryPathName ('"'+(Join-Path $program 'CreativeFlow.Host.exe')+'" --contentRoot "'+$program+'"') -StartupType Automatic | Out-Null
New-NetFirewallRule -Name CreativeFlowHost071Https -DisplayName 'CreativeFlow Host HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private,Domain -RemoteAddress LocalSubnet | Out-Null
Start-Service CreativeFlowHost
Write-Host "安装完成：https://${ServerName}:$Port"
Write-Host "请保留上方管理员邀请码（10分钟有效），并把 $materials 分发给员工。"
Write-Host '电脑所在网络需为可信的专用网络或公司域网络；主机电脑需要保持开机。'
