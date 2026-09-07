using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

/// <summary>
/// Answers shaped like the ones a daemon sends, so the merge can be driven without one.
/// </summary>
internal static class Daemon
{
    internal static TorrentFacts Facts(int id, string? name = null, long size = 1_000_000_000) =>
        new(id, Hash(id), name ?? $"torrent-{id:0000}.iso", 1_700_000_000 + id, size, @"D:\Downloads");

    internal static TorrentSummary Summary(
        int id,
        TorrentStatus status = TorrentStatus.Download,
        int queuePosition = -1,
        double percentDone = 0.5,
        long rateDownload = 1_000_000,
        long rateUpload = 100_000,
        int peers = 12,
        bool stalled = false,
        long editDate = 0,
        string error = "") =>
        new(
            Id: id,
            Status: status,
            IsStalled: stalled,
            QueuePosition: queuePosition < 0 ? id : queuePosition,
            PercentDone: percentDone,
            RecheckProgress: 0,
            MetadataPercentComplete: 1,
            SizeWhenDone: 1_000_000_000,
            LeftUntilDone: (long)(1_000_000_000 * (1 - percentDone)),
            RateDownload: rateDownload,
            RateUpload: rateUpload,
            PeersConnected: peers,
            PeersGettingFromUs: 3,
            PeersSendingToUs: 5,
            Eta: new Eta(600),
            UploadRatio: 1.25,
            DoneDate: 0,
            Error: error.Length == 0 ? TorrentError.Ok : TorrentError.LocalError,
            ErrorString: error,
            EditDate: editDate);

    /// <summary>Forty hex characters, so the row key looks like the info hash it stands for.</summary>
    internal static string Hash(int id) => id.ToString("x").PadLeft(40, '0');

    internal static (List<TorrentSummary> Summaries, List<TorrentFacts> Facts) Population(int count)
    {
        List<TorrentSummary> summaries = new(count);
        List<TorrentFacts> facts = new(count);

        for (int i = 0; i < count; i++)
        {
            summaries.Add(Summary(i));
            facts.Add(Facts(i));
        }

        return (summaries, facts);
    }
}
