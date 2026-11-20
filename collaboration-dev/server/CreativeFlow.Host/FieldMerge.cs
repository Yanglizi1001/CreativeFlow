using System.Text.Json;
using CreativeFlow.Protocol;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed partial class CommandService
{
    private static string HistoryTable(string type) => EntityType(type) switch {
        "project"=>"projects", "task"=>"tasks", "version"=>"versions", "storage_root"=>"storage_roots", "media"=>"media_links", "feedback_list"=>"feedback_lists", _=>"feedback_items" };

    private static async Task<JsonElement?> ReadRowAsync(SqliteConnection connection, SqliteTransaction transaction, string table, string workspace, string id, CancellationToken ct)
    {
        await using var query=connection.CreateCommand(); query.Transaction=transaction;
        query.CommandText=$"SELECT * FROM {table} WHERE workspace_id=$workspace AND id=$id";
        query.Parameters.AddWithValue("$workspace",workspace); query.Parameters.AddWithValue("$id",id);
        await using var reader=await query.ExecuteReaderAsync(ct);
        if(!await reader.ReadAsync(ct)) return null;
        var row=new Dictionary<string,object?>();
        for(var index=0;index<reader.FieldCount;index++) {
            var parts=reader.GetName(index).Split('_');
            var key=parts[0]+string.Concat(parts.Skip(1).Select(part=>char.ToUpperInvariant(part[0])+part[1..]));
            row[key]=reader.IsDBNull(index)?null:reader.GetValue(index);
        }
        return JsonSerializer.SerializeToElement(row,JsonOptions);
    }

    private static async Task StoreHistoryAsync(SqliteConnection connection, SqliteTransaction transaction, DeviceIdentity identity, CommandEnvelope command, CancellationToken ct)
    {
        var table=HistoryTable(command.Type);
        var current=await ReadRowAsync(connection,transaction,table,identity.WorkspaceId,command.EntityId,ct);
        if(current is null) return;
        await WorkspaceService.ExecuteAsync(connection,transaction,
            "INSERT OR IGNORE INTO entity_history(workspace_id,table_name,entity_id,revision,snapshot_json) VALUES($workspace,$table,$id,$revision,$json)",ct,
            ("$workspace",identity.WorkspaceId),("$table",table),("$id",command.EntityId),("$revision",current.Value.GetProperty("revision").GetInt64()),("$json",current.Value.GetRawText()));
    }

    private static async Task<CommandEnvelope> MergeIndependentFieldsAsync(SqliteConnection connection, SqliteTransaction transaction, DeviceIdentity identity, CommandEnvelope command, CancellationToken ct)
    {
        if(command.Type is not ("UpdateProject" or "UpdateTask" or "UpdateVersion" or "EditFeedbackItem")) return command;
        var table=HistoryTable(command.Type);
        var current=await ReadRowAsync(connection,transaction,table,identity.WorkspaceId,command.EntityId,ct);
        if(current is null || current.Value.GetProperty("deletedAt").ValueKind!=JsonValueKind.Null) return command;
        var revision=current.Value.GetProperty("revision").GetInt64();
        if(command.BaseRevision>=revision) return command;
        await using var query=connection.CreateCommand(); query.Transaction=transaction;
        query.CommandText="SELECT snapshot_json FROM entity_history WHERE workspace_id=$workspace AND table_name=$table AND entity_id=$id AND revision=$revision";
        query.Parameters.AddWithValue("$workspace",identity.WorkspaceId);query.Parameters.AddWithValue("$table",table);query.Parameters.AddWithValue("$id",command.EntityId);query.Parameters.AddWithValue("$revision",command.BaseRevision);
        var json=Convert.ToString(await query.ExecuteScalarAsync(ct));
        if(string.IsNullOrEmpty(json)) return command;
        using var baseline=JsonDocument.Parse(json);
        if(command.Type=="UpdateTask" && command.Payload.TryGetProperty("changeAssignee",out var assign) && assign.ValueKind==JsonValueKind.True && !command.Payload.TryGetProperty("assigneeMemberId",out _)) {
            var original=baseline.RootElement.GetProperty("assigneeMemberId"); var latest=current.Value.GetProperty("assigneeMemberId");
            if(original.GetRawText()!=latest.GetRawText() && latest.ValueKind!=JsonValueKind.Null) return command;
        }
        foreach(var field in command.Payload.EnumerateObject()) {
            if(field.Name=="changeAssignee") continue;
            if(field.Name=="assigneeMemberId" && (!command.Payload.TryGetProperty("changeAssignee",out var change) || change.ValueKind!=JsonValueKind.True)) continue;
            if(field.Value.ValueKind==JsonValueKind.Null && field.Name!="assigneeMemberId") continue;
            if(!baseline.RootElement.TryGetProperty(field.Name,out var original) || !current.Value.TryGetProperty(field.Name,out var latest)) return command;
            if(original.GetRawText()!=latest.GetRawText() && field.Value.GetRawText()!=latest.GetRawText()) return command;
        }
        return command with {BaseRevision=revision};
    }
}
