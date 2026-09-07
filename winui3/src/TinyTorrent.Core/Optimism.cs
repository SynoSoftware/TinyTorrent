using Transmission;

namespace TinyTorrent;

/// <summary>
/// The only thing the list is allowed to show before the daemon has confirmed it.
/// </summary>
/// <remarks>
/// There are exactly three such things - a status, a queue order, and whether a row is there - so
/// this carries exactly those three and <see cref="Apply"/> returns the edit that undoes it.
/// Rollback is applying that. Inverses are never composed across overlapping edits: when a second
/// mutation touches a row the first one is still waiting on, the optimism is thrown away and the
/// next tick reads everything. Composing them is where a previous attempt grew a grace-timer state
/// machine beside a separate toggle, both owning the same question.
/// </remarks>
internal sealed class TorrentEdit
{
    private readonly Change[] _changes;

    internal TorrentEdit(IEnumerable<Change> changes) => _changes = [.. changes];

    internal readonly record struct Change(
        Torrent Row,
        TorrentStatus? Status = null,
        int? QueuePosition = null,
        TorrentPresence? Presence = null);

    internal bool IsEmpty => _changes.Length == 0;

    internal IReadOnlyList<Torrent> Rows => Array.ConvertAll(_changes, static change => change.Row);

    internal bool Touches(IReadOnlyList<Torrent> rows)
    {
        foreach (Change change in _changes)
        {
            foreach (Torrent row in rows)
            {
                if (ReferenceEquals(change.Row, row))
                {
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>Write the change and hand back the one that undoes it.</summary>
    internal TorrentEdit Apply(out TorrentFields changed)
    {
        changed = TorrentFields.None;
        Change[] inverse = new Change[_changes.Length];

        for (int i = 0; i < _changes.Length; i++)
        {
            Change change = _changes[i];
            Torrent row = change.Row;

            inverse[i] = new Change(
                row,
                change.Status is null ? null : row.Status,
                change.QueuePosition is null ? null : row.QueuePosition,
                change.Presence is null ? null : row.Presence);

            if (change.Status is { } status)
            {
                changed |= row.SetStatus(status);
            }

            if (change.QueuePosition is { } position)
            {
                changed |= row.SetQueuePosition(position);
            }

            if (change.Presence is { } presence)
            {
                changed |= row.SetPresence(presence);
            }
        }

        return new TorrentEdit(inverse);
    }
}
