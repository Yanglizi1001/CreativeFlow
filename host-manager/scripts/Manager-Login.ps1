$ErrorActionPreference='Stop'
$folder=Join-Path $env:ProgramData 'CreativeFlow Manager'
$config=Get-Content -LiteralPath (Join-Path $folder 'manager-startup.json') -Raw|ConvertFrom-Json
if(!$config.enabled){exit}
foreach($file in @($config.files)){
    if(!(Test-Path -LiteralPath $file.path) -or (Get-FileHash -LiteralPath $file.path -Algorithm SHA256).Hash -ne $file.sha256){exit 2}
}
if(!(Test-Path -LiteralPath $config.executable)){exit 2}
Start-Process -FilePath $config.executable -WorkingDirectory (Split-Path $config.executable -Parent) -WindowStyle Normal
