param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$resolved=[IO.Path]::GetFullPath($Directory)
if(!$resolved.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'creativeflow-access-*'){throw 'Isolated access fixture directory required'}
New-Item -ItemType Directory -Force -Path $resolved|Out-Null
$rsa=[Security.Cryptography.RSA]::Create(2048)
try {
    $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=CreativeFlow-Isolated-Access-Test',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new();$san.AddDnsName('localhost');$san.AddDnsName('employee-test.local');$request.CertificateExtensions.Add($san.Build())
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
    $cert=$request.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1),[DateTimeOffset]::Now.AddDays(2))
    try {
        [IO.File]::WriteAllBytes((Join-Path $resolved 'test.cer'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
        [IO.File]::WriteAllBytes((Join-Path $resolved 'test.pfx'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'fixture-only'))
        Write-Output $resolved
    } finally {$cert.Dispose()}
} finally {$rsa.Dispose()}
