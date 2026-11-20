using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed record VersionMemberAccess(string MemberId,string DisplayName,string Role,string Permission,string EffectivePermission,bool Locked);
public sealed record MediaFile(string Path,string ContentType,long Length);
public sealed partial class IntegratedWorkspaceService
{
    public const long MaxMediaBytes=20L*1024*1024*1024;
    private static async Task<List<IntegratedMember>> Members(SqliteConnection connection,SqliteTransaction? transaction,string workspace)
    {
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="SELECT id,display_name,role FROM members WHERE workspace_id=$w AND removed_at IS NULL ORDER BY created_at,id";command.Parameters.AddWithValue("$w",workspace);
        var members=new List<IntegratedMember>();await using var reader=await command.ExecuteReaderAsync();
        while(await reader.ReadAsync())members.Add(new(reader.GetString(0),reader.GetString(1),reader.GetString(2)));
        return members;
    }
    public async Task<IReadOnlyList<VersionMemberAccess>> VersionAccessAsync(DeviceIdentity actor,string versionId)
    {
        await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
        var rows=await Read(connection,transaction,actor.WorkspaceId);
        if(!rows.TryGetValue(versionId,out var version)||version.Kind!="version")throw new ArgumentException("版本不存在");
        if(await Access(connection,transaction,actor,version,rows)<4)throw new IntegratedDenied("仅版本管理者可以设置成员权限");
        var result=new List<VersionMemberAccess>();
        foreach(var member in await Members(connection,transaction,actor.WorkspaceId)) {
            var target=new DeviceIdentity(actor.WorkspaceId,member.Id,"",member.DisplayName,member.Role);
            var locked=ProjectManager(target,version,rows)||version.CreatedBy==member.Id;
            await using var query=connection.CreateCommand();query.Transaction=transaction;
            query.CommandText="SELECT permission FROM integrated_version_access WHERE workspace_id=$w AND version_id=$v AND member_id=$m";
            query.Parameters.AddWithValue("$w",actor.WorkspaceId);query.Parameters.AddWithValue("$v",versionId);query.Parameters.AddWithValue("$m",member.Id);
            var permission=Convert.ToString(await query.ExecuteScalarAsync());if(string.IsNullOrEmpty(permission))permission="none";
            result.Add(new(member.Id,member.DisplayName,member.Role,permission,locked?"manage":permission,locked));
        }
        await transaction.CommitAsync();return result;
    }
    private string MediaPath(string workspace,string id)
    {
        if(!Guid.TryParseExact(id,"D",out _))throw new ArgumentException("无效的媒体标识");
        return System.IO.Path.Combine(database.DataDirectory,"media",SecurityHelpers.Hash(workspace),id+".bin");
    }
    public async Task<MediaFile> GetMediaAsync(DeviceIdentity actor,string mediaId)
    {
        var path=MediaPath(actor.WorkspaceId,mediaId);
        await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
        string versionId,contentType;long length;
        await using(var query=connection.CreateCommand()) {
            query.Transaction=transaction;query.CommandText="SELECT version_id,content_type,length FROM integrated_media WHERE workspace_id=$w AND id=$id";
            query.Parameters.AddWithValue("$w",actor.WorkspaceId);query.Parameters.AddWithValue("$id",mediaId);
            await using var reader=await query.ExecuteReaderAsync();if(!await reader.ReadAsync())throw new FileNotFoundException("媒体不存在");
            versionId=reader.GetString(0);contentType=reader.GetString(1);length=reader.GetInt64(2);
        }
        var rows=await Read(connection,transaction,actor.WorkspaceId);
        if(!rows.TryGetValue(versionId,out var version)||version.Fields["file"]?["mediaId"]?.GetValue<string>()!=mediaId)throw new FileNotFoundException("版本已删除或视频已被替换");
        if(await Access(connection,transaction,actor,version,rows)<1)throw new IntegratedDenied("没有查看此视频的权限");
        if(!File.Exists(path))throw new FileNotFoundException("主机上的视频文件缺失，请联系管理员恢复备份");
        await transaction.CommitAsync();return new(path,contentType,length);
    }
    private static JsonObject Descriptor(string id,string name,long length)=>new() { ["mediaId"]=id,["source"]="collaboration",["name"]=name,["bytes"]=length,["size"]=(length/1048576d).ToString("F1",System.Globalization.CultureInfo.InvariantCulture)+" MB" };
    public async Task<JsonObject> PublishMediaAsync(DeviceIdentity actor,string versionId,string uploadId,string name,long revision,string epoch,Stream source,long? contentLength,CancellationToken cancellationToken)
    {
        var finalPath=MediaPath(actor.WorkspaceId,uploadId);
        name=System.IO.Path.GetFileName(name.Replace('\\','/'));
        if(string.IsNullOrWhiteSpace(name)||name.Length>200)throw new ArgumentException("视频名称无效");
        var extension=System.IO.Path.GetExtension(name).ToLowerInvariant();
        var mime=extension switch { ".mp4" or ".m4v"=>"video/mp4", ".webm"=>"video/webm", ".mov"=>"video/quicktime", _=>throw new ArgumentException("请选择 MP4、M4V、WebM 或 MOV 视频；推荐 H.264 MP4") };
        if(contentLength is null or <=0 || contentLength>MaxMediaBytes)throw new ArgumentException("视频大小无效，单个视频最大 20 GB");
        // Do not hold a database lock while a large video transfers.
        await using(var connection=await database.OpenAsync()) {
            if(await Epoch(connection,null,actor.WorkspaceId)!=epoch)throw new IntegratedConflict("空间已恢复，请重新连接后发布视频");
            var rows=await Read(connection,null,actor.WorkspaceId);
            if(!rows.TryGetValue(versionId,out var version)||version.Kind!="version")throw new ArgumentException("版本不存在");
            if(await Access(connection,null,actor,version,rows)<3)throw new IntegratedDenied("需要编辑或管理权限才能发布视频");
            if(version.Fields["file"]?["mediaId"]?.GetValue<string>()==uploadId)return (JsonObject)version.Fields["file"]!.DeepClone();
            if(version.Revision!=revision)throw new IntegratedConflict("版本已发生变化，请刷新后重新发布");
        }
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(finalPath)!);
        var temporary=finalPath+"."+Guid.NewGuid().ToString("N")+".upload";bool moved=false,committed=false;
        await using var reservation=await database.Storage.ReserveAsync(temporary,contentLength.Value,cancellationToken);
        try {
            long length=0;using var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using(var destination=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None,81920,true)) {
                var buffer=new byte[81920];int read;
                while((read=await source.ReadAsync(buffer,cancellationToken))>0) {
                    await reservation.CheckWriteAsync(length,read,cancellationToken);length+=read;if(length>MaxMediaBytes||length>contentLength)throw new ArgumentException("视频超过允许的大小");
                    hash.AppendData(buffer,0,read);await destination.WriteAsync(buffer.AsMemory(0,read),cancellationToken);
                }
                await destination.FlushAsync(cancellationToken);
            }
            if(length!=contentLength)throw new IOException("视频传输不完整，请重试");
            var digest=Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
            using var commitGate=await database.Storage.LockAsync(cancellationToken);
            await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
            var rows=await Read(connection,transaction,actor.WorkspaceId);
            if(await Epoch(connection,transaction,actor.WorkspaceId)!=epoch)throw new IntegratedConflict("空间已恢复，请重新连接");
            if(!rows.TryGetValue(versionId,out var version)||version.Revision!=revision)throw new IntegratedConflict("发布期间版本已改变，请刷新后重试");
            if(await Access(connection,transaction,actor,version,rows)<3)throw new IntegratedDenied("发布期间权限已改变");
            var descriptor=Descriptor(uploadId,name,length);descriptor["publishedBy"]=actor.MemberId;descriptor["publishedByName"]=actor.DisplayName;descriptor["publishedAt"]=SecurityHelpers.Utc(DateTimeOffset.UtcNow);
            await using(var insert=connection.CreateCommand()) {
                insert.Transaction=transaction;insert.CommandText="INSERT INTO integrated_media(workspace_id,id,version_id,name,length,content_type,created_by,created_at,sha256) VALUES($w,$id,$v,$n,$length,$mime,$by,$at,$hash)";
                insert.Parameters.AddWithValue("$w",actor.WorkspaceId);insert.Parameters.AddWithValue("$id",uploadId);insert.Parameters.AddWithValue("$v",versionId);insert.Parameters.AddWithValue("$n",name);insert.Parameters.AddWithValue("$length",length);insert.Parameters.AddWithValue("$mime",mime);insert.Parameters.AddWithValue("$by",actor.MemberId);insert.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));insert.Parameters.AddWithValue("$hash",digest);await insert.ExecuteNonQueryAsync();
            }
            var fields=(JsonObject)version.Fields.DeepClone();fields["file"]=descriptor;fields.Remove("duration");
            await Write(connection,transaction,actor.WorkspaceId,version with {Fields=fields,Revision=version.Revision+1},false);
            await AddEvent(connection,transaction,actor,Ancestor(version,"project",rows)!.Id,version.Id,"发布了视频「"+name+"」");
            File.Move(temporary,finalPath,false);moved=true;await transaction.CommitAsync();committed=true;return descriptor;
        } finally {
            if(File.Exists(temporary))File.Delete(temporary);
            if(moved&&!committed&&File.Exists(finalPath))File.Delete(finalPath);
        }
    }
}
