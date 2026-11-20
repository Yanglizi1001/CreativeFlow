using System.Text.Json;
using CreativeFlow.Host;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host.Tests;

public sealed class ReviewFlowTests
{
    [Fact]
    public async Task OwnerInvitesReviewerAndReviewPersistsWithBackup()
    {
        var directory = Path.Combine(Path.GetTempPath(), "creativeflow-review-test-" + Guid.NewGuid().ToString("N"));
        try {
            var database = new CollaborationDatabase(directory); await database.InitializeAsync();
            var workspace = new WorkspaceService(database); var commands = new CommandService(database);
            var setup = await workspace.SetupAsync(new("空间", "管理员"));
            var ownerSession = (await workspace.RedeemInvitationAsync(new(setup.InvitationCode, "管理员", "A")))!;
            var owner = (await workspace.AuthenticateAsync(new StringValues("Bearer " + ownerSession.Token)))!;
            var invitation = await workspace.InviteAsync(owner, new("审阅成员", "reviewer"));
            var reviewerSession = (await workspace.RedeemInvitationAsync(new(invitation.InvitationCode, "审阅成员", "B")))!;
            var reviewer = (await workspace.AuthenticateAsync(new StringValues("Bearer " + reviewerSession.Token)))!;
            CommandEnvelope Command(string type, string id, object payload, long revision = 0) => new(Guid.NewGuid().ToString(), setup.WorkspaceEpoch, type, id, revision, JsonSerializer.SerializeToElement(payload), null);
            Assert.Equal(CommandStatus.Rejected, (await commands.ExecuteAsync(reviewer, Command("CreateProject", "denied", new { name = "无权限" }))).Status);
            await commands.ExecuteAsync(owner, Command("CreateProject", "p", new { name = "项目" }));
            Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(owner, Command("UpdateProject", "p", new {status="进行中"},1))).Status);
            Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(owner, Command("UpdateProject", "p", new {name="独立字段合并"},1))).Status);
            Assert.Equal(CommandStatus.Conflict, (await commands.ExecuteAsync(owner, Command("UpdateProject", "p", new {name="冲突名称"},1))).Status);
            await commands.ExecuteAsync(owner, Command("CreateTask", "t", new { projectId = "p", name = "任务" }));
            await commands.ExecuteAsync(owner, Command("CreateVersion", "v", new { taskId = "t", name = "V1" }));
            await commands.ExecuteAsync(owner, Command("CreateStorageRoot", "root", new { name = "视频", uncPath = @"\\server\share" }));
            Assert.Equal(CommandStatus.Rejected, (await commands.ExecuteAsync(owner, Command("LinkMedia", "bad", new { versionId = "v", storageRootId = "root", relativePath = @"..\secret.mp4" }))).Status);
            Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(owner, Command("LinkMedia", "media", new { versionId = "v", storageRootId = "root", relativePath = @"项目\初剪.mp4" }))).Status);
            await commands.ExecuteAsync(reviewer, Command("CreateFeedbackList", "list", new { versionId = "v", name = "修改清单" }));
            var add = Command("AddFeedbackItem", "feedback", new { listId = "list", text = "修改字幕", timecode = "00:00:12" });
            await commands.ExecuteAsync(reviewer, add);
            Assert.Equal(CommandStatus.Duplicate, (await commands.ExecuteAsync(reviewer, add)).Status);
            await commands.ExecuteAsync(reviewer, Command("CompleteFeedbackItem", "feedback", new { }, 1));
            Assert.Equal(CommandStatus.Applied, (await commands.ExecuteAsync(reviewer, Command("EditFeedbackItem", "feedback", new { text = "独立文本修改" }, 1))).Status);
            Assert.Equal(CommandStatus.Conflict, (await commands.ExecuteAsync(reviewer, Command("EditFeedbackItem", "feedback", new { text = "冲突文本修改" }, 1))).Status);
            var snapshot = await workspace.GetSnapshotAsync(setup.WorkspaceId);
            Assert.NotNull(Assert.Single(snapshot.Feedback).CompletedAt);
            Assert.Single(snapshot.Media); Assert.Equal(2, snapshot.Members.Count);
            var file = await new BackupService(database).CreateAsync();
            await using(var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = file, Mode = SqliteOpenMode.ReadOnly }.ToString())) {
                await backup.OpenAsync(); await using var query = backup.CreateCommand(); query.CommandText = "SELECT COUNT(*) FROM feedback_items";
                Assert.Equal(1L, await query.ExecuteScalarAsync());
            }
            await workspace.RemoveMemberAsync(owner, reviewer.MemberId);
            Assert.Null(await workspace.AuthenticateAsync(new StringValues("Bearer " + reviewerSession.Token)));
        } finally {
            SqliteConnection.ClearAllPools();
            if (Path.GetFileName(directory).StartsWith("creativeflow-review-test-")) Directory.Delete(directory, true);
        }
    }
}
