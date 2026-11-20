using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class CommandService
{
    private static string EntityType(string type) => type switch {
        "CreateProject" or "UpdateProject" or "DeleteProject" => "project",
        "CreateTask" or "UpdateTask" or "DeleteTask" => "task",
        "CreateVersion" or "UpdateVersion" or "DeleteVersion" => "version",
        "CreateStorageRoot" => "storage_root", "LinkMedia" or "UnlinkMedia" => "media", "CreateFeedbackList" or "DeleteFeedbackList" => "feedback_list", _ => "feedback" };

    private static async Task<CommandResult> ReviewCommandAsync(SqliteConnection connection, SqliteTransaction transaction,
        DeviceIdentity identity, CommandEnvelope command, CancellationToken ct)
    {
        var payload = command.Payload;
        string Value(string key) => payload.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : "";
        var now = DateTimeOffset.UtcNow;
        var at = SecurityHelpers.Utc(now);
        async Task<long> Count(string table, string id) {
            await using var query = connection.CreateCommand(); query.Transaction = transaction;
            query.CommandText = $"SELECT COUNT(*) FROM {table} WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL";
            if (table == "versions") query.CommandText += " AND EXISTS(SELECT 1 FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=versions.task_id AND t.deleted_at IS NULL AND p.deleted_at IS NULL)";
            if (table == "feedback_lists") query.CommandText += " AND EXISTS(SELECT 1 FROM versions v JOIN tasks t ON t.id=v.task_id JOIN projects p ON p.id=t.project_id WHERE v.id=feedback_lists.version_id AND v.deleted_at IS NULL AND t.deleted_at IS NULL AND p.deleted_at IS NULL)";
            query.Parameters.AddWithValue("$id", id); query.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            return Convert.ToInt64(await query.ExecuteScalarAsync(ct));
        }
        async Task Insert(string table, string columns, string values, params (string, object?)[] extra) {
            var parameters = new List<(string, object?)> { ("$id", command.EntityId), ("$workspace", identity.WorkspaceId), ("$at", at), ("$actor", identity.MemberId) };
            parameters.AddRange(extra);
            await WorkspaceService.ExecuteAsync(connection, transaction,
                $"INSERT INTO {table}(id,workspace_id,revision,created_at,created_by,updated_at,updated_by,{columns}) VALUES($id,$workspace,1,$at,$actor,$at,$actor,{values})", ct, parameters.ToArray());
        }
        var table = command.Type switch {
            "CreateStorageRoot" => "storage_roots", "LinkMedia" or "UnlinkMedia" => "media_links", "CreateFeedbackList" or "DeleteFeedbackList" => "feedback_lists",
            "DeleteProject" => "projects", "DeleteTask" => "tasks", "DeleteVersion" => "versions", _ => "feedback_items" };
        long revision = 1;
        var creating = command.Type is "CreateStorageRoot" or "LinkMedia" or "CreateFeedbackList" or "AddFeedbackItem";
        if (creating) {
            await using var exists = connection.CreateCommand(); exists.Transaction = transaction;
            exists.CommandText = $"SELECT COUNT(*) FROM {table} WHERE id=$id"; exists.Parameters.AddWithValue("$id", command.EntityId);
            if (Convert.ToInt64(await exists.ExecuteScalarAsync(ct)) != 0) return Rejected(command, "entity_exists", "记录已存在。");
        } else {
            await using var current = connection.CreateCommand(); current.Transaction = transaction;
            current.CommandText = $"SELECT revision FROM {table} WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL";
            current.Parameters.AddWithValue("$id", command.EntityId); current.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            var value = await current.ExecuteScalarAsync(ct);
            if (value is null) return Rejected(command, "entity_not_found", "记录不存在或已删除。");
            revision = Convert.ToInt64(value);
            if (revision != command.BaseRevision) return new CommandResult(CommandStatus.Conflict, command.OperationId, 0, command.EntityId, revision, "revision_conflict", "记录已被其他成员修改，请刷新后重试。");
            revision++;
        }
        switch (command.Type) {
            case "CreateStorageRoot": {
                var unc = Value("uncPath").Trim().TrimEnd('\\');
                if (!unc.StartsWith(@"\\") || unc.StartsWith(@"\\?\") || unc.StartsWith(@"\\.\") || unc[2..].Split('\\').Length < 2 || unc.Contains("..") || unc.Contains(':'))
                    throw new ArgumentException(@"共享位置必须是 \\服务器\共享名 格式。");
                await Insert(table, "name,server_path,unc_path", "$name,'',$unc", ("$name", Required(Value("name"), "位置名称", 80)), ("$unc", unc)); break;
            }
            case "LinkMedia": {
                var version = Value("versionId"); var root = Value("storageRootId");
                if (await Count("versions", version) != 1 || await Count("storage_roots", root) != 1) return Rejected(command, "parent_not_found", "版本或共享位置不存在。");
                var relative = Value("relativePath").Replace('/', '\\');
                if (string.IsNullOrWhiteSpace(relative) || relative.StartsWith('\\') || relative.Contains(':') || relative.Split('\\').Any(part => part is ".." or "." or "")) throw new ArgumentException("素材路径必须是共享位置内的相对路径。");
                await Insert(table, "version_id,storage_root_id,relative_path,name", "$version,$root,$path,$name", ("$version", version), ("$root", root), ("$path", relative), ("$name", Path.GetFileName(relative))); break;
            }
            case "CreateFeedbackList": {
                var version = Value("versionId"); if (await Count("versions", version) != 1) return Rejected(command, "parent_not_found", "版本不存在。");
                await Insert(table, "version_id,name", "$version,$name", ("$version", version), ("$name", Required(Value("name"), "清单名称", 120))); break;
            }
            case "AddFeedbackItem": {
                var list = Value("listId"); if (await Count("feedback_lists", list) != 1) return Rejected(command, "parent_not_found", "意见清单不存在。");
                await Insert(table, "list_id,text,timecode", "$list,$text,$timecode", ("$list", list), ("$text", Required(Value("text"), "意见", 5000)), ("$timecode", Value("timecode"))); break;
            }
            default: {
                string changes = command.Type switch {
                    "EditFeedbackItem" => "text=$text,timecode=COALESCE($timecode,timecode)",
                    "CompleteFeedbackItem" => "completed_at=$at,completed_by=$actor",
                    "ReopenFeedbackItem" => "completed_at=NULL,completed_by=NULL", _ => "deleted_at=$at" };
                await WorkspaceService.ExecuteAsync(connection, transaction,
                    $"UPDATE {table} SET {changes},revision=$revision,updated_at=$at,updated_by=$actor WHERE id=$id AND workspace_id=$workspace", ct,
                    ("$text", command.Type == "EditFeedbackItem" ? Required(Value("text"), "意见", 5000) : ""), ("$timecode", payload.TryGetProperty("timecode",out _) ? Value("timecode") : null),
                    ("$revision", revision), ("$at", at), ("$actor", identity.MemberId), ("$id", command.EntityId), ("$workspace", identity.WorkspaceId));
                break;
            }
        }
        return await RecordOperationAsync(connection, transaction, identity, command, revision, now, ct);
    }
}
