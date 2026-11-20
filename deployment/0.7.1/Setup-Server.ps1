$ErrorActionPreference='Stop'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -NoExit -File "'+$PSCommandPath+'"') -Wait
    exit
}
$server=Read-Host "服务器计算机名（回车使用 $env:COMPUTERNAME）"
if([string]::IsNullOrWhiteSpace($server)){$server=$env:COMPUTERNAME}
$company=Read-Host '公司空间名称（回车使用“公司协作空间”）'
if([string]::IsNullOrWhiteSpace($company)){$company='公司协作空间'}
$owner=Read-Host '管理员姓名（回车使用“空间管理员”）'
if([string]::IsNullOrWhiteSpace($owner)){$owner='空间管理员'}
& (Join-Path $PSScriptRoot 'Install-Host.ps1') -ServerName $server -WorkspaceName $company -OwnerName $owner
