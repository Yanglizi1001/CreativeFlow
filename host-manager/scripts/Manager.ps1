param([switch]$Library,[switch]$Scheduled)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=New-Object Text.UTF8Encoding($false)

function Assert-Administrator {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    if(!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw '请以管理员身份运行协作主机管理器。'}
}
function Get-ManagerSettingsPath {Join-Path $env:ProgramData 'CreativeFlow Manager\settings.json'}
function Test-LegacyManager {
    foreach($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')){
        if(Get-ItemProperty -Path $key -ErrorAction SilentlyContinue|Where-Object {$_.DisplayName -eq '创作流协作管理器'}){return $true}
    };return $false
}
function Get-ManagerStartupStatus {
    $file=Join-Path (Split-Path (Get-ManagerSettingsPath) -Parent) 'manager-startup.json'
    $task=Get-ScheduledTask -TaskName CreativeFlowManagerLogon -ErrorAction SilentlyContinue
    if(!(Test-Path -LiteralPath $file)){return @{enabled=$false;healthy=$true;detail='登录后不自动打开管理器'}}
    $config=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
    $healthy=!!$task -and [string]$task.State -ne 'Disabled'
    foreach($item in @($config.files)){if(!(Test-Path -LiteralPath $item.path) -or (Get-Item -LiteralPath $item.path).Length -ne $item.length -or (Get-Item -LiteralPath $item.path).LastWriteTimeUtc.Ticks -ne $item.modified){$healthy=$false;break}}
    return @{enabled=([bool]$config.enabled -and !!$task);healthy=$healthy;detail=if($healthy){'当前管理员登录后自动打开管理器'}else{'启动文件已移动或更新，请重新启用自启'};path=$config.executable;source=$config.source}
}
function Set-ManagerStartup($Request,[string]$Resources) {
    $folder=Split-Path (Get-ManagerSettingsPath) -Parent;New-Item -ItemType Directory -Force -Path $folder|Out-Null;Protect-Directory $folder
    $file=Join-Path $folder 'manager-startup.json'
    $previous=if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw}else{$null}
    if(!$Request.enabled){if(Get-ScheduledTask -TaskName CreativeFlowManagerLogon -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName CreativeFlowManagerLogon -Confirm:$false};if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force};return @{ok=$true}}
    $exe=[IO.Path]::GetFullPath([string]$Request.executablePath)
    if([IO.Path]::GetExtension($exe) -ne '.exe' -or !(Test-Path -LiteralPath $exe)){throw '未找到稳定的管理器启动程序，请将免安装版放到固定位置后再启用'}
    $parent=Assert-LocalDirectory (Split-Path $exe -Parent)
    $files=@(Get-Item -LiteralPath $exe)
    if($Request.source -eq 'installed'){$files=@(Get-ChildItem -LiteralPath $parent -Recurse -File -Force)}elseif($Request.source -ne 'portable'){throw '启动程序类型无效'}
    $manifest=@();foreach($item in $files){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '自启程序不能使用文件链接'};$manifest+=@{path=$item.FullName;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash;length=$item.Length;modified=$item.LastWriteTimeUtc.Ticks}}
    $entry=Join-Path $folder 'Manager-Login.ps1';Copy-Item -LiteralPath (Join-Path $Resources 'scripts\Manager-Login.ps1') -Destination $entry -Force
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$entry+'"')
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
    $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Highest
    @{enabled=$true;executable=$exe;source=$Request.source;files=$manifest}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $file -Encoding UTF8
    try{Register-ScheduledTask -TaskName CreativeFlowManagerLogon -Action $action -Trigger $trigger -Principal $principal -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)) -Force|Out-Null}catch{if($previous){$previous|Set-Content -LiteralPath $file -Encoding UTF8}else{Remove-Item -LiteralPath $file -Force};throw}
    return @{ok=$true}
}
function Protect-Directory([string]$Path) {
    & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw '无法保护数据目录，请使用本机 NTFS 磁盘。'}
}
function Write-ManagerSettings($Settings) {
    $file=Get-ManagerSettingsPath;$folder=Split-Path $file -Parent
    New-Item -ItemType Directory -Force -Path $folder | Out-Null;Protect-Directory $folder
    $Settings | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $file -Encoding UTF8
}
function Read-ManagerSettings {
    $file=Get-ManagerSettingsPath
    if(Test-Path -LiteralPath $file){return Get-Content -LiteralPath $file -Raw | ConvertFrom-Json}
    return [pscustomobject]@{installDirectory='C:\Program Files\CreativeFlow Host';dataDirectory='C:\ProgramData\CreativeFlow Host';serverName=[Environment]::MachineName;backupDirectory='';automaticBackup=$false;backupHour=2}
}
function Assert-LocalDirectory([string]$Path) {
    if(!$Path -or ![IO.Path]::IsPathRooted($Path) -or $Path.StartsWith('\\')){throw '请选择服务器本机磁盘的完整文件夹路径，不支持共享盘或相对路径。'}
    $full=[IO.Path]::GetFullPath($Path).TrimEnd('\')
    if($full -notmatch '^[A-Za-z]:\\' -or $full+'\' -eq [IO.Path]::GetPathRoot($full)){throw '不能选择磁盘根目录。'}
    $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
    if(!$drive.IsReady -or $drive.DriveType -notin @([IO.DriveType]::Fixed,[IO.DriveType]::Removable) -or $drive.DriveFormat -ne 'NTFS'){throw '请选择可用的本机 NTFS 磁盘；映射共享盘、网络驱动器和其他文件系统不能作为协作数据位置。'}
    $ancestor=$full
    while($ancestor -and (Split-Path $ancestor -Parent)) {
        if(Test-Path -LiteralPath $ancestor){if((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '请选择实际文件夹，不能使用目录链接或联接点。'}}
        $ancestor=Split-Path $ancestor -Parent
    }
    return $full
}
function Assert-Separate([string]$A,[string]$B) {
    if($A -eq $B -or $A.StartsWith($B+'\',[StringComparison]::OrdinalIgnoreCase) -or $B.StartsWith($A+'\',[StringComparison]::OrdinalIgnoreCase)){throw "两个目录不能相同或互相包含：$A / $B"}
}
function Get-HostInstallation {
    $settings=Read-ManagerSettings
    $service=Get-CimInstance Win32_Service -Filter "Name='CreativeFlowHost'" -ErrorAction SilentlyContinue
    if($service) {
        $match=[regex]::Match($service.PathName,'^"([^"]+\.exe)"')
        if(!$match.Success){throw '现有服务的程序路径无法识别，请检查服务配置。'}
        $settings.installDirectory=Split-Path $match.Groups[1].Value -Parent
    }
    $configFile=Join-Path $settings.installDirectory 'appsettings.Production.json'
    $config=$null
    if(Test-Path -LiteralPath $configFile){$config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json;$settings.dataDirectory=$config.Host.DataDirectory}
    return @{settings=$settings;service=$service;config=$config;configFile=$configFile}
}
function Invoke-HostCli([string]$Program,[string]$Data,$Request) {
    $exe=Join-Path $Program 'CreativeFlow.Host.exe'
    if(!(Test-Path -LiteralPath $exe)){throw '未找到服务器程序，请先安装或升级主机。'}
    $capabilityFile=Join-Path $Program 'host-manager-capabilities.json'
    if(!(Test-Path -LiteralPath $capabilityFile)){throw '当前服务器尚不支持图形管理，请先点击“升级现有主机”。'}
    $capability=Get-Content -LiteralPath $capabilityFile -Raw|ConvertFrom-Json
    if($capability.format -ne 'creativeflow-host-manager-cli' -or $capability.version -ne 1){throw '服务器管理接口版本不兼容，请升级管理器与主机。'}
    $requestJson=$Request | ConvertTo-Json -Depth 8 -Compress
    $lines=@($requestJson | & $exe --contentRoot $Program --Host:DataDirectory $Data --manager-json 2>&1)
    $line=$lines | ForEach-Object {"$_"} | Where-Object {$_.StartsWith('CFMANAGER:')} | Select-Object -Last 1
    if(!$line){throw '当前服务器尚不支持图形管理，请先点击“升级现有主机”。'}
    $result=$line.Substring(10) | ConvertFrom-Json
    if($result.error){throw $result.error};return $result
}
function Stop-HostService { $service=Get-Service CreativeFlowHost -ErrorAction Stop;if($service.Status -ne 'Stopped'){Stop-Service CreativeFlowHost -ErrorAction Stop;(Get-Service CreativeFlowHost).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))} }
function Start-HostService {
    Start-Service CreativeFlowHost -ErrorAction Stop;(Get-Service CreativeFlowHost).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
    $installed=Get-HostInstallation;$port=[int]$installed.config.Host.TlsPort
    if(!$port){throw '服务已启动，但未找到 HTTPS 端口配置，请运行网络检测。'}
    $certificate=New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $installed.settings.dataDirectory 'CreativeFlow-Host.cer'))
    try {for($attempt=0;$attempt -lt 5;$attempt++){if((Test-Health "https://localhost:$port" $certificate.Thumbprint).ok){return};Start-Sleep -Milliseconds 400}}finally{$certificate.Dispose()}
    throw '服务已启动，但协作接口未就绪。请运行网络检测并检查主机配置，暂不要让员工接入。'
}
function Set-HostBinary([string]$Program) {
    $binary='"'+(Join-Path $Program 'CreativeFlow.Host.exe')+'" --contentRoot "'+$Program+'"'
    $service=Get-CimInstance Win32_Service -Filter "Name='CreativeFlowHost'"
    $result=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$binary}
    if($result.ReturnValue -ne 0){throw '无法更新主机服务路径。'}
}
function Get-SnapshotFiles([string]$Data) {
    $mediaRoot=Join-Path $Data 'media'
    if(Test-Path -LiteralPath $mediaRoot){
        if((Get-Item -LiteralPath $mediaRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '视频目录不能是链接或联接点。'}
        if(@(Get-ChildItem -LiteralPath $mediaRoot -Recurse -Directory -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw '视频目录中存在链接文件夹，已停止复制。'}
    }
    $items=@();foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','host.pfx','CreativeFlow-Host.cer','storage-policy.json')){$p=Join-Path $Data $name;if(Test-Path -LiteralPath $p){$items+=Get-Item -LiteralPath $p}}
    $media=Join-Path $Data 'media';if(Test-Path -LiteralPath $media){$items+=@(Get-ChildItem -LiteralPath $media -Recurse -File)}
    foreach($item in $items){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '数据中存在链接文件，请先检查。'};[pscustomobject]@{file=$item.FullName;relative=$item.FullName.Substring($Data.Length+1)}}
}
function Copy-CheckedSpace([string]$Data,[string]$Target) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null;Protect-Directory $Target
    New-Item -ItemType Directory -Path (Join-Path $Target 'media') -Force | Out-Null
    $hashes=@()
    foreach($item in @(Get-SnapshotFiles $Data)) {
        $destination=Join-Path $Target $item.relative;New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Assert-StorageDestination $Target (Get-Item -LiteralPath $item.file).Length $Data
        Copy-Item -LiteralPath $item.file -Destination $destination
        $hash=(Get-FileHash -LiteralPath $item.file -Algorithm SHA256).Hash
        if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash){throw '数据复制校验失败，原数据已保留。'}
        $hashes+=@{path=$item.relative;sha256=$hash}
    };return ,$hashes
}
function New-FullBackup($Installation,[string]$Parent) {
    $data=Assert-LocalDirectory $Installation.settings.dataDirectory;$parent=Assert-LocalDirectory $Parent;Assert-Separate $data $parent;Assert-Separate (Assert-LocalDirectory $Installation.settings.installDirectory) $parent
    $backup=Join-Path $parent ('CreativeFlow-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
    $estimate=(@(Get-SnapshotFiles $data)|ForEach-Object {(Get-Item -LiteralPath $_.file).Length}|Measure-Object -Sum).Sum
    Assert-StorageDestination $parent ([long]$estimate+1MB) $data
    $running=$Installation.service.State -eq 'Running';Stop-HostService
    try {
        $hashes=Copy-CheckedSpace $data $backup
        Copy-Item -LiteralPath $Installation.configFile -Destination (Join-Path $backup 'appsettings.Production.json')
        $hashes+=@{path='appsettings.Production.json';sha256=(Get-FileHash -LiteralPath (Join-Path $backup 'appsettings.Production.json') -Algorithm SHA256).Hash}
        @{format='creativeflow-full-backup-v1';createdAt=(Get-Date).ToString('o');includesMedia=$true;hashes=$hashes} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding UTF8
        & (Join-Path $Installation.settings.installDirectory 'CreativeFlow.Host.exe') --contentRoot $Installation.settings.installDirectory --Host:DataDirectory $backup --validate-backup | Out-Null
        if($LASTEXITCODE -ne 0){throw '备份数据库校验失败，未修改原空间。'}
        return $backup
    } finally {if($running){Start-HostService}}
}
function Get-StorageFreeBytes([string]$Target) {(New-Object IO.DriveInfo([IO.Path]::GetPathRoot($Target))).AvailableFreeSpace}
function Assert-StorageDestination([string]$Target,[long]$Bytes,[string]$Data) {
    $reserve=20GB;$file=Join-Path $Data 'storage-policy.json';if(Test-Path -LiteralPath $file){$policy=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;$reserve=[long]$policy.minimumFreeBytes}
    if($reserve -lt 5GB){throw '容量保护配置无效，请先检查空间设置。'}
    $free=Get-StorageFreeBytes $Target
    if($free -lt $Bytes+$reserve){throw '目标磁盘空间不足，无法在保留必要磁盘余量的同时完成备份或迁移。原资料未更改。'}
}
function Test-Health([string]$Url,[string]$Fingerprint='') {
    try {
        # A request-local C# callback avoids changing global trust or invoking PowerShell on a TLS worker thread.
        if(!('CreativeFlowManagerProbe' -as [type])){Add-Type -TypeDefinition @'
using System;using System.Net;using System.IO;
public static class CreativeFlowManagerProbe {
 public static string Read(string url,string fingerprint) {
  var request=(HttpWebRequest)WebRequest.Create(url);request.Timeout=4000;request.Proxy=null;
  if(!String.IsNullOrEmpty(fingerprint))request.ServerCertificateValidationCallback=(sender,cert,chain,errors)=>cert!=null&&String.Equals(cert.GetCertHashString(),fingerprint,StringComparison.OrdinalIgnoreCase);
  using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream()))return reader.ReadToEnd();
 }
}
'@}
        $value=[CreativeFlowManagerProbe]::Read($Url.TrimEnd('/')+'/api/v1/health',$Fingerprint)|ConvertFrom-Json
        if($value.status -ne 'ok'){throw '接口响应异常'};return @{ok=$true;version=$value.integratedVersion}
    } catch {return @{ok=$false;error=$_.Exception.Message}}
}
function Get-UninstallDataPlan($Installation,$Request) {
    $data=Assert-LocalDirectory $Installation.settings.dataDirectory
    $program=Assert-LocalDirectory $Installation.settings.installDirectory;Assert-Separate $data $program
    if($Request.confirmation -cne '删除协作数据' -or $Request.confirmedDataDirectory -cne $data){throw '删除确认与当前协作数据目录不一致，请重新打开卸载窗口。'}
    if(!$Installation.config -or [IO.Path]::GetFullPath($Installation.config.Host.DataDirectory).TrimEnd('\') -ne $data){throw '服务器配置与协作数据目录不一致，已停止卸载。'}
    if(!(Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db'))){throw '未找到可确认归属的协作数据库，已停止删除。'}
    if($Installation.settings.backupDirectory){Assert-Separate $data (Assert-LocalDirectory $Installation.settings.backupDirectory)}
    $files=@(Get-SnapshotFiles $data)
    foreach($name in @('storage-reservations.json','storage-control.lock')){$p=Join-Path $data $name;if(Test-Path -LiteralPath $p){$files+=[pscustomobject]@{file=$p;relative=$name}}}
    foreach($item in $files){$full=[IO.Path]::GetFullPath($item.file);if(!$full.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase)){throw '删除目标超出协作目录，已停止。'}}
    if((Get-Item -LiteralPath $Installation.configFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '服务器配置不能是链接。'}
    $thumbprint='';$public=Join-Path $data 'CreativeFlow-Host.cer';if(Test-Path -LiteralPath $public){$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($public);try{$thumbprint=$cert.Thumbprint}finally{$cert.Dispose()}}
    return @{directory=$data;files=$files;configFile=$Installation.configFile;thumbprint=$thumbprint}
}
function Remove-HostCertificate([string]$Thumbprint) {
    if($Thumbprint -match '^[0-9A-F]{40}$'){$certPath='Cert:\LocalMachine\My\'+$Thumbprint;if(Test-Path -LiteralPath $certPath){$cert=Get-Item -LiteralPath $certPath;if($cert.FriendlyName -eq 'CreativeFlow Host 0.7.1'){Remove-Item -LiteralPath $certPath -DeleteKey -Force}}}
}
function Remove-UninstalledSpace($Plan) {
    # Only the validated database/media/certificate files are owned by this space.
    # Leave the directory, unrelated files, server binaries and separate backups intact.
    Remove-HostCertificate $Plan.thumbprint
    foreach($item in $Plan.files){if(Test-Path -LiteralPath $item.file){if((Get-Item -LiteralPath $item.file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '删除期间发现链接，已停止清理。'};Remove-Item -LiteralPath $item.file -Force}}
    Remove-Item -LiteralPath $Plan.configFile -Force
}
function Invoke-ManagerRequest($Request,[string]$Resources) {
    if($Request.action -eq 'public-status'){
        $admin=(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        try{$service=Get-Service CreativeFlowHost -ErrorAction Stop}catch{
            if($_.FullyQualifiedErrorId -notlike '*NoServiceFoundForGivenName*'){return @{installed=$null;state='Unknown';computerName=[Environment]::MachineName;administrator=$admin;publicError='暂时无法读取本机服务状态，授权后再核对；请勿因此重复建立空间。'}}
            $service=$null
        }
        return @{installed=!!$service;state=if($service){[string]$service.Status}else{'NotInstalled'};computerName=[Environment]::MachineName;administrator=$admin;legacyManager=(Test-LegacyManager)}
    }
    $installation=Get-HostInstallation;$s=$installation.settings;$action=[string]$Request.action
    if($action -notin @('status','diagnose')){Assert-Administrator}
    switch($action) {
        'status' {
            $space=$null;$managementError=''
            if(Test-Path -LiteralPath (Join-Path $s.dataDirectory 'creativeflow-host.db')){try{$space=Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='inspect'}}catch{$managementError=$_.Exception.Message}}
            $certFile=Join-Path $s.dataDirectory 'CreativeFlow-Host.cer';$cert=$null
            if(Test-Path -LiteralPath $certFile){$c=New-Object Security.Cryptography.X509Certificates.X509Certificate2($certFile);$cert=@{fingerprint=$c.Thumbprint;expiresAt=$c.NotAfter.ToString('o');subject=$c.Subject};$c.Dispose()}
            $port=47840;if($installation.config.Host.TlsPort){$port=[int]$installation.config.Host.TlsPort}
            $drives=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {@{name=$_.DeviceID;free=[double]$_.FreeSpace;size=[double]$_.Size}})
            $lastBackup=$null;$lastBackupFile=Join-Path (Split-Path (Get-ManagerSettingsPath) -Parent) 'last-backup.json';if(Test-Path -LiteralPath $lastBackupFile){$lastBackup=Get-Content -LiteralPath $lastBackupFile -Raw|ConvertFrom-Json}
            $storage=$null;$storageError='';if($space){try{$storage=Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='storage-summary'}}catch{$storageError='容量管理需要配套主机，请先升级现有主机。'}}
            return @{legacyManager=(Test-LegacyManager);installed=!!$installation.service;state=if($installation.service){$installation.service.State}else{'NotInstalled'};autostart=($installation.service.StartMode -eq 'Auto');managerStartup=(Get-ManagerStartupStatus);storage=$storage;storageError=$storageError;settings=$s;space=$space;managementError=$managementError;certificate=$cert;port=$port;url="https://$($s.serverName):$port";computerName=[Environment]::MachineName;drives=$drives;lastBackup=$lastBackup}
        }
        'diagnose' {
            $port=47840;if($installation.config.Host.TlsPort){$port=[int]$installation.config.Host.TlsPort}
            $profiles=@(Get-NetConnectionProfile | ForEach-Object {@{name=$_.Name;interface=$_.InterfaceAlias;category=[string]$_.NetworkCategory}})
            $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess)
            $rule=Get-NetFirewallRule -Name CreativeFlowHost071Https -ErrorAction SilentlyContinue
            $firewallOk=$false
            if($rule){$filter=$rule|Get-NetFirewallPortFilter;$addressFilter=$rule|Get-NetFirewallAddressFilter;$firewallOk=([string]$rule.Enabled -eq 'True' -and [string]$filter.LocalPort -eq [string]$port -and [string]$filter.Protocol -in @('TCP','6') -and [string]$addressFilter.RemoteAddress -eq 'LocalSubnet' -and [string]$rule.Profile -match 'Private|Domain' -and [string]$rule.Profile -notmatch 'Public|Any')}
            $addresses=@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*'} | Select-Object InterfaceAlias,IPAddress)
            $certFile=Join-Path $s.dataDirectory 'CreativeFlow-Host.cer';$cert=$null;$fingerprint=''
            if(Test-Path -LiteralPath $certFile){$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($certFile);$fingerprint=$cert.Thumbprint}
            $dns=$false;try{$dns=[Net.Dns]::GetHostAddresses($s.serverName).Count -gt 0}catch{}
            $health=Test-Health "https://localhost:$port" $fingerprint
            $expiry=$false;if($cert){$expiry=$cert.NotAfter -gt (Get-Date).AddDays(30);$cert.Dispose()}
            return @{checkedAt=(Get-Date).ToString('o');profiles=$profiles;addresses=$addresses;checks=@(
                @{name='协作服务';ok=($installation.service.State -eq 'Running');detail=[string]$installation.service.State},
                @{name='协作端口';ok=($listeners.Count -gt 0);detail="TCP $port"},
                @{name='本机协作接口';ok=$health.ok;detail=if($health.ok){'接口响应正常'}else{$health.error}},
                @{name='网络类型';ok=(@($profiles|Where-Object {$_.category -in 'Private','DomainAuthenticated'}).Count -gt 0 -and @($profiles|Where-Object {$_.category -eq 'Public'}).Count -eq 0);detail=($profiles|ForEach-Object {"$($_.interface)：$($_.category)"}) -join '；'},
                @{name='协作防火墙规则';ok=$firewallOk;detail=if($rule){"启用：$($rule.Enabled)，范围：$($rule.Profile)，端口：$($filter.LocalPort)"}else{'未找到协作规则'}},
                @{name='服务器名称解析';ok=$dns;detail=$s.serverName},
                @{name='证书有效期';ok=$expiry;detail=if($expiry){'有效期超过 30 天'}else{'证书缺失、已过期或即将到期'}}
            );note='本机检测不代表所有员工电脑均可连接。公用网络不会自动开放；请由管理员确认可信公司网络后在 Windows 设置中调整。'}
        }
        'install' {
            if($installation.service){throw '已有协作服务，请接管或升级，不能重复安装。'}
            $program=Assert-LocalDirectory $Request.installDirectory;$data=Assert-LocalDirectory $Request.dataDirectory;Assert-Separate $program $data
            if($Request.serverName -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{0,79}$'){throw '服务器名称无效。'}
            if([int]$Request.port -lt 1024 -or [int]$Request.port -gt 65535){throw '端口应介于 1024 和 65535。'}
            if(Get-NetTCPConnection -LocalPort ([int]$Request.port) -State Listen -ErrorAction SilentlyContinue){throw '该端口已被使用。'}
            & (Join-Path $Resources 'deployment\Install-Host.ps1') -ServerName $Request.serverName -WorkspaceName $Request.workspaceName -OwnerName $Request.ownerName -InstallDirectory $program -DataDirectory $data -Port ([int]$Request.port) | Out-Null
            $s.installDirectory=$program;$s.dataDirectory=$data;$s.serverName=[string]$Request.serverName;Write-ManagerSettings $s
            Start-HostService
            return Invoke-HostCli $program $data @{action='recover-owner'}
        }
        'adopt' {
            if(!$installation.service){throw '未找到 CreativeFlow Host 服务，请先安装。'}
            Write-ManagerSettings $s;return @{ok=$true}
        }
        'reattach' {
            if($installation.service){throw '服务已经存在，请使用接管现有主机。'}
            $program=Assert-LocalDirectory $Request.installDirectory;$data=Assert-LocalDirectory $Request.dataDirectory;Assert-Separate $program $data
            $file=Join-Path $program 'appsettings.Production.json';$existing=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
            if([IO.Path]::GetFullPath($existing.Host.DataDirectory).TrimEnd('\') -ne $data -or !(Test-Path -LiteralPath (Join-Path $data 'creativeflow-host.db')) -or !(Test-Path -LiteralPath $existing.Host.TlsPath)){throw '所选程序配置、空间数据和证书不匹配，请选择原来的完整部署目录。'}
            $publicCert=New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $data 'CreativeFlow-Host.cer'))
            try{$s.serverName=$publicCert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::DnsName,$false)}finally{$publicCert.Dispose()}
            Protect-Directory $data;Protect-Directory $program
            $binary='"'+(Join-Path $program 'CreativeFlow.Host.exe')+'" --contentRoot "'+$program+'"'
            if(!(Test-Path -LiteralPath (Join-Path $program 'CreativeFlow.Host.exe'))){throw '所选目录中没有服务器程序。'}
            New-Service -Name CreativeFlowHost -DisplayName 'CreativeFlow Host' -BinaryPathName $binary -StartupType Automatic|Out-Null
            $s.installDirectory=$program;$s.dataDirectory=$data;Write-ManagerSettings $s
            if(!(Get-NetFirewallRule -Name CreativeFlowHost071Https -ErrorAction SilentlyContinue)){New-NetFirewallRule -Name CreativeFlowHost071Https -DisplayName 'CreativeFlow Host HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ([int]$existing.Host.TlsPort) -Profile Private,Domain -RemoteAddress LocalSubnet|Out-Null}
            Start-HostService;return @{ok=$true}
        }
        'start' {Start-HostService;return @{ok=$true}}
        'stop' {Stop-HostService;return @{ok=$true}}
        'autostart' {Set-Service CreativeFlowHost -StartupType $(if($Request.enabled){'Automatic'}else{'Manual'});return @{ok=$true}}
        'manager-startup' {return Set-ManagerStartup $Request $Resources}
        'storage-status' {return Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='storage-status'}}
        'storage-configure' {return Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='storage-configure';limitBytes=$Request.limitBytes;minimumFreeBytes=$Request.minimumFreeBytes}}
        'storage-cleanup' {return Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='storage-cleanup';ids=$Request.ids;confirmation=$Request.confirmation}}
        'firewall' {
            $port=47840;if($installation.config.Host.TlsPort){$port=[int]$installation.config.Host.TlsPort}
            if(Get-NetFirewallRule -Name CreativeFlowHost071Https -ErrorAction SilentlyContinue){Remove-NetFirewallRule -Name CreativeFlowHost071Https}
            New-NetFirewallRule -Name CreativeFlowHost071Https -DisplayName 'CreativeFlow Host HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private,Domain -RemoteAddress LocalSubnet | Out-Null;return @{ok=$true}
        }
        'manage' {return Invoke-HostCli $s.installDirectory $s.dataDirectory $Request.command}
        'backup' {
            $target=Assert-LocalDirectory $Request.path
            $completed=New-FullBackup $installation $target
            $s.backupDirectory=$target;Write-ManagerSettings $s
            return @{path=$completed}
        }
        'backup-schedule' {
            $s.backupDirectory=Assert-LocalDirectory $Request.path;Assert-Separate (Assert-LocalDirectory $s.dataDirectory) $s.backupDirectory
            Assert-Separate (Assert-LocalDirectory $s.installDirectory) $s.backupDirectory
            $s.automaticBackup=[bool]$Request.enabled;$s.backupHour=[int]$Request.hour;if($s.backupHour -lt 0 -or $s.backupHour -gt 23){throw '备份时间无效。'}
            if($s.automaticBackup){
                $entrySource=$PSCommandPath;if(!$entrySource){$entrySource=Join-Path $PSScriptRoot 'Manager.ps1'}
                $taskFolder=Split-Path (Get-ManagerSettingsPath) -Parent;New-Item -ItemType Directory -Path $taskFolder -Force|Out-Null;Protect-Directory $taskFolder
                $entry=Join-Path $taskFolder 'Manager.ps1';if([IO.Path]::GetFullPath($entrySource) -ne [IO.Path]::GetFullPath($entry)){Copy-Item -LiteralPath $entrySource -Destination $entry -Force}
                $taskAction=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -ExecutionPolicy Bypass -File "'+$entry+'" -Scheduled')
                $trigger=New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($s.backupHour))
                Register-ScheduledTask -TaskName CreativeFlowFullBackup -Action $taskAction -Trigger $trigger -User SYSTEM -RunLevel Highest -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force | Out-Null
            }elseif(Get-ScheduledTask -TaskName CreativeFlowFullBackup -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName CreativeFlowFullBackup -Confirm:$false}
            Write-ManagerSettings $s;return @{ok=$true}
        }
        'migrate-data' {
            $target=Assert-LocalDirectory $Request.path;$old=Assert-LocalDirectory $s.dataDirectory;Assert-Separate $old $target;Assert-Separate (Assert-LocalDirectory $s.installDirectory) $target
            if(Test-Path -LiteralPath $target){if(@(Get-ChildItem -LiteralPath $target -Force).Count){throw '迁移目标必须为空文件夹。'}}
            if(!$s.backupDirectory){throw '请先选择并完成一次完整备份。'}
            $backup=New-FullBackup $installation $s.backupDirectory
            $estimate=(@(Get-SnapshotFiles $old)|ForEach-Object {(Get-Item -LiteralPath $_.file).Length}|Measure-Object -Sum).Sum;Assert-StorageDestination $target ([long]$estimate+1MB) $old
            $wasRunning=$installation.service.State -eq 'Running';Stop-HostService
            $originalConfig=Get-Content -LiteralPath $installation.configFile -Raw
            try {
                $null=Copy-CheckedSpace $old $target
                $installation.config.Host.DataDirectory=$target;$installation.config.Host.TlsPath=Join-Path $target 'host.pfx'
                $installation.config|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $installation.configFile -Encoding UTF8
                $null=Invoke-HostCli $s.installDirectory $target @{action='inspect'}
                if($wasRunning){Start-HostService}
                $s.dataDirectory=$target;Write-ManagerSettings $s
                return @{ok=$true;oldPath=$old;backup=$backup}
            } catch {
                Stop-HostService
                $originalConfig|Set-Content -LiteralPath $installation.configFile -Encoding UTF8
                if($wasRunning){Start-HostService};throw
            }
        }
        'restore' {
            $source=Assert-LocalDirectory $Request.path;$data=Assert-LocalDirectory $s.dataDirectory;$mediaPath=Join-Path $data 'media'
            if($source -eq $data -or $data.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase) -or $source -eq $mediaPath -or $source.StartsWith($mediaPath+'\',[StringComparison]::OrdinalIgnoreCase)){throw '恢复源目录不能是当前空间或视频目录。'}
            $manifestFile=Join-Path $source 'manifest.json';$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
            if($manifest.format -ne 'creativeflow-full-backup-v1' -or !(Test-Path -LiteralPath (Join-Path $source 'media'))){throw '请选择完整备份文件夹。'}
            foreach($entry in @($manifest.hashes)){
                $file=[IO.Path]::GetFullPath((Join-Path $source $entry.path));if(!$file.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)){throw '备份清单路径无效。'}
                if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256){throw '备份文件校验失败，不会恢复。'}
            }
            & (Join-Path $s.installDirectory 'CreativeFlow.Host.exe') --contentRoot $s.installDirectory --Host:DataDirectory $source --validate-backup | Out-Null
            if($LASTEXITCODE -ne 0){throw '备份数据库不完整，不会恢复。'}
            $parent=$s.backupDirectory;if(!$parent){$parent=Join-Path (Split-Path $data -Parent) 'CreativeFlow-Backups'}
            $safety=New-FullBackup $installation $parent
            $estimate=(@($manifest.hashes)|Where-Object {$_.path -notin @('appsettings.Production.json','host.pfx','CreativeFlow-Host.cer','storage-policy.json')}|ForEach-Object {(Get-Item -LiteralPath (Join-Path $source $_.path)).Length}|Measure-Object -Sum).Sum;Assert-StorageDestination $data ([long]$estimate+1MB) $data
            Stop-HostService
            $retained=Join-Path $data ('before-restore-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $retained | Out-Null
            foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','media')) {
                $item=[IO.Path]::GetFullPath((Join-Path $data $name));$destination=[IO.Path]::GetFullPath((Join-Path $retained $name))
                if(!$item.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or !$destination.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase) -or $destination.StartsWith($item+'\',[StringComparison]::OrdinalIgnoreCase)){throw '恢复路径校验失败。'}
                if(Test-Path -LiteralPath $item){Move-Item -LiteralPath $item -Destination $destination}
            }
            try {
                foreach($name in @('creativeflow-host.db','creativeflow-host.db-wal','creativeflow-host.db-shm','media')){$item=Join-Path $source $name;if(Test-Path -LiteralPath $item){Copy-Item -LiteralPath $item -Destination (Join-Path $data $name) -Recurse}}
                & (Join-Path $s.installDirectory 'CreativeFlow.Host.exe') --contentRoot $s.installDirectory --Host:DataDirectory $data --restored-epoch | Out-Null
                if($LASTEXITCODE -ne 0){throw '恢复后纪元更新失败。'}
                Start-HostService;return @{ok=$true;safety=$safety;retained=$retained}
            } catch {throw "恢复未完成，服务保持停止；原数据在 $retained，完整备份在 $safety。$($_.Exception.Message)"}
        }
        'upgrade' {
            if(!$installation.service){throw '未找到现有服务。'}
            $parent=$s.backupDirectory;if(!$parent){$parent=Join-Path (Split-Path $s.dataDirectory -Parent) 'CreativeFlow-Backups'}
            $backup=New-FullBackup $installation $parent
            $programBytes=(Get-ChildItem -LiteralPath $s.installDirectory -Recurse -File|Measure-Object Length -Sum).Sum;Assert-StorageDestination $backup ([long]$programBytes+1MB) $s.dataDirectory
            Stop-HostService
            $safety=Join-Path $backup ('before-upgrade-program-'+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $safety | Out-Null
            Copy-Item -LiteralPath $s.installDirectory -Destination (Join-Path $safety 'program') -Recurse
            Protect-Directory $s.installDirectory
            Get-ChildItem -LiteralPath (Join-Path $Resources 'deployment\host') | Where-Object {$_.Name -ne 'appsettings.Production.json'} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $s.installDirectory -Recurse -Force}
            & (Join-Path $s.installDirectory 'CreativeFlow.Host.exe') --contentRoot $s.installDirectory --Host:DataDirectory $s.dataDirectory --migrate-legacy | Out-Null
            if($LASTEXITCODE -ne 0){throw "升级未完成，服务已停止。原程序在 $safety，备份在 $backup。"}
            Start-HostService;return @{ok=$true;backup=$backup}
        }
        'migrate-program' {
            $target=Assert-LocalDirectory $Request.path;$old=Assert-LocalDirectory $s.installDirectory;Assert-Separate $target $old;Assert-Separate $target (Assert-LocalDirectory $s.dataDirectory)
            if(Test-Path -LiteralPath $target){if(@(Get-ChildItem -LiteralPath $target -Force).Count){throw '程序目标必须为空文件夹。'}}
            $programBytes=(Get-ChildItem -LiteralPath $old -Recurse -File|Measure-Object Length -Sum).Sum;Assert-StorageDestination $target ([long]$programBytes+1MB) $s.dataDirectory
            $running=$installation.service.State -eq 'Running';Stop-HostService
            try {
                New-Item -ItemType Directory -Path $target -Force|Out-Null;Protect-Directory $target;Get-ChildItem -LiteralPath $old | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse}
                foreach($file in @(Get-ChildItem -LiteralPath $old -Recurse -File)){$relative=$file.FullName.Substring($old.Length+1);if((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target $relative)).Hash){throw '程序复制校验失败。'}}
                & icacls.exe (Join-Path $target 'appsettings.Production.json') /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null;if($LASTEXITCODE -ne 0){throw '配置保护失败。'}
                Set-HostBinary $target;if($running){Start-HostService};$s.installDirectory=$target;Write-ManagerSettings $s;return @{ok=$true;oldPath=$old}
            } catch {Stop-HostService;Set-HostBinary $old;if($running){Start-HostService};throw}
        }
        'export-access' {
            $target=Assert-LocalDirectory $Request.path;Assert-Separate $target (Assert-LocalDirectory $s.dataDirectory);Assert-Separate $target (Assert-LocalDirectory $s.installDirectory);New-Item -ItemType Directory -Force -Path $target | Out-Null
            Copy-Item -LiteralPath (Join-Path $s.dataDirectory 'CreativeFlow-Host.cer') -Destination $target -Force
            Copy-Item -LiteralPath (Join-Path $Resources 'deployment\Trust-Host.ps1'),(Join-Path $Resources 'deployment\信任主机证书.cmd') -Destination $target -Force
            $cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $s.dataDirectory 'CreativeFlow-Host.cer'))
            $port=$installation.config.Host.TlsPort
            $space=Invoke-HostCli $s.installDirectory $s.dataDirectory @{action='inspect'}
            $sha=[Security.Cryptography.SHA256]::Create();try{$fingerprint=([BitConverter]::ToString($sha.ComputeHash($cert.RawData))).Replace('-','')}finally{$sha.Dispose()}
            @{format='creativeflow-company-access';version=1;workspaceName=$space.workspace.name;workspaceId=$space.workspace.id;host="https://$($s.serverName):$port";certificate=[Convert]::ToBase64String($cert.RawData);fingerprintSha256=$fingerprint}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $target '公司协作空间.cfspace') -Encoding UTF8
            @("公司主机：https://$($s.serverName):$port","证书 SHA-256：$fingerprint",'新版员工客户端：双击公司协作空间.cfspace，或在加入公司空间中导入此文件，按提示配置信任。','请向管理员单独领取一次性邀请码。旧版可使用保留的证书信任工具。')|Set-Content -LiteralPath (Join-Path $target '连接信息.txt') -Encoding UTF8;$cert.Dispose();return @{path=$target;accessFile=(Join-Path $target '公司协作空间.cfspace')}
        }
        'uninstall' {
            if(!$installation.service){throw '协作服务尚未安装。'}
            $delete=$Request.deleteData -is [bool] -and $Request.deleteData
            $plan=$null;if($delete){$plan=Get-UninstallDataPlan $installation $Request}
            Stop-HostService
            if($delete){$plan=Get-UninstallDataPlan $installation $Request}
            & sc.exe delete CreativeFlowHost | Out-Null;if($LASTEXITCODE -ne 0){throw '服务删除失败。'}
            if(Get-NetFirewallRule -Name CreativeFlowHost071Https -ErrorAction SilentlyContinue){Remove-NetFirewallRule -Name CreativeFlowHost071Https}
            if(Get-ScheduledTask -TaskName CreativeFlowFullBackup -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName CreativeFlowFullBackup -Confirm:$false}
            $s.automaticBackup=$false;Write-ManagerSettings $s
            if($delete){try{Remove-UninstalledSpace $plan}catch{throw ('协作服务已卸载，但数据清理未全部完成。请检查目录 '+$plan.directory+'。原因：'+$_.Exception.Message)};return @{ok=$true;deletedData=$true;directory=$plan.directory;program=$s.installDirectory}}
            return @{ok=$true;retained=$s.dataDirectory;program=$s.installDirectory}
        }
        default {throw '不支持的主机管理操作。'}
    }
}
if($Library){return}
$maintenanceMutex=$null;$ownsMutex=$false
try {
    if(!$Scheduled){
        $raw=[Console]::In.ReadToEnd();if($raw.Length -gt 65536){throw '管理请求过大。'};$request=$raw|ConvertFrom-Json
        if($request.action -eq 'public-status'){
            $result=Invoke-ManagerRequest $request (Split-Path $PSScriptRoot -Parent)
            'CFMANAGER:'+($result|ConvertTo-Json -Depth 12 -Compress);return
        }
    }
    $maintenanceMutex=New-Object Threading.Mutex($false,'Global\CreativeFlowHostMaintenance071')
    try{$ownsMutex=$maintenanceMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ownsMutex=$true}
    if(!$ownsMutex){throw '另一项主机维护或自动备份正在进行，请稍后再试。'}
    if($Scheduled){$settings=Read-ManagerSettings;$request=@{action='backup';path=$settings.backupDirectory}}
    $resources=Split-Path $PSScriptRoot -Parent
    $result=Invoke-ManagerRequest $request $resources
    if($Scheduled){$record=Join-Path (Split-Path (Get-ManagerSettingsPath) -Parent) 'last-backup.json';@{ok=$true;at=(Get-Date).ToString('o');path=$result.path}|ConvertTo-Json|Set-Content -LiteralPath $record -Encoding UTF8}
    'CFMANAGER:'+($result|ConvertTo-Json -Depth 12 -Compress)
} catch {
    if($Scheduled){$record=Join-Path (Split-Path (Get-ManagerSettingsPath) -Parent) 'last-backup.json';@{ok=$false;at=(Get-Date).ToString('o');error=$_.Exception.Message}|ConvertTo-Json|Set-Content -LiteralPath $record -Encoding UTF8}
    'CFMANAGER:'+(@{error=$_.Exception.Message}|ConvertTo-Json -Compress);exit 1
} finally {
    if($ownsMutex){$maintenanceMutex.ReleaseMutex()};if($maintenanceMutex){$maintenanceMutex.Dispose()}
}
