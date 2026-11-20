param([string]$CertificatePath=(Join-Path $PSScriptRoot 'CreativeFlow-Host.cer'))
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath $CertificatePath)){throw '请将管理员提供的 CreativeFlow-Host.cer 放在本脚本旁边。'}
$cert=Get-PfxCertificate -FilePath $CertificatePath
Write-Host "公司主机证书：$($cert.Subject)";Write-Host "指纹：$($cert.Thumbprint)"
if((Read-Host '请与管理员提供的指纹核对。确认后输入 TRUST') -cne 'TRUST'){throw '已取消，不会更改证书。'}
Import-Certificate -FilePath $CertificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Write-Host '当前用户已信任公司主机证书，可以打开创作流加入空间。'
