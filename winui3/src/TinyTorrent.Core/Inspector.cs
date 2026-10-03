using Transmission;

namespace TinyTorrent;

public enum InspectorTab
{
    General,
    Files,
    Peers,
    Trackers,
    Speed,
    Pieces,
}

public sealed record TorrentDetail(string Hash, InspectorTab Tab, object Value);

public sealed record SeedingLimits(bool RatioLimited, double RatioLimit, bool IdleLimited, int IdleMinutes);

public sealed record TorrentGeneral(
    int Id,
    string HashString,
    string Name,
    string DownloadDir,
    string Comment,
    string Creator,
    string Source,
    string MagnetLink,
    string TorrentFile,
    long AddedDate,
    long DateCreated,
    long DoneDate,
    long StartDate,
    long ActivityDate,
    bool IsPrivate,
    int FileCount,
    string PrimaryMimeType,
    int PieceCount,
    long PieceSize,
    long TotalSize,
    long SizeWhenDone,
    long LeftUntilDone,
    long DownloadedEver,
    long UploadedEver,
    long CorruptEver,
    long DesiredAvailable,
    long HaveUnchecked,
    long HaveValid,
    double PercentDone,
    double PercentComplete,
    double MetadataPercentComplete,
    double RecheckProgress,
    double UploadRatio,
    long SecondsDownloading,
    long SecondsSeeding,
    Eta EtaIdle,
    bool IsFinished,
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
    int PeerLimit,
    bool SequentialDownload,
    int SequentialDownloadFromPiece);

public sealed record TorrentFiles(
    int Id,
    string HashString,
    IReadOnlyList<TorrentFile> Files,
    IReadOnlyList<FileStat> FileStats);

internal sealed record TorrentFileStats(
    int Id,
    string HashString,
    IReadOnlyList<FileStat> FileStats);

public sealed record TorrentPeers(
    int Id,
    string HashString,
    IReadOnlyList<Peer> Peers,
    PeerCounts PeersFrom,
    IReadOnlyList<string> Webseeds,
    int WebseedsSendingToUs,
    int MaxConnectedPeers);

public sealed record TorrentTrackers(
    int Id,
    string HashString,
    string TrackerList,
    IReadOnlyList<TrackerStat> TrackerStats);

public sealed record TorrentPieces(
    int Id,
    string HashString,
    int PieceCount,
    long PieceSize,
    PieceBitfield Pieces,
    IReadOnlyList<int> Availability);
