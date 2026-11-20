using System.Text.Json.Nodes;
namespace CreativeFlow.Host;

public sealed record DeletedVersion(string Id,string Name,string ProjectName,string TaskName,string DeletedAt,string DeletedBy,bool CanRestore,string Reason);
public sealed partial class IntegratedWorkspaceService
{
    private static int VersionSequence(IntegratedEntity task,IEnumerable<IntegratedEntity> rows)
    {
        var maximum=task.Fields["versionSequence"]?.GetValue<int>()??0;
        foreach(var row in rows.Where(r=>r.Kind=="version"&&r.ParentId==task.Id))
            if(int.TryParse(new string((row.Fields["name"]?.GetValue<string>()??"").Where(char.IsAsciiDigit).ToArray()),out var number))maximum=Math.Max(maximum,number);
        return maximum;
    }
    public async Task DeleteVersionAsync(DeviceIdentity actor,string versionId,IntegratedBatch batch)
    {
        if(batch.Commands is null||batch.Commands.Count is <1 or >5000||batch.Commands.Any(c=>c.Type!="delete")||batch.Commands.Count(c=>c.Kind=="version"&&c.Id==versionId)!=1)
            throw new ArgumentException("删除请求必须仅包含该版本及其意见");
        await using(var connection=await database.OpenAsync()) {
            var all=await Read(connection,null,actor.WorkspaceId,true);
            if(!all.TryGetValue(versionId,out var version)||version.Kind!="version")throw new IntegratedConflict("版本不存在或已被删除");
            if(await Access(connection,null,actor,version,all)<4)throw new IntegratedDenied("需要此版本的可管理权限才能删除");
            foreach(var change in batch.Commands)
                if(!all.TryGetValue(change.Id,out var row)||Ancestor(row,"version",all)?.Id!=versionId)throw new ArgumentException("不能通过版本删除操作修改其他内容");
        }
        // ApplyAsync checks every expected record and missing child within one transaction.
        // A newly submitted opinion makes the whole deletion fail; nothing is partly deleted.
        await ApplyAsync(actor,batch);
    }
    public async Task<IReadOnlyList<DeletedVersion>> VersionTrashAsync(DeviceIdentity actor)
    {
        await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
        var all=await Read(connection,transaction,actor.WorkspaceId,true);var active=await Read(connection,transaction,actor.WorkspaceId);
        var members=(await Members(connection,transaction,actor.WorkspaceId)).ToDictionary(m=>m.Id,m=>m.DisplayName);
        var deleted=new List<(string Id,string At,string By)>();
        await using(var q=connection.CreateCommand()) {q.Transaction=transaction;q.CommandText="SELECT e.id,d.at,d.deleted_by FROM integrated_entities e JOIN integrated_deletions d ON e.workspace_id=d.workspace_id AND e.id=d.entity_id WHERE e.workspace_id=$w AND e.kind='version' AND e.deleted_at IS NOT NULL ORDER BY d.at DESC";q.Parameters.AddWithValue("$w",actor.WorkspaceId);await using var r=await q.ExecuteReaderAsync();while(await r.ReadAsync())deleted.Add((r.GetString(0),r.GetString(1),r.GetString(2)));}
        var result=new List<DeletedVersion>();
        foreach(var record in deleted) {
            var v=all[record.Id];var level=await Access(connection,transaction,actor,v,all);if(level<1)continue;
            var task=Ancestor(v,"task",all);var project=Ancestor(v,"project",all);var parentActive=task is not null&&active.ContainsKey(task.Id)&&project is not null&&active.ContainsKey(project.Id);
            var duplicate=active.Values.Any(r=>r.Kind=="version"&&r.ParentId==v.ParentId&&string.Equals(r.Fields["name"]?.GetValue<string>()?.Trim(),v.Fields["name"]?.GetValue<string>()?.Trim(),StringComparison.OrdinalIgnoreCase));
            var reason=!parentActive?"请先恢复所属项目或任务":level<4?"需要此版本的可管理权限":duplicate?"已有同名版本，请先重命名现有版本":"";
            result.Add(new(v.Id,v.Fields["name"]!.GetValue<string>(),project?.Fields["name"]?.GetValue<string>()??"原项目",task?.Fields["name"]?.GetValue<string>()??"原任务",record.At,members.GetValueOrDefault(record.By,"已离开的成员"),reason.Length==0,reason));
        }
        await transaction.CommitAsync();return result;
    }
    public async Task RestoreVersionAsync(DeviceIdentity actor,string versionId)
    {
        List<IntegratedChange> changes=[];string epoch;
        await using(var connection=await database.OpenAsync()) {
            await using var transaction=connection.BeginTransaction();var all=await Read(connection,transaction,actor.WorkspaceId,true);var active=await Read(connection,transaction,actor.WorkspaceId);
            if(!all.TryGetValue(versionId,out var version)||version.Kind!="version")throw new ArgumentException("版本不存在");
            if(active.ContainsKey(versionId))throw new IntegratedConflict("该版本已恢复，请刷新查看");
            if(await Access(connection,transaction,actor,version,all)<4)throw new IntegratedDenied("需要此版本的可管理权限才能恢复");
            if(version.ParentId is null||!active.ContainsKey(version.ParentId))throw new IntegratedConflict("请先恢复所属项目或任务");
            if(active.Values.Any(r=>r.Kind=="version"&&r.ParentId==version.ParentId&&string.Equals(r.Fields["name"]?.GetValue<string>()?.Trim(),version.Fields["name"]?.GetValue<string>()?.Trim(),StringComparison.OrdinalIgnoreCase)))throw new IntegratedConflict("已有同名版本，请先重命名现有版本");
            var ids=new HashSet<string>();await using(var q=connection.CreateCommand()){q.Transaction=transaction;q.CommandText="SELECT entity_id FROM integrated_deletions WHERE workspace_id=$w AND operation_id=(SELECT operation_id FROM integrated_deletions WHERE workspace_id=$w AND entity_id=$id)";q.Parameters.AddWithValue("$w",actor.WorkspaceId);q.Parameters.AddWithValue("$id",versionId);await using var r=await q.ExecuteReaderAsync();while(await r.ReadAsync())ids.Add(r.GetString(0));}
            if(!ids.Contains(versionId))throw new IntegratedConflict("旧版删除记录不支持单独恢复，请从主机备份恢复");
            foreach(var row in all.Values.Where(r=>ids.Contains(r.Id)&&Ancestor(r,"version",all)?.Id==versionId).OrderBy(r=>r.Kind switch {"version"=>0,"list"=>1,_=>2}))changes.Add(new("restore",row.Kind,row.Id,row.ParentId,row.Order,(JsonObject)row.Fields.DeepClone(),(JsonObject)row.Fields.DeepClone(),row.Revision));
            epoch=await Epoch(connection,transaction,actor.WorkspaceId);await transaction.CommitAsync();
        }
        await ApplyAsync(actor,new(Guid.NewGuid().ToString("N"),epoch,changes));
    }
}
