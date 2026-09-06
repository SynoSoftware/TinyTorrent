using Transmission;

namespace Transmission_Tests;

// The library ships no torrent or settings projection: which fields a poll asks for is the
// consumer's decision, and a library that shipped one would make itself the only consumer. These
// are the suite's own, and having more than one is the point - a single projection would prove
// nothing about whether the field list really follows the type.

/// <summary>What the list needs every tick.</summary>
internal sealed record TorrentSummary(
    int Id,
    string HashString,
    string Name,
    TorrentStatus Status,
    int QueuePosition,
    double PercentDone,
    long RateDownload,
    long RateUpload,
    Eta Eta,
    bool IsStalled,
    long DownloadedEver,
    long UploadedEver,
    double UploadRatio,
    TorrentError Error,
    string ErrorString,
    IReadOnlyList<string> Labels,
    long EditDate);

/// <summary>What the inspector needs, for the selected torrent only.</summary>
internal sealed record TorrentDetail(
    int Id,
    IReadOnlyList<TorrentFile> Files,
    IReadOnlyList<FileStat> FileStats,
    IReadOnlyList<Peer> Peers,
    PeerCounts PeersFrom,
    IReadOnlyList<Tracker> Trackers,
    IReadOnlyList<TrackerStat> TrackerStats,
    string TrackerList,
    PieceBitfield Pieces,
    IReadOnlyList<int> Availability,
    Priority BandwidthPriority,
    int DownloadLimit,
    bool DownloadLimited,
    int UploadLimit,
    bool UploadLimited,
    bool HonorsSessionLimits,
    double SeedRatioLimit,
    RatioMode SeedRatioMode,
    int SeedIdleLimit,
    IdleMode SeedIdleMode,
    Eta EtaIdle,
    int PeerLimit,
    bool SequentialDownload,
    long CorruptEver,
    long HaveValid,
    long HaveUnchecked,
    double PercentComplete,
    long StartDate,
    long ActivityDate,
    int PieceCount,
    long PieceSize);

/// <summary>
/// The daemon settings the product exposes, plus the read-only ones it reports.
/// </summary>
/// <remarks>
/// Every property is nullable, which is what <see cref="SessionSet{TSettings}"/> requires of a
/// settings projection: null is the only value the wire omits, so a plain <c>bool</c> could not
/// tell "turn turtle mode off" from "leave turtle mode alone" and a plain <c>int</c> could not
/// set a limit to 0. A key set to false or 0 here is a key the daemon is asked to change.
/// </remarks>
internal sealed record Preferences
{
    public string? DownloadDir { get; init; }

    public string? IncompleteDir { get; init; }

    public bool? IncompleteDirEnabled { get; init; }

    public bool? RenamePartialFiles { get; init; }

    public bool? StartAddedTorrents { get; init; }

    public bool? TrashOriginalTorrentFiles { get; init; }

    public int? PeerPort { get; init; }

    public bool? PeerPortRandomOnStart { get; init; }

    public bool? PortForwardingEnabled { get; init; }

    public string? Encryption { get; init; }

    public bool? PexEnabled { get; init; }

    public bool? DhtEnabled { get; init; }

    public bool? LpdEnabled { get; init; }

    /// <summary>kB/s, k = 1000.</summary>
    public int? SpeedLimitDown { get; init; }

    public bool? SpeedLimitDownEnabled { get; init; }

    public int? SpeedLimitUp { get; init; }

    public bool? SpeedLimitUpEnabled { get; init; }

    public int? AltSpeedDown { get; init; }

    public int? AltSpeedUp { get; init; }

    public bool? AltSpeedEnabled { get; init; }

    public bool? AltSpeedTimeEnabled { get; init; }

    /// <summary>Minutes from midnight.</summary>
    public int? AltSpeedTimeBegin { get; init; }

    public int? AltSpeedTimeEnd { get; init; }

    /// <summary>A day bitmask, Sunday = 1 through Saturday = 64.</summary>
    public int? AltSpeedTimeDay { get; init; }

    public int? PeerLimitGlobal { get; init; }

    public int? PeerLimitPerTorrent { get; init; }

    public bool? DownloadQueueEnabled { get; init; }

    public int? DownloadQueueSize { get; init; }

    public bool? SeedQueueEnabled { get; init; }

    public int? SeedQueueSize { get; init; }

    public bool? QueueStalledEnabled { get; init; }

    public int? QueueStalledMinutes { get; init; }

    public double? SeedRatioLimit { get; init; }

    public bool? SeedRatioLimited { get; init; }

    public int? IdleSeedingLimit { get; init; }

    public bool? IdleSeedingLimitEnabled { get; init; }

    public bool? BlocklistEnabled { get; init; }

    public string? BlocklistUrl { get; init; }

    public int? BlocklistSize { get; init; }

    public bool? SequentialDownload { get; init; }

    public string? ConfigDir { get; init; }

    public string? Version { get; init; }

    public int? RpcVersion { get; init; }

    public int? RpcVersionMinimum { get; init; }

    public string? RpcVersionSemver { get; init; }

    public bool? TcpEnabled { get; init; }

    public Units? Units { get; init; }
}
