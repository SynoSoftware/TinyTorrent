using System.Globalization;

namespace Synapse_Sample;

/// <summary>
/// One explicit comparer per sortable column. <see cref="Synapse.TableColumn.SortComparer"/> is
/// typed <c>IComparer&lt;object&gt;</c> because the table has no row type, so the cast back to
/// <see cref="TorrentRowViewModel"/> happens here, in the host that owns the row type.
/// </summary>
public static class TorrentComparers
{
    /// <summary>
    /// Ordered by the collation's own output rather than by collating the names each time. Same
    /// order; see <see cref="TorrentRowViewModel.NameSortKey"/> for what it costs otherwise.
    /// </summary>
    public static IComparer<object> Name { get; } = By(row => row.NameSortKey, SortKeyOrder);

    public static IComparer<object> Progress { get; } = By(row => row.Progress);

    /// <summary>Sorted by the daemon state, not by the localized label, so order is stable.</summary>
    public static IComparer<object> Status { get; } = By(row => (int)row.Status);

    public static IComparer<object> Queue { get; } = By(row => row.QueuePosition);

    /// <summary>An unknown estimate sorts last, which is what "no estimate" means to a user.</summary>
    public static IComparer<object> Eta { get; } =
        By(row => row.Eta?.TotalSeconds ?? double.MaxValue);

    public static IComparer<object> Speed { get; } = By(row => row.ActiveSpeed);

    public static IComparer<object> Peers { get; } = By(row => row.PeersConnected);

    public static IComparer<object> Size { get; } = By(row => row.TotalSize);

    public static IComparer<object> Ratio { get; } = By(row => row.Ratio);

    public static IComparer<object> Added { get; } = By(row => row.Added);

    /// <summary>An incomplete torrent has no completion date; it sorts last.</summary>
    public static IComparer<object> CompletedOn { get; } =
        By(row => row.CompletedOn ?? DateTimeOffset.MaxValue);

    /// <summary><see cref="SortKey"/> is not comparable itself; this is its documented order.</summary>
    private static readonly IComparer<SortKey> SortKeyOrder =
        Comparer<SortKey>.Create(static (left, right) => SortKey.Compare(left, right));

    private static IComparer<object> By<TKey>(
        Func<TorrentRowViewModel, TKey> key, IComparer<TKey>? comparer = null) =>
        new RowComparer<TKey>(key, comparer ?? Comparer<TKey>.Default);

    private sealed class RowComparer<TKey> : IComparer<object>
    {
        private readonly Func<TorrentRowViewModel, TKey> _key;
        private readonly IComparer<TKey> _comparer;

        internal RowComparer(Func<TorrentRowViewModel, TKey> key, IComparer<TKey> comparer)
        {
            _key = key;
            _comparer = comparer;
        }

        public int Compare(object? x, object? y)
        {
            if (x is not TorrentRowViewModel left || y is not TorrentRowViewModel right)
            {
                return 0;
            }

            return _comparer.Compare(_key(left), _key(right));
        }
    }
}
