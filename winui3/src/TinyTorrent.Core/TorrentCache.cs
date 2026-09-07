using Transmission;

namespace TinyTorrent;

/// <summary>What one merge changed, and what the next tick therefore has to ask for.</summary>
internal readonly record struct TickChange(
    TorrentFields Fields,
    bool NeedsSweep,
    IReadOnlyList<string> Refetch)
{
    internal static readonly IReadOnlyList<string> Nothing = [];
}

/// <summary>
/// Every torrent the daemon has told us about, in queue order, as row objects that survive the
/// ticks. The rows are stable so that cells redraw from <c>INotifyPropertyChanged</c> instead of
/// being rebuilt, and so the table can reconcile selection across an update by key.
/// </summary>
public sealed class TorrentCache
{
    private readonly Dictionary<int, Torrent> _byId = [];
    private readonly List<Torrent> _rows = [];

    private TorrentFormat _format = TorrentFormat.Default;

    /// <summary>Every torrent, in the daemon's queue order. The page filters this; the table never does.</summary>
    public IReadOnlyList<Torrent> Rows => _rows;

    public int Count => _rows.Count;

    /// <summary>
    /// The scale this daemon publishes, so anything outside a row that prints a size or a rate
    /// prints it the same way the rows do.
    /// </summary>
    public TorrentFormat Format => _format;

    /// <summary>
    /// Start again against a daemon whose units we have just read. The rows go with the old
    /// connection because the numeric ids they were keyed by do not survive a daemon restart, and
    /// a connection that dropped may well be a daemon that did.
    /// </summary>
    internal void Adopt(TorrentFormat format)
    {
        _format = format;
        _byId.Clear();
        _rows.Clear();
    }

    /// <summary>Every torrent, read whole. The two answers came from one batch, so they agree.</summary>
    internal TickChange Sweep(IReadOnlyList<TorrentSummary> summaries, IReadOnlyList<TorrentFacts> facts)
    {
        Dictionary<int, Torrent> kept = new(summaries.Count);
        Dictionary<int, TorrentFacts> described = new(facts.Count);

        foreach (TorrentFacts known in facts)
        {
            described[known.Id] = known;
        }

        TorrentFields changed = TorrentFields.None;

        foreach (TorrentSummary summary in summaries)
        {
            if (!described.TryGetValue(summary.Id, out TorrentFacts? known))
            {
                continue;
            }

            if (!_byId.TryGetValue(summary.Id, out Torrent? row) ||
                !string.Equals(row.Hash, known.HashString, StringComparison.Ordinal))
            {
                row = new Torrent(summary.Id, known.HashString, _format);
                changed |= TorrentFields.Membership;
            }

            changed |= row.Apply(known);
            changed |= row.Apply(summary);
            kept[summary.Id] = row;
        }

        foreach (int id in _byId.Keys)
        {
            if (!kept.ContainsKey(id))
            {
                changed |= TorrentFields.Membership;
                break;
            }
        }

        _byId.Clear();
        foreach ((int id, Torrent row) in kept)
        {
            _byId[id] = row;
        }

        _rows.Clear();
        _rows.AddRange(_byId.Values);
        Order();

        return new TickChange(changed, NeedsSweep: false, TickChange.Nothing);
    }

    /// <summary>
    /// The torrents the daemon says changed in the last 60 seconds, plus the ids it dropped.
    /// </summary>
    internal TickChange Delta(IReadOnlyList<TorrentSummary> summaries, IReadOnlyList<int>? removed)
    {
        TorrentFields changed = TorrentFields.None;
        bool sweep = false;
        List<string>? refetch = null;

        HashSet<int> present = new(summaries.Count);

        foreach (TorrentSummary summary in summaries)
        {
            if (!_byId.TryGetValue(summary.Id, out Torrent? row))
            {
                // A torrent we have never seen. Its name, size and added date are in the static
                // set, and the only way to ask for those is by hash, which is exactly what we do
                // not have yet - so the next tick reads everything.
                sweep = true;
                continue;
            }

            present.Add(summary.Id);

            long edited = row.EditDate;
            changed |= row.Apply(summary);

            if (row.EditDate != edited)
            {
                (refetch ??= []).Add(row.Hash);
            }
        }

        foreach (Torrent row in _rows)
        {
            if (!present.Contains(row.Id))
            {
                changed |= row.ZeroRates();
            }
        }

        if (removed is { Count: > 0 })
        {
            foreach (int id in removed)
            {
                if (_byId.Remove(id, out Torrent? gone))
                {
                    _rows.Remove(gone);
                    changed |= TorrentFields.Membership;
                }
            }
        }

        if ((changed & TorrentFields.Queue) != 0)
        {
            Order();
        }

        return new TickChange(changed, sweep, refetch ?? TickChange.Nothing);
    }

    /// <summary>The static set again, for the torrents whose <c>edit_date</c> moved.</summary>
    internal TorrentFields Facts(IReadOnlyList<TorrentFacts> facts)
    {
        TorrentFields changed = TorrentFields.None;

        foreach (TorrentFacts known in facts)
        {
            if (_byId.TryGetValue(known.Id, out Torrent? row))
            {
                changed |= row.Apply(known);
            }
        }

        return changed;
    }

    /// <summary>Re-read every relative "added" string. Only the visible rows pay for it.</summary>
    public void InvalidateRelativeTimes()
    {
        foreach (Torrent row in _rows)
        {
            row.InvalidateRelativeTimes();
        }
    }

    /// <summary>Announce every accent key again, after the theme changed what those keys name.</summary>
    public void InvalidateStatusAccents()
    {
        foreach (Torrent row in _rows)
        {
            row.InvalidateStatusAccent();
        }
    }

    /// <summary>
    /// Put the rows back in queue order. The one owner of that order: the merge calls it when a
    /// tick moved a position, and the session calls it after an optimistic reorder.
    /// </summary>
    internal void Order() => _rows.Sort(static (a, b) => a.QueuePosition.CompareTo(b.QueuePosition));

    /// <summary>
    /// One sparkline sample per row. The tick is the caller, and it calls this on every tick,
    /// whatever that tick asked the daemon for - which is what makes the ring a true 64-second
    /// window rather than one that stands still whenever a merge does. A quiet daemon is answered
    /// with statistics alone and merges nothing, so a sample taken inside the merge would leave
    /// every row's ring holding the same picture while the cell still read it as that window. It
    /// is an array write and a raise with no listener for every row a template is not reading.
    /// </summary>
    internal void Sample()
    {
        foreach (Torrent row in _rows)
        {
            row.PushSpeedSample(row.ActiveSpeed);
        }
    }
}
