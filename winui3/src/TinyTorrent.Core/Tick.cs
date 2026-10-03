using Transmission;

namespace TinyTorrent;

/// <summary>What the last two ticks learned, and what the interface has asked for since.</summary>
internal readonly record struct TickInputs(
    SessionStatistics? Last,
    SessionStatistics? Before,
    int CachedCount,
    bool MutationLanded,
    bool SweepForced,
    long Ticks);

/// <summary>What this tick asks the daemon for, beyond the statistics every tick carries.</summary>
internal readonly record struct TickPlan(bool Torrents, bool Sweep);

/// <summary>
/// What one poll is made of.
/// </summary>
/// <remarks>
/// The interval is fixed at two seconds and there is no setting for it. It is derived:
/// <c>Bandwidth::HistoryMSec</c> is 2000, so the daemon averages every speed over a two-second
/// window. Polling faster returns the same average twice and polling slower throws away one it
/// has already computed. Quiet ticks carry statistics between full sweeps at the daemon's
/// 60-second recent-change window (<c>rpcimpl.cc:RecentlyActiveSeconds</c>).
/// </remarks>
internal static class Tick
{
    internal static TimeSpan Interval => TimeSpan.FromSeconds(2);

    private static readonly long QuietSweepTicks = (long)(TimeSpan.FromSeconds(60) / Interval);

    internal static TickPlan Compose(TickInputs inputs)
    {
        if (inputs.Last is not { } last)
        {
            // Nothing has been read yet, so there is nothing the cache can be trusted to hold.
            return new TickPlan(Torrents: true, Sweep: true);
        }

        // torrent_count rides every tick, so a count-changing removal or addition from a watch
        // folder or another client shows up as one integer disagreeing, within one
        // tick, whether or not we were connected when it happened.
        bool sweep = inputs.SweepForced || last.TorrentCount != inputs.CachedCount;

        bool torrents = sweep
            || last.ActiveTorrentCount > 0
            || last.DownloadSpeed != 0
            || last.UploadSpeed != 0
            || inputs.MutationLanded
            || last.PausedTorrentCount != inputs.Before?.PausedTorrentCount;

        if (!torrents && inputs.Ticks > 0 && inputs.Ticks % QuietSweepTicks == 0)
        {
            return new TickPlan(Torrents: true, Sweep: true);
        }

        return new TickPlan(torrents, sweep);
    }
}
