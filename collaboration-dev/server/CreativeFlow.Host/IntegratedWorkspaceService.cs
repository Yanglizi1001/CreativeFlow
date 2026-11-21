using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed record IntegratedEntity(string Kind, string Id, string? ParentId, int Order, JsonObject Fields, long Revision, string CreatedBy, string Permission="manage", string CreatorName="");
public sealed record IntegratedChange(string Type, string Kind, string Id, string? ParentId, int Order, JsonObject? Fields, JsonObject? Expected, long Revision);
public sealed record IntegratedBatch(string OperationId, string Epoch, IReadOnlyList<IntegratedChange> Commands);
public sealed record IntegratedActivity(string Id,string ProjectId,string At,string Text,string? VersionId=null);
public sealed record IntegratedSnapshot(string Epoch, IReadOnlyList<IntegratedEntity> Entities, IReadOnlyList<IntegratedMember> Members,IReadOnlyList<IntegratedActivity>? Activities=null);
public sealed record IntegratedMember(string Id,string DisplayName,string Role);
public sealed record VersionAccessRequest(string MemberId, string Permission, string? ExpectedPermission=null);
public sealed class IntegratedConflict(string message) : Exception(message);
public sealed class IntegratedDenied(string message) : Exception(message);

// Separate tables are deliberate: the earlier collaboration prototype has fewer
// fields than beta3. Never down-convert beta3 data into those legacy tables.
public sealed partial class IntegratedWorkspaceService(CollaborationDatabase database)
{
    private static readonly Dictionary<string, string[]> Fields = new() {
        ["project"] = ["name","description","notes","status","type","start","due","color","defaultColor","archived"],
        ["task"] = ["versionSequence","name","description","notes","status","type","start","due","color","defaultColor"],
        ["version"] = ["name","status","createdAt","file","duration"],
        ["list"] = ["name"], ["opinion"] = ["text","time","done","status","createdAt","updatedAt","statusChangedAt","timeOrigin","inheritedFrom","sourceCreatedAt"],
        ["preferences"] = ["customOptions","tagColors"]
    };
    private static readonly Dictionary<string,string> ParentKinds = new() { ["task"]="project",["version"]="task",["list"]="version",["opinion"]="list" };
    private static readonly Dictionary<string,int> Levels = new() { ["none"]=0,["view"]=1,["comment"]=2,["edit"]=3,["manage"]=4 };

    public async Task InitializeAsync()
    {
        await using var connection=await database.OpenAsync();
        await using var command=connection.CreateCommand();
        command.CommandText="""
          CREATE TABLE IF NOT EXISTS integrated_entities (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL,
            kind TEXT NOT NULL, parent_id TEXT, sort_order INTEGER NOT NULL,
            fields TEXT NOT NULL, revision INTEGER NOT NULL, created_by TEXT NOT NULL,
            deleted_at TEXT, PRIMARY KEY(workspace_id,id));
          CREATE TABLE IF NOT EXISTS integrated_commits (
            workspace_id TEXT NOT NULL, operation_id TEXT NOT NULL, member_id TEXT NOT NULL,
            device_id TEXT NOT NULL, payload TEXT NOT NULL, at TEXT NOT NULL,
            PRIMARY KEY(workspace_id,operation_id));
          CREATE TABLE IF NOT EXISTS integrated_version_access (
            workspace_id TEXT NOT NULL, version_id TEXT NOT NULL, member_id TEXT NOT NULL,
            permission TEXT NOT NULL, PRIMARY KEY(workspace_id,version_id,member_id));
          CREATE TABLE IF NOT EXISTS integrated_media (
            workspace_id TEXT NOT NULL, id TEXT NOT NULL, version_id TEXT NOT NULL,
            name TEXT NOT NULL, length INTEGER NOT NULL, content_type TEXT NOT NULL,
            created_by TEXT NOT NULL, created_at TEXT NOT NULL, sha256 TEXT NOT NULL,
            PRIMARY KEY(workspace_id,id));
          CREATE TABLE IF NOT EXISTS integrated_deletions (
            workspace_id TEXT NOT NULL,entity_id TEXT NOT NULL,operation_id TEXT NOT NULL,
            deleted_by TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(workspace_id,entity_id));
          CREATE TABLE IF NOT EXISTS integrated_events (
            id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,
            version_id TEXT,member_id TEXT NOT NULL,at TEXT NOT NULL,text TEXT NOT NULL);
          """;
        await command.ExecuteNonQueryAsync();
    }
    private static async Task<string> Epoch(SqliteConnection connection, SqliteTransaction? transaction, string workspace)
    {
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="SELECT epoch FROM workspaces WHERE id=$w";command.Parameters.AddWithValue("$w",workspace);
        return Convert.ToString(await command.ExecuteScalarAsync()) ?? throw new IntegratedDenied("空间不存在");
    }
    private static async Task<Dictionary<string,IntegratedEntity>> Read(SqliteConnection connection, SqliteTransaction? transaction, string workspace,bool includeDeleted=false)
    {
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="SELECT kind,id,parent_id,sort_order,fields,revision,created_by FROM integrated_entities WHERE workspace_id=$w"+(includeDeleted?"":" AND deleted_at IS NULL");
        command.Parameters.AddWithValue("$w",workspace);await using var reader=await command.ExecuteReaderAsync();
        var result=new Dictionary<string,IntegratedEntity>();
        while(await reader.ReadAsync()) {
            var row=new IntegratedEntity(reader.GetString(0),reader.GetString(1),reader.IsDBNull(2)?null:reader.GetString(2),reader.GetInt32(3),JsonNode.Parse(reader.GetString(4))!.AsObject(),reader.GetInt64(5),reader.GetString(6));
            result.Add(row.Id,row);
        }
        return result;
    }
    private static IntegratedEntity? Ancestor(IntegratedEntity entity, string kind, Dictionary<string,IntegratedEntity> rows)
    {
        for(int depth=0;depth<6;depth++) {
            if(entity.Kind==kind)return entity;
            if(entity.ParentId is null || !rows.TryGetValue(entity.ParentId,out var parent)) return null;
            entity=parent;
        }
        return null;
    }
    private static bool ProjectManager(DeviceIdentity actor, IntegratedEntity row, Dictionary<string,IntegratedEntity> rows) =>
        actor.Role=="owner" || Ancestor(row,"project",rows)?.CreatedBy==actor.MemberId;
    private static bool WorkEquals(string kind,JsonObject left,JsonObject right) {
        if(kind=="opinion"){var x=(JsonObject)left.DeepClone();var y=(JsonObject)right.DeepClone();foreach(var key in OpinionMetadata){x.Remove(key);y.Remove(key);}return JsonNode.DeepEquals(x,y);}
        if(kind=="task"){var x=(JsonObject)left.DeepClone();var y=(JsonObject)right.DeepClone();x.Remove("versionSequence");y.Remove("versionSequence");return JsonNode.DeepEquals(x,y);}
        if(kind!="version")return JsonNode.DeepEquals(left,right);
        var a=(JsonObject)left.DeepClone();var b=(JsonObject)right.DeepClone();a.Remove("duration");b.Remove("duration");return JsonNode.DeepEquals(a,b);
    }

    private static async Task<int> Access(SqliteConnection connection,SqliteTransaction? transaction,DeviceIdentity actor,IntegratedEntity row,Dictionary<string,IntegratedEntity> rows)
    {
        if(ProjectManager(actor,row,rows)) return 4;
        var version=Ancestor(row,"version",rows);
        if(version is null) return 1;
        if(version.CreatedBy==actor.MemberId) return 4;
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="SELECT permission FROM integrated_version_access WHERE workspace_id=$w AND version_id=$v AND member_id=$m";
        command.Parameters.AddWithValue("$w",actor.WorkspaceId);command.Parameters.AddWithValue("$v",version.Id);command.Parameters.AddWithValue("$m",actor.MemberId);
        var permission=Convert.ToString(await command.ExecuteScalarAsync());
        // Versions are private until the manager explicitly grants access.
        return permission is not null && Levels.TryGetValue(permission,out var level)?level:0;
    }
    public async Task<IntegratedSnapshot> SnapshotAsync(DeviceIdentity actor)
    {
        await using var connection=await database.OpenAsync();
        await using var transaction=connection.BeginTransaction();
        var rows=await Read(connection,transaction,actor.WorkspaceId);
        var all=await Read(connection,transaction,actor.WorkspaceId,true);
        var visible=new List<IntegratedEntity>();
        var members=await Members(connection,transaction,actor.WorkspaceId);
        var names=members.ToDictionary(member=>member.Id,member=>member.DisplayName);var accessCache=new Dictionary<string,int>();
        foreach(var row in rows.Values) {
            var version=Ancestor(row,"version",rows);var key=version is not null?"version:"+version.Id:"metadata:"+(Ancestor(row,"project",rows)?.Id??row.Id);
            if(!accessCache.TryGetValue(key,out var access)){access=await Access(connection,transaction,actor,row,rows);accessCache[key]=access;}
            if(access>0&&row.Kind=="task")row.Fields["versionSequence"]=VersionSequence(row,all.Values);
            if(access>0) visible.Add(row with {Permission=Levels.First(pair=>pair.Value==access).Key,CreatorName=names.GetValueOrDefault(row.CreatedBy,"已离开的成员")});
        }
        var epoch=await Epoch(connection,transaction,actor.WorkspaceId);
        var activities=new List<IntegratedActivity>();var visibleIds=visible.Select(row=>row.Id).ToHashSet();
        await using(var query=connection.CreateCommand()) {
            query.Transaction=transaction;query.CommandText="SELECT id,project_id,version_id,at,text FROM integrated_events WHERE workspace_id=$w ORDER BY at DESC LIMIT 200";query.Parameters.AddWithValue("$w",actor.WorkspaceId);
            var records=new List<(string Id,string Project,string? Version,string At,string Text)>();
            await using(var reader=await query.ExecuteReaderAsync())while(await reader.ReadAsync())records.Add((reader.GetString(0),reader.GetString(1),reader.IsDBNull(2)?null:reader.GetString(2),reader.GetString(3),reader.GetString(4)));
            foreach(var record in records){if(!visibleIds.Contains(record.Project))continue;var allowed=record.Version is null||visibleIds.Contains(record.Version);if(!allowed&&record.Version is not null&&record.Text.Contains("删除了版本")&&all.TryGetValue(record.Version,out var deleted))allowed=await Access(connection,transaction,actor,deleted,all)>0;if(allowed)activities.Add(new(record.Id,record.Project,record.At,record.Text,record.Version));}
        }
        await transaction.CommitAsync();
        return new(epoch,visible,members,activities);
    }
    private static void Validate(IntegratedChange change)
    {
        if(!Fields.TryGetValue(change.Kind,out var allowed) || string.IsNullOrWhiteSpace(change.Id) || change.Id.Length>150 || change.Order<0)
            throw new ArgumentException("无效的数据类型或标识");
        if(change.Id=="workspace-preferences"&&change.Kind!="preferences")throw new ArgumentException("该标识保留给空间设置");
        if(change.Type is not ("create" or "update" or "delete" or "restore"))throw new ArgumentException("无效的操作类型");
        if(change.Fields is not null && change.Fields.Any(pair=>!allowed.Contains(pair.Key)))throw new ArgumentException("包含不支持的字段");
        if(change.Type=="create" || change.Type=="update") {
            if(change.Fields is null)throw new ArgumentException("缺少字段");
            foreach(var pair in change.Fields) {
                if(pair.Value is null)continue;
                if(pair.Key is "done" or "archived") {if(pair.Value is not JsonValue b||!b.TryGetValue<bool>(out _))throw new ArgumentException("无效的完成或归档状态");}
                else if(change.Kind=="opinion"&&pair.Key is "createdAt" or "updatedAt" or "statusChangedAt" or "sourceCreatedAt") {if(pair.Value is not JsonValue date||!date.TryGetValue<string>(out _)||!OpinionTime(pair.Value,out _))throw new ArgumentException("无效的意见时间");}
                else if(pair.Key=="versionSequence") {if(change.Kind!="task"||pair.Value is not JsonValue seq||!seq.TryGetValue<int>(out var number)||number<0)throw new ArgumentException("无效的版本序号");}
                else if(pair.Key=="duration") {if(pair.Value is not JsonValue n||!n.TryGetValue<double>(out var duration)||duration<0)throw new ArgumentException("无效的时长");}
                else if(pair.Key=="file")throw new ArgumentException("请通过发布视频功能关联协作媒体，不能同步本机路径");
                else if(pair.Key is "customOptions" or "tagColors") {if(pair.Value is not JsonObject)throw new ArgumentException("无效的配置");}
                else if(pair.Value is not JsonValue v||!v.TryGetValue<string>(out var text)||text.Length>100000)throw new ArgumentException("无效的文字字段");
            }
            if(change.Type=="create" && change.Kind!="preferences") {
                var key=change.Kind=="opinion"?"text":"name";
                if(string.IsNullOrWhiteSpace(change.Fields[key]?.GetValue<string>()))throw new ArgumentException("名称或意见不能为空");
                if(change.Kind=="opinion" && change.Fields["done"] is null)throw new ArgumentException("缺少完成状态");
            }
        }
    }
    public async Task ApplyAsync(DeviceIdentity actor,IntegratedBatch batch)
    {
        if(string.IsNullOrWhiteSpace(batch.OperationId)||batch.OperationId.Length>150||batch.Commands is null||batch.Commands.Count is <1 or >5000)throw new ArgumentException("操作数量或标识无效");
        foreach(var change in batch.Commands)Validate(change);
        await using var connection=await database.OpenAsync();
        await using var transaction=connection.BeginTransaction();
        if(await Epoch(connection,transaction,actor.WorkspaceId)!=batch.Epoch)throw new IntegratedConflict("空间已恢复备份，请重新连接后核对数据");
        var payload=JsonSerializer.Serialize(batch);
        await using(var dedup=connection.CreateCommand()) {
            dedup.Transaction=transaction;dedup.CommandText="SELECT member_id,device_id,payload FROM integrated_commits WHERE workspace_id=$w AND operation_id=$o";
            dedup.Parameters.AddWithValue("$w",actor.WorkspaceId);dedup.Parameters.AddWithValue("$o",batch.OperationId);
            await using var reader=await dedup.ExecuteReaderAsync();
            if(await reader.ReadAsync()) {
                if(reader.GetString(0)!=actor.MemberId || reader.GetString(1)!=actor.DeviceId || reader.GetString(2)!=payload)throw new IntegratedConflict("重复操作标识对应了不同的内容");
                return;
            }
        }
        var rows=await Read(connection,transaction,actor.WorkspaceId);
        var events=new Dictionary<string,(string Project,string? Version,string Text)>();
        foreach(var change in batch.Commands) {
            rows.TryGetValue(change.Id,out var existing);
            if(change.Type=="restore") {
                if(existing is not null)throw new IntegratedConflict("内容已经恢复，请刷新后查看");
                var all=await Read(connection,transaction,actor.WorkspaceId,true);
                if(!all.TryGetValue(change.Id,out var deleted)||deleted.Kind!=change.Kind)throw new IntegratedConflict("没有可恢复的内容");
                if(deleted.ParentId is not null&&!rows.ContainsKey(deleted.ParentId))throw new IntegratedConflict("请先恢复所属项目或父级内容");
                if(change.Expected is not null?!WorkEquals(deleted.Kind,deleted.Fields,change.Expected):deleted.Revision!=change.Revision)throw new IntegratedConflict("删除记录已改变，无法自动恢复");
                rows[deleted.Id]=deleted;
                var needed=deleted.Kind=="opinion"&&deleted.CreatedBy==actor.MemberId?2:deleted.Kind is "project" or "task" or "version" or "preferences"?4:3;
                if(await Access(connection,transaction,actor,deleted,rows)<needed)throw new IntegratedDenied("没有恢复此内容的权限");
                if(deleted.Kind=="version"&&rows.Values.Any(r=>r.Id!=deleted.Id&&r.Kind=="version"&&r.ParentId==deleted.ParentId&&string.Equals(r.Fields["name"]?.GetValue<string>()?.Trim(),deleted.Fields["name"]?.GetValue<string>()?.Trim(),StringComparison.OrdinalIgnoreCase)))throw new IntegratedConflict("已有同名版本，请先重命名现有版本");
                await using var restore=connection.CreateCommand();restore.Transaction=transaction;restore.CommandText="UPDATE integrated_entities SET deleted_at=NULL,revision=revision+1 WHERE workspace_id=$w AND id=$id AND deleted_at IS NOT NULL";
                restore.Parameters.AddWithValue("$w",actor.WorkspaceId);restore.Parameters.AddWithValue("$id",deleted.Id);if(await restore.ExecuteNonQueryAsync()!=1)throw new IntegratedConflict("内容已恢复");
                await using(var clear=connection.CreateCommand()){clear.Transaction=transaction;clear.CommandText="DELETE FROM integrated_deletions WHERE workspace_id=$w AND entity_id=$id";clear.Parameters.AddWithValue("$w",actor.WorkspaceId);clear.Parameters.AddWithValue("$id",deleted.Id);await clear.ExecuteNonQueryAsync();}
                rows[deleted.Id]=deleted with {Revision=deleted.Revision+1};
            } else if(change.Type=="create") {
                if(existing is not null)throw new IntegratedConflict("该记录已存在");
                IntegratedEntity? parent=null;
                if(ParentKinds.TryGetValue(change.Kind,out var required)) {
                    if(change.ParentId is null || !rows.TryGetValue(change.ParentId,out parent)||parent.Kind!=required)throw new ArgumentException("父级记录不存在或类型错误");
                } else if(change.ParentId is not null)throw new ArgumentException("顶级记录不允许设置父级");
                if(change.Kind=="preferences" && change.Id!="workspace-preferences")throw new ArgumentException("配置标识错误");
                if(change.Kind is "project" or "preferences") {
                    if(actor.Role=="reviewer" || (change.Kind=="preferences"&&actor.Role!="owner"))throw new IntegratedDenied("没有创建权限");
                } else {
                    var needed=change.Kind is "opinion" or "list" ? 2:4;
                    if(await Access(connection,transaction,actor,parent!,rows)<needed)throw new IntegratedDenied("没有创建权限");
                }
                var entity=new IntegratedEntity(change.Kind,change.Id,change.ParentId,change.Order,change.Kind=="opinion"?StampOpinion(change.Fields!,null):(JsonObject)change.Fields!.DeepClone(),1,actor.MemberId);
                if(entity.Kind=="version"&&rows.Values.Any(r=>r.Kind=="version"&&r.ParentId==entity.ParentId&&string.Equals(r.Fields["name"]?.GetValue<string>()?.Trim(),entity.Fields["name"]?.GetValue<string>()?.Trim(),StringComparison.OrdinalIgnoreCase)))throw new IntegratedConflict("版本名称已存在，请重新命名");
                await Write(connection,transaction,actor.WorkspaceId,entity,false);rows.Add(entity.Id,entity);
            } else {
                if(existing is null || existing.Kind!=change.Kind)throw new IntegratedConflict("记录已删除或不存在");
                var access=await Access(connection,transaction,actor,existing,rows);
                var needed=existing.Kind=="opinion"&&existing.CreatedBy==actor.MemberId?2:3;
                if(change.Type=="delete"&&existing.Kind=="version")needed=4;
                if(existing.Kind is "project" or "task" or "preferences")needed=4;
                if(access<needed || existing.Kind=="preferences"&&actor.Role!="owner")throw new IntegratedDenied("没有修改权限");
                if(change.Type=="delete") {
                    if(change.Expected is not null?!WorkEquals(existing.Kind,existing.Fields,change.Expected):existing.Revision!=change.Revision)throw new IntegratedConflict("内容已被其他成员修改，无法删除");
                    if(rows.Values.Any(row=>row.ParentId==existing.Id))throw new IntegratedConflict("请先处理下级记录");
                    await Write(connection,transaction,actor.WorkspaceId,existing,true);
                    await using(var marker=connection.CreateCommand()){marker.Transaction=transaction;marker.CommandText="INSERT INTO integrated_deletions(workspace_id,entity_id,operation_id,deleted_by,at) VALUES($w,$id,$o,$by,$at) ON CONFLICT(workspace_id,entity_id) DO UPDATE SET operation_id=$o,deleted_by=$by,at=$at";marker.Parameters.AddWithValue("$w",actor.WorkspaceId);marker.Parameters.AddWithValue("$id",existing.Id);marker.Parameters.AddWithValue("$o",batch.OperationId);marker.Parameters.AddWithValue("$by",actor.MemberId);marker.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));await marker.ExecuteNonQueryAsync();}
                    rows.Remove(existing.Id);
                } else {
                    // Compare only edited fields, allowing independent calendar/opinion edits.
                    foreach(var pair in change.Fields!) if(!(existing.Kind=="opinion"&&OpinionMetadata.Contains(pair.Key))&&(change.Expected is null || !change.Expected.ContainsKey(pair.Key) || !JsonNode.DeepEquals(existing.Fields[pair.Key],change.Expected[pair.Key])&&!JsonNode.DeepEquals(existing.Fields[pair.Key],pair.Value)))
                        throw new IntegratedConflict("同一字段已被其他成员修改，请刷新后核对");
                    var fields=(JsonObject)existing.Fields.DeepClone();
                    foreach(var pair in change.Fields) {if(pair.Value is null)fields.Remove(pair.Key);else fields[pair.Key]=pair.Value.DeepClone();}
                    var required=existing.Kind=="opinion"?"text":"name";
                    if(existing.Kind!="preferences" && string.IsNullOrWhiteSpace(fields[required]?.GetValue<string>()))throw new ArgumentException("名称或意见不能为空");
                    if(existing.Kind=="opinion" && fields["done"] is null)throw new ArgumentException("完成状态不能为空");
                    var entity=existing with {Fields=existing.Kind=="opinion"?StampOpinion(fields,existing.Fields,change.Fields):fields,Revision=existing.Revision+1};
                    await Write(connection,transaction,actor.WorkspaceId,entity,false);rows[entity.Id]=entity;
                }
            }
            var target=rows.GetValueOrDefault(change.Id)??existing;
            if(target is not null&&!(change.Kind=="version"&&change.Type=="update"&&change.Fields!.All(pair=>pair.Key=="duration"))) {
                var project=Ancestor(target,"project",rows);var version=Ancestor(target,"version",rows);
                if(project is not null) {
                    var verb=change.Type switch {"create"=>"创建了","delete"=>"删除了","restore"=>"恢复了",_=>"更新了"};
                    var noun=change.Kind switch {"project"=>"项目","task"=>"任务","version"=>"版本","list"=>"意见清单",_=>"修改意见"};
                    var name=target.Kind=="opinion"?"":target.Fields["name"]?.GetValue<string>()??"";
                    var eventKey=project.Id+"|"+version?.Id;var activity=(project.Id,version?.Id,verb+noun+(string.IsNullOrEmpty(name)?"":"「"+name+"」"));if(change.Kind=="version")events[eventKey]=activity;else events.TryAdd(eventKey,activity);
                }
            }
        }
        foreach(var activity in events.Values)await AddEvent(connection,transaction,actor,activity.Project,activity.Version,activity.Text);
        await using(var commit=connection.CreateCommand()) {
            commit.Transaction=transaction;commit.CommandText="INSERT INTO integrated_commits(workspace_id,operation_id,member_id,device_id,payload,at) VALUES($w,$o,$m,$d,$p,$at)";
            commit.Parameters.AddWithValue("$w",actor.WorkspaceId);commit.Parameters.AddWithValue("$o",batch.OperationId);commit.Parameters.AddWithValue("$m",actor.MemberId);
            commit.Parameters.AddWithValue("$d",actor.DeviceId);commit.Parameters.AddWithValue("$p",payload);commit.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));
            await commit.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }
    private static async Task Write(SqliteConnection connection,SqliteTransaction transaction,string workspace,IntegratedEntity entity,bool deleted)
    {
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        // Tombstones cannot be reused by another create command.
        command.CommandText=deleted?"UPDATE integrated_entities SET deleted_at=$at,revision=revision+1 WHERE workspace_id=$w AND id=$id":
          "INSERT INTO integrated_entities(workspace_id,id,kind,parent_id,sort_order,fields,revision,created_by) VALUES($w,$id,$k,$parent,$order,$fields,$revision,$by) ON CONFLICT(workspace_id,id) DO UPDATE SET fields=$fields,revision=$revision WHERE integrated_entities.deleted_at IS NULL";
        command.Parameters.AddWithValue("$w",workspace);command.Parameters.AddWithValue("$id",entity.Id);
        if(deleted)command.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));
        else {command.Parameters.AddWithValue("$k",entity.Kind);command.Parameters.AddWithValue("$parent",(object?)entity.ParentId??DBNull.Value);command.Parameters.AddWithValue("$order",entity.Order);command.Parameters.AddWithValue("$fields",entity.Fields.ToJsonString());command.Parameters.AddWithValue("$revision",entity.Revision);command.Parameters.AddWithValue("$by",entity.CreatedBy);}
        if(await command.ExecuteNonQueryAsync()!=1)throw new IntegratedConflict("记录已删除，不能重复使用标识");
    }
    public async Task SetAccessAsync(DeviceIdentity actor,string versionId,VersionAccessRequest values)
    {
        if(!Levels.ContainsKey(values.Permission))throw new ArgumentException("不支持的权限");
        await using var connection=await database.OpenAsync();await using var transaction=connection.BeginTransaction();
        var rows=await Read(connection,transaction,actor.WorkspaceId);
        if(!rows.TryGetValue(versionId,out var version)||version.Kind!="version")throw new ArgumentException("版本不存在");
        if(await Access(connection,transaction,actor,version,rows)<4)throw new IntegratedDenied("仅管理者可以设置版本权限");
        if(values.ExpectedPermission is not null) {
            await using var check=connection.CreateCommand();check.Transaction=transaction;check.CommandText="SELECT permission FROM integrated_version_access WHERE workspace_id=$w AND version_id=$v AND member_id=$m";
            check.Parameters.AddWithValue("$w",actor.WorkspaceId);check.Parameters.AddWithValue("$v",versionId);check.Parameters.AddWithValue("$m",values.MemberId);
            var current=Convert.ToString(await check.ExecuteScalarAsync());if(string.IsNullOrEmpty(current))current="none";
            if(current!=values.ExpectedPermission)throw new IntegratedConflict("成员权限已被其他管理者更改，请刷新后重试");
        }
        await using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="INSERT INTO integrated_version_access(workspace_id,version_id,member_id,permission) SELECT $w,$v,id,$p FROM members WHERE id=$m AND workspace_id=$w AND removed_at IS NULL ON CONFLICT(workspace_id,version_id,member_id) DO UPDATE SET permission=$p";
        command.Parameters.AddWithValue("$w",actor.WorkspaceId);command.Parameters.AddWithValue("$v",versionId);command.Parameters.AddWithValue("$m",values.MemberId);command.Parameters.AddWithValue("$p",values.Permission);
        if(await command.ExecuteNonQueryAsync()!=1)throw new ArgumentException("成员不存在");
        await AddEvent(connection,transaction,actor,Ancestor(version,"project",rows)!.Id,version.Id,"更新了版本成员权限");
        await transaction.CommitAsync();
    }
    private static async Task AddEvent(SqliteConnection connection,SqliteTransaction transaction,DeviceIdentity actor,string projectId,string? versionId,string text)
    {
        await using var command=connection.CreateCommand();command.Transaction=transaction;command.CommandText="INSERT INTO integrated_events(id,workspace_id,project_id,version_id,member_id,at,text) VALUES($id,$w,$p,$v,$m,$at,$text)";
        command.Parameters.AddWithValue("$id",Guid.NewGuid().ToString("N"));command.Parameters.AddWithValue("$w",actor.WorkspaceId);command.Parameters.AddWithValue("$p",projectId);command.Parameters.AddWithValue("$v",(object?)versionId??DBNull.Value);command.Parameters.AddWithValue("$m",actor.MemberId);command.Parameters.AddWithValue("$at",SecurityHelpers.Utc(DateTimeOffset.UtcNow));command.Parameters.AddWithValue("$text",actor.DisplayName+" "+text);await command.ExecuteNonQueryAsync();
    }
}
