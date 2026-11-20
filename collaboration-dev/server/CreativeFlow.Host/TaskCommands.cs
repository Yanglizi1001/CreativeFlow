using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class CommandService
{
    private static async Task<CommandResult> TaskCommandAsync(SqliteConnection connection, SqliteTransaction transaction,
        DeviceIdentity identity, CommandEnvelope command, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        long revision = 1;
        if (command.Type == CommandTypes.CreateTask)
        {
            var payload = command.Payload.Deserialize<CreateTaskPayload>(JsonOptions) ?? throw new JsonException();
            var name = Required(payload.Name, "任务名称", 120);
            ValidateTaskStatus(payload.Status);
            await using var project = connection.CreateCommand();
            project.Transaction = transaction;
            project.CommandText = "SELECT COUNT(*) FROM projects WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL";
            project.Parameters.AddWithValue("$id", payload.ProjectId);
            project.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            if (Convert.ToInt64(await project.ExecuteScalarAsync(cancellationToken)) != 1)
                return Rejected(command, "project_not_found", "所属项目不存在。");
            await using var exists = connection.CreateCommand();
            exists.Transaction = transaction;
            exists.CommandText = "SELECT COUNT(*) FROM tasks WHERE id=$id";
            exists.Parameters.AddWithValue("$id", command.EntityId);
            if (Convert.ToInt64(await exists.ExecuteScalarAsync(cancellationToken)) > 0)
                return Rejected(command, "entity_exists", "任务 ID 已存在。");
            await WorkspaceService.ExecuteAsync(connection, transaction,
                "INSERT INTO tasks(id,workspace_id,project_id,name,type,status,due,revision,created_at,created_by,updated_at,updated_by) VALUES($id,$workspace,$project,$name,$type,$status,$due,1,$at,$actor,$at,$actor)", cancellationToken,
                ("$id", command.EntityId), ("$workspace", identity.WorkspaceId), ("$project", payload.ProjectId),
                ("$name", name), ("$type", Required(payload.Type, "任务类型", 40)), ("$status", payload.Status), ("$due", payload.Due ?? ""),
                ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId));
        }
        else
        {
            var payload = command.Payload.Deserialize<UpdateTaskPayload>(JsonOptions) ?? throw new JsonException();
            if (payload.Status is not null) ValidateTaskStatus(payload.Status);
            if (payload.ChangeAssignee && payload.AssigneeMemberId is not null)
            {
                await using var member = connection.CreateCommand();
                member.Transaction = transaction;
                member.CommandText = "SELECT COUNT(*) FROM members WHERE id=$id AND workspace_id=$workspace AND removed_at IS NULL";
                member.Parameters.AddWithValue("$id", payload.AssigneeMemberId);
                member.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
                if (Convert.ToInt64(await member.ExecuteScalarAsync(cancellationToken)) != 1)
                    return Rejected(command, "member_not_found", "负责人不在当前空间。");
            }
            await using var lookup = connection.CreateCommand();
            lookup.Transaction = transaction;
            lookup.CommandText = "SELECT revision FROM tasks WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM projects p WHERE p.id=tasks.project_id AND p.deleted_at IS NULL)";
            lookup.Parameters.AddWithValue("$id", command.EntityId);
            lookup.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            var value = await lookup.ExecuteScalarAsync(cancellationToken);
            if (value is null) return Rejected(command, "entity_not_found", "任务不存在。");
            revision = Convert.ToInt64(value);
            if (revision != command.BaseRevision)
                return new CommandResult(CommandStatus.Conflict, command.OperationId, 0, command.EntityId, revision, "revision_conflict", "任务已被其他成员修改，请刷新后重试。");
            revision++;
            await WorkspaceService.ExecuteAsync(connection, transaction,
                "UPDATE tasks SET name=COALESCE($name,name),due=COALESCE($due,due),status=COALESCE($status,status),assignee_member_id=CASE WHEN $change=1 THEN $assignee ELSE assignee_member_id END,revision=$revision,updated_at=$at,updated_by=$actor WHERE id=$id AND workspace_id=$workspace", cancellationToken,
                ("$name", payload.Name is null ? null : Required(payload.Name, "任务名称", 120)), ("$due", payload.Due),
                ("$change", payload.ChangeAssignee ? 1 : 0), ("$assignee", payload.AssigneeMemberId),
                ("$status", payload.Status), ("$revision", revision), ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId),
                ("$id", command.EntityId), ("$workspace", identity.WorkspaceId));
        }
        return await RecordOperationAsync(connection, transaction, identity, command, revision, now, cancellationToken);
    }

    private static void ValidateTaskStatus(string status)
    {
        if (status is not ("待开始" or "进行中" or "待审阅" or "已完成")) throw new ArgumentException("任务状态无效。");
    }
}
