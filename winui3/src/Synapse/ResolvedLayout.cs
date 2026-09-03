namespace Synapse;

/// <summary>Why the resolved layout changed. Decides whether a subscriber re-measures.</summary>
internal enum LayoutInvalidationReason
{
    /// <summary>Only <see cref="ResolvedLayout.HorizontalOffset"/> moved. Arrange is enough.</summary>
    Offset,

    /// <summary>Order, width, or visibility changed. Children and measure are stale.</summary>
    Geometry,
}

/// <summary>
/// One column's resolved state. Width and visibility are baseline plus an optional override so
/// that section 18's sparse override maps can be emitted without guessing.
/// </summary>
internal sealed class ResolvedColumn
{
    internal ResolvedColumn(TableColumn column)
    {
        Column = column;
        BaselineWidth = Clamp(column.DefaultWidth, column.MinWidth, column.MaxWidth);
    }

    internal TableColumn Column { get; }

    internal string Id => Column.Id;

    /// <summary>Declared default width after the column's own bounds are applied.</summary>
    internal double BaselineWidth { get; }

    internal bool BaselineVisibility => Column.IsVisibleByDefault;

    internal double? WidthOverride { get; set; }

    internal bool? VisibilityOverride { get; set; }

    internal double Width => WidthOverride ?? BaselineWidth;

    internal bool IsVisible => VisibilityOverride ?? BaselineVisibility;

    internal static double Clamp(double value, double min, double max)
    {
        if (value < min)
        {
            value = min;
        }

        if (value > max)
        {
            value = max;
        }

        return value;
    }
}

/// <summary>A visible column with its derived geometry.</summary>
internal readonly struct VisibleColumn
{
    internal VisibleColumn(ResolvedColumn column, double offset)
    {
        Column = column;
        Offset = offset;
    }

    internal ResolvedColumn Column { get; }

    /// <summary>Cumulative x of this column's left edge, before the horizontal offset.</summary>
    internal double Offset { get; }

    internal double Width => Column.Width;
}

/// <summary>
/// The single geometry source. The header panel and every realized row panel read it and
/// nothing else computes column geometry.
/// </summary>
internal sealed class ResolvedLayout
{
    private readonly List<ResolvedColumn> _order = new();
    private readonly List<VisibleColumn> _visible = new();
    private double _totalWidth;
    private double _horizontalOffset;

    internal event EventHandler<LayoutInvalidationReason>? Invalidated;

    /// <summary>The complete ordered column list, including hidden columns.</summary>
    internal IReadOnlyList<ResolvedColumn> Order => _order;

    /// <summary>Derived visible geometry, in effective order.</summary>
    internal IReadOnlyList<VisibleColumn> VisibleColumns => _visible;

    /// <summary>Sum of visible resolved widths.</summary>
    internal double TotalWidth => _totalWidth;

    /// <summary>The table-owned horizontal offset. Panels subtract it at arrange time.</summary>
    internal double HorizontalOffset
    {
        get => _horizontalOffset;
        set
        {
            if (_horizontalOffset == value)
            {
                return;
            }

            _horizontalOffset = value;
            Invalidated?.Invoke(this, LayoutInvalidationReason.Offset);
        }
    }

    /// <summary>The resolved column with this ID, or null when no column declares it.</summary>
    internal ResolvedColumn? Find(string id)
    {
        foreach (ResolvedColumn column in _order)
        {
            if (string.Equals(column.Id, id, StringComparison.Ordinal))
            {
                return column;
            }
        }

        return null;
    }

    /// <summary>This column's place among the visible ones, or -1 when it is hidden.</summary>
    internal int IndexOfVisible(ResolvedColumn column)
    {
        for (int i = 0; i < _visible.Count; i++)
        {
            if (ReferenceEquals(_visible[i].Column, column))
            {
                return i;
            }
        }

        return -1;
    }

    /// <summary>
    /// The visible column whose trailing edge lies within <paramref name="tolerance"/> of
    /// <paramref name="x"/>, or -1 when none does. <paramref name="x"/> is a header-strip
    /// coordinate, so the horizontal offset is subtracted here.
    /// </summary>
    internal int TrailingEdgeNear(double x, double tolerance)
    {
        for (int i = 0; i < _visible.Count; i++)
        {
            double edge = _visible[i].Offset + _visible[i].Width - _horizontalOffset;
            if (Math.Abs(x - edge) <= tolerance)
            {
                return i;
            }
        }

        return -1;
    }

    internal void SetOrder(IEnumerable<ResolvedColumn> columns)
    {
        _order.Clear();
        _order.AddRange(columns);
        Rebuild();
    }

    /// <summary>Recompute derived visible geometry and announce a geometry change.</summary>
    internal void Rebuild()
    {
        _visible.Clear();
        double x = 0;
        foreach (ResolvedColumn column in _order)
        {
            if (!column.IsVisible)
            {
                continue;
            }

            _visible.Add(new VisibleColumn(column, x));
            x += column.Width;
        }

        _totalWidth = x;
        Invalidated?.Invoke(this, LayoutInvalidationReason.Geometry);
    }
}
