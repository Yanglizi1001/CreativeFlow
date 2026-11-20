using System.Text.Json;
using System.Text.Json.Nodes;
namespace CreativeFlow.Host;

public sealed class StorageManagement(CollaborationDatabase database)
{
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    private sealed record Row(string Id,string Workspace,string Version,string Name,long Bytes,string Path,string Project,string VersionName,bool Referenced,bool Deleted);
    private async Task<List<Row>> InventoryAsync(){
        await new IntegratedWorkspaceService(database).InitializeAsync();
        await using var c=await database.OpenAsync();var entities=new Dictionary<string,(string Kind,string? Parent,JsonObject Fields,bool Deleted)>();
        await using(var q=c.CreateCommand()){q.CommandText="SELECT workspace_id,id,kind,parent_id,fields,deleted_at FROM integrated_entities";await using var reader=await q.ExecuteReaderAsync();while(await reader.ReadAsync())entities[reader.GetString(0)+":"+reader.GetString(1)]=(reader.GetString(2),reader.IsDBNull(3)?null:reader.GetString(3),JsonNode.Parse(reader.GetString(4))!.AsObject(),!reader.IsDBNull(5));}
        var rows=new List<Row>();
        await using(var q=c.CreateCommand()){q.CommandText="SELECT workspace_id,id,version_id,name,length FROM integrated_media";await using var reader=await q.ExecuteReaderAsync();while(await reader.ReadAsync()){
            var workspace=reader.GetString(0);var id=reader.GetString(1);var version=reader.GetString(2);if(!Guid.TryParseExact(id,"D",out _))continue;
            var path=System.IO.Path.Combine(database.DataDirectory,"media",SecurityHelpers.Hash(workspace),id+".bin");
            var found=entities.TryGetValue(workspace+":"+version,out var entity);var referenced=found&&entity.Fields["file"]?["mediaId"]?.GetValue<string>()==id;
            var project="未关联项目";var cursor=entity;var visits=new HashSet<string>();
            while(found){if(cursor.Kind=="project"){project=cursor.Fields["name"]?.GetValue<string>()??"未命名项目";break;}if(cursor.Parent==null||!visits.Add(cursor.Parent))break;found=entities.TryGetValue(workspace+":"+cursor.Parent,out cursor);}
            rows.Add(new(id,workspace,version,reader.GetString(3),StorageBudget.Length(path),path,project,entity.Fields?["name"]?.GetValue<string>()??"已移除版本",referenced,entity.Deleted));
        }}
        var hashes=new Dictionary<string,string>();await using(var q=c.CreateCommand()){q.CommandText="SELECT id FROM workspaces";await using var reader=await q.ExecuteReaderAsync();while(await reader.ReadAsync())hashes[SecurityHelpers.Hash(reader.GetString(0))]=reader.GetString(0);}
        var known=rows.Select(row=>row.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var file in database.Storage.Files()){
            if(file.Extension!=".bin"||known.Contains(file.FullName)||!Guid.TryParseExact(System.IO.Path.GetFileNameWithoutExtension(file.Name),"D",out _))continue;
            var parent=System.IO.Path.GetDirectoryName(file.FullName)!;var hash=System.IO.Path.GetFileName(parent);
            if(hashes.TryGetValue(hash,out var workspace)&&System.IO.Path.GetDirectoryName(parent)==System.IO.Path.Combine(database.DataDirectory,"media"))rows.Add(new(System.IO.Path.GetFileNameWithoutExtension(file.Name),workspace,"",file.Name,file.Length,file.FullName,"未完成发布的文件","无版本引用",false,false));
        }
        return rows;
    }
    public async Task<JsonObject> StatusAsync(){
        var rows=await InventoryAsync();var usage=await database.Storage.UsageAsync();long videos=0,backups=0,db=0,other=0;
        foreach(var file in database.Storage.Files()){var relative=System.IO.Path.GetRelativePath(database.DataDirectory,file.FullName).Replace('\\','/');var bytes=StorageBudget.Length(file.FullName);if(relative.StartsWith("media/",StringComparison.Ordinal))videos+=bytes;else if(relative.StartsWith("backups/",StringComparison.Ordinal))backups+=bytes;else if(relative=="creativeflow-host.db"||relative.StartsWith("creativeflow-host.db-",StringComparison.Ordinal))db+=bytes;else other+=bytes;}
        return new(){["usage"]=JsonSerializer.SerializeToNode(usage,Json),["categories"]=new JsonObject{["videos"]=videos,["database"]=db,["backups"]=backups,["other"]=other},
            ["files"]=JsonSerializer.SerializeToNode(rows.Select(row=>new {id=row.Id,name=row.Name,bytes=row.Bytes,project=row.Project,version=row.VersionName,canClean=!row.Referenced,state=row.Referenced?(row.Deleted?"回收站保留":"版本保留"):"已被替换、无版本引用"}),Json)};
    }
    public async Task<JsonObject> CleanupAsync(JsonObject request){
        if(request["confirmation"]?.GetValue<string>()!="清理无引用视频")throw new ArgumentException("请确认清理范围");
        var ids=request["ids"]?.AsArray().Select(value=>value!.GetValue<string>()).Distinct().ToArray()??[];if(ids.Length is 0 or >500)throw new ArgumentException("请选择 1 至 500 个无引用视频");
        long freed=0;
        using(var gate=await database.Storage.LockAsync()){
            // Upload admission uses this same cross-process lock. Existing transfers
            // must finish first, so a publication cannot acquire a file being cleaned.
            var reservations=System.IO.Path.Combine(database.DataDirectory,"storage-reservations.json");
            if(File.Exists(reservations)&&JsonNode.Parse(File.ReadAllText(reservations))!.AsArray().Count>0)throw new IOException("有上传或备份正在进行，请完成后再清理");
            var rows=await InventoryAsync();var selected=ids.Select(id=>rows.FirstOrDefault(row=>row.Id==id)??throw new ArgumentException("清理列表已变化，请刷新")).ToArray();
            if(selected.Any(row=>row.Referenced))throw new ArgumentException("所选视频仍被版本或回收站引用，不能清理");
            await using var c=await database.OpenAsync();await using var tx=c.BeginTransaction();
            foreach(var row in selected){
                if(File.Exists(row.Path)){if((File.GetAttributes(row.Path)&FileAttributes.ReparsePoint)!=0)throw new IOException("视频路径不能是链接");freed+=new FileInfo(row.Path).Length;File.Delete(row.Path);}
                await using var q=c.CreateCommand();q.Transaction=tx;q.CommandText="DELETE FROM integrated_media WHERE workspace_id=$w AND id=$id";q.Parameters.AddWithValue("$w",row.Workspace);q.Parameters.AddWithValue("$id",row.Id);await q.ExecuteNonQueryAsync();
            }
            await tx.CommitAsync();
        }
        return new(){["freedBytes"]=freed,["storage"]=await StatusAsync()};
    }
}
