using System.Text.Json;
using System.Text.Json.Serialization;
using CreativeFlow.Host;
using CreativeFlow.Protocol;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var maintenanceFlags = new[] { "--manager-json", "--recover-owner", "--restored-epoch", "--validate-backup", "--initialize-workspace", "--migrate-legacy" };
var builder = WebApplication.CreateBuilder(args.Where(value => !maintenanceFlags.Contains(value)).ToArray());

builder.Host.UseWindowsService(options => options.ServiceName = "CreativeFlowHost");
var tlsPath = builder.Configuration["Host:TlsPath"];
if (!args.Any(maintenanceFlags.Contains) && !string.IsNullOrEmpty(tlsPath)) {
    builder.WebHost.ConfigureKestrel(options => {
        var port = builder.Configuration.GetValue<int?>("Host:TlsPort") ?? 47840;
        if (builder.Configuration.GetValue<bool>("Host:TlsLoopback")) options.ListenLocalhost(port, listen => listen.UseHttps(tlsPath, builder.Configuration["Host:TlsPassword"]));
        else options.ListenAnyIP(port, listen => listen.UseHttps(tlsPath, builder.Configuration["Host:TlsPassword"]));
    });
} else builder.WebHost.UseUrls(builder.Configuration["Host:Urls"] ?? "http://127.0.0.1:47831");
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var dataDirectory = builder.Configuration["Host:DataDirectory"]
    ?? Environment.GetEnvironmentVariable("CREATIVEFLOW_DATA_DIR")
    ?? Path.Combine(AppContext.BaseDirectory, "data");

builder.Services.AddSingleton(new CollaborationDatabase(dataDirectory));
builder.Services.AddSingleton<WorkspaceService>();
builder.Services.AddSingleton<CommandService>();
builder.Services.AddSingleton<IntegratedWorkspaceService>();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddPolicy("join", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.AddSingleton<BackupService>();
builder.Services.AddSingleton<ChangeHub>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<BackupService>());
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 8 * 1024 * 1024);

var app = builder.Build();
if (args.Contains("--manager-json")) {
    try {
        Console.InputEncoding = new System.Text.UTF8Encoding(false);
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        var input = await Console.In.ReadToEndAsync();
        if(input.Length > 65536) throw new ArgumentException("管理请求过大。");
        var request = System.Text.Json.Nodes.JsonNode.Parse(input)?.AsObject() ?? throw new ArgumentException("请求无效。");
        var db = app.Services.GetRequiredService<CollaborationDatabase>();
        if(request["action"]?.GetValue<string>() != "setup" && !File.Exists(db.DatabasePath)) throw new IOException("未找到现有协作空间，未创建任何新数据。");
        await db.InitializeAsync();
        var result = await new HostManagerService(db).ExecuteAsync(request);
        Console.WriteLine("CFMANAGER:" + result.ToJsonString());
    } catch(Exception error) {
        Console.WriteLine("CFMANAGER:" + JsonSerializer.Serialize(new { error = error.Message })); Environment.ExitCode = 1;
    }
    return;
}
if (args.Contains("--validate-backup")) {
    var database = app.Services.GetRequiredService<CollaborationDatabase>();
    await using var connection = new Microsoft.Data.Sqlite.SqliteConnection(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource=database.DatabasePath, Mode=Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly }.ToString());
    await connection.OpenAsync();
    await using var check = connection.CreateCommand(); check.CommandText="PRAGMA integrity_check";
    if (Convert.ToString(await check.ExecuteScalarAsync()) != "ok") throw new IOException("备份完整性检查失败。");
    check.CommandText="SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('workspaces','members','projects','operations')";
    if(Convert.ToInt64(await check.ExecuteScalarAsync()) != 4) throw new IOException("不是创作流空间备份。");
    check.CommandText="PRAGMA foreign_key_check";
    await using var reader=await check.ExecuteReaderAsync();
    if(await reader.ReadAsync()) throw new IOException("备份关联数据校验失败。");
    Console.WriteLine("Backup validated."); return;
}
await app.Services.GetRequiredService<CollaborationDatabase>().InitializeAsync();
await app.Services.GetRequiredService<IntegratedWorkspaceService>().InitializeAsync();
if(args.Contains("--initialize-workspace")) {
    var setup=await app.Services.GetRequiredService<WorkspaceService>().SetupAsync(new SetupRequest(builder.Configuration["Setup:WorkspaceName"]??"公司协作空间",builder.Configuration["Setup:OwnerName"]??"空间管理员"));
    await app.Services.GetRequiredService<CollaborationDatabase>().Storage.ConfigureAsync(100*StorageBudget.GiB,20*StorageBudget.GiB);
    Console.WriteLine("公司空间已建立。管理员一次性邀请码（10 分钟内有效）："+setup.InvitationCode);return;
}
if(args.Contains("--migrate-legacy")) {
    var count=await app.Services.GetRequiredService<IntegratedWorkspaceService>().MigrateLegacyAsync();Console.WriteLine($"已迁移旧协作资料：{count} 条。素材需在新版审阅页重新发布；旧表与原素材保留。");return;
}
if (args.Contains("--recover-owner")) {
    var database = app.Services.GetRequiredService<CollaborationDatabase>();
    await using var connection = await database.OpenAsync();
    var code = SecurityHelpers.NewInvitationCode();
    await using var command = connection.CreateCommand();
    command.CommandText = "INSERT INTO invitations(id,workspace_id,member_id,code_hash,expires_at,created_at) SELECT $id,workspace_id,id,$hash,$expires,$at FROM members WHERE role='owner' AND removed_at IS NULL LIMIT 1";
    command.Parameters.AddWithValue("$id", SecurityHelpers.NewId("recovery"));
    command.Parameters.AddWithValue("$hash", SecurityHelpers.Hash(code));
    command.Parameters.AddWithValue("$expires", SecurityHelpers.Utc(DateTimeOffset.UtcNow.AddMinutes(10)));
    command.Parameters.AddWithValue("$at", SecurityHelpers.Utc(DateTimeOffset.UtcNow));
    if (await command.ExecuteNonQueryAsync() != 1) throw new InvalidOperationException("空间尚未创建。");
    Console.WriteLine($"Owner invitation (10 minutes): {code}"); return;
}
if (args.Contains("--restored-epoch")) {
    await using var connection = await app.Services.GetRequiredService<CollaborationDatabase>().OpenAsync();
    await using var command = connection.CreateCommand(); command.CommandText = "UPDATE workspaces SET epoch=$epoch";
    command.Parameters.AddWithValue("$epoch", Guid.NewGuid().ToString("N")); await command.ExecuteNonQueryAsync();
    Console.WriteLine("Workspace epoch changed."); return;
}
app.UseRateLimiter();
app.UseWebSockets();
app.Map("/api/v1/workspaces/{id}/stream", async (HttpContext context, string id, ChangeHub hub, WorkspaceService service) => await hub.ConnectAsync(context, id, service));

app.MapGet("/api/v1/health", () => new {status="ok",protocolVersion=ProtocolInfo.Version,schemaVersion=ProtocolInfo.SchemaVersion,serverTime=DateTimeOffset.UtcNow,integratedVersion="0.7.1-beta",features=new[]{"integrated-media-v1","integrated-access-v1","integrated-restore-v1","storage-budget-v1"}});
app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/storage",async(string workspaceId,HttpRequest request,WorkspaceService auth,CollaborationDatabase database)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.Forbid();
    var usage=await database.Storage.UsageAsync();return Results.Ok(new{usage.AvailableUploadBytes,usage.Warning,usage.Configured,usage.ActiveUploads,usage=actor.Role=="owner"?usage:null});
});

app.MapGet("/api/v1/discovery-info", async (WorkspaceService service) =>
    Results.Ok(await service.GetDiscoveryInfoAsync()));

app.MapPost("/api/v1/setup", async (SetupRequest request, HttpContext context, WorkspaceService service) =>
{
    if (context.Connection.RemoteIpAddress is not { } address || !System.Net.IPAddress.IsLoopback(address)) return Results.StatusCode(403);
    try
    {
        return Results.Ok(await service.SetupAsync(request));
    }
    catch (InvalidOperationException error)
    {
        return Results.Conflict(new { error = "already_initialized", message = error.Message });
    }
    catch (ArgumentException error)
    {
        return Results.BadRequest(new { error = "invalid_request", message = error.Message });
    }
});

app.MapPost("/api/v1/invitations/redeem", async (
    RedeemInvitationRequest request,
    WorkspaceService service,
    ChangeHub hub) =>
{
    var session = await service.RedeemInvitationAsync(request);
    if (session is not null) await hub.SignalAsync(session.WorkspaceId);
    return session is null
        ? Results.BadRequest(new { error = "invalid_invitation", message = "邀请码无效、已使用或已过期。" })
        : Results.Ok(session);
}).RequireRateLimiting("join");

app.MapGet("/api/v1/workspaces/{workspaceId}/snapshot", async (
    string workspaceId,
    HttpRequest request,
    WorkspaceService service) =>
{
    var identity = await service.AuthenticateAsync(request.Headers.Authorization);
    if (identity is null) return Results.Unauthorized();
    if (!string.Equals(identity.WorkspaceId, workspaceId, StringComparison.Ordinal)) return Results.Forbid();
    return Results.Json(new {message="旧协作客户端已停用，请升级到创作流 0.7.1 beta。"},statusCode:410);
});

app.MapGet("/api/v1/workspaces/{workspaceId}/operations", async (
    string workspaceId,
    long? after,
    HttpRequest request,
    WorkspaceService service) =>
{
    var identity = await service.AuthenticateAsync(request.Headers.Authorization);
    if (identity is null) return Results.Unauthorized();
    if (!string.Equals(identity.WorkspaceId, workspaceId, StringComparison.Ordinal)) return Results.Forbid();
    return Results.Json(new {message="旧协作客户端已停用，请升级到创作流 0.7.1 beta。"},statusCode:410);
});

app.MapPost("/api/v1/workspaces/{workspaceId}/commands", async (
    string workspaceId,
    CommandEnvelope command,
    HttpRequest request,
    WorkspaceService workspaceService,
    CommandService commandService,
    ChangeHub hub) =>
{
    var identity = await workspaceService.AuthenticateAsync(request.Headers.Authorization);
    if (identity is null) return Results.Unauthorized();
    if (!string.Equals(identity.WorkspaceId, workspaceId, StringComparison.Ordinal)) return Results.Forbid();

    return Results.Json(new {message="旧协作客户端不能写入新版空间，请使用创作流 0.7.1 beta。"},statusCode:410);
});

app.MapPost("/api/v1/admin/invitations", async (InviteMemberRequest values, HttpRequest request, WorkspaceService service, ChangeHub hub) => {
    var actor = await service.AuthenticateAsync(request.Headers.Authorization);
    if (actor?.Role != "owner") return Results.StatusCode(403);
    try { var invitation=await service.InviteAsync(actor, values); await hub.SignalAsync(actor.WorkspaceId); return Results.Ok(invitation); }
    catch (ArgumentException error) { return Results.BadRequest(new { message = error.Message }); }
});
app.MapDelete("/api/v1/admin/members/{id}", async (string id, HttpRequest request, WorkspaceService service, ChangeHub hub) => {
    var actor = await service.AuthenticateAsync(request.Headers.Authorization);
    if (actor?.Role != "owner") return Results.StatusCode(403);
    var removed=await service.RemoveMemberAsync(actor,id); if(removed) await hub.SignalAsync(actor.WorkspaceId);
    return removed ? Results.Ok() : Results.BadRequest();
});
app.MapPost("/api/v1/admin/members/{id}/invitation",async(string id,HttpRequest request,WorkspaceService service)=>{
    var actor=await service.AuthenticateAsync(request.Headers.Authorization);if(actor?.Role!="owner")return Results.StatusCode(403);
    try{return Results.Ok(await service.ReinviteAsync(actor,id));}catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapPost("/api/v1/admin/backup", async (HttpRequest request, WorkspaceService service, BackupService backups) => {
    var actor = await service.AuthenticateAsync(request.Headers.Authorization);
    if (actor?.Role != "owner") return Results.StatusCode(403);
    var file = await backups.CreateAsync();
    return Results.File(file, "application/octet-stream", Path.GetFileName(file));
});

app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/snapshot", async (string workspaceId, HttpRequest request, WorkspaceService auth, IntegratedWorkspaceService service) => {
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);
    if(actor is null)return Results.Unauthorized();
    if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    return Results.Ok(await service.SnapshotAsync(actor));
});
app.MapPost("/api/v1/workspaces/{workspaceId}/integrated/commands", async (string workspaceId, IntegratedBatch batch, HttpRequest request, WorkspaceService auth, IntegratedWorkspaceService service, ChangeHub hub) => {
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);
    if(actor is null)return Results.Unauthorized();
    if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try {await service.ApplyAsync(actor,batch);await hub.SignalAsync(workspaceId);return Results.Ok(new { applied=true });}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapPut("/api/v1/workspaces/{workspaceId}/integrated/versions/{versionId}/access", async (string workspaceId, string versionId, VersionAccessRequest values, HttpRequest request, WorkspaceService auth, IntegratedWorkspaceService service, ChangeHub hub) => {
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);
    if(actor is null)return Results.Unauthorized();
    if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try {await service.SetAccessAsync(actor,versionId,values);await hub.SignalAsync(workspaceId);return Results.Ok();}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/versions/{versionId}/access", async (string workspaceId,string versionId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try{return Results.Ok(await service.VersionAccessAsync(actor,versionId));}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapPut("/api/v1/workspaces/{workspaceId}/integrated/versions/{versionId}/media", async (string workspaceId,string versionId,string uploadId,string name,long revision,string epoch,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service,ChangeHub hub)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    var feature=request.HttpContext.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();if(feature is {IsReadOnly:false})feature.MaxRequestBodySize=IntegratedWorkspaceService.MaxMediaBytes;
    var length=request.ContentLength??(long.TryParse(request.Headers["X-CreativeFlow-Length"],out var declared)?declared:null as long?);
    try {var result=await service.PublishMediaAsync(actor,versionId,uploadId,name,revision,epoch,request.Body,length,request.HttpContext.RequestAborted);await hub.SignalAsync(workspaceId);return Results.Ok(result);}
    catch(StorageLimitException error){return Results.Json(new{message=error.Message},statusCode:507);}
    catch(IOException){return Results.Json(new{message="视频写入未完成，请检查服务器磁盘空间；已发布的视频保留"},statusCode:507);}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/media/{mediaId}", async (string workspaceId,string mediaId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try {var file=await service.GetMediaAsync(actor,mediaId);request.HttpContext.Response.Headers.CacheControl="no-store";return Results.File(file.Path,file.ContentType,enableRangeProcessing:true);}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(FileNotFoundException error){return Results.NotFound(new {message=error.Message});}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/trash",async(string workspaceId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);return Results.Ok(await service.TrashAsync(actor));
});
app.MapPost("/api/v1/workspaces/{workspaceId}/integrated/projects/{projectId}/restore",async(string workspaceId,string projectId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service,ChangeHub hub)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try{await service.RestoreProjectAsync(actor,projectId);await hub.SignalAsync(workspaceId);return Results.Ok();}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapGet("/api/v1/workspaces/{workspaceId}/integrated/versions/trash",async(string workspaceId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);return Results.Ok(await service.VersionTrashAsync(actor));
});
app.MapPost("/api/v1/workspaces/{workspaceId}/integrated/versions/{versionId}/delete",async(string workspaceId,string versionId,IntegratedBatch batch,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service,ChangeHub hub)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try{await service.DeleteVersionAsync(actor,versionId,batch);await hub.SignalAsync(workspaceId);return Results.Ok(new {applied=true});}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.MapPost("/api/v1/workspaces/{workspaceId}/integrated/versions/{versionId}/restore",async(string workspaceId,string versionId,HttpRequest request,WorkspaceService auth,IntegratedWorkspaceService service,ChangeHub hub)=>{
    var actor=await auth.AuthenticateAsync(request.Headers.Authorization);if(actor is null)return Results.Unauthorized();if(actor.WorkspaceId!=workspaceId)return Results.StatusCode(403);
    try{await service.RestoreVersionAsync(actor,versionId);await hub.SignalAsync(workspaceId);return Results.Ok();}
    catch(IntegratedConflict error){return Results.Conflict(new {message=error.Message});}
    catch(IntegratedDenied error){return Results.Json(new {message=error.Message},statusCode:403);}
    catch(ArgumentException error){return Results.BadRequest(new {message=error.Message});}
});
app.Run();

public partial class Program;
