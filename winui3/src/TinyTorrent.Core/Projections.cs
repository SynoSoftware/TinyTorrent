using Transmission;

namespace TinyTorrent;

// The library ships no projection on purpose: which fields a poll asks for is the consumer's
// decision, and the request derives its "fields" argument from the type the answer decodes into.
// So these records ARE the field lists, and a property nothing reads is a field nothing should
// have asked the daemon to compute. Adding one to a screen means adding it here in the same edit.

/// <summary>
/// What the list needs on every tick, for the recently-active delta or for a whole sweep.
/// </summary>
/// <remarks>
/// <c>edit_date</c> earns its place by being the trigger that refetches <see cref="TorrentFacts"/>:
/// a rename or a label change moves it and nothing else the list watches.
/// </remarks>
internal sealed record TorrentSummary(
    int Id,
    TorrentStatus Status,
    bool IsStalled,
    int QueuePosition,
    double PercentDone,
    double RecheckProgress,
    double MetadataPercentComplete,
    long SizeWhenDone,
    long LeftUntilDone,
    long RateDownload,
    long RateUpload,
    int PeersConnected,
    int PeersGettingFromUs,
    int PeersSendingToUs,
    Eta Eta,
    double UploadRatio,
    long DoneDate,
    TorrentError Error,
    string ErrorString,
    long EditDate);

/// <summary>
/// What does not change between edits: fetched when a torrent is first seen, and again when its
/// <c>edit_date</c> moves.
/// </summary>
internal sealed record TorrentFacts(
    int Id,
    string HashString,
    string Name,
    long AddedDate,
    long TotalSize,
    string DownloadDir);

/// <summary>
/// What the interface must learn once per connection. Reading <c>units</c> is also what proves
/// the connection: it draws the session-id challenge, and that challenge is the only place the
/// daemon's RPC version is revealed.
/// </summary>
internal sealed record SessionFacts(Units Units);
