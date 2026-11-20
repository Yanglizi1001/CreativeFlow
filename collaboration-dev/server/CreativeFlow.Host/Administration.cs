using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class WorkspaceService
{
    public async Task<InviteMemberResponse> ReinviteAsync(DeviceIdentity owner,string memberId)
    {
        if(owner.Role!="owner")throw new UnauthorizedAccessException();
        await using var connection=await database.OpenAsync();await using var transaction=(SqliteTransaction)await connection.BeginTransactionAsync();
        var code=SecurityHelpers.NewInvitationCode();var expires=DateTimeOffset.UtcNow.AddMinutes(10);
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="INSERT INTO invitations(id,workspace_id,member_id,code_hash,expires_at,created_at) SELECT $id,workspace_id,id,$hash,$expires,$at FROM members WHERE workspace_id=$w AND id=$member AND removed_at IS NULL";
        command.Parameters.AddWithValue("$id",SecurityHelpers.NewId("invite"));command.Parameters.AddWithValue("$hash",SecurityHelpers.Hash(code));command.Parameters.AddWithValue("$expires",SecurityHelpers.Utc(expires));command.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));command.Parameters.AddWithValue("$w",owner.WorkspaceId);command.Parameters.AddWithValue("$member",memberId);
        if(await command.ExecuteNonQueryAsync()!=1)throw new ArgumentException("成员不存在或已移除");
        await AuditAsync(connection,transaction,owner,"ReinviteMember",memberId);await transaction.CommitAsync();return new(code,expires);
    }
    public async Task<InviteMemberResponse> InviteAsync(DeviceIdentity owner, InviteMemberRequest request)
    {
        if (owner.Role != "owner") throw new UnauthorizedAccessException();
        if (request.Role is not ("member" or "reviewer")) throw new ArgumentException("成员角色无效。");
        var name = Required(request.DisplayName, "显示名称", 40);
        var code = SecurityHelpers.NewInvitationCode(); var now = DateTimeOffset.UtcNow; var expires = now.AddMinutes(10);
        await using var connection = await database.OpenAsync();
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();
        var member = SecurityHelpers.NewId("member");
        await ExecuteAsync(connection, transaction, "INSERT INTO members(id,workspace_id,display_name,role,created_at) VALUES($id,$workspace,$name,$role,$at)", default,
            ("$id", member), ("$workspace", owner.WorkspaceId), ("$name", name), ("$role", request.Role), ("$at", SecurityHelpers.Utc(now)));
        await ExecuteAsync(connection, transaction, "INSERT INTO invitations(id,workspace_id,member_id,code_hash,expires_at,created_at) VALUES($id,$workspace,$member,$hash,$expires,$at)", default,
            ("$id", SecurityHelpers.NewId("invite")), ("$workspace", owner.WorkspaceId), ("$member", member), ("$hash", SecurityHelpers.Hash(code)), ("$expires", SecurityHelpers.Utc(expires)), ("$at", SecurityHelpers.Utc(now)));
        await AuditAsync(connection, transaction, owner, "InviteMember", name);
        await transaction.CommitAsync(); return new(code, expires);
    }

    public async Task<bool> RemoveMemberAsync(DeviceIdentity owner, string memberId)
    {
        if (owner.Role != "owner" || owner.MemberId == memberId) return false;
        await using var connection = await database.OpenAsync();
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();
        await ExecuteAsync(connection, transaction, "UPDATE members SET removed_at=$at WHERE id=$id AND workspace_id=$workspace AND role!='owner'", default,
            ("$at", SecurityHelpers.Utc(DateTimeOffset.UtcNow)), ("$id", memberId), ("$workspace", owner.WorkspaceId));
        await AuditAsync(connection, transaction, owner, "RemoveMember", memberId);
        await transaction.CommitAsync(); return true;
    }

    internal static Task AuditAsync(SqliteConnection connection, SqliteTransaction transaction, DeviceIdentity actor, string action, string summary) =>
        ExecuteAsync(connection, transaction, "INSERT INTO activities(id,workspace_id,actor_id,action,summary,created_at) VALUES($id,$workspace,$actor,$action,$summary,$at)", default,
            ("$id", SecurityHelpers.NewId("activity")), ("$workspace", actor.WorkspaceId), ("$actor", actor.MemberId), ("$action", action), ("$summary", summary), ("$at", SecurityHelpers.Utc(DateTimeOffset.UtcNow)));
}

public sealed class BackupService(CollaborationDatabase database) : BackgroundService
{
    public async Task<string> CreateAsync()
    {
        var directory = Path.Combine(database.DataDirectory, "backups"); Directory.CreateDirectory(directory);
        var file = Path.Combine(directory, $"backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.db");
        var temporary=file+".pending";var estimate=new FileInfo(database.DatabasePath).Length+(File.Exists(database.DatabasePath+"-wal")?new FileInfo(database.DatabasePath+"-wal").Length:0)+1024*1024;
        await using var allocation=await database.Storage.ReserveAsync(temporary,estimate);
        try {
        await using var source = await database.OpenAsync();
        await using var destination = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = temporary,Pooling=false }.ToString());
        await destination.OpenAsync(); source.BackupDatabase(destination);
        await using var check = destination.CreateCommand(); check.CommandText = "PRAGMA integrity_check";
        if (!string.Equals(Convert.ToString(await check.ExecuteScalarAsync()), "ok", StringComparison.OrdinalIgnoreCase)) throw new IOException("备份完整性校验失败。");
        await destination.CloseAsync();File.Move(temporary,file);return file;
        }finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
        while (!stoppingToken.IsCancellationRequested) {
            try { await CreateAsync(); } catch (Exception error) { Console.Error.WriteLine($"Backup failed: {error.Message}"); }
            if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
        }
    }
}
