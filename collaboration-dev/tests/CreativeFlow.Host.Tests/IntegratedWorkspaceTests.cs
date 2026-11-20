using System.Text.Json.Nodes;
using System.Text.Json;
using CreativeFlow.Host;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host.Tests;

public sealed class IntegratedWorkspaceTests
{
    private sealed class Environment : IAsyncDisposable
    {
        private readonly string directory=Path.Combine(Path.GetTempPath(),"creativeflow-integrated-"+Guid.NewGuid().ToString("N"));
        public CollaborationDatabase Database {get;}
        public IntegratedWorkspaceService Service {get;}
        public DeviceIdentity Owner {get;private set;}=null!;
        public DeviceIdentity Reviewer {get;private set;}=null!;
        public string Epoch {get;private set;}="";
        public Environment(){Database=new(directory);Service=new(Database);}
        public async Task Initialize()
        {
            await Database.InitializeAsync();await Service.InitializeAsync();
            var auth=new WorkspaceService(Database);var setup=await auth.SetupAsync(new("公司","负责人"));Epoch=setup.WorkspaceEpoch;
            var session=(await auth.RedeemInvitationAsync(new(setup.InvitationCode,"负责人","A")))!;
            Owner=(await auth.AuthenticateAsync(new StringValues("Bearer "+session.Token)))!;
            var invitation=await auth.InviteAsync(Owner,new("审阅者","reviewer"));
            var other=(await auth.RedeemInvitationAsync(new(invitation.InvitationCode,"审阅者","B")))!;
            Reviewer=(await auth.AuthenticateAsync(new StringValues("Bearer "+other.Token)))!;
        }
        public IntegratedBatch Batch(params IntegratedChange[] commands)=>new(Guid.NewGuid().ToString("N"),Epoch,commands);
        public async Task Seed()=>await Service.ApplyAsync(Owner,Batch(
            Create("project","p",null,"""{"name":"本地项目","notes":"保留备注","start":"2026-11-19","due":"2026-12-01","color":"#123456"}"""),
            Create("task","t","p","""{"name":"任务","type":"视频","status":"自定义阶段","notes":"任务备注"}"""),
            Create("version","v","t","""{"name":"V1","status":"客户审核","file":null}"""),
            Create("list","l","v","""{"name":"修改意见"}"""),
            Create("opinion","i","l","""{"text":"整体意见","time":"","done":false,"status":"todo"}""")));
        public ValueTask DisposeAsync()
        {
            SqliteConnection.ClearAllPools();
            if(Path.GetFullPath(directory).StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase) && Path.GetFileName(directory).StartsWith("creativeflow-integrated-"))Directory.Delete(directory,true);
            return ValueTask.CompletedTask;
        }
    }
    private static IntegratedChange Create(string kind,string id,string? parent,string fields)=>new("create",kind,id,parent,0,JsonNode.Parse(fields)!.AsObject(),null,0);
    private static IntegratedChange Update(string kind,string id,string fields,string expected)=>new("update",kind,id,null,0,JsonNode.Parse(fields)!.AsObject(),JsonNode.Parse(expected)!.AsObject(),0);

    [Fact]
    public async Task UploadIsAtomicIdempotentAndPreservesLocalFields()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        var snapshot=await env.Service.SnapshotAsync(env.Owner);
        Assert.Equal(5,snapshot.Entities.Count);Assert.Equal("保留备注",snapshot.Entities.Single(e=>e.Id=="p").Fields["notes"]!.GetValue<string>());
        var batch=env.Batch(Update("project","p","""{"due":"2026-12-02"}""","""{"due":"2026-12-01"}"""));
        await env.Service.ApplyAsync(env.Owner,batch);await env.Service.ApplyAsync(env.Owner,batch);
        Assert.Equal(2,(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(e=>e.Id=="p").Revision);
        var atomic=env.Batch(Update("project","p","""{"name":"不应保存"}""","""{"name":"本地项目"}"""),Create("opinion","bad","missing","""{"text":"意见","done":false}"""));
        await Assert.ThrowsAsync<ArgumentException>(()=>env.Service.ApplyAsync(env.Owner,atomic));
        Assert.Equal("本地项目",(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(e=>e.Id=="p").Fields["name"]!.GetValue<string>());
    }
    [Fact]
    public async Task VersionPermissionIsEnforcedForReadsAndEveryWrite()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        Assert.DoesNotContain((await env.Service.SnapshotAsync(env.Reviewer)).Entities,e=>e.Kind=="version"||e.Kind=="opinion");
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"view"));
        Assert.Contains((await env.Service.SnapshotAsync(env.Reviewer)).Entities,e=>e.Id=="i");
        var create=env.Batch(Create("opinion","new","l","""{"text":"我的意见","time":"00:00","done":false}"""));
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.ApplyAsync(env.Reviewer,create));
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"comment"));await env.Service.ApplyAsync(env.Reviewer,create);
        await env.Service.ApplyAsync(env.Reviewer,env.Batch(Update("opinion","new","""{"text":"修订意见"}""","""{"text":"我的意见"}""")));
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.ApplyAsync(env.Reviewer,env.Batch(Update("opinion","i","""{"done":true}""","""{"done":false}"""))));
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"edit"));
        await env.Service.ApplyAsync(env.Reviewer,env.Batch(Update("opinion","i","""{"done":true}""","""{"done":false}""")));
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.SetAccessAsync(env.Reviewer,"v",new(env.Reviewer.MemberId,"manage")));
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"none"));
        Assert.DoesNotContain((await env.Service.SnapshotAsync(env.Reviewer)).Entities,e=>e.Id=="new");
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.ApplyAsync(env.Reviewer,env.Batch(Update("opinion","new","""{"text":"越权"}""","""{"text":"修订意见"}"""))));
    }
    [Fact]
    public async Task IndependentFieldsMergeButSameFieldConflictAndRestoreEpochAreRejected()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        await env.Service.ApplyAsync(env.Owner,env.Batch(Update("project","p","""{"name":"改名"}""","""{"name":"本地项目"}""")));
        await env.Service.ApplyAsync(env.Owner,env.Batch(Update("project","p","""{"due":"2026-12-03"}""","""{"due":"2026-12-01"}""")));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(Update("project","p","""{"name":"覆盖"}""","""{"name":"本地项目"}"""))));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,new("operation","old-epoch",[Update("project","p","""{"name":"覆盖"}""","""{"name":"改名"}""" )])));
    }
    [Fact]
    public async Task DeleteRequiresCurrentRevisionAndChildrenAndNeverRevivesTombstones()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","project","p",null,0,null,null,1))));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,null,0))));
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,null,1)));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(Create("opinion","i","l","""{"text":"旧标识复活","done":false}"""))));
    }
    [Fact]
    public async Task RejectsPrivatePlaybackAndLocalFilePublication()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        await Assert.ThrowsAsync<ArgumentException>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(Update("version","v","""{"reviewPosition":12}""","{}"))));
        await Assert.ThrowsAsync<ArgumentException>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(Update("version","v","""{"file":{"path":"D:/private.mp4"}}""","""{"file":null}"""))));
    }
    [Fact]
    public async Task PublishedVideoIsStoredByOpaqueIdAndChecksPermissionOnEveryRead()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        var id=Guid.NewGuid().ToString("D");var bytes=new byte[]{1,2,3,4,5};
        var result=await env.Service.PublishMediaAsync(env.Owner,"v",id,"样片.webm",1,env.Epoch,new MemoryStream(bytes),bytes.Length,CancellationToken.None);
        Assert.Equal(id,result["mediaId"]!.GetValue<string>());Assert.Null(result["path"]);Assert.Equal(env.Owner.MemberId,result["publishedBy"]!.GetValue<string>());
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.GetMediaAsync(env.Reviewer,id));
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"view"));
        var file=await env.Service.GetMediaAsync(env.Reviewer,id);Assert.Equal(bytes,await File.ReadAllBytesAsync(file.Path));Assert.Equal("video/webm",file.ContentType);
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.PublishMediaAsync(env.Reviewer,"v",Guid.NewGuid().ToString("D"),"替换.webm",2,env.Epoch,new MemoryStream(bytes),bytes.Length,CancellationToken.None));
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"none"));await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.GetMediaAsync(env.Reviewer,id));
        Assert.Equal(2,(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="v").Revision);
    }
    [Fact]
    public async Task InterruptedPublicationAndStaleRevisionNeverReplaceExistingMedia()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();var bytes=new byte[]{1,2,3};
        await Assert.ThrowsAsync<IOException>(()=>env.Service.PublishMediaAsync(env.Owner,"v",Guid.NewGuid().ToString("D"),"失败.mp4",1,env.Epoch,new MemoryStream(bytes),10,CancellationToken.None));
        Assert.Null((await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="v").Fields["file"]);
        Assert.Empty(Directory.GetFiles(Path.Combine(env.Database.DataDirectory,"media"),"*",SearchOption.AllDirectories));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.PublishMediaAsync(env.Owner,"v",Guid.NewGuid().ToString("D"),"失败.mp4",0,env.Epoch,new MemoryStream(bytes),3,CancellationToken.None));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.PublishMediaAsync(env.Owner,"v",Guid.NewGuid().ToString("D"),"失败.mp4",1,"restored",new MemoryStream(bytes),3,CancellationToken.None));
    }
    [Fact]
    public async Task ReplacingVideoRevokesOldMediaUrlAndUploadRetryIsIdempotent()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();var bytes=new byte[]{1,2,3};var first=Guid.NewGuid().ToString("D");var second=Guid.NewGuid().ToString("D");
        await env.Service.PublishMediaAsync(env.Owner,"v",first,"V1.webm",1,env.Epoch,new MemoryStream(bytes),3,CancellationToken.None);
        await env.Service.PublishMediaAsync(env.Owner,"v",first,"V1.webm",1,env.Epoch,new MemoryStream(bytes),3,CancellationToken.None);
        Assert.Equal(2,(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="v").Revision);
        await env.Service.PublishMediaAsync(env.Owner,"v",second,"V2.webm",2,env.Epoch,new MemoryStream(bytes),3,CancellationToken.None);
        await Assert.ThrowsAsync<FileNotFoundException>(()=>env.Service.GetMediaAsync(env.Owner,first));Assert.Equal(3,(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="v").Revision);
    }
    [Fact]
    public async Task PermissionEditorShowsEffectiveRolesAndProtectsConcurrentPermissionEdits()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        var rows=await env.Service.VersionAccessAsync(env.Owner,"v");Assert.True(rows.Single(row=>row.MemberId==env.Owner.MemberId).Locked);Assert.Equal("none",rows.Single(row=>row.MemberId==env.Reviewer.MemberId).EffectivePermission);
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"comment","none"));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"edit","none")));
        var visible=await env.Service.SnapshotAsync(env.Reviewer);Assert.Equal("comment",visible.Entities.Single(row=>row.Id=="v").Permission);Assert.Equal("负责人",visible.Entities.Single(row=>row.Id=="v").CreatorName);
    }
    [Fact]
    public async Task ProjectTrashRestoresOnlyTheDeletedBatchAndPreservesItsVideo()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        var media=Guid.NewGuid().ToString("D");await env.Service.PublishMediaAsync(env.Owner,"v",media,"demo.webm",1,env.Epoch,new MemoryStream(new byte[]{1,2}),2,CancellationToken.None);
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,null,1)));
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","list","l",null,0,null,null,1),new IntegratedChange("delete","version","v",null,0,null,null,2),new IntegratedChange("delete","task","t",null,0,null,null,1),new IntegratedChange("delete","project","p",null,0,null,null,1)));
        Assert.Single(await env.Service.TrashAsync(env.Owner));Assert.Empty(await env.Service.TrashAsync(env.Reviewer));await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.RestoreProjectAsync(env.Reviewer,"p"));
        await env.Service.RestoreProjectAsync(env.Owner,"p");var snapshot=await env.Service.SnapshotAsync(env.Owner);Assert.Equal(4,snapshot.Entities.Count);Assert.DoesNotContain(snapshot.Entities,row=>row.Id=="i");Assert.NotNull(await env.Service.GetMediaAsync(env.Owner,media));Assert.Empty(await env.Service.TrashAsync(env.Owner));
    }
    [Fact]
    public async Task ConditionalUndoRestoresAnOpinionWithoutRecreatingItsIdentityOrAuthor()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();var original=(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="i");
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,null,1)));
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("restore","opinion","i","l",0,original.Fields,original.Fields,2)));
        var restored=(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="i");Assert.Equal(original.CreatedBy,restored.CreatedBy);Assert.Equal(3,restored.Revision);
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,original.Fields,1)));
        Assert.DoesNotContain((await env.Service.SnapshotAsync(env.Owner)).Entities,row=>row.Id=="i");
    }
    [Fact]
    public async Task UndoCannotDeleteAnotherMembersChangedContent()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();var old=(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(row=>row.Id=="i");
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"edit"));
        await env.Service.ApplyAsync(env.Reviewer,env.Batch(Update("opinion","i","""{"text":"同事的新意见"}""","""{"text":"整体意见"}""")));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,old.Fields,1))));
    }
    [Fact]
    public async Task LegacyImportIsIdempotentAndKeepsOriginalTablesAndOwnership()
    {
        await using var env=new Environment();await env.Initialize();var commands=new CommandService(env.Database);
        await commands.ExecuteAsync(env.Owner,new CommandEnvelope("legacy-op",env.Epoch,CommandTypes.CreateProject,"old-project",0,JsonSerializer.SerializeToElement(new CreateProjectPayload("旧协作项目")),null));
        CommandEnvelope Legacy(string type,string id,object payload)=>new(Guid.NewGuid().ToString("N"),env.Epoch,type,id,0,JsonSerializer.SerializeToElement(payload),null);
        await commands.ExecuteAsync(env.Owner,Legacy("CreateTask","old-task",new {projectId="old-project",name="旧任务"}));
        await commands.ExecuteAsync(env.Owner,Legacy("CreateVersion","old-version",new {taskId="old-task",name="旧V1"}));
        await commands.ExecuteAsync(env.Owner,Legacy("CreateFeedbackList","old-list",new {versionId="old-version",name="旧意见清单"}));
        await commands.ExecuteAsync(env.Owner,Legacy("AddFeedbackItem","old-opinion",new {listId="old-list",text="旧意见",timecode="00:01"}));
        Assert.Equal(5,await env.Service.MigrateLegacyAsync());Assert.Equal(0,await env.Service.MigrateLegacyAsync());
        var imported=(await env.Service.SnapshotAsync(env.Owner)).Entities;var project=imported.Single(row=>row.Kind=="project");Assert.Equal("旧协作项目",project.Fields["name"]!.GetValue<string>());Assert.Equal(env.Owner.MemberId,project.CreatedBy);Assert.Equal("00:01",imported.Single(row=>row.Kind=="opinion").Fields["time"]!.GetValue<string>());
        Assert.Single((await new WorkspaceService(env.Database).GetSnapshotAsync(env.Owner.WorkspaceId)).Projects);
    }

    private static async Task<IntegratedBatch> VersionDeletion(Environment env)
    {
        var snapshot=await env.Service.SnapshotAsync(env.Owner);
        return env.Batch(snapshot.Entities.Where(r=>r.Kind is "version" or "list" or "opinion").OrderBy(r=>r.Kind switch {"opinion"=>0,"list"=>1,_=>2}).Select(r=>new IntegratedChange("delete",r.Kind,r.Id,r.ParentId,r.Order,null,(JsonObject)r.Fields.DeepClone(),r.Revision)).ToArray());
    }
    [Fact]
    public async Task VersionTrashPreservesVideoOpinionsPermissionsAndAuditsDeletion()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();
        var media=Guid.NewGuid().ToString("D");await env.Service.PublishMediaAsync(env.Owner,"v",media,"原片.webm",1,env.Epoch,new MemoryStream(new byte[]{1,2,3}),3,CancellationToken.None);
        await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"view"));
        var batch=await VersionDeletion(env);await env.Service.DeleteVersionAsync(env.Owner,"v",batch);await env.Service.DeleteVersionAsync(env.Owner,"v",batch);
        var snapshot=await env.Service.SnapshotAsync(env.Reviewer);Assert.DoesNotContain(snapshot.Entities,r=>r.Id=="v");Assert.Contains(snapshot.Activities!,a=>a.VersionId=="v"&&a.Text.Contains("负责人 删除了版本"));
        var trash=Assert.Single(await env.Service.VersionTrashAsync(env.Owner));Assert.Equal("负责人",trash.DeletedBy);Assert.True(trash.CanRestore);
        await Assert.ThrowsAsync<FileNotFoundException>(()=>env.Service.GetMediaAsync(env.Reviewer,media));
        Assert.True(File.Exists(Directory.GetFiles(Path.Combine(env.Database.DataDirectory,"media"),"*.bin",SearchOption.AllDirectories).Single()));
        var storage=await new StorageManagement(env.Database).StatusAsync();Assert.False(storage["files"]!.AsArray().Single(row=>row!["id"]!.GetValue<string>()==media)!["canClean"]!.GetValue<bool>());
        await env.Service.RestoreVersionAsync(env.Owner,"v");Assert.Empty(await env.Service.VersionTrashAsync(env.Owner));
        snapshot=await env.Service.SnapshotAsync(env.Reviewer);Assert.Equal("view",snapshot.Entities.Single(r=>r.Id=="v").Permission);Assert.Contains(snapshot.Entities,r=>r.Id=="i");Assert.Equal(3,(await env.Service.GetMediaAsync(env.Reviewer,media)).Length);
    }
    [Theory]
    [InlineData("view")][InlineData("comment")][InlineData("edit")]
    public async Task NonManagersCannotDeleteOrRestoreVersions(string permission)
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,permission));
        var batch=await VersionDeletion(env);await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.DeleteVersionAsync(env.Reviewer,"v",batch));
        await env.Service.DeleteVersionAsync(env.Owner,"v",batch);Assert.False(Assert.Single(await env.Service.VersionTrashAsync(env.Reviewer)).CanRestore);
        await Assert.ThrowsAsync<IntegratedDenied>(()=>env.Service.RestoreVersionAsync(env.Reviewer,"v"));
    }
    [Fact]
    public async Task NewOpinionAfterConfirmationRejectsWholeVersionDeletion()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();var batch=await VersionDeletion(env);
        await env.Service.ApplyAsync(env.Owner,env.Batch(Create("opinion","late","l","""{"text":"刚提交的意见","done":false}""")));
        await Assert.ThrowsAsync<IntegratedConflict>(()=>env.Service.DeleteVersionAsync(env.Owner,"v",batch));
        var snapshot=await env.Service.SnapshotAsync(env.Owner);Assert.Contains(snapshot.Entities,r=>r.Id=="i");Assert.Contains(snapshot.Entities,r=>r.Id=="late");Assert.Empty(await env.Service.VersionTrashAsync(env.Owner));
    }
    [Fact]
    public async Task DelegatedManagerRestoresOnlySameDeletionAndNextNumberIncludesDeletedVersions()
    {
        await using var env=new Environment();await env.Initialize();await env.Seed();await env.Service.SetAccessAsync(env.Owner,"v",new(env.Reviewer.MemberId,"manage"));
        var opinion=(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(r=>r.Id=="i");
        await env.Service.ApplyAsync(env.Owner,env.Batch(new IntegratedChange("delete","opinion","i",null,0,null,null,opinion.Revision)));
        await env.Service.ApplyAsync(env.Owner,env.Batch(Update("version","v","""{"name":"V7"}""","""{"name":"V1"}""")));
        await env.Service.DeleteVersionAsync(env.Reviewer,"v",await VersionDeletion(env));
        Assert.Equal(7,(await env.Service.SnapshotAsync(env.Owner)).Entities.Single(r=>r.Id=="t").Fields["versionSequence"]!.GetValue<int>());
        await env.Service.RestoreVersionAsync(env.Reviewer,"v");var snapshot=await env.Service.SnapshotAsync(env.Owner);Assert.DoesNotContain(snapshot.Entities,r=>r.Id=="i");Assert.Equal("V7",snapshot.Entities.Single(r=>r.Id=="v").Fields["name"]!.GetValue<string>());
    }
}
