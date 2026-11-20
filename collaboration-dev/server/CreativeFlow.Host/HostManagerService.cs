using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
namespace CreativeFlow.Host;

// Local maintenance entry point only. No management HTTP endpoint or persistent owner token.
// Access to deployed data is restricted to SYSTEM and Windows administrators by the installer.
public sealed class HostManagerService(CollaborationDatabase database)
{
    static string Text(JsonObject input,string key,int max=80) {
        var value=input[key]?.GetValue<string>()?.Trim()??"";
        if(string.IsNullOrEmpty(value)||value.Length>max)throw new ArgumentException("请填写有效的"+key+"。");return value;
    }
    public async Task<JsonObject> ExecuteAsync(JsonObject request) {
        var action=Text(request,"action");
        if(action=="storage-summary")return JsonSerializerNode(await database.Storage.JsonUsageAsync());
        if(action=="storage-status")return await new StorageManagement(database).StatusAsync();
        if(action=="storage-configure"){await database.Storage.ConfigureAsync(request["limitBytes"]!.GetValue<long>(),request["minimumFreeBytes"]!.GetValue<long>());return await new StorageManagement(database).StatusAsync();}
        if(action=="storage-cleanup")return await new StorageManagement(database).CleanupAsync(request);
        if(action=="setup") {
            var setup=await new WorkspaceService(database).SetupAsync(new(Text(request,"workspaceName",60),Text(request,"ownerName",40)));
            await database.Storage.ConfigureAsync(100*StorageBudget.GiB,20*StorageBudget.GiB);
            return new(){["code"]=setup.InvitationCode,["expiresAt"]=setup.InvitationExpiresAt.ToString("o")};
        }
        await using var c=await database.OpenAsync();
        await using(var schema=c.CreateCommand()) {schema.CommandText="CREATE TABLE IF NOT EXISTS manager_disabled(member_id TEXT PRIMARY KEY REFERENCES members(id),disabled_at TEXT NOT NULL)";await schema.ExecuteNonQueryAsync();}
        await using var tx=(SqliteTransaction)await c.BeginTransactionAsync();
        async Task<int> Write(string sql,params (string,object?)[] values) {await using var q=c.CreateCommand();q.Transaction=tx;q.CommandText=sql;foreach(var (k,v) in values)q.Parameters.AddWithValue(k,v??DBNull.Value);return await q.ExecuteNonQueryAsync();}
        async Task<JsonArray> Rows(string sql,params (string,object?)[] values) {await using var q=c.CreateCommand();q.Transaction=tx;q.CommandText=sql;foreach(var(k,v)in values)q.Parameters.AddWithValue(k,v??DBNull.Value);await using var reader=await q.ExecuteReaderAsync();var rows=new JsonArray();while(await reader.ReadAsync()){var row=new JsonObject();for(var i=0;i<reader.FieldCount;i++)row[reader.GetName(i)]=reader.IsDBNull(i)?null:JsonValue.Create(reader.GetValue(i));rows.Add(row);}return rows;}
        var spaces=await Rows("SELECT id,name,epoch FROM workspaces LIMIT 1");if(spaces.Count==0)throw new InvalidOperationException("协作空间尚未初始化。");
        var workspace=spaces[0]!.AsObject();var wid=workspace["id"]!.GetValue<string>();
        var members=await Rows("SELECT m.id,m.display_name AS name,m.role,m.created_at AS createdAt,m.removed_at AS removedAt,d.disabled_at AS disabledAt FROM members m LEFT JOIN manager_disabled d ON d.member_id=m.id WHERE m.workspace_id=$w ORDER BY m.created_at,m.id",("$w",wid));
        var owners=members.OfType<JsonObject>().Where(m=>m["role"]!.GetValue<string>()=="owner"&&m["removedAt"]==null).ToList();
        if(owners.Count==0)throw new InvalidOperationException("未找到有效的空间所有者，请先恢复管理员。");
        var ownerId=owners[0]["id"]!.GetValue<string>();var now=SecurityHelpers.Utc(DateTimeOffset.UtcNow);
        JsonObject FindMember(){var id=Text(request,"memberId");return members.OfType<JsonObject>().FirstOrDefault(m=>m["id"]!.GetValue<string>()==id)??throw new ArgumentException("成员不存在。");}
        string? code=null;var expires=SecurityHelpers.Utc(DateTimeOffset.UtcNow.AddMinutes(10));
        switch(action) {
            case "inspect":
                var devices=await Rows("SELECT id,member_id AS memberId,name,last_seen_at AS lastSeenAt,revoked_at AS revokedAt FROM devices WHERE workspace_id=$w ORDER BY last_seen_at DESC",("$w",wid));
                var pending=await Rows("SELECT id,member_id AS memberId,expires_at AS expiresAt FROM invitations WHERE workspace_id=$w AND used_at IS NULL AND expires_at>$now",("$w",wid),("$now",now));
                await tx.CommitAsync();return new(){["workspace"]=workspace.DeepClone(),["members"]=members,["devices"]=devices,["invitations"]=pending};
            case "rename-workspace":await Write("UPDATE workspaces SET name=$name WHERE id=$w",("$name",Text(request,"name",60)),("$w",wid));break;
            case "rename-member":var rename=FindMember();await Write("UPDATE members SET display_name=$name WHERE id=$id",("$name",Text(request,"name",40)),("$id",rename["id"]!.GetValue<string>()));break;
            case "invite":
                var name=Text(request,"name",40);var role=request["role"]?.GetValue<string>()??"member";if(role is not("member" or "reviewer"))throw new ArgumentException("成员角色无效。");
                if(members.OfType<JsonObject>().Any(m=>m["name"]!.GetValue<string>()==name&&m["removedAt"]==null))throw new ArgumentException("已有同名成员，请使用该成员的重新接入功能。");
                var newId=SecurityHelpers.NewId("member");await Write("INSERT INTO members(id,workspace_id,display_name,role,created_at) VALUES($id,$w,$name,$role,$at)",("$id",newId),("$w",wid),("$name",name),("$role",role),("$at",now));request["memberId"]=newId;goto case "reinvite";
            case "recover-owner":request["memberId"]=ownerId;goto case "reinvite";
            case "reinvite":
                var memberId=Text(request,"memberId");var target=await Rows("SELECT id FROM members WHERE id=$id AND workspace_id=$w AND removed_at IS NULL",("$id",memberId),("$w",wid));if(target.Count!=1)throw new ArgumentException("成员已禁用或移除，请先启用。");
                await Write("UPDATE invitations SET used_at=$at WHERE member_id=$id AND used_at IS NULL",("$at",now),("$id",memberId));
                for(var n=0;n<100;n++){code=SecurityHelpers.NewInvitationCode();if((await Rows("SELECT id FROM invitations WHERE code_hash=$hash AND used_at IS NULL AND expires_at>$at",("$hash",SecurityHelpers.Hash(code)),("$at",now))).Count==0)break;code=null;}
                if(code==null)throw new InvalidOperationException("暂时无法生成邀请码，请重试。");
                await Write("INSERT INTO invitations(id,workspace_id,member_id,code_hash,expires_at,created_at) VALUES($id,$w,$member,$hash,$expires,$at)",("$id",SecurityHelpers.NewId("invite")),("$w",wid),("$member",memberId),("$hash",SecurityHelpers.Hash(code)),("$expires",expires),("$at",now));break;
            case "cancel-invitations":var cancel=FindMember();await Write("UPDATE invitations SET used_at=$at WHERE member_id=$id AND used_at IS NULL",("$at",now),("$id",cancel["id"]!.GetValue<string>()));break;
            case "disable":case "remove":case "enable":
                var member=FindMember();var id=member["id"]!.GetValue<string>();
                if(member["role"]!.GetValue<string>()=="owner")throw new ArgumentException("请先转移所有者身份，不能禁用或移除所有者。");
                if(action=="enable") {if(member["disabledAt"]==null)throw new ArgumentException("该成员不是停用状态。");await Write("UPDATE members SET removed_at=NULL WHERE id=$id",("$id",id));await Write("DELETE FROM manager_disabled WHERE member_id=$id",("$id",id));}
                else {await Write("UPDATE members SET removed_at=$at WHERE id=$id",("$at",now),("$id",id));await Write("UPDATE devices SET revoked_at=$at WHERE member_id=$id AND revoked_at IS NULL",("$at",now),("$id",id));await Write("UPDATE invitations SET used_at=$at WHERE member_id=$id AND used_at IS NULL",("$at",now),("$id",id));if(action=="disable")await Write("INSERT OR REPLACE INTO manager_disabled(member_id,disabled_at) VALUES($id,$at)",("$id",id),("$at",now));else await Write("DELETE FROM manager_disabled WHERE member_id=$id",("$id",id));}break;
            case "revoke-device":if(await Write("UPDATE devices SET revoked_at=$at WHERE id=$id AND workspace_id=$w AND revoked_at IS NULL",("$at",now),("$id",Text(request,"deviceId")),("$w",wid))!=1)throw new ArgumentException("设备不存在或已撤销。");break;
            case "transfer-owner":
                var next=FindMember();var nextId=next["id"]!.GetValue<string>();if(next["removedAt"]!=null||nextId==ownerId)throw new ArgumentException("请选择其他有效成员。");
                // Require an already joined device so the new owner is not locked out.
                if((await Rows("SELECT id FROM devices WHERE member_id=$id AND revoked_at IS NULL",("$id",nextId))).Count==0)throw new ArgumentException("该成员尚未接入，请先让成员加入后再转移。");
                await Write("UPDATE members SET role='member' WHERE workspace_id=$w AND role='owner'",("$w",wid));await Write("UPDATE members SET role='owner' WHERE id=$id",("$id",nextId));break;
            default:throw new ArgumentException("不支持的管理操作。");
        }
        await Write("INSERT INTO activities(id,workspace_id,actor_id,action,summary,created_at) VALUES($id,$w,$actor,$action,$summary,$at)",("$id",SecurityHelpers.NewId("activity")),("$w",wid),("$actor",ownerId),("$action","HostManager:"+action),("$summary","服务器本机管理操作"),("$at",now));
        await tx.CommitAsync();return new(){["ok"]=true,["code"]=code,["expiresAt"]=code==null?null:expires,["memberId"]=request["memberId"]?.DeepClone()};
    }
    private static JsonObject JsonSerializerNode(System.Text.Json.JsonElement value)=>JsonNode.Parse(value.GetRawText())!.AsObject();
}
