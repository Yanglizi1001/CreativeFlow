param([string]$InstallDirectory)
$ErrorActionPreference='Stop'
$file=Join-Path $env:ProgramData 'CreativeFlow Manager\manager-startup.json'
if(Test-Path -LiteralPath $file){
    $config=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
    $root=[IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')+'\'
    if($config.source -eq 'installed' -and $config.executable.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){
        if(Get-ScheduledTask -TaskName CreativeFlowManagerLogon -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName CreativeFlowManagerLogon -Confirm:$false}
        Remove-Item -LiteralPath $file -Force
    }
}
