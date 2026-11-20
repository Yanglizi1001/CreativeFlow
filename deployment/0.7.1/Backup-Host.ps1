#Requires -RunAsAdministrator
param([string]$DataDirectory='C:\ProgramData\CreativeFlow Host',[string]$InstallDirectory='C:\Program Files\CreativeFlow Host',[string]$BackupDirectory='')
$ErrorActionPreference='Stop'
$data=[IO.Path]::GetFullPath($DataDirectory)
if(!(Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db'))){throw '未找到公司空间数据库。'}
if(!$BackupDirectory){$BackupDirectory=Join-Path $data ('backups\full-'+(Get-Date -Format yyyyMMdd-HHmmss))}
$backup=[IO.Path]::GetFullPath($BackupDirectory)
if($backup -eq $data -or $backup -eq (Join-Path $data 'media') -or $data.StartsWith($backup+'\',[StringComparison]::OrdinalIgnoreCase) -or $backup.StartsWith((Join-Path $data 'media')+'\',[StringComparison]::OrdinalIgnoreCase)){throw '备份目录不能包含源数据目录，也不能位于视频目录中。'}
if(Test-Path -LiteralPath $backup){throw '备份目标已存在，请选择新文件夹。'}
$service=Get-Service CreativeFlowHost;$running=$service.Status -eq 'Running'
if($running){Stop-Service CreativeFlowHost}
try {
    New-Item -ItemType Directory -Path $backup | Out-Null
    & icacls.exe $backup /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw '备份目录权限保护失败，请使用本机 NTFS 受控目录。'}
    foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','host.pfx','CreativeFlow-Host.cer')){$file=Join-Path $data $name;if(Test-Path -LiteralPath $file){Copy-Item -LiteralPath $file -Destination (Join-Path $backup $name)}}
    $media=Join-Path $data 'media';if(Test-Path -LiteralPath $media){Copy-Item -LiteralPath $media -Destination (Join-Path $backup 'media') -Recurse}else{New-Item -ItemType Directory -Path (Join-Path $backup 'media') | Out-Null}
    Copy-Item -LiteralPath (Join-Path $InstallDirectory 'appsettings.Production.json') -Destination (Join-Path $backup 'appsettings.Production.json')
    @{format='creativeflow-full-backup-v1';version='0.7.1-beta';createdAt=(Get-Date).ToString('o');includesMedia=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding UTF8
    & (Join-Path $InstallDirectory 'CreativeFlow.Host.exe') --contentRoot $InstallDirectory --Host:DataDirectory $backup --validate-backup
    if($LASTEXITCODE -ne 0){throw '备份完整性检查失败，请保留原数据。'}
    Write-Host "完整备份已完成：$backup"
} finally {if($running){Start-Service CreativeFlowHost}}
