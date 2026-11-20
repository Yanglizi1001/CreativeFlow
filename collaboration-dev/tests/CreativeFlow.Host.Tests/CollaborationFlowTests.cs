using System.Text.Json;
using CreativeFlow.Host;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host.Tests;

public sealed class CollaborationFlowTests
{
    [Fact]
    public async Task DatabaseInitializesSchemaAndWal()
    {
        using var environment = new TestEnvironment();
        await environment.Database.InitializeAsync();

        await using var connection = await environment.Database.OpenAsync();
        await using var journal = connection.CreateCommand();
        journal.CommandText = "PRAGMA journal_mode";
        Assert.Equal("wal", Convert.ToString(await journal.ExecuteScalarAsync()), ignoreCase: true);

        await using var tables = connection.CreateCommand();
        tables.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('workspaces','projects','operations')";
        Assert.Equal(3, Convert.ToInt32(await tables.ExecuteScalarAsync()));
    }

    [Fact]
    public async Task SetupRedeemsOneTimeInvitationAndAuthenticatesDevice()
    {
        using var environment = new TestEnvironment();
        await environment.Database.InitializeAsync();
        var service = new WorkspaceService(environment.Database);
        var setup = await service.SetupAsync(new SetupRequest("公司协作空间", "赵阳"));
        var session = await service.RedeemInvitationAsync(new RedeemInvitationRequest(
            setup.InvitationCode,
            "赵阳",
            "剪辑电脑 A"));

        Assert.NotNull(session);
        Assert.Equal("owner", session.Role);
        Assert.Equal(setup.WorkspaceId, session.WorkspaceId);

        var identity = await service.AuthenticateAsync(new StringValues($"Bearer {session.Token}"));
        Assert.NotNull(identity);
        Assert.Equal(session.DeviceId, identity.DeviceId);

        var secondAttempt = await service.RedeemInvitationAsync(new RedeemInvitationRequest(
            setup.InvitationCode,
            "赵阳",
            "剪辑电脑 A"));
        Assert.Null(secondAttempt);
    }

    [Fact]
    public async Task CreateProjectIsIdempotentAndVisibleInSnapshotAndOperations()
    {
        using var environment = new TestEnvironment();
        var context = await CreateContextAsync(environment);
        var commandService = new CommandService(environment.Database);
        var workspaceService = new WorkspaceService(environment.Database);
        var command = new CommandEnvelope(
            "device-a-00000001",
            context.Setup.WorkspaceEpoch,
            CommandTypes.CreateProject,
            "project-test-0001",
            0,
            JsonSerializer.SerializeToElement(new CreateProjectPayload("试点项目", "协作基础测试")),
            DateTimeOffset.UtcNow);

        var first = await commandService.ExecuteAsync(context.Identity, command);
        var duplicate = await commandService.ExecuteAsync(context.Identity, command);
        var snapshot = await workspaceService.GetSnapshotAsync(context.Setup.WorkspaceId);
        var operations = await workspaceService.GetOperationsAsync(context.Setup.WorkspaceId, 0);

        Assert.Equal(CommandStatus.Applied, first.Status);
        Assert.Equal(CommandStatus.Duplicate, duplicate.Status);
        Assert.Equal(first.ServerSequence, duplicate.ServerSequence);
        Assert.Single(snapshot.Projects);
        Assert.Equal("试点项目", snapshot.Projects[0].Name);
        Assert.Single(operations.Operations);
        Assert.Equal(first.ServerSequence, operations.Cursor);
    }

    [Fact]
    public async Task StaleProjectRevisionReturnsConflictWithoutOverwrite()
    {
        using var environment = new TestEnvironment();
        var context = await CreateContextAsync(environment);
        var commandService = new CommandService(environment.Database);
        var workspaceService = new WorkspaceService(environment.Database);

        await commandService.ExecuteAsync(context.Identity, new CommandEnvelope(
            "device-a-create-project",
            context.Setup.WorkspaceEpoch,
            CommandTypes.CreateProject,
            "project-test-0001",
            0,
            JsonSerializer.SerializeToElement(new CreateProjectPayload("原名称")),
            null));

        var firstUpdate = await commandService.ExecuteAsync(context.Identity, new CommandEnvelope(
            "device-a-update-project",
            context.Setup.WorkspaceEpoch,
            CommandTypes.UpdateProject,
            "project-test-0001",
            1,
            JsonSerializer.SerializeToElement(new UpdateProjectPayload(Name: "已更新名称")),
            null));

        var staleUpdate = await commandService.ExecuteAsync(context.Identity, new CommandEnvelope(
            "device-b-stale-update",
            context.Setup.WorkspaceEpoch,
            CommandTypes.UpdateProject,
            "project-test-0001",
            1,
            JsonSerializer.SerializeToElement(new UpdateProjectPayload(Name: "过期名称")),
            null));

        var snapshot = await workspaceService.GetSnapshotAsync(context.Setup.WorkspaceId);
        Assert.Equal(CommandStatus.Applied, firstUpdate.Status);
        Assert.Equal(CommandStatus.Conflict, staleUpdate.Status);
        Assert.Equal(2, staleUpdate.Revision);
        Assert.Equal("已更新名称", snapshot.Projects[0].Name);
    }

    [Fact]
    public async Task TasksPersistSynchronizeAndRejectStaleUpdates()
    {
        using var environment = new TestEnvironment();
        var context = await CreateContextAsync(environment);
        var commands = new CommandService(environment.Database);
        CommandEnvelope Command(string op, string type, string id, long revision, object payload) =>
            new(op, context.Setup.WorkspaceEpoch, type, id, revision, JsonSerializer.SerializeToElement(payload), null);
        await commands.ExecuteAsync(context.Identity, Command("p", CommandTypes.CreateProject, "project", 0, new CreateProjectPayload("项目")));
        var create = Command("t", CommandTypes.CreateTask, "task", 0, new CreateTaskPayload("project", "剪辑"));
        Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(context.Identity, create)).Status);
        Assert.Equal(CommandStatus.Duplicate, (await commands.ExecuteAsync(context.Identity, create)).Status);
        Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(context.Identity, Command("u", CommandTypes.UpdateTask, "task", 1, new UpdateTaskPayload("进行中")))).Status);
        Assert.Equal(CommandStatus.Conflict, (await commands.ExecuteAsync(context.Identity, Command("stale", CommandTypes.UpdateTask, "task", 1, new UpdateTaskPayload("已完成")))).Status);
        Assert.Equal(CommandStatus.Rejected, (await commands.ExecuteAsync(context.Identity, Command("missing", CommandTypes.CreateTask, "missing", 0, new CreateTaskPayload("absent", "任务")))).Status);
        var service = new WorkspaceService(environment.Database);
        var snapshot = await service.GetSnapshotAsync(context.Setup.WorkspaceId);
        Assert.Equal("进行中", Assert.Single(snapshot.Tasks).Status);
        Assert.Equal(2, snapshot.Tasks[0].Revision);
        var batch = await service.GetOperationsAsync(context.Setup.WorkspaceId, 1);
        Assert.Equal(2, batch.Operations.Count);
        Assert.All(batch.Operations, operation => Assert.Equal("task", operation.EntityType));
    }

    [Fact]
    public async Task AssignmentAndVersionRecordsPersistAndRejectInvalidChanges()
    {
        using var environment = new TestEnvironment();
        var context = await CreateContextAsync(environment);
        var commands = new CommandService(environment.Database);
        CommandEnvelope Command(string op, string type, string id, long revision, object payload) =>
            new(op, context.Setup.WorkspaceEpoch, type, id, revision, JsonSerializer.SerializeToElement(payload), null);
        await commands.ExecuteAsync(context.Identity, Command("p", CommandTypes.CreateProject, "p", 0, new CreateProjectPayload("项目")));
        await commands.ExecuteAsync(context.Identity, Command("t", CommandTypes.CreateTask, "t", 0, new CreateTaskPayload("p", "剪辑")));
        Assert.Equal(CommandStatus.Rejected, (await commands.ExecuteAsync(context.Identity, Command("bad", CommandTypes.UpdateTask, "t", 1, new UpdateTaskPayload(AssigneeMemberId: "absent", ChangeAssignee: true)))).Status);
        Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(context.Identity, Command("assign", CommandTypes.UpdateTask, "t", 1, new UpdateTaskPayload(AssigneeMemberId: context.Identity.MemberId, ChangeAssignee: true)))).Status);
        var create = Command("v", CommandTypes.CreateVersion, "v", 0, new CreateVersionPayload("t", "V1 初剪"));
        Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(context.Identity, create)).Status);
        Assert.Equal(CommandStatus.Duplicate, (await commands.ExecuteAsync(context.Identity, create)).Status);
        Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(context.Identity, Command("approve", CommandTypes.UpdateVersion, "v", 1, new UpdateVersionPayload("已通过")))).Status);
        Assert.Equal(CommandStatus.Conflict, (await commands.ExecuteAsync(context.Identity, Command("stale", CommandTypes.UpdateVersion, "v", 1, new UpdateVersionPayload("修改中")))).Status);
        var service = new WorkspaceService(environment.Database);
        var snapshot = await service.GetSnapshotAsync(context.Setup.WorkspaceId);
        Assert.Equal(context.Identity.MemberId, Assert.Single(snapshot.Tasks).AssigneeMemberId);
        Assert.Equal("待开始", snapshot.Tasks[0].Status);
        Assert.Equal("已通过", Assert.Single(snapshot.Versions).Status);
        Assert.Equal(context.Identity.MemberId, Assert.Single(snapshot.Members).Id);
        await commands.ExecuteAsync(context.Identity, Command("clear", CommandTypes.UpdateTask, "t", 2, new UpdateTaskPayload(ChangeAssignee: true)));
        Assert.Null(Assert.Single((await service.GetSnapshotAsync(context.Setup.WorkspaceId)).Tasks).AssigneeMemberId);
    }

    private static async Task<TestContext> CreateContextAsync(TestEnvironment environment)
    {
        await environment.Database.InitializeAsync();
        var service = new WorkspaceService(environment.Database);
        var setup = await service.SetupAsync(new SetupRequest("公司协作空间", "赵阳"));
        var session = await service.RedeemInvitationAsync(new RedeemInvitationRequest(
            setup.InvitationCode,
            "赵阳",
            "剪辑电脑 A"));
        Assert.NotNull(session);
        var identity = await service.AuthenticateAsync(new StringValues($"Bearer {session.Token}"));
        Assert.NotNull(identity);
        return new TestContext(setup, identity);
    }

    private sealed record TestContext(SetupResponse Setup, DeviceIdentity Identity);

    private sealed class TestEnvironment : IDisposable
    {
        private readonly string _directory = Path.Combine(
            Path.GetTempPath(),
            $"creativeflow-collaboration-test-{Guid.NewGuid():N}");

        public CollaborationDatabase Database { get; }

        public TestEnvironment() => Database = new CollaborationDatabase(_directory);

        public void Dispose()
        {
            var fullPath = Path.GetFullPath(_directory);
            var tempPath = Path.GetFullPath(Path.GetTempPath());
            if (!fullPath.StartsWith(tempPath, StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(fullPath).StartsWith("creativeflow-collaboration-test-", StringComparison.Ordinal))
                return;

            SqliteConnection.ClearAllPools();
            if (Directory.Exists(fullPath)) Directory.Delete(fullPath, recursive: true);
        }
    }
}
