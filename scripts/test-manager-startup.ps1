param([string]$Workspace)
$ErrorActionPreference='Stop'
$ProjectLayout=Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\project-layout.json') -Raw|ConvertFrom-Json
. (Join-Path $Workspace 'host-manager\scripts\Manager.ps1') -Library
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('creativeflow-manager-startup-'+[guid]::NewGuid().ToString('N'))
$folder=Join-Path $testRoot 'CreativeFlow Manager';$bin=Join-Path $testRoot 'bin';New-Item -ItemType Directory -Path $folder,$bin|Out-Null
$exe=Join-Path $bin 'manager.exe';[IO.File]::WriteAllText($exe,'isolated fixture executable; never run')
function Get-ManagerSettingsPath {Join-Path $folder 'settings.json'}
function Protect-Directory([string]$Path) {}
$script:task=$null;$script:registration=$null;$script:launch=$null
function Get-ScheduledTask {return $script:task}
function New-ScheduledTaskAction($Execute,$Argument){return @{execute=$Execute;argument=$Argument}}
function New-ScheduledTaskTrigger([switch]$AtLogOn,$User){return @{atLogOn=[bool]$AtLogOn;user=$User}}
function New-ScheduledTaskPrincipal($UserId,$LogonType,$RunLevel){return @{userId=$UserId;logonType=$LogonType;runLevel=$RunLevel}}
function New-ScheduledTaskSettingsSet([switch]$StartWhenAvailable,$ExecutionTimeLimit){return @{}}
function Register-ScheduledTask($TaskName,$Action,$Trigger,$Principal,$Settings,[switch]$Force){$script:registration=@{name=$TaskName;action=$Action;trigger=$Trigger;principal=$Principal};$script:task=[pscustomobject]@{State='Ready'}}
function Unregister-ScheduledTask($TaskName,[switch]$Confirm){$script:task=$null}
function Start-Process($FilePath,$WorkingDirectory,$WindowStyle){$script:launch=$FilePath}
function Check($value,[string]$message){if(!$value){throw "ASSERT: $message"}}
$resources=Join-Path $Workspace 'host-manager\resources'
$null=Set-ManagerStartup @{enabled=$true;source='portable';executablePath=$exe} $resources
$state=Get-ManagerStartupStatus;Check ($state.enabled -and $state.healthy) 'portable startup registered'
Check ($script:registration.principal.logonType -eq 'Interactive' -and $script:registration.principal.runLevel -eq 'Highest') 'elevated interactive task without stored password'
Check ($script:registration.trigger.atLogOn -and $script:registration.action.argument -match 'Manager-Login.ps1') 'protected helper used on login'
$oldProgramData=$env:ProgramData;$env:ProgramData=$testRoot
try {
    . (Join-Path $resources 'scripts\Manager-Login.ps1')
    Check ($script:launch -eq $exe) 'approved executable selected'
    [IO.File]::WriteAllText($exe,'changed executable')
    Check (!(Get-ManagerStartupStatus).healthy) 'moved or updated program requires refresh'
    $script:launch=$null
    $null=Set-ManagerStartup @{enabled=$true;source='portable';executablePath=$exe} $resources
    Check (Get-ManagerStartupStatus).healthy 'refresh records new approved binary'
    . (Join-Path $resources 'scripts\Remove-ManagerStartup.ps1') -InstallDirectory $bin
    Check (!!$script:task) 'uninstalling installed manager does not remove separate portable startup'
    $null=Set-ManagerStartup @{enabled=$false} $resources
    Check (!(Get-ManagerStartupStatus).enabled) 'disable removes only manager login task'
    $null=Set-ManagerStartup @{enabled=$true;source='installed';executablePath=$exe} $resources
    . (Join-Path $resources 'scripts\Remove-ManagerStartup.ps1') -InstallDirectory $bin
    Check (!$script:task) 'installed manager uninstall removes own startup task'
} finally {$env:ProgramData=$oldProgramData}
@{passed=$true;checks=@('independent manager login task','current administrator interactive highest without password','protected helper validates startup manifest','portable source path retained','updates detected and refreshed','disable and uninstall cleanup');scope='All scheduler and process-launch operations use isolated adapters; no real startup task changed'}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Workspace (Join-Path $ProjectLayout.qaRoot 'manager\startup-result.json')) -Encoding UTF8
Write-Output 'Manager startup checks passed.'
