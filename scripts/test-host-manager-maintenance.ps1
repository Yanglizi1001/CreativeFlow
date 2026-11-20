param([string]$Workspace)
$ErrorActionPreference='Stop'
$ProjectLayout=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\project-layout.json') -Raw|ConvertFrom-Json
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('creativeflow-manager-maintenance-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
. (Join-Path $Workspace 'host-manager\resources\scripts\Manager.ps1') -Library
# Isolated service adapter: never access or modify the real service, firewall, task scheduler or certificate store.
function Assert-Administrator {}
function Get-ManagerSettingsPath {Join-Path $testRoot 'settings.json'}
function Protect-Directory([string]$Path) {}
$script:fixture=$null
function Get-HostInstallation {return $script:fixture}
function Stop-HostService {$script:fixture.service.State='Stopped'}
function Start-HostService {$script:fixture.service.State='Running'}
function Set-HostBinary([string]$Program) {$script:lastProgram=$Program}
function Assert-True($Value,[string]$Message){if(!$Value){throw "ASSERT: $Message"}}
function Assert-Rejected([scriptblock]$Action){$rejected=$false;try{& $Action}catch{$rejected=$true};Assert-True $rejected 'unsafe operation must be rejected'}
$program=Join-Path $testRoot '程序 原位置';$data=Join-Path $testRoot '协作资料';$backups=Join-Path $testRoot '备份';New-Item -ItemType Directory -Path $program,$data,(Join-Path $data 'media') | Out-Null
Copy-Item -Path (Join-Path $Workspace (Join-Path $ProjectLayout.publishedHost '*')) -Destination $program -Recurse
$setup=Invoke-HostCli $program $data @{action='setup';workspaceName='维护测试空间';ownerName='维护管理员'}
Assert-True ($setup.code -match '^\d{6}$') 'Chinese input and initial invitation work through PowerShell native pipe'
$oldHost=Join-Path $testRoot 'old-host';New-Item -ItemType Directory -Path $oldHost | Out-Null;Copy-Item -LiteralPath (Join-Path $program 'CreativeFlow.Host.exe') -Destination $oldHost
Assert-Rejected {Invoke-HostCli $oldHost $data @{action='inspect'}}
[IO.File]::WriteAllBytes((Join-Path $data 'media\test.webm'),[byte[]](1,2,3,4,5))
[IO.File]::WriteAllText((Join-Path $data 'host.pfx'),'fixture-private-key')
[IO.File]::WriteAllText((Join-Path $data 'CreativeFlow-Host.cer'),'fixture-public-key')
$config=@{Host=@{DataDirectory=$data;TlsPath=(Join-Path $data 'host.pfx');TlsPassword='fixture-only';TlsPort=47840}}
$configFile=Join-Path $program 'appsettings.Production.json';$config|ConvertTo-Json|Set-Content -LiteralPath $configFile -Encoding UTF8
$settings=[pscustomobject]@{installDirectory=$program;dataDirectory=$data;serverName='FIXTURE';backupDirectory=$backups;automaticBackup=$false;backupHour=2}
$script:fixture=@{settings=$settings;service=[pscustomobject]@{State='Running'};config=$config|ConvertTo-Json|ConvertFrom-Json;configFile=$configFile}
$resources=Join-Path $Workspace 'host-manager\resources'
$before=(Invoke-HostCli $program $data @{action='inspect'}).workspace.epoch
$backup=(Invoke-ManagerRequest @{action='backup';path=$backups} $resources).path
Assert-True (Test-Path -LiteralPath (Join-Path $backup 'manifest.json')) 'full backup manifest exists'
Assert-True ((Get-FileHash -LiteralPath (Join-Path $data 'media\test.webm')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $backup 'media\test.webm')).Hash) 'media copied'
Assert-True ($script:fixture.service.State -eq 'Running') 'service restored after backup'
Assert-Rejected {Invoke-ManagerRequest @{action='backup';path=(Join-Path $data 'media\bad')} $resources}
Assert-Rejected {Invoke-ManagerRequest @{action='migrate-data';path=$program} $resources}
Assert-True (Test-Path -LiteralPath (Join-Path $backup 'storage-policy.json')) 'capacity policy included in backup'
$newData=Join-Path $testRoot '新协作资料';$result=Invoke-ManagerRequest @{action='migrate-data';path=$newData} $resources
Assert-True (Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db')) 'original data retained'
Assert-True ((Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json).Host.DataDirectory -eq $newData) 'configuration switches after verified migration'
Assert-True (Test-Path -LiteralPath (Join-Path $newData 'storage-policy.json')) 'capacity policy migrates with workspace'
$script:fixture.settings.dataDirectory=$newData;$script:fixture.config=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
$null=Invoke-HostCli $program $newData @{action='rename-workspace';name='恢复前修改'}
$restored=Invoke-ManagerRequest @{action='restore';path=$backup} $resources
$after=Invoke-HostCli $program $newData @{action='inspect'}
Assert-True ($after.workspace.name -eq '维护测试空间') 'restore database content'
Assert-True ($after.workspace.epoch -ne $before) 'restore changes epoch to quarantine old offline edits'
Assert-True (Test-Path -LiteralPath (Join-Path $restored.retained 'creativeflow-host.db')) 'pre-restore records retained'
$mediaFile=Join-Path $backup 'media\test.webm';[IO.File]::WriteAllBytes($mediaFile,[byte[]](9,9,9))
Assert-Rejected {Invoke-ManagerRequest @{action='restore';path=$backup} $resources}
Assert-True ($script:fixture.service.State -eq 'Running') 'invalid backup rejected before stopping service'
$newProgram=Join-Path $testRoot '新程序位置';$moved=Invoke-ManagerRequest @{action='migrate-program';path=$newProgram} $resources
Assert-True ($script:lastProgram -eq $newProgram) 'service binary points to new verified program'
Assert-True (Test-Path -LiteralPath (Join-Path $program 'CreativeFlow.Host.exe')) 'old program retained'
Assert-Rejected {Assert-LocalDirectory 'C:\'}
Assert-Rejected {Assert-LocalDirectory '\\server\share\data'}
Assert-Rejected {Assert-LocalDirectory '..\data'}
function Get-StorageFreeBytes([string]$Target) {return 1GB}
Assert-Rejected {Assert-StorageDestination $backups 10MB $newData}
Assert-True ($script:fixture.service.State -eq 'Running') 'insufficient destination space rejected before stopping service'
$result=@{passed=$true;checks=@('Chinese native CLI input and initial code','complete database and media backup','backup restarts prior service state','unsafe and overlapping paths rejected','data migration verifies copies and retains originals','restore retains current data and changes epoch','tampered backup rejected before service stop','program migration updates binary after hash verification','quota policy included and migrated','disk protection rejects before service stop');testDirectory=$testRoot}
$output=Join-Path $Workspace (Join-Path $ProjectLayout.qaRoot 'manager\maintenance-result.json');$result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $output -Encoding UTF8
Write-Output 'Isolated maintenance checks passed: 8'
