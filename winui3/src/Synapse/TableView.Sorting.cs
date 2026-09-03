namespace Synapse;

/// <summary>
/// Specification section 9. Sorting is a local table projection over the current source snapshot:
/// it produces the private view and never touches <see cref="ItemsSource"/>.
/// </summary>
public sealed partial class TableView
{
    /// <summary>
    /// The default settling interval. It is chosen, not derived: no system metric and no theme
    /// resource answers how often a list should reorder. It is long enough that a row does not move
    /// out from under a pointer reaching for it, and short enough that nobody concludes the sort is
    /// broken. A host that knows its own data should say so with
    /// <see cref="SortSettleInterval"/> rather than inherit this.
    /// </summary>
    private static readonly TimeSpan DefaultSortSettleInterval = TimeSpan.FromSeconds(3);

    private ResolvedColumn? _sortColumn;
    private TableSortDirection _sortDirection;
    private TimeSpan _sortSettleInterval = DefaultSortSettleInterval;

    /// <summary>When the rows were last allowed to take their sorted places.</summary>
    private DateTimeOffset _orderSettledAt = DateTimeOffset.MinValue;

    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _settleDue;

    /// <summary>
    /// How long rows already on screen keep their places while a sort is applied over values the
    /// source keeps changing. <see cref="TimeSpan.Zero"/> re-sorts on every update.
    /// </summary>
    /// <remarks>
    /// Only relative position waits. Membership never does: a row that arrives appears at once, at
    /// the place the sort gives it, and a row that leaves goes at once. The distinction is the
    /// reason this lives in the table rather than in the host — a host publishes one snapshot
    /// carrying membership and position together, so throttling it would delay the arrival that
    /// made it necessary, while the table holds both the old order and the new one and can take one
    /// without the other. Measured on a 2,002-row torrent list over five seconds of a one-second
    /// update: sorted by a value the updates never touch, no notifications at all; sorted by speed,
    /// which they always touch, 4,276 — an entire re-sort arriving unasked-for, roughly once a
    /// second. A table that reshuffles that often cannot be clicked on at any speed, which is why
    /// this exists, rather than the cost.
    /// <para>
    /// Live. Shortening it takes effect on the next update; the sorted order is taken immediately
    /// when it is set to <see cref="TimeSpan.Zero"/>. Negative values are treated as zero.
    /// </para>
    /// </remarks>
    public TimeSpan SortSettleInterval
    {
        get => _sortSettleInterval;
        set
        {
            value = value > TimeSpan.Zero ? value : TimeSpan.Zero;
            if (value == _sortSettleInterval)
            {
                return;
            }

            _sortSettleInterval = value;

            // Turning settling off is a request to see the sorted order, not a request to see it
            // whenever the source next moves.
            if (value == TimeSpan.Zero && _schemaCaptured && _sortColumn is not null)
            {
                _orderSettledAt = DateTimeOffset.MinValue;
                RebuildView();
            }
        }
    }

    /// <summary>The direction this column is sorted in, or null when it is not the sorted column.</summary>
    internal TableSortDirection? SortDirectionOf(TableColumn column) =>
        _sortColumn is not null && ReferenceEquals(_sortColumn.Column, column)
            ? _sortDirection
            : null;

    /// <summary>
    /// Section 9's cycle on header activation: unsorted becomes ascending, ascending becomes
    /// descending, and descending returns to natural order. A non-sortable header has no action.
    /// </summary>
    internal void ActivateSort(ResolvedColumn column)
    {
        if (!column.Column.CanSort)
        {
            return;
        }

        if (!ReferenceEquals(_sortColumn, column))
        {
            _sortColumn = column;
            _sortDirection = TableSortDirection.Ascending;
        }
        else if (_sortDirection == TableSortDirection.Ascending)
        {
            _sortDirection = TableSortDirection.Descending;
        }
        else
        {
            _sortColumn = null;
        }

        // The user asked for this order, so it is taken now rather than at the next cadence.
        _orderSettledAt = DateTimeOffset.MinValue;
        RebuildView();

        // Sorting changes no geometry, so nothing else republishes the header cells.
        _headerStrip?.Panel?.RefreshHeaderCells();

        RaiseLayoutChanged(TableLayoutChangeKind.Sort);
    }

    /// <summary>
    /// Section 5: the captured baseline carries no sort criterion, so <see cref="ResetColumnLayout"/>
    /// clears the local sort with the rest of the overrides. Silent: the reset reports once.
    /// </summary>
    /// <returns>True when a sort was in force and the view now needs rebuilding.</returns>
    private bool ClearSort()
    {
        if (_sortColumn is null)
        {
            return false;
        }

        _sortColumn = null;
        _sortDirection = TableSortDirection.Ascending;
        _orderSettledAt = DateTimeOffset.MinValue;
        return true;
    }

    /// <summary>
    /// The order the rows are actually shown in: the sorted snapshot, except that rows already on
    /// screen are left where they are between reorders.
    /// </summary>
    /// <remarks>
    /// A sort over a value the source keeps changing would otherwise re-order the whole table every
    /// time the source moves. Measured on the torrent host: sorted by name, which no update
    /// touches, an update costs nothing at all; sorted by speed, which every update touches, the
    /// table re-sorted itself about once a second, 214 ms to change the collection and 252 ms to lay
    /// it out, unprompted. The cost is the smaller half of it. A table that reshuffles once a second
    /// cannot be clicked on: the row being reached for moves out from under the pointer. The owner
    /// chose a cadence for that reason, not for the milliseconds.
    /// <para>
    /// Membership is never delayed, only position. A row that arrives appears at once, at the place
    /// the sort gives it among the rows already shown, and a row that leaves goes at once. What
    /// waits is existing rows trading places.
    /// </para>
    /// </remarks>
    private IReadOnlyList<object> ViewOrder()
    {
        IReadOnlyList<object> sorted = SortedSnapshot();

        // Natural order belongs to the host, which reorders when it means to; an empty view has no
        // established order to preserve; and a zero interval is the host asking for none of this.
        if (_sortColumn is null || _view.Count == 0 || _sortSettleInterval == TimeSpan.Zero)
        {
            _orderSettledAt = DateTimeOffset.UtcNow;
            return sorted;
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;
        if (now - _orderSettledAt >= _sortSettleInterval)
        {
            _orderSettledAt = now;
            return sorted;
        }

        ScheduleSettle(_sortSettleInterval - (now - _orderSettledAt));
        return HoldingCurrentOrder(sorted);
    }

    /// <summary>
    /// Take the sorted order at the end of the current interval, whether or not the source moves
    /// again in the meantime. Without this a table whose source went quiet would hold the order it
    /// was last left in.
    /// </summary>
    private void ScheduleSettle(TimeSpan due)
    {
        if (_settleDue is null)
        {
            _settleDue = DispatcherQueue.CreateTimer();
            _settleDue.IsRepeating = false;
            _settleDue.Tick += (_, _) => RebuildView();
        }

        if (_settleDue.IsRunning)
        {
            return;
        }

        _settleDue.Interval = due > TimeSpan.Zero ? due : TimeSpan.FromMilliseconds(1);
        _settleDue.Start();
    }

    /// <summary>
    /// The snapshot's rows, with the ones already shown kept in the order they are already in, and
    /// the rest placed where the sort puts them among those.
    /// </summary>
    private List<object> HoldingCurrentOrder(IReadOnlyList<object> sorted)
    {
        // Always the snapshot's instances, never the view's: the host may have replaced a row with
        // an equal-identity instance, and keeping the old one would leave its container bound to an
        // object nothing updates any more.
        Dictionary<object, object> live = new(sorted.Count, _identity);
        foreach (object row in sorted)
        {
            live[row] = row;
        }

        List<object> order = new(sorted.Count);
        HashSet<object> placed = new(_identity);
        foreach (object shown in _view)
        {
            if (live.TryGetValue(shown, out object? current) && placed.Add(current))
            {
                order.Add(current);
            }
        }

        IComparer<object> comparer = _sortColumn!.Column.SortComparer!;
        int sign = _sortDirection == TableSortDirection.Ascending ? 1 : -1;

        foreach (object arrival in sorted)
        {
            if (!placed.Add(arrival))
            {
                continue;
            }

            int at = order.Count;
            for (int i = 0; i < order.Count; i++)
            {
                if (sign * comparer.Compare(arrival, order[i]) < 0)
                {
                    at = i;
                    break;
                }
            }

            order.Insert(at, arrival);
        }

        return order;
    }

    /// <summary>
    /// The current source snapshot in sorted order. Natural order is the snapshot itself. A sort is
    /// stable, so equal values keep the exact base-sequence order they arrived in — descending
    /// included, because only the comparison is reversed and never the tie-break.
    /// </summary>
    private IReadOnlyList<object> SortedSnapshot()
    {
        IReadOnlyList<object> snapshot = _source.Snapshot;
        if (_sortColumn is null)
        {
            return snapshot;
        }

        // Schema validation rejects a sortable column without a comparer, so this cannot be null.
        IComparer<object> comparer = _sortColumn.Column.SortComparer!;

        return _sortDirection == TableSortDirection.Ascending
            ? snapshot.OrderBy(item => item, comparer).ToList()
            : snapshot.OrderByDescending(item => item, comparer).ToList();
    }

    /// <summary>
    /// Section 18's defensive sort restoration. The saved sort applies only when its column is
    /// currently sortable and its direction is one of the two valid values; anything else, a
    /// missing ID included, is natural order.
    /// </summary>
    /// <returns>True when the effective sort is not the one that was already in force.</returns>
    private bool RestoreSort(TableLayoutState state, Dictionary<string, ResolvedColumn> byId)
    {
        ResolvedColumn? previousColumn = _sortColumn;
        TableSortDirection previousDirection = _sortDirection;

        _sortColumn = null;
        _sortDirection = TableSortDirection.Ascending;

        if (state.SortColumnId is string id
            && byId.TryGetValue(id, out ResolvedColumn? column)
            && column.Column.CanSort
            && Enum.IsDefined(state.SortDirection))
        {
            _sortColumn = column;
            _sortDirection = state.SortDirection;
        }

        bool moved = !ReferenceEquals(previousColumn, _sortColumn)
            || (_sortColumn is not null && previousDirection != _sortDirection);

        if (moved)
        {
            // A restored sort is a new order the host asked for, not a drift of the old one.
            _orderSettledAt = DateTimeOffset.MinValue;
        }

        return moved;
    }
}
