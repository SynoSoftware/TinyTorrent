using System.Text.Json;
using System.Text.Json.Serialization;

namespace Transmission;

/// <summary>Transcribed from <c>tr_torrent_activity</c> (types.h:218-227).</summary>
public enum TorrentStatus
{
    Stopped = 0,
    CheckWait = 1,
    Check = 2,
    DownloadWait = 3,
    Download = 4,
    SeedWait = 5,
    Seed = 6,
}

/// <summary>Transcribed from <c>tr_stat::Error</c> (types.h:493-499). Says what <c>error_string</c> holds.</summary>
public enum TorrentError
{
    Ok = 0,
    TrackerWarning = 1,
    TrackerError = 2,
    LocalError = 3,
}

/// <summary>Transcribed from <c>tr_priority_t</c> (types.h:147-152).</summary>
public enum Priority
{
    Low = -1,
    Normal = 0,
    High = 1,
}

/// <summary>Transcribed from <c>tr_ratiolimit</c> (types.h:163-171).</summary>
public enum RatioMode
{
    Global = 0,
    Single = 1,
    Unlimited = 2,
}

/// <summary>Transcribed from <c>tr_idlelimit</c> (types.h:125-133).</summary>
public enum IdleMode
{
    Global = 0,
    Single = 1,
    Unlimited = 2,
}

/// <summary>Transcribed from <c>tr_tracker_state</c> (types.h:229-242).</summary>
public enum TrackerState
{
    Inactive = 0,
    Waiting = 1,
    Queued = 2,
    Active = 3,
}

/// <summary>
/// Seconds until done, carrying the daemon's two sentinels rather than losing them:
/// <see cref="Value"/> is null for both, and <see cref="Seconds"/> tells them apart.
/// </summary>
[JsonConverter(typeof(EtaConverter))]
public readonly record struct Eta(int Seconds)
{
    /// <summary>The torrent is not moving toward completion, so there is nothing to estimate.</summary>
    public const int NotAvailable = -1;

    /// <summary>Too little has happened yet to estimate.</summary>
    public const int Unknown = -2;

    public TimeSpan? Value => Seconds >= 0 ? TimeSpan.FromSeconds(Seconds) : null;
}

/// <summary>
/// The <c>pieces</c> have/don't-have bitfield, MSB first within each byte. It is an empty string
/// while a magnet has no metainfo yet, which is what <see cref="IsEmpty"/> reports.
/// </summary>
[JsonConverter(typeof(PieceBitfieldConverter))]
public readonly struct PieceBitfield
{
    private readonly byte[]? _bits;

    internal PieceBitfield(byte[] bits) => _bits = bits;

    public bool IsEmpty => _bits is null or { Length: 0 };

    public bool Has(int piece) =>
        _bits is { } bits &&
        (uint)(piece >> 3) < (uint)bits.Length &&
        (bits[piece >> 3] & (0x80 >> (piece & 7))) != 0;
}

public sealed record TorrentFile(string Name, long Length, long BytesCompleted, int BeginPiece, int EndPiece);

public sealed record FileStat(long BytesCompleted, Priority Priority, bool Wanted);

public sealed record Peer(
    string Address,
    int Port,
    string ClientName,
    string PeerId,
    string FlagStr,
    double Progress,
    long RateToClient,
    long RateToPeer,
    long BytesToClient,
    long BytesToPeer,
    bool ClientIsChoked,
    bool ClientIsInterested,
    bool PeerIsChoked,
    bool PeerIsInterested,
    bool IsDownloadingFrom,
    bool IsUploadingTo,
    bool IsEncrypted,
    bool IsIncoming,
    bool IsUtp);

public sealed record PeerCounts(
    int FromCache,
    int FromDht,
    int FromIncoming,
    int FromLpd,
    int FromLtep,
    int FromPex,
    int FromTracker);

public sealed record Tracker(int Id, int Tier, string Announce, string Scrape, string Sitename);

public sealed record TrackerStat(
    int Id,
    int Tier,
    string Announce,
    string Scrape,
    string Sitename,
    string Host,
    bool IsBackup,
    TrackerState AnnounceState,
    TrackerState ScrapeState,
    bool HasAnnounced,
    bool LastAnnounceSucceeded,
    bool LastAnnounceTimedOut,
    string LastAnnounceResult,
    long LastAnnounceStartTime,
    long LastAnnounceTime,
    int LastAnnouncePeerCount,
    long NextAnnounceTime,
    bool HasScraped,
    bool LastScrapeSucceeded,
    bool LastScrapeTimedOut,
    string LastScrapeResult,
    long LastScrapeStartTime,
    long LastScrapeTime,
    long NextScrapeTime,
    int SeederCount,
    int LeecherCount,
    int DownloadCount,
    int DownloaderCount);

internal sealed class EtaConverter : JsonConverter<Eta>
{
    public override Eta Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
        new(reader.GetInt32());

    public override void Write(Utf8JsonWriter writer, Eta value, JsonSerializerOptions options) =>
        writer.WriteNumberValue(value.Seconds);
}

internal sealed class PieceBitfieldConverter : JsonConverter<PieceBitfield>
{
    public override PieceBitfield Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
        new(reader.GetBytesFromBase64());

    public override void Write(Utf8JsonWriter writer, PieceBitfield value, JsonSerializerOptions options) =>
        throw new NotSupportedException("pieces is read-only.");
}
