using System.Text.Json;
using System.Text.Json.Serialization;

namespace Transmission;

/// <summary>The result of a method that answers <c>{}</c>.</summary>
public readonly record struct Empty;

/// <summary>
/// A torrent_get answer. <see cref="Removed"/> is present only for
/// <see cref="TorrentIds.RecentlyActive"/>, and lists numeric ids, not hashes.
/// </summary>
public sealed record TorrentGetResult<TTorrent>(
    IReadOnlyList<TTorrent> Torrents,
    IReadOnlyList<int>? Removed = null);

/// <summary>The three keys torrent_add answers with (rpcimpl.cc:1662-1666).</summary>
public sealed record TorrentRef(int Id, string Name, string HashString);

/// <summary>
/// A torrent_add outcome. A duplicate is not an error - the daemon answers success with the
/// torrent it already had - so the two cases are one type and the caller cannot miss the second.
/// </summary>
[JsonConverter(typeof(TorrentAddedConverter))]
public sealed record TorrentAdded(TorrentRef Torrent, bool IsDuplicate);

public sealed record RenamedPath(int Id, string Path, string Name);

public sealed record DiskSpace(string Path, long SizeBytes, long TotalSize);

public sealed record PortStatus(bool PortIsOpen, string? IpProtocol = null);

public sealed record Blocklist(int BlocklistSize);

public sealed record SessionStatistics(
    int ActiveTorrentCount,
    int PausedTorrentCount,
    int TorrentCount,
    long DownloadSpeed,
    long UploadSpeed,
    Totals CumulativeStats,
    Totals CurrentStats);

public sealed record Totals(
    long DownloadedBytes,
    long UploadedBytes,
    int FilesAdded,
    int SessionCount,
    long SecondsActive);

/// <summary>
/// What the daemon means by its units. Speed and size count a k as 1000 and memory as 1024;
/// only the GTK and Qt clients ever reassign that (utils.cc:65), so a consumer asserts
/// <see cref="SpeedBytes"/> rather than branching on it.
/// </summary>
public sealed record Units(
    long MemoryBytes,
    IReadOnlyList<string> MemoryUnits,
    long SizeBytes,
    IReadOnlyList<string> SizeUnits,
    long SpeedBytes,
    IReadOnlyList<string> SpeedUnits);

public sealed record GroupGetResult(IReadOnlyList<Group> Group);

public sealed record Group(
    string Name,
    bool HonorsSessionLimits,
    int SpeedLimitDown,
    bool SpeedLimitDownEnabled,
    int SpeedLimitUp,
    bool SpeedLimitUpEnabled);

internal sealed class TorrentAddedConverter : JsonConverter<TorrentAdded>
{
    public override TorrentAdded Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var result = JsonDocument.ParseValue(ref reader);

        if (result.RootElement.TryGetProperty("torrent_added", out var added))
        {
            return new TorrentAdded(Reference(added, options), IsDuplicate: false);
        }

        if (result.RootElement.TryGetProperty("torrent_duplicate", out var duplicate))
        {
            return new TorrentAdded(Reference(duplicate, options), IsDuplicate: true);
        }

        throw new JsonException("torrent_add answered neither torrent_added nor torrent_duplicate.");
    }

    public override void Write(Utf8JsonWriter writer, TorrentAdded value, JsonSerializerOptions options) =>
        throw new NotSupportedException("torrent_add's answer is never sent.");

    private static TorrentRef Reference(JsonElement element, JsonSerializerOptions options) =>
        element.Deserialize<TorrentRef>(options)
        ?? throw new JsonException("torrent_add named a torrent with no body.");
}
