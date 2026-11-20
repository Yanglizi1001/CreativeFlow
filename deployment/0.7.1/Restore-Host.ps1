#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$BackupPath,[string]$DataDirectory='C:\ProgramData\CreativeFlow Host',[string]$InstallDirectory='C:\Program Files\CreativeFlow Host')
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $BackupPath).Path;$data=[IO.Path]::GetFullPath($DataDirectory)
$manifest=Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
if($manifest.format -ne 'creativeflow-full-backup-v1' -or !(Test-Path -LiteralPath (Join-Path $source 'media'))){throw '请选择由 Backup-Host.ps1 生成的完整备份文件夹。'}
if($data -eq [IO.Path]::GetPathRoot($data) -or $source -eq $data -or $source -eq (Join-Path $data 'media') -or $source.StartsWith((Join-Path $data 'media')+'\',[StringComparison]::OrdinalIgnoreCase)){throw '备份源目录无效。'}
& (Join-Path $InstallDirectory 'CreativeFlow.Host.exe') --contentRoot $InstallDirectory --Host:DataDirectory $source --validate-backup
if($LASTEXITCODE -ne 0){throw '备份校验失败，不会替换当前数据。'}
if((Read-Host '恢复将替换当前空间和主机视频，请确认备份后输入 RESTORE') -cne 'RESTORE'){throw '已取消恢复。'}
Stop-Service CreativeFlowHost
$safety=Join-Path $data ('before-restore-'+(Get-Date -Format yyyyMMdd-HHmmss));New-Item -ItemType Directory -Path $safety | Out-Null
try {
    foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','media')){
        $target=[IO.Path]::GetFullPath((Join-Path $data $name));$destination=[IO.Path]::GetFullPath((Join-Path $safety $name))
        if(!$target.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or !$destination.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or $destination.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw '恢复路径检查失败，操作中止。'}
        if(Test-Path -LiteralPath $target){Move-Item -LiteralPath $target -Destination $destination}
    }
    foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','media')){$item=Join-Path $source $name;if(Test-Path -LiteralPath $item){Copy-Item -LiteralPath $item -Destination (Join-Path $data $name) -Recurse}}
    & (Join-Path $InstallDirectory 'CreativeFlow.Host.exe') --contentRoot $InstallDirectory --Host:DataDirectory $data --restored-epoch
    if($LASTEXITCODE -ne 0){throw '空间纪元更新失败，请保持服务停止。'}
    Start-Service CreativeFlowHost
    Write-Host "恢复完成，恢复前的数据保存在：$safety。客户端离线修改会进入人工核对，身份失效时请用新设备邀请码重新加入。"
} catch {throw "恢复未完成，服务保持当前状态；原数据保存在 $safety。请先检查，不要再次执行恢复。错误：$_"}
