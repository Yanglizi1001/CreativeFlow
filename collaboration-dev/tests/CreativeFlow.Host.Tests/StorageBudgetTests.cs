using System.Text.Json;
using System.Text.Json.Nodes;
using CreativeFlow.Host;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host.Tests;
public sealed class StorageBudgetTests
{
    private sealed class Fixture : IDisposable {
        public string Root {get;}=Path.Combine(Path.GetTempPath(),"creativeflow-quota-"+Guid.NewGuid().ToString("N"));
        public Fixture(){Directory.CreateDirectory(Root);Directory.CreateDirectory(Path.Combine(Root,"media","test"));}
        public string Upload()=>Path.Combine(Root,"media","test",Guid.NewGuid()+".upload");
        public void Dispose(){SqliteConnection.ClearAllPools();var resolved=Path.GetFullPath(Root);if(!resolved.StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(resolved).StartsWith("creativeflow-quota-"))throw new InvalidOperationException();Directory.Delete(resolved,true);}
    }
    [Fact] public async Task ExistingSpaceRequiresConfirmationAndPolicySurvivesRestart(){
        using var f=new Fixture();File.WriteAllText(Path.Combine(f.Root,"notes.txt"),"existing data");var store=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);
        Assert.False((await store.UsageAsync()).Configured);await store.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB);
        var restored=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);Assert.Equal(StorageBudget.GiB,(await restored.UsageAsync()).LimitBytes);Assert.Equal("existing data",File.ReadAllText(Path.Combine(f.Root,"notes.txt")));
    }
    [Fact] public async Task ConcurrentAdmissionsAcrossManagersCannotOversubscribeAndReleaseWorks(){
        using var f=new Fixture();var a=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);var b=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);await a.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB);
        async Task<StorageBudget.Lease?> Try(StorageBudget budget){try{return await budget.ReserveAsync(f.Upload(),700*1024*1024);}catch(StorageLimitException){return null;}}
        var leases=await Task.WhenAll(Try(a),Try(b));Assert.Single(leases.Where(item=>item!=null));Assert.Equal(1,(await b.UsageAsync()).ActiveUploads);
        foreach(var lease in leases)if(lease!=null)await lease.DisposeAsync();await using var next=await b.ReserveAsync(f.Upload(),700*1024*1024);Assert.Equal(1,(await a.UsageAsync()).ActiveUploads);
        await Assert.ThrowsAsync<ArgumentException>(()=>a.ConfigureAsync(StorageBudget.GiB,4*StorageBudget.GiB));
    }
    [Fact] public async Task PartialUploadsCountActualPlusUnwrittenReservationExactlyOnce(){
        using var f=new Fixture();var budget=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);await budget.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB);var file=f.Upload();await using var lease=await budget.ReserveAsync(file,100*1024*1024);File.WriteAllBytes(file,new byte[1024*1024]);
        var usage=await budget.UsageAsync();Assert.Equal(99*1024*1024,usage.ReservedBytes);Assert.InRange(usage.UsedBytes+usage.ReservedBytes,100*1024*1024,101*1024*1024);
        await Assert.ThrowsAsync<StorageLimitException>(()=>lease.CheckWriteAsync(100*1024*1024,1,default));
    }
    [Fact] public async Task DiskFloorStopsTransferWithoutDeletingExistingFiles(){
        using var f=new Fixture();long free=50*StorageBudget.GiB;var budget=new StorageBudget(f.Root,()=>free);await budget.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB);
        var retained=Path.Combine(f.Root,"retained.txt");File.WriteAllText(retained,"keep");await using var lease=await budget.ReserveAsync(f.Upload(),1024*1024);free=5*StorageBudget.GiB;
        await Assert.ThrowsAsync<StorageLimitException>(()=>lease.CheckWriteAsync(0,80000,default));Assert.Equal("keep",File.ReadAllText(retained));Assert.Equal(0,(await budget.UsageAsync()).AvailableUploadBytes);
    }
    [Fact] public async Task QuotaCannotBeLoweredBelowLiveReservations(){
        using var f=new Fixture();var budget=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);await budget.ConfigureAsync(2*StorageBudget.GiB,5*StorageBudget.GiB);await using var lease=await budget.ReserveAsync(f.Upload(),StorageBudget.GiB+1024*1024);
        await Assert.ThrowsAsync<ArgumentException>(()=>budget.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB));Assert.Equal(2*StorageBudget.GiB,budget.Policy.LimitBytes);
    }
    [Fact] public async Task CrashRecoveryOnlyRemovesOwnedRecordedTemporaryFile(){
        using var f=new Fixture();var file=f.Upload();File.WriteAllText(file,"partial");var unknown=f.Upload();File.WriteAllText(unknown,"keep unknown");
        File.WriteAllText(Path.Combine(f.Root,"storage-reservations.json"),JsonSerializer.Serialize(new[]{new StorageReservation("dead",file,100,int.MaxValue,0)},new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var budget=new StorageBudget(f.Root,()=>50*StorageBudget.GiB);Assert.Equal(0,(await budget.UsageAsync()).ActiveUploads);Assert.False(File.Exists(file));Assert.True(File.Exists(unknown));
    }
    [Fact] public async Task CleanupPreservesReferencedAndTrashVideosAndRemovesOnlyReplacedFiles(){
        using var f=new Fixture();var db=new CollaborationDatabase(f.Root);await db.InitializeAsync();var service=new IntegratedWorkspaceService(db);await service.InitializeAsync();var auth=new WorkspaceService(db);var setup=await auth.SetupAsync(new("quota","owner"));
        var session=(await auth.RedeemInvitationAsync(new(setup.InvitationCode,"owner","test")))!;var owner=(await auth.AuthenticateAsync(new StringValues("Bearer "+session.Token)))!;
        IntegratedChange Create(string kind,string id,string? parent,string name)=>new("create",kind,id,parent,0,new JsonObject{["name"]=name},null,0);
        await service.ApplyAsync(owner,new(Guid.NewGuid().ToString("N"),setup.WorkspaceEpoch,[Create("project","p",null,"project"),Create("task","t","p","task"),Create("version","v","t","V1")]));
        var first=Guid.NewGuid().ToString("D");var second=Guid.NewGuid().ToString("D");
        await service.PublishMediaAsync(owner,"v",first,"one.webm",1,setup.WorkspaceEpoch,new MemoryStream(new byte[100]),100,default);
        await service.PublishMediaAsync(owner,"v",second,"two.webm",2,setup.WorkspaceEpoch,new MemoryStream(new byte[200]),200,default);
        var management=new StorageManagement(db);JsonObject Request(string id)=>new(){["confirmation"]="清理无引用视频",["ids"]=new JsonArray(id)};
        await Assert.ThrowsAsync<ArgumentException>(()=>management.CleanupAsync(Request(second)));Assert.Equal(200,(await service.GetMediaAsync(owner,second)).Length);
        var result=await management.CleanupAsync(Request(first));Assert.Equal(100,result["freedBytes"]!.GetValue<long>());Assert.Equal(200,(await service.GetMediaAsync(owner,second)).Length);
        await using(var c=await db.OpenAsync()){await using var q=c.CreateCommand();q.CommandText="UPDATE integrated_entities SET deleted_at='test'";await q.ExecuteNonQueryAsync();}
        await Assert.ThrowsAsync<ArgumentException>(()=>management.CleanupAsync(Request(second)));
        var inventory=await management.StatusAsync();Assert.False(inventory["files"]!.AsArray().Single()!["canClean"]!.GetValue<bool>());
    }
    [Fact] public async Task BackgroundBackupRespectsSameBudget(){
        using var f=new Fixture();long free=50*StorageBudget.GiB;var db=new CollaborationDatabase(f.Root,()=>free);await db.InitializeAsync();await db.Storage.ConfigureAsync(StorageBudget.GiB,5*StorageBudget.GiB);free=5*StorageBudget.GiB;
        await Assert.ThrowsAsync<StorageLimitException>(()=>new BackupService(db).CreateAsync());Assert.Empty(Directory.GetFiles(Path.Combine(f.Root,"backups"),"*.pending"));
    }
}
