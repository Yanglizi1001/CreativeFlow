using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class CommandService
{
    private static async Task<CommandResult> VersionCommandAsync(SqliteConnection connection, SqliteTransaction transaction,
        DeviceIdentity identity, CommandEnvelope command, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        long revision = 1;
        if (command.Type == CommandTypes.CreateVersion)
        {
            var payload = command.Payload.Deserialize<CreateVersionPayload>(JsonOptions) ?? throw new JsonException();
            var name = Required(payload.Name, "版本名称", 120);
            await using var check = connection.CreateCommand();
            check.Transaction = transaction;
            check.CommandText = "SELECT COUNT(*) FROM tasks WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM projects p WHERE p.id=tasks.project_id AND p.deleted_at IS NULL)";
            check.Parameters.AddWithValue("$id", payload.TaskId);
            check.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            if (Convert.ToInt64(await check.ExecuteScalarAsync(cancellationToken)) != 1)
                return Rejected(command, "task_not_found", "所属任务不存在。");
            await using var exists = connection.CreateCommand();
            exists.Transaction = transaction;
            exists.CommandText = "SELECT COUNT(*) FROM versions WHERE id=$id";
            exists.Parameters.AddWithValue("$id", command.EntityId);
            if (Convert.ToInt64(await exists.ExecuteScalarAsync(cancellationToken)) != 0)
                return Rejected(command, "entity_exists", "版本 ID 已存在。");
            await WorkspaceService.ExecuteAsync(connection, transaction,
                "INSERT INTO versions(id,workspace_id,task_id,name,status,created_date,revision,created_at,created_by,updated_at,updated_by) VALUES($id,$workspace,$task,$name,'待审阅',$date,1,$at,$actor,$at,$actor)", cancellationToken,
                ("$id", command.EntityId), ("$workspace", identity.WorkspaceId), ("$task", payload.TaskId), ("$name", name),
                ("$date", now.ToString("yyyy-MM-dd")), ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId));
        }
        else
        {
            var payload = command.Payload.Deserialize<UpdateVersionPayload>(JsonOptions) ?? throw new JsonException();
            if (payload.Status is not null && payload.Status is not ("待审阅" or "修改中" or "已通过")) throw new ArgumentException("版本状态无效。");
            await using var check = connection.CreateCommand();
            check.Transaction = transaction;
            check.CommandText = "SELECT revision FROM versions WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=versions.task_id AND t.deleted_at IS NULL AND p.deleted_at IS NULL)";
            check.Parameters.AddWithValue("$id", command.EntityId);
            check.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            var value = await check.ExecuteScalarAsync(cancellationToken);
            if (value is null) return Rejected(command, "entity_not_found", "版本不存在。");
            revision = Convert.ToInt64(value);
            if (revision != command.BaseRevision)
                return new CommandResult(CommandStatus.Conflict, command.OperationId, 0, command.EntityId, revision, "revision_conflict", "版本已更新，请刷新后重试。");
            revision++;
            await WorkspaceService.ExecuteAsync(connection, transaction,
                "UPDATE versions SET name=COALESCE($name,name),status=COALESCE($status,status),revision=$revision,updated_at=$at,updated_by=$actor WHERE id=$id AND workspace_id=$workspace", cancellationToken,
                ("$name", payload.Name is null ? null : Required(payload.Name, "版本名称", 120)),
                ("$status", payload.Status), ("$revision", revision), ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId), ("$id", command.EntityId), ("$workspace", identity.WorkspaceId));
        }
        return await RecordOperationAsync(connection, transaction, identity, command, revision, now, cancellationToken);
    }
}
