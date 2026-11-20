using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Primitives;

namespace CreativeFlow.Host;

public sealed partial class WorkspaceService(CollaborationDatabase database)
{
    public async Task<DiscoveryInfo> GetDiscoveryInfoAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await database.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, name FROM workspaces LIMIT 1";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var initialized = await reader.ReadAsync(cancellationToken);
        return new DiscoveryInfo(
            "creativeflow-host",
            ProtocolInfo.Version,
            initialized,
            initialized ? reader.GetString(0) : null,
            initialized ? reader.GetString(1) : null,
            Environment.MachineName);
    }

    public async Task<SetupResponse> SetupAsync(
        SetupRequest request,
        CancellationToken cancellationToken = default)
    {
        var workspaceName = Required(request.WorkspaceName, "空间名称", 60);
        var ownerName = Required(request.OwnerDisplayName, "所有者名称", 40);
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(10);
        var workspaceId = SecurityHelpers.NewId("workspace");
        var memberId = SecurityHelpers.NewId("member");
        var invitationId = SecurityHelpers.NewId("invitation");
        var epoch = Guid.NewGuid().ToString("N");
        var code = SecurityHelpers.NewInvitationCode();

        await using var connection = await database.OpenAsync(cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

        await using (var check = connection.CreateCommand())
        {
            check.Transaction = transaction;
            check.CommandText = "SELECT COUNT(*) FROM workspaces";
            if (Convert.ToInt64(await check.ExecuteScalarAsync(cancellationToken)) > 0)
                throw new InvalidOperationException("协作主机已经初始化。请通过空间设置生成新的邀请码。");
        }

        await ExecuteAsync(connection, transaction,
            "INSERT INTO workspaces(id,name,epoch,created_at) VALUES ($id,$name,$epoch,$at)",
            cancellationToken,
            ("$id", workspaceId), ("$name", workspaceName), ("$epoch", epoch), ("$at", SecurityHelpers.Utc(now)));

        await ExecuteAsync(connection, transaction,
            "INSERT INTO members(id,workspace_id,display_name,role,created_at) VALUES ($id,$workspace,$name,'owner',$at)",
            cancellationToken,
            ("$id", memberId), ("$workspace", workspaceId), ("$name", ownerName), ("$at", SecurityHelpers.Utc(now)));

        await ExecuteAsync(connection, transaction,
            "INSERT INTO invitations(id,workspace_id,member_id,code_hash,expires_at,created_at) VALUES ($id,$workspace,$member,$hash,$expires,$at)",
            cancellationToken,
            ("$id", invitationId), ("$workspace", workspaceId), ("$member", memberId),
            ("$hash", SecurityHelpers.Hash(code)), ("$expires", SecurityHelpers.Utc(expiresAt)), ("$at", SecurityHelpers.Utc(now)));

        await transaction.CommitAsync(cancellationToken);
        return new SetupResponse(workspaceId, epoch, code, expiresAt);
    }

    public async Task<DeviceSession?> RedeemInvitationAsync(
        RedeemInvitationRequest request,
        CancellationToken cancellationToken = default)
    {
        var displayName = Required(request.DisplayName, "显示名称", 40);
        var deviceName = Required(request.DeviceName, "设备名称", 80);
        var now = DateTimeOffset.UtcNow;
        var codeHash = SecurityHelpers.Hash(request.InvitationCode.Replace(" ", string.Empty, StringComparison.Ordinal));

        await using var connection = await database.OpenAsync(cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await using var lookup = connection.CreateCommand();
        lookup.Transaction = transaction;
        lookup.CommandText = """
            SELECT i.id, i.workspace_id, i.member_id, w.epoch, m.role
            FROM invitations i
            JOIN workspaces w ON w.id=i.workspace_id
            JOIN members m ON m.id=i.member_id
            WHERE i.code_hash=$hash AND i.used_at IS NULL AND i.expires_at>$now AND m.removed_at IS NULL
            LIMIT 1
            """;
        lookup.Parameters.AddWithValue("$hash", codeHash);
        lookup.Parameters.AddWithValue("$now", SecurityHelpers.Utc(now));
        await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }

        var invitationId = reader.GetString(0);
        var workspaceId = reader.GetString(1);
        var memberId = reader.GetString(2);
        var epoch = reader.GetString(3);
        var role = reader.GetString(4);
        await reader.DisposeAsync();

        var deviceId = SecurityHelpers.NewId("device");
        var token = SecurityHelpers.NewToken();
        await ExecuteAsync(connection, transaction,
            "UPDATE members SET display_name=$name WHERE id=$id",
            cancellationToken, ("$name", displayName), ("$id", memberId));

        await ExecuteAsync(connection, transaction,
            "INSERT INTO devices(id,workspace_id,member_id,name,token_hash,created_at,last_seen_at) VALUES ($id,$workspace,$member,$name,$hash,$at,$at)",
            cancellationToken,
            ("$id", deviceId), ("$workspace", workspaceId), ("$member", memberId), ("$name", deviceName),
            ("$hash", SecurityHelpers.Hash(token)), ("$at", SecurityHelpers.Utc(now)));

        await ExecuteAsync(connection, transaction,
            "UPDATE invitations SET used_at=$at WHERE id=$id",
            cancellationToken, ("$at", SecurityHelpers.Utc(now)), ("$id", invitationId));

        await transaction.CommitAsync(cancellationToken);
        return new DeviceSession(workspaceId, epoch, memberId, deviceId, displayName, role, token);
    }

    public async Task<DeviceIdentity?> AuthenticateAsync(
        StringValues authorization,
        CancellationToken cancellationToken = default)
    {
        var value = authorization.ToString();
        if (!value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = value[7..].Trim();
        if (token.Length < 32) return null;

        await using var connection = await database.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT d.workspace_id,d.member_id,d.id,m.display_name,m.role
            FROM devices d JOIN members m ON m.id=d.member_id
            WHERE d.token_hash=$hash AND d.revoked_at IS NULL AND m.removed_at IS NULL
            LIMIT 1
            """;
        command.Parameters.AddWithValue("$hash", SecurityHelpers.Hash(token));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        var identity = new DeviceIdentity(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4));
        await reader.DisposeAsync();

        await using var touch = connection.CreateCommand();
        touch.CommandText = "UPDATE devices SET last_seen_at=$at WHERE id=$id";
        touch.Parameters.AddWithValue("$at", SecurityHelpers.Utc(DateTimeOffset.UtcNow));
        touch.Parameters.AddWithValue("$id", identity.DeviceId);
        await touch.ExecuteNonQueryAsync(cancellationToken);
        return identity;
    }

    public async Task<WorkspaceSnapshot> GetSnapshotAsync(
        string workspaceId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await database.OpenAsync(cancellationToken);
        string workspaceName;
        string epoch;
        await using (var workspace = connection.CreateCommand())
        {
            workspace.CommandText = "SELECT name, epoch FROM workspaces WHERE id=$id";
            workspace.Parameters.AddWithValue("$id", workspaceId);
            await using var reader = await workspace.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) throw new KeyNotFoundException("空间不存在。");
            workspaceName = reader.GetString(0);
            epoch = reader.GetString(1);
        }

        await using var cursorCommand = connection.CreateCommand();
        cursorCommand.CommandText = "SELECT COALESCE(MAX(server_sequence),0) FROM operations WHERE workspace_id=$workspace";
        cursorCommand.Parameters.AddWithValue("$workspace", workspaceId);
        var cursor = Convert.ToInt64(await cursorCommand.ExecuteScalarAsync(cancellationToken));
        var projects = new List<ProjectRecord>();
        await using (var projectsCommand = connection.CreateCommand())
        {
            projectsCommand.CommandText = """
                SELECT id,name,description,status,type,start,due,color,revision,created_at,created_by,updated_at,updated_by
                FROM projects WHERE workspace_id=$workspace AND deleted_at IS NULL ORDER BY created_at,id
                """;
            projectsCommand.Parameters.AddWithValue("$workspace", workspaceId);
            await using var reader = await projectsCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) projects.Add(ReadProject(reader));
        }

        var tasks = new List<TaskRecord>();
        await using var tasksCommand = connection.CreateCommand();
        tasksCommand.CommandText = "SELECT id,project_id,name,type,status,due,revision,assignee_member_id FROM tasks WHERE workspace_id=$workspace AND deleted_at IS NULL ORDER BY created_at,id";
        tasksCommand.Parameters.AddWithValue("$workspace", workspaceId);
        await using var tasksReader = await tasksCommand.ExecuteReaderAsync(cancellationToken);
        while (await tasksReader.ReadAsync(cancellationToken))
            tasks.Add(new TaskRecord(tasksReader.GetString(0), tasksReader.GetString(1), tasksReader.GetString(2), tasksReader.GetString(3), tasksReader.GetString(4), tasksReader.GetString(5), tasksReader.GetInt64(6), tasksReader.IsDBNull(7) ? null : tasksReader.GetString(7)));
        await tasksReader.DisposeAsync();
        var members = new List<MemberRecord>();
        await using var memberCommand = connection.CreateCommand();
        memberCommand.CommandText = "SELECT id,display_name FROM members WHERE workspace_id=$workspace AND removed_at IS NULL ORDER BY display_name,id";
        memberCommand.Parameters.AddWithValue("$workspace", workspaceId);
        await using var memberReader = await memberCommand.ExecuteReaderAsync(cancellationToken);
        while (await memberReader.ReadAsync(cancellationToken)) members.Add(new MemberRecord(memberReader.GetString(0), memberReader.GetString(1)));
        await memberReader.DisposeAsync();
        var versions = new List<VersionRecord>();
        await using var versionCommand = connection.CreateCommand();
        versionCommand.CommandText = "SELECT id,task_id,name,status,created_date,revision FROM versions WHERE workspace_id=$workspace AND deleted_at IS NULL ORDER BY created_at,id";
        versionCommand.Parameters.AddWithValue("$workspace", workspaceId);
        await using var versionReader = await versionCommand.ExecuteReaderAsync(cancellationToken);
        while (await versionReader.ReadAsync(cancellationToken)) versions.Add(new VersionRecord(versionReader.GetString(0), versionReader.GetString(1), versionReader.GetString(2), versionReader.GetString(3), versionReader.GetString(4), versionReader.GetInt64(5)));
        await versionReader.DisposeAsync();
        tasks = tasks.Where(t => projects.Any(p => p.Id == t.ProjectId)).ToList();
        versions = versions.Where(v => tasks.Any(t => t.Id == v.TaskId)).ToList();
        async Task<List<T>> Read<T>(string sql, Func<SqliteDataReader,T> map) {
            var result = new List<T>();
            await using var query = connection.CreateCommand(); query.CommandText = sql;
            query.Parameters.AddWithValue("$workspace", workspaceId);
            await using var reader = await query.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) result.Add(map(reader));
            return result;
        }
        var roots = await Read("SELECT id,name,unc_path,revision FROM storage_roots WHERE workspace_id=$workspace AND deleted_at IS NULL", r => new StorageRootRecord(r.GetString(0), r.GetString(1), r.GetString(2), r.GetInt64(3)));
        var media = await Read("SELECT id,version_id,storage_root_id,relative_path,name,revision FROM media_links WHERE workspace_id=$workspace AND deleted_at IS NULL", r => new MediaRecord(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetInt64(5)));
        var lists = await Read("SELECT id,version_id,name,revision FROM feedback_lists WHERE workspace_id=$workspace AND deleted_at IS NULL", r => new FeedbackListRecord(r.GetString(0), r.GetString(1), r.GetString(2), r.GetInt64(3)));
        var feedback = await Read("SELECT id,list_id,text,timecode,completed_at,revision FROM feedback_items WHERE workspace_id=$workspace AND deleted_at IS NULL", r => new FeedbackRecord(r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.IsDBNull(4) ? null : r.GetString(4), r.GetInt64(5)));
        media = media.Where(m => versions.Any(v => v.Id == m.VersionId)).ToList();
        lists = lists.Where(l => versions.Any(v => v.Id == l.VersionId)).ToList();
        feedback = feedback.Where(f => lists.Any(l => l.Id == f.ListId)).ToList();
        return new WorkspaceSnapshot(workspaceId, workspaceName, epoch, cursor, projects, tasks, members, versions, roots, media, lists, feedback);
    }

    public async Task<OperationBatch> GetOperationsAsync(
        string workspaceId,
        long after,
        CancellationToken cancellationToken = default)
    {
        var operations = new List<OperationRecord>();
        await using var connection = await database.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT server_sequence,operation_id,actor_id,command_type,entity_type,entity_id,created_at,result_json
            FROM operations WHERE workspace_id=$workspace AND server_sequence>$after
            ORDER BY server_sequence LIMIT 1000
            """;
        command.Parameters.AddWithValue("$workspace", workspaceId);
        command.Parameters.AddWithValue("$after", after);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        long cursor = after;
        while (await reader.ReadAsync(cancellationToken))
        {
            cursor = reader.GetInt64(0);
            using var document = JsonDocument.Parse(reader.GetString(7));
            operations.Add(new OperationRecord(
                cursor,
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                DateTimeOffset.Parse(reader.GetString(6)),
                document.RootElement.Clone()));
        }
        return new OperationBatch(cursor, operations);
    }

    internal static ProjectRecord ReadProject(SqliteDataReader reader) => new(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
        reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetInt64(8),
        DateTimeOffset.Parse(reader.GetString(9)), reader.GetString(10),
        DateTimeOffset.Parse(reader.GetString(11)), reader.GetString(12));

    internal static async Task ExecuteAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object? Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string Required(string value, string label, int maxLength)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length is 0 || trimmed.Length > maxLength)
            throw new ArgumentException($"{label}长度必须为 1–{maxLength} 个字符。");
        return trimmed;
    }
}
