using Microsoft.Data.Sqlite;

namespace CreativeFlow.Host;

public sealed class CollaborationDatabase
{
    private readonly string _connectionString;

    public CollaborationDatabase(string dataDirectory,Func<long>? diskFree=null)
    {
        DataDirectory = Path.GetFullPath(dataDirectory);
        Storage = new StorageBudget(DataDirectory,diskFree);
        DatabasePath = Path.Combine(DataDirectory, "creativeflow-host.db");
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString();
    }

    public string DataDirectory { get; }
    public StorageBudget Storage { get; }
    public string DatabasePath { get; }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(DataDirectory);
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = MigrationV1;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;";
        await pragma.ExecuteNonQueryAsync(cancellationToken);
        return connection;
    }

    private const string MigrationV1 = """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            epoch TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            display_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('owner','member','reviewer')),
            created_at TEXT NOT NULL,
            removed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            member_id TEXT NOT NULL REFERENCES members(id),
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            revoked_at TEXT
        );

        CREATE TABLE IF NOT EXISTS invitations (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            member_id TEXT NOT NULL REFERENCES members(id),
            code_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            used_at TEXT
        );

        CREATE TABLE IF NOT EXISTS storage_roots (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            name TEXT NOT NULL,
            server_path TEXT NOT NULL,
            unc_path TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '计划中',
            type TEXT NOT NULL DEFAULT '视频',
            start TEXT NOT NULL DEFAULT '',
            due TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#3878cf',
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            project_id TEXT NOT NULL REFERENCES projects(id),
            assignee_member_id TEXT REFERENCES members(id),
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            start TEXT NOT NULL DEFAULT '',
            due TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#3878cf',
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS versions (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            task_id TEXT NOT NULL REFERENCES tasks(id),
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            created_date TEXT NOT NULL,
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS media_links (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            version_id TEXT NOT NULL REFERENCES versions(id),
            storage_root_id TEXT NOT NULL REFERENCES storage_roots(id),
            relative_path TEXT NOT NULL,
            name TEXT NOT NULL,
            size INTEGER,
            modified_at TEXT,
            quick_fingerprint TEXT,
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS feedback_lists (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            version_id TEXT NOT NULL REFERENCES versions(id),
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS feedback_items (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            list_id TEXT NOT NULL REFERENCES feedback_lists(id),
            text TEXT NOT NULL,
            timecode TEXT NOT NULL DEFAULT '',
            completed_at TEXT,
            completed_by TEXT REFERENCES members(id),
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            project_id TEXT REFERENCES projects(id),
            actor_id TEXT NOT NULL REFERENCES members(id),
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS operations (
            server_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL UNIQUE,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            workspace_epoch TEXT NOT NULL,
            actor_id TEXT NOT NULL REFERENCES members(id),
            command_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            result_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS backup_records (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            path TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS ix_projects_workspace ON projects(workspace_id, deleted_at);
        CREATE TABLE IF NOT EXISTS entity_history (
            workspace_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            PRIMARY KEY(workspace_id,table_name,entity_id,revision)
        );
        CREATE INDEX IF NOT EXISTS ix_operations_workspace_sequence ON operations(workspace_id, server_sequence);
        CREATE INDEX IF NOT EXISTS ix_devices_token_hash ON devices(token_hash);

        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        """;
}
