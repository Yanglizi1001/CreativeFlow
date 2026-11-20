using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class CommandService(CollaborationDatabase database)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    public async Task<CommandResult> ExecuteAsync(
        DeviceIdentity identity,
        CommandEnvelope command,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(command.OperationId) || command.OperationId.Length > 128)
            return Rejected(command, "invalid_operation_id", "operationId 无效。");
        if (string.IsNullOrWhiteSpace(command.EntityId) || command.EntityId.Length > 128)
            return Rejected(command, "invalid_entity_id", "entityId 无效。");
        if (command.Payload.ValueKind != JsonValueKind.Object)
            return Rejected(command, "invalid_payload", "命令内容必须是对象。");
        if (identity.Role == "reviewer" && command.Type is not ("CreateFeedbackList" or "AddFeedbackItem" or "EditFeedbackItem" or "CompleteFeedbackItem" or "ReopenFeedbackItem"))
            return Rejected(command, "forbidden", "审阅者只能提交审阅意见。");
        if (command.Type == "CreateStorageRoot" && identity.Role != "owner")
            return Rejected(command, "forbidden", "只有空间所有者可以管理共享位置。");

        await using var connection = await database.OpenAsync(cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await using (var epochCommand = connection.CreateCommand())
        {
            epochCommand.Transaction = transaction;
            epochCommand.CommandText = "SELECT epoch FROM workspaces WHERE id=$workspace";
            epochCommand.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            var epoch = Convert.ToString(await epochCommand.ExecuteScalarAsync(cancellationToken));
            if (!string.Equals(epoch, command.WorkspaceEpoch, StringComparison.Ordinal))
            {
                await transaction.RollbackAsync(cancellationToken);
                return Rejected(command, "workspace_epoch_changed", "空间已从备份恢复，请先重新下载最新数据。");
            }
        }

        var duplicate = await FindDuplicateAsync(connection, transaction, command.OperationId, cancellationToken);
        if (duplicate is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return duplicate with { Status = CommandStatus.Duplicate };
        }
        CommandResult result;
        try
        {
            command = await MergeIndependentFieldsAsync(connection, transaction, identity, command, cancellationToken);
            result = command.Type switch
            {
                CommandTypes.CreateProject => await CreateProjectAsync(connection, transaction, identity, command, cancellationToken),
                CommandTypes.UpdateProject => await UpdateProjectAsync(connection, transaction, identity, command, cancellationToken),
                CommandTypes.CreateTask or CommandTypes.UpdateTask => await TaskCommandAsync(connection, transaction, identity, command, cancellationToken),
                CommandTypes.CreateVersion or CommandTypes.UpdateVersion => await VersionCommandAsync(connection, transaction, identity, command, cancellationToken),
                "CreateStorageRoot" or "LinkMedia" or "UnlinkMedia" or "CreateFeedbackList" or "DeleteFeedbackList" or "AddFeedbackItem" or "EditFeedbackItem" or "CompleteFeedbackItem" or "ReopenFeedbackItem" or "DeleteFeedbackItem" or "DeleteProject" or "DeleteTask" or "DeleteVersion" => await ReviewCommandAsync(connection, transaction, identity, command, cancellationToken),
                _ => Rejected(command, "unsupported_command", $"暂不支持命令 {command.Type}。")
            };
        }
        catch (JsonException)
        {
            result = Rejected(command, "invalid_payload", "命令 payload 无法识别。");
        }
        catch (ArgumentException error)
        {
            result = Rejected(command, "invalid_payload", error.Message);
        }

        if (result.Status is CommandStatus.Conflict or CommandStatus.Rejected)
        {
            await transaction.RollbackAsync(cancellationToken);
            return result;
        }

        await StoreHistoryAsync(connection, transaction, identity, command, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private static async Task<CommandResult> CreateProjectAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DeviceIdentity identity,
        CommandEnvelope command,
        CancellationToken cancellationToken)
    {
        var payload = command.Payload.Deserialize<CreateProjectPayload>(JsonOptions)
            ?? throw new JsonException();
        var name = Required(payload.Name, "项目名称", 120);

        await using (var exists = connection.CreateCommand())
        {
            exists.Transaction = transaction;
            exists.CommandText = "SELECT COUNT(*) FROM projects WHERE id=$id";
            exists.Parameters.AddWithValue("$id", command.EntityId);
            if (Convert.ToInt64(await exists.ExecuteScalarAsync(cancellationToken)) > 0)
                return Rejected(command, "entity_exists", "项目 ID 已存在。");
        }

        var now = DateTimeOffset.UtcNow;
        await WorkspaceService.ExecuteAsync(connection, transaction, """
            INSERT INTO projects(
                id,workspace_id,name,description,status,type,start,due,color,revision,
                created_at,created_by,updated_at,updated_by)
            VALUES ($id,$workspace,$name,$description,$status,$type,$start,$due,$color,1,$at,$actor,$at,$actor)
            """, cancellationToken,
            ("$id", command.EntityId), ("$workspace", identity.WorkspaceId), ("$name", name),
            ("$description", payload.Description?.Trim() ?? string.Empty), ("$status", payload.Status?.Trim() ?? "计划中"),
            ("$type", payload.Type?.Trim() ?? "视频"), ("$start", payload.Start?.Trim() ?? string.Empty),
            ("$due", payload.Due?.Trim() ?? string.Empty), ("$color", NormalizeColor(payload.Color)),
            ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId));

        return await RecordOperationAsync(connection, transaction, identity, command, 1, now, cancellationToken);
    }

    private static async Task<CommandResult> UpdateProjectAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DeviceIdentity identity,
        CommandEnvelope command,
        CancellationToken cancellationToken)
    {
        var payload = command.Payload.Deserialize<UpdateProjectPayload>(JsonOptions)
            ?? throw new JsonException();
        ProjectRecord? current;
        await using (var select = connection.CreateCommand())
        {
            select.Transaction = transaction;
            select.CommandText = """
                SELECT id,name,description,status,type,start,due,color,revision,created_at,created_by,updated_at,updated_by
                FROM projects WHERE id=$id AND workspace_id=$workspace AND deleted_at IS NULL
                """;
            select.Parameters.AddWithValue("$id", command.EntityId);
            select.Parameters.AddWithValue("$workspace", identity.WorkspaceId);
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            current = await reader.ReadAsync(cancellationToken) ? WorkspaceService.ReadProject(reader) : null;
        }

        if (current is null) return Rejected(command, "entity_not_found", "项目不存在或已删除。");
        if (current.Revision != command.BaseRevision)
        {
            return new CommandResult(
                CommandStatus.Conflict,
                command.OperationId,
                0,
                command.EntityId,
                current.Revision,
                "revision_conflict",
                "项目已被其他成员修改。",
                JsonSerializer.SerializeToElement(current, JsonOptions));
        }

        var nextRevision = current.Revision + 1;
        var now = DateTimeOffset.UtcNow;
        await WorkspaceService.ExecuteAsync(connection, transaction, """
            UPDATE projects SET
                name=$name,description=$description,status=$status,type=$type,start=$start,due=$due,color=$color,
                revision=$revision,updated_at=$at,updated_by=$actor
            WHERE id=$id AND workspace_id=$workspace
            """, cancellationToken,
            ("$name", payload.Name is null ? current.Name : Required(payload.Name, "项目名称", 120)),
            ("$description", payload.Description ?? current.Description), ("$status", payload.Status ?? current.Status),
            ("$type", payload.Type ?? current.Type), ("$start", payload.Start ?? current.Start),
            ("$due", payload.Due ?? current.Due), ("$color", payload.Color is null ? current.Color : NormalizeColor(payload.Color)),
            ("$revision", nextRevision), ("$at", SecurityHelpers.Utc(now)), ("$actor", identity.MemberId),
            ("$id", command.EntityId), ("$workspace", identity.WorkspaceId));

        return await RecordOperationAsync(connection, transaction, identity, command, nextRevision, now, cancellationToken);
    }

    private static async Task<CommandResult> RecordOperationAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        DeviceIdentity identity,
        CommandEnvelope command,
        long revision,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await WorkspaceService.ExecuteAsync(connection, transaction, """
            INSERT INTO operations(
                operation_id,workspace_id,workspace_epoch,actor_id,command_type,entity_type,entity_id,result_json,created_at)
            VALUES ($operation,$workspace,$epoch,$actor,$command,$entityType,$entity,'{}',$at)
            """, cancellationToken,
            ("$operation", command.OperationId), ("$workspace", identity.WorkspaceId),
            ("$epoch", command.WorkspaceEpoch), ("$actor", identity.MemberId), ("$command", command.Type),
            ("$entityType", EntityType(command.Type)),
            ("$entity", command.EntityId), ("$at", SecurityHelpers.Utc(now)));

        await using var sequenceCommand = connection.CreateCommand();
        sequenceCommand.Transaction = transaction;
        sequenceCommand.CommandText = "SELECT last_insert_rowid()";
        var sequence = Convert.ToInt64(await sequenceCommand.ExecuteScalarAsync(cancellationToken));
        var result = new CommandResult(CommandStatus.Applied, command.OperationId, sequence, command.EntityId, revision);
        await WorkspaceService.AuditAsync(connection, transaction, identity, command.Type, command.EntityId);

        await WorkspaceService.ExecuteAsync(connection, transaction,
            "UPDATE operations SET result_json=$json WHERE server_sequence=$sequence",
            cancellationToken,
            ("$json", JsonSerializer.Serialize(result, JsonOptions)), ("$sequence", sequence));
        return result;
    }

    private static async Task<CommandResult?> FindDuplicateAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string operationId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT result_json FROM operations WHERE operation_id=$id";
        command.Parameters.AddWithValue("$id", operationId);
        var json = Convert.ToString(await command.ExecuteScalarAsync(cancellationToken));
        return string.IsNullOrEmpty(json) ? null : JsonSerializer.Deserialize<CommandResult>(json, JsonOptions);
    }

    private static CommandResult Rejected(CommandEnvelope command, string code, string message) =>
        new(CommandStatus.Rejected, command.OperationId, 0, command.EntityId, command.BaseRevision, code, message);

    private static string Required(string value, string label, int maxLength)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length is 0 || trimmed.Length > maxLength)
            throw new ArgumentException($"{label}长度必须为 1–{maxLength} 个字符。");
        return trimmed;
    }

    private static string NormalizeColor(string? value)
    {
        var color = string.IsNullOrWhiteSpace(value) ? "#3878cf" : value.Trim();
        if (color.Length != 7 || color[0] != '#' || !color[1..].All(Uri.IsHexDigit))
            throw new ArgumentException("项目颜色必须是 #RRGGBB 格式。");
        return color.ToLowerInvariant();
    }
}
