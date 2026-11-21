param([string]$InstallDirectory)
$ErrorActionPreference='Stop'
$key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$value=Get-ItemPropertyValue -LiteralPath $key -Name CreativeFlow -ErrorAction SilentlyContinue
if(!$value){return}
$root=[IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')+'\'
$match=[regex]::Match([string]$value,'^"([^"]+\.exe)"')
if($match.Success -and [IO.Path]::GetFullPath($match.Groups[1].Value).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){Remove-ItemProperty -LiteralPath $key -Name CreativeFlow}
