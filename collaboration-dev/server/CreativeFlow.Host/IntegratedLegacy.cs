using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
namespace CreativeFlow.Host;
public sealed partial class IntegratedWorkspaceService
{
    // Explicit maintenance command: preserves the old tables and original files.
    // Re-running never overwrites a record already edited in the integrated app.
    public async Task<int> MigrateLegacyAsync()
    {
        await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
        string Id(string kind,string id)=>"legacy-"+kind+"-"+SecurityHelpers.Hash(id)[..24];
        var count=0;
        async Task Import(string table,string kind,string? parentKind,string? parentColumn,string[] columns)
        {
            var values=new List<(string Workspace,IntegratedEntity Entity)>();
            await using(var query=connection.CreateCommand()) {
                query.Transaction=transaction;query.CommandText="SELECT * FROM "+table+" WHERE deleted_at IS NULL ORDER BY created_at,id";
                await using var reader=await query.ExecuteReaderAsync();int order=0;
                while(await reader.ReadAsync()) {
                    string S(string key)=>reader.IsDBNull(reader.GetOrdinal(key))?"":reader.GetString(reader.GetOrdinal(key));
                    var fields=new JsonObject();foreach(var column in columns)fields[column]=S(column);
                    if(kind=="version"){fields["createdAt"]=S("created_date");fields["file"]=null;}
                    if(kind=="project"||kind=="task")fields["defaultColor"]=S("color");
                    if(kind=="opinion"){var done=!reader.IsDBNull(reader.GetOrdinal("completed_at"));fields["done"]=done;fields["status"]=done?"done":"todo";fields["time"]=S("timecode");}
                    values.Add((S("workspace_id"),new(kind,Id(kind,S("id")),parentKind is null?null:Id(parentKind,S(parentColumn!)),order++,fields,1,S("created_by"))));
                }
            }
            foreach(var value in values) {
                await using var check=connection.CreateCommand();check.Transaction=transaction;
                check.CommandText="SELECT COUNT(*) FROM integrated_entities WHERE workspace_id=$w AND id=$id";check.Parameters.AddWithValue("$w",value.Workspace);check.Parameters.AddWithValue("$id",value.Entity.Id);
                if(Convert.ToInt64(await check.ExecuteScalarAsync())>0)continue;
                if(value.Entity.ParentId is not null){check.CommandText="SELECT COUNT(*) FROM integrated_entities WHERE workspace_id=$w AND id=$parent AND deleted_at IS NULL";check.Parameters.AddWithValue("$parent",value.Entity.ParentId);if(Convert.ToInt64(await check.ExecuteScalarAsync())!=1)continue;}
                await Write(connection,transaction,value.Workspace,value.Entity,false);count++;
            }
        }
        await Import("projects","project",null,null,["name","description","status","type","start","due","color"]);
        await Import("tasks","task","project","project_id",["name","status","type","start","due","color"]);
        await Import("versions","version","task","task_id",["name","status"]);
        await Import("feedback_lists","list","version","version_id",["name"]);
        await Import("feedback_items","opinion","list","list_id",["text"]);
        await transaction.CommitAsync();return count;
    }
}
