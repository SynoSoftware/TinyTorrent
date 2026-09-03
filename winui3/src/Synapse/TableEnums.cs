namespace Synapse;

/// <summary>Which empty presentation the host wants when the view has no items.</summary>
public enum TableEmptyState
{
    /// <summary>The host's wider source has no items.</summary>
    Empty,

    /// <summary>An external filter excluded every item.</summary>
    NoResults,
}

/// <summary>Direction of an active header sort.</summary>
public enum TableSortDirection
{
    Ascending,
    Descending,
}

/// <summary>What completed layout operation produced a <see cref="TableView.LayoutChanged"/> event.</summary>
public enum TableLayoutChangeKind
{
    Sort,
    ColumnMove,
    ColumnResize,
    AutoFit,
    Visibility,
    Reset,
}
