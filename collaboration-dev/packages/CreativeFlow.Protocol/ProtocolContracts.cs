using System.Text.Json;
using System.Text.Json.Serialization;

namespace CreativeFlow.Protocol;

public static class ProtocolInfo
{
    public const int Version = 1;
    public const int SchemaVersion = 1;
}

public static class CommandTypes
{
    public const string CreateProject = "CreateProject";
    public const string UpdateProject = "UpdateProject";
    public const string CreateTask = "CreateTask";
    public const string UpdateTask = "UpdateTask";
    public const string CreateVersion = "CreateVersion";
    public const string UpdateVersion = "UpdateVersion";
}

public sealed record SetupRequest(string WorkspaceName, string OwnerDisplayName);

public sealed record SetupResponse(
    string WorkspaceId,
    string WorkspaceEpoch,
    string InvitationCode,
    DateTimeOffset InvitationExpiresAt);

public sealed record RedeemInvitationRequest(
    string InvitationCode,
    string DisplayName,
    string DeviceName);

public sealed record DeviceSession(
    string WorkspaceId,
    string WorkspaceEpoch,
    string MemberId,
    string DeviceId,
    string DisplayName,
    string Role,
    string Token);

public sealed record DiscoveryInfo(
    string Service,
    int ProtocolVersion,
    bool IsInitialized,
    string? WorkspaceId,
    string? WorkspaceName,
    string ServerName);

public sealed record HealthInfo(
    string Status,
    int ProtocolVersion,
    int SchemaVersion,
    DateTimeOffset ServerTime);

public sealed record CommandEnvelope(
    string OperationId,
    string WorkspaceEpoch,
    string Type,
    string EntityId,
    long BaseRevision,
    JsonElement Payload,
    DateTimeOffset? ClientTime);

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CommandStatus
{
    Applied,
    Duplicate,
    Conflict,
    Rejected
}

public sealed record CommandResult(
    CommandStatus Status,
    string OperationId,
    long ServerSequence,
    string EntityId,
    long Revision,
    string? ErrorCode = null,
    string? Message = null,
    JsonElement? CurrentEntity = null);

public sealed record ProjectRecord(
    string Id,
    string Name,
    string Description,
    string Status,
    string Type,
    string Start,
    string Due,
    string Color,
    long Revision,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    DateTimeOffset UpdatedAt,
    string UpdatedBy);

public sealed record WorkspaceSnapshot(
    string WorkspaceId,
    string WorkspaceName,
    string WorkspaceEpoch,
    long Cursor,
    IReadOnlyList<ProjectRecord> Projects,
    IReadOnlyList<TaskRecord> Tasks,
    IReadOnlyList<MemberRecord> Members,
    IReadOnlyList<VersionRecord> Versions,
    IReadOnlyList<StorageRootRecord> StorageRoots,
    IReadOnlyList<MediaRecord> Media,
    IReadOnlyList<FeedbackListRecord> FeedbackLists,
    IReadOnlyList<FeedbackRecord> Feedback);

public sealed record StorageRootRecord(string Id, string Name, string UncPath, long Revision);
public sealed record MediaRecord(string Id, string VersionId, string StorageRootId, string RelativePath, string Name, long Revision);
public sealed record FeedbackListRecord(string Id, string VersionId, string Name, long Revision);
public sealed record FeedbackRecord(string Id, string ListId, string Text, string Timecode, string? CompletedAt, long Revision);
public sealed record InviteMemberRequest(string DisplayName, string Role);
public sealed record InviteMemberResponse(string InvitationCode, DateTimeOffset ExpiresAt);

public sealed record TaskRecord(string Id, string ProjectId, string Name, string Type, string Status, string Due, long Revision, string? AssigneeMemberId = null);
public sealed record CreateTaskPayload(string ProjectId, string Name, string Type = "视频", string Status = "待开始", string Due = "");
public sealed record UpdateTaskPayload(string? Status = null, string? AssigneeMemberId = null, bool ChangeAssignee = false, string? Name = null, string? Due = null);
public sealed record MemberRecord(string Id, string DisplayName);
public sealed record VersionRecord(string Id, string TaskId, string Name, string Status, string CreatedDate, long Revision);
public sealed record CreateVersionPayload(string TaskId, string Name);
public sealed record UpdateVersionPayload(string? Status = null, string? Name = null);

public sealed record OperationRecord(
    long ServerSequence,
    string OperationId,
    string ActorId,
    string CommandType,
    string EntityType,
    string EntityId,
    DateTimeOffset CreatedAt,
    JsonElement Result);

public sealed record OperationBatch(long Cursor, IReadOnlyList<OperationRecord> Operations);

public sealed record CreateProjectPayload(
    string Name,
    string? Description = null,
    string? Status = null,
    string? Type = null,
    string? Start = null,
    string? Due = null,
    string? Color = null);

public sealed record UpdateProjectPayload(
    string? Name = null,
    string? Description = null,
    string? Status = null,
    string? Type = null,
    string? Start = null,
    string? Due = null,
    string? Color = null);
