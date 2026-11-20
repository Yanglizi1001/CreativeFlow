using System.Security.Cryptography;
using System.Text;

namespace CreativeFlow.Host;

internal static class SecurityHelpers
{
    public static string NewId(string prefix) => $"{prefix}-{Guid.NewGuid():N}";

    public static string NewToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string NewInvitationCode() =>
        RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();

    public static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    public static string Utc(DateTimeOffset value) => value.UtcDateTime.ToString("O");
}

public sealed record DeviceIdentity(
    string WorkspaceId,
    string MemberId,
    string DeviceId,
    string DisplayName,
    string Role);
