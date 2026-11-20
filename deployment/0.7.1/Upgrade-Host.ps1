#Requires -RunAsAdministrator
param([string]$InstallDirectory='C:\Program Files\CreativeFlow Host',[string]$DataDirectory='C:\ProgramData\CreativeFlow Host')
$ErrorActionPreference='Stop'
$program=[IO.Path]::GetFullPath($InstallDirectory);$data=[IO.Path]::GetFullPath($DataDirectory)
if($program -eq $data -or $program.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or $data.StartsWith($program+'\',[StringComparison]::OrdinalIgnoreCase)){throw '程序与数据目录不能互相包含，请先整理旧部署目录。'}
if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'host\CreativeFlow.Host.exe'))){throw '缺少新版 host 文件夹。'}
& (Join-Path $PSScriptRoot 'Backup-Host.ps1') -DataDirectory $DataDirectory -InstallDirectory $InstallDirectory
Stop-Service CreativeFlowHost
$safety=Join-Path $DataDirectory ('before-upgrade-program-'+(Get-Date -Format yyyyMMdd-HHmmss));New-Item -ItemType Directory -Path $safety | Out-Null
try {
    Copy-Item -LiteralPath $InstallDirectory -Destination (Join-Path $safety 'program') -Recurse
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'host') | Where-Object {$_.Name -ne 'appsettings.Production.json'} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $InstallDirectory -Recurse -Force}
    & (Join-Path $InstallDirectory 'CreativeFlow.Host.exe') --contentRoot $InstallDirectory --Host:DataDirectory $DataDirectory --migrate-legacy
    if($LASTEXITCODE -ne 0){throw '旧版资料迁移未完成，请保留备份并检查。'}
    Start-Service CreativeFlowHost;Write-Host "升级完成。旧程序保存在 $safety；请同时升级所有员工客户端。旧版共享盘视频需要在审阅页重新发布。"
}catch{throw "升级未完成，请保留服务当前状态并检查；旧程序在 $safety。错误：$_"}
