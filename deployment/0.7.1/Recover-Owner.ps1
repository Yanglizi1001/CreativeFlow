#Requires -RunAsAdministrator
param([string]$InstallDirectory='C:\Program Files\CreativeFlow Host',[string]$DataDirectory='C:\ProgramData\CreativeFlow Host')
$ErrorActionPreference='Stop'
& (Join-Path $InstallDirectory 'CreativeFlow.Host.exe') --contentRoot $InstallDirectory --Host:DataDirectory $DataDirectory --recover-owner
if($LASTEXITCODE -ne 0){throw '无法生成管理员邀请码，请检查主机安装路径。'}
