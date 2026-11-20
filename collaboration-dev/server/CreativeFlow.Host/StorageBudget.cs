using System.Diagnostics;
using System.Text.Json;

namespace CreativeFlow.Host;

public sealed class StorageLimitException(string message) : IOException(message);
public sealed record StoragePolicy(bool Configured=false,long LimitBytes=100L*1024*1024*1024,long MinimumFreeBytes=20L*1024*1024*1024);
public sealed record StorageReservation(string Id,string Path,long Length,int ProcessId,long ProcessStarted);
public sealed record StorageUsage(bool Configured,long LimitBytes,long MinimumFreeBytes,long UsedBytes,long ReservedBytes,long DiskFreeBytes,long AvailableUploadBytes,int ActiveUploads,string Warning);

// The same lock coordinates the service, local management CLI and backup writer.
// Files on disk and remaining reserved bytes are counted once, including partial uploads.
public sealed class StorageBudget(string directory,Func<long>? diskFree=null)
{
    public const long GiB=1024L*1024*1024;
    private readonly string root=System.IO.Path.GetFullPath(directory).TrimEnd(System.IO.Path.DirectorySeparatorChar);
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    private string FilePath(string name)=>System.IO.Path.Combine(root,name);
    public long FreeBytes=>diskFree?.Invoke()??new DriveInfo(System.IO.Path.GetPathRoot(root)!).AvailableFreeSpace;
    private static T Read<T>(string path){using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);return JsonSerializer.Deserialize<T>(stream,Json)??throw new IOException("容量配置损坏，请检查主机配置");}
    public StoragePolicy Policy {get{var value=File.Exists(FilePath("storage-policy.json"))?Read<StoragePolicy>(FilePath("storage-policy.json")):new();if(value.LimitBytes<GiB||value.MinimumFreeBytes<5*GiB)throw new IOException("容量配置损坏，请检查主机配置");return value;}}
    public static long Length(string path){try{return new FileInfo(path).Length;}catch(FileNotFoundException){return 0;}catch(DirectoryNotFoundException){return 0;}}
    public async Task<FileStream> LockAsync(CancellationToken ct=default){
        Directory.CreateDirectory(root);
        for(var n=0;n<150;n++){ct.ThrowIfCancellationRequested();try{return new FileStream(FilePath("storage-control.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}catch(IOException){await Task.Delay(40,ct);}}
        throw new IOException("另一项存储操作正在进行，请稍后重试");
    }
    private static void Save<T>(string file,T value){var temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";try{File.WriteAllText(temp,JsonSerializer.Serialize(value,Json));File.Move(temp,file,true);}finally{if(File.Exists(temp))File.Delete(temp);}}
    public IEnumerable<FileInfo> Files(){
        if(!Directory.Exists(root))yield break;
        var pending=new Stack<string>();pending.Push(root);
        while(pending.Count>0){var folder=pending.Pop();if((File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)throw new IOException("协作目录包含链接，请管理员检查实际存储位置");foreach(var path in Directory.EnumerateFileSystemEntries(folder)){FileAttributes attr;try{attr=File.GetAttributes(path);}catch(FileNotFoundException){continue;}if((attr&FileAttributes.ReparsePoint)!=0)throw new IOException("协作目录包含链接，请管理员检查实际存储位置");if((attr&FileAttributes.Directory)!=0)pending.Push(path);else yield return new FileInfo(path);}}
    }
    private bool OwnedTemporary(string path)=>path.StartsWith(root+System.IO.Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&
        (path.EndsWith(".upload",StringComparison.Ordinal)&&path.Contains(System.IO.Path.DirectorySeparatorChar+"media"+System.IO.Path.DirectorySeparatorChar,StringComparison.Ordinal)||path.EndsWith(".pending",StringComparison.Ordinal)&&System.IO.Path.GetDirectoryName(path)==FilePath("backups"));
    private List<StorageReservation> Reservations(){
        var file=FilePath("storage-reservations.json");var rows=File.Exists(file)?Read<List<StorageReservation>>(file):[];
        var alive=new List<StorageReservation>();foreach(var row in rows){bool running;try{using var process=Process.GetProcessById(row.ProcessId);running=!process.HasExited&&process.StartTime.ToUniversalTime().Ticks==row.ProcessStarted;}catch{running=false;}
            if(running)alive.Add(row);else if(OwnedTemporary(row.Path)&&File.Exists(row.Path)){if((File.GetAttributes(row.Path)&FileAttributes.ReparsePoint)!=0)throw new IOException("临时上传文件不能是链接");File.Delete(row.Path);}}
        if(alive.Count!=rows.Count)Save(file,alive);return alive;
    }
    private StorageUsage Measure(List<StorageReservation> rows){
        var policy=Policy;long used=0;foreach(var file in Files())used=checked(used+Length(file.FullName));
        var reserved=rows.Sum(row=>Math.Max(0,row.Length-Length(row.Path)));
        var free=FreeBytes;var limit=policy.Configured?Math.Max(0,policy.LimitBytes-used-reserved):long.MaxValue;
        var available=Math.Max(0,Math.Min(limit,free-policy.MinimumFreeBytes-reserved-1024*1024));
        var ratio=policy.Configured?(double)(used+reserved)/policy.LimitBytes:0;
        var warning=available==0?"空间容量或磁盘余量不足，已暂停新增视频上传":ratio>=.9?"协作空间用量已达到 90%，请清理或扩容":ratio>=.8?"协作空间用量已达到 80%":!policy.Configured?"请确认当前空间的容量上限，现有资料不会自动删除":"";
        return new(policy.Configured,policy.LimitBytes,policy.MinimumFreeBytes,used,reserved,free,available,rows.Count,warning);
    }
    public async Task<StorageUsage> UsageAsync(){using var gate=await LockAsync();return Measure(Reservations());}
    public async Task<StorageUsage> ConfigureAsync(long limit,long minimumFree){
        if(limit<GiB||limit>1024L*1024*GiB||minimumFree<5*GiB||minimumFree>1024L*1024*GiB)throw new ArgumentException("空间上限至少 1 GB，磁盘最低剩余空间至少 5 GB");
        using var gate=await LockAsync();var rows=Reservations();var usage=Measure(rows);if(limit<usage.UsedBytes+usage.ReservedBytes+1024*1024)throw new ArgumentException("容量上限不能低于现有占用、上传预留和必要运行余量之和");
        Save(FilePath("storage-policy.json"),new StoragePolicy(true,limit,minimumFree));return Measure(rows);
    }
    public async Task<Lease> ReserveAsync(string path,long length,CancellationToken ct=default){
        path=System.IO.Path.GetFullPath(path);if(!OwnedTemporary(path)||length<=0)throw new ArgumentException("上传或备份预留请求无效");
        using var gate=await LockAsync(ct);var rows=Reservations();var usage=Measure(rows);if(length>usage.AvailableUploadBytes)throw new StorageLimitException("容量不足：空间配额或磁盘最低剩余空间限制了本次上传，请联系管理员清理或扩容");
        using var process=Process.GetCurrentProcess();var item=new StorageReservation(Guid.NewGuid().ToString("N"),path,length,Environment.ProcessId,process.StartTime.ToUniversalTime().Ticks);rows.Add(item);Save(FilePath("storage-reservations.json"),rows);return new(this,item);
    }
    public sealed class Lease(StorageBudget owner,StorageReservation reservation) : IAsyncDisposable {
        private long lastCheck;private bool disposed;
        public async Task CheckWriteAsync(long total,int next,CancellationToken ct){
            if(total+next>reservation.Length)throw new StorageLimitException("实际写入超过已预留的容量");
            if(owner.FreeBytes-owner.Policy.MinimumFreeBytes<next+1024*1024)throw new StorageLimitException("磁盘剩余空间不足，上传已停止，原有资料保留");
            if(total-lastCheck>=1024*1024||total==0){using var gate=await owner.LockAsync(ct);var usage=owner.Measure(owner.Reservations());if(usage.Configured&&usage.UsedBytes+usage.ReservedBytes>usage.LimitBytes||usage.DiskFreeBytes-usage.ReservedBytes<usage.MinimumFreeBytes)throw new StorageLimitException("磁盘或协作空间容量已不足，上传已停止");lastCheck=total;}
        }
        public async ValueTask DisposeAsync(){if(disposed)return;disposed=true;using var gate=await owner.LockAsync();var rows=owner.Reservations();rows.RemoveAll(row=>row.Id==reservation.Id);Save(owner.FilePath("storage-reservations.json"),rows);}
    }
    public async Task<JsonElement> JsonUsageAsync()=>JsonSerializer.SerializeToElement(await UsageAsync(),Json);
}
