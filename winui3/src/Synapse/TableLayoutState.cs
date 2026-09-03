namespace Synapse;

/// <summary>
/// Data-only layout snapshot. The table produces and validates it; the host stores it.
/// <paramref name="ColumnVisibility"/> and <paramref name="ColumnWidths"/> are sparse override
/// maps: a missing column ID means that column uses its baseline.
/// </summary>
public sealed record TableLayoutState(
    IReadOnlyList<string> ColumnOrder,
    IReadOnlyDictionary<string, bool> ColumnVisibility,
    IReadOnlyDictionary<string, double> ColumnWidths,
    string? SortColumnId,
    TableSortDirection SortDirection);

/// <summary>Payload of <see cref="TableView.LayoutChanged"/>.</summary>
public sealed class TableLayoutChangedEventArgs : EventArgs
{
    public TableLayoutChangedEventArgs(TableLayoutState layoutState, TableLayoutChangeKind kind)
    {
        LayoutState = layoutState;
        Kind = kind;
    }

    public TableLayoutState LayoutState { get; }

    public TableLayoutChangeKind Kind { get; }
}
