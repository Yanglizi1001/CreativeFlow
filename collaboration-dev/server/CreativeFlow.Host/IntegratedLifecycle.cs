using System.Text.Json.Nodes;
namespace CreativeFlow.Host;
public sealed record DeletedProject(string Id,string Name,string DeletedAt,bool CanRestore);
public sealed partial class IntegratedWorkspaceService
{
    public async Task<IReadOnlyList<DeletedProject>> TrashAsync(DeviceIdentity actor)
    {
        await using var connection=await database.OpenAsync();await using var command=connection.CreateCommand();
        command.CommandText="SELECT e.id,e.fields,e.deleted_at,d.operation_id FROM integrated_entities e LEFT JOIN integrated_deletions d ON e.workspace_id=d.workspace_id AND e.id=d.entity_id WHERE e.workspace_id=$w AND e.kind='project' AND e.deleted_at IS NOT NULL AND ($owner=1 OR e.created_by=$m) ORDER BY e.deleted_at DESC";
        command.Parameters.AddWithValue("$w",actor.WorkspaceId);command.Parameters.AddWithValue("$owner",actor.Role=="owner"?1:0);command.Parameters.AddWithValue("$m",actor.MemberId);
        var result=new List<DeletedProject>();await using var reader=await command.ExecuteReaderAsync();
        while(await reader.ReadAsync())result.Add(new(reader.GetString(0),JsonNode.Parse(reader.GetString(1))!["name"]!.GetValue<string>(),reader.GetString(2),!reader.IsDBNull(3)));
        return result;
    }
    public async Task RestoreProjectAsync(DeviceIdentity actor,string projectId)
    {
        List<IntegratedChange> changes=[];string epoch;
        await using(var connection=await database.OpenAsync()) {
            await using var transaction=connection.BeginTransaction();var all=await Read(connection,transaction,actor.WorkspaceId,true);
            if(!all.TryGetValue(projectId,out var project)||project.Kind!="project")throw new ArgumentException("项目不存在");
            if(actor.Role!="owner"&&project.CreatedBy!=actor.MemberId)throw new IntegratedDenied("仅项目创建者或空间所有者可恢复项目");
            await using var query=connection.CreateCommand();query.Transaction=transaction;
            query.CommandText="SELECT entity_id FROM integrated_deletions WHERE workspace_id=$w AND operation_id=(SELECT operation_id FROM integrated_deletions WHERE workspace_id=$w AND entity_id=$id)";
            query.Parameters.AddWithValue("$w",actor.WorkspaceId);query.Parameters.AddWithValue("$id",projectId);
            var ids=new HashSet<string>();await using(var reader=await query.ExecuteReaderAsync())while(await reader.ReadAsync())ids.Add(reader.GetString(0));
            if(!ids.Contains(projectId))throw new IntegratedConflict("该项目属于旧版删除记录，请从主机备份恢复");
            foreach(var row in all.Values.Where(row=>ids.Contains(row.Id)&&Ancestor(row,"project",all)?.Id==projectId).OrderBy(row=>row.Kind switch {"project"=>0,"task"=>1,"version"=>2,"list"=>3,_=>4}))
                changes.Add(new("restore",row.Kind,row.Id,row.ParentId,row.Order,(JsonObject)row.Fields.DeepClone(),(JsonObject)row.Fields.DeepClone(),row.Revision));
            epoch=await Epoch(connection,transaction,actor.WorkspaceId);await transaction.CommitAsync();
        }
        await ApplyAsync(actor,new(Guid.NewGuid().ToString("N"),epoch,changes));
    }
}
