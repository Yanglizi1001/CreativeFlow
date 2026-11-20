param([string]$Workspace,[string]$Directory)
$ErrorActionPreference='Stop'
$ProjectLayout=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\project-layout.json') -Raw|ConvertFrom-Json
. (Join-Path $Workspace 'host-manager\scripts\Manager.ps1') -Library
function Assert-Administrator {}
$resolved=[IO.Path]::GetFullPath($Directory)
if(!$resolved.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'creativeflow-access-*'){throw 'Isolated access directory required'}
$program=Join-Path $Workspace $ProjectLayout.publishedHost;$data=Join-Path $resolved 'data';New-Item -ItemType Directory -Force -Path $data|Out-Null
Copy-Item -LiteralPath (Join-Path $resolved 'test.cer') -Destination (Join-Path $data 'CreativeFlow-Host.cer')
$setup=Invoke-HostCli $program $data @{action='setup';workspaceName='接入向导演示公司';ownerName='测试管理员'}
$script:installation=@{settings=[pscustomobject]@{installDirectory=$program;dataDirectory=$data;serverName='localhost'};config=[pscustomobject]@{Host=[pscustomobject]@{TlsPort=47860}}}
function Get-HostInstallation {return $script:installation}
$result=Invoke-ManagerRequest @{action='export-access';path=(Join-Path $resolved 'employee')} (Join-Path $Workspace 'host-manager\resources')
@{accessFile=$result.accessFile;code=$setup.code}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $resolved 'fixture.json') -Encoding UTF8
Write-Output 'Access fixture exported by production manager script.'
