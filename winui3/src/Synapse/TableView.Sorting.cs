namespace Synapse;

/// <summary>
/// Specification section 9. Sorting is a local table projection over the current source snapshot:
/// it produces the private view and never touches <see cref="ItemsSource"/>.
/// </summary>
public sealed partial class TableView
{
    private ResolvedColumn? _sortColumn;
    private TableSortDirection _sortDirection;

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
        return true;
    }

    /// <summary>
    /// The current source snapshot in view order. Natural order is the snapshot itself. A sort is
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

        return !ReferenceEquals(previousColumn, _sortColumn)
            || (_sortColumn is not null && previousDirection != _sortDirection);
    }
}
