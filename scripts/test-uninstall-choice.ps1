param([string]$Workspace)
$ErrorActionPreference='Stop'
$ProjectLayout=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\project-layout.json') -Raw|ConvertFrom-Json
. (Join-Path $Workspace 'host-manager\scripts\Manager.ps1') -Library
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('creativeflow-access-uninstall-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $testRoot|Out-Null
& (Join-Path $Workspace 'scripts\create-access-fixture.ps1') -Directory $testRoot | Out-Null
function Assert-Administrator {}
function Protect-Directory([string]$Path) {}
function Get-ManagerSettingsPath {Join-Path $testRoot 'settings.json'}
function Get-HostInstallation {return $script:fixture}
$script:stops=0;$script:deletes=0;$script:certRemoved=''
function Stop-HostService {$script:stops++}
function sc.exe {$script:deletes++;$global:LASTEXITCODE=0}
function Get-NetFirewallRule {return $null}
function Get-ScheduledTask {return $null}
function Remove-HostCertificate([string]$Thumbprint) {$script:certRemoved=$Thumbprint}
function Assert-True($Value,[string]$Message){if(!$Value){throw "ASSERT: $Message"}}
function Assert-Rejected([scriptblock]$Action){$rejected=$false;try{& $Action}catch{$rejected=$true};Assert-True $rejected 'unsafe deletion must fail'}
$program=Join-Path $testRoot 'program';$data=Join-Path $testRoot 'space';$backup=Join-Path $testRoot 'backup';New-Item -ItemType Directory -Path $program,$data,$backup,(Join-Path $data 'media')|Out-Null
[IO.File]::WriteAllText((Join-Path $program 'CreativeFlow.Host.exe'),'fixture binary')
[IO.File]::WriteAllText((Join-Path $data 'creativeflow-host.db'),'fixture database')
[IO.File]::WriteAllText((Join-Path $data 'host.pfx'),'fixture key')
[IO.File]::WriteAllText((Join-Path $data 'media\video.webm'),'fixture video')
[IO.File]::WriteAllText((Join-Path $data 'unrelated.txt'),'must survive')
[IO.File]::WriteAllText((Join-Path $backup 'kept.txt'),'must survive')
Copy-Item -LiteralPath (Join-Path $testRoot 'test.cer') -Destination (Join-Path $data 'CreativeFlow-Host.cer')
$configFile=Join-Path $program 'appsettings.Production.json';$config=@{Host=@{DataDirectory=$data}};$config|ConvertTo-Json|Set-Content -LiteralPath $configFile -Encoding UTF8
$settings=[pscustomobject]@{installDirectory=$program;dataDirectory=$data;backupDirectory=$backup;automaticBackup=$false}
$script:fixture=@{settings=$settings;service=[pscustomobject]@{State='Running'};config=$config|ConvertTo-Json|ConvertFrom-Json;configFile=$configFile}
$resources=Join-Path $Workspace 'host-manager\resources'
$keep=Invoke-ManagerRequest @{action='uninstall';deleteData=$false} $resources
Assert-True ($keep.retained -eq $data -and (Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db')) -and (Test-Path -LiteralPath $configFile)) 'keep preserves database and configuration'
Assert-True ($script:certRemoved -eq '') 'keep does not change certificate store'
$count=$script:deletes
Assert-Rejected {Invoke-ManagerRequest @{action='uninstall';deleteData=$true;confirmation='wrong';confirmedDataDirectory=$data} $resources}
Assert-Rejected {Invoke-ManagerRequest @{action='uninstall';deleteData=$true;confirmation='删除协作数据';confirmedDataDirectory=$program} $resources}
Assert-True ($count -eq $script:deletes) 'invalid confirmation cannot remove service'
$delete=Invoke-ManagerRequest @{action='uninstall';deleteData=$true;confirmation='删除协作数据';confirmedDataDirectory=$data} $resources
Assert-True $delete.deletedData 'delete result explicit'
foreach($name in @('creativeflow-host.db','host.pfx','CreativeFlow-Host.cer','media\video.webm')){Assert-True (!(Test-Path -LiteralPath (Join-Path $data $name))) 'owned data removed'}
Assert-True (!(Test-Path -LiteralPath $configFile)) 'obsolete secret service configuration removed'
Assert-True ((Test-Path -LiteralPath (Join-Path $program 'CreativeFlow.Host.exe')) -and (Test-Path -LiteralPath (Join-Path $backup 'kept.txt')) -and (Test-Path -LiteralPath (Join-Path $data 'unrelated.txt'))) 'program backups and unrelated files survive'
Assert-True ($script:certRemoved -match '^[0-9A-F]{40}$') 'only exact server certificate selected'
@{passed=$true;scope='Disposable files with service, firewall, scheduler and machine certificate adapters; no production state changed';checks=@('keep retains data and certificate','invalid confirmation rejected before service removal','delete removes only owned data and secret configuration','program independent backups and unrelated files preserved','certificate selected by exact fingerprint')}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Workspace (Join-Path $ProjectLayout.qaRoot 'manager\uninstall-choice-result.json')) -Encoding UTF8
Write-Output 'Uninstall choice checks passed.'
