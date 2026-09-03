using Microsoft.UI.Xaml;

namespace Synapse;

/// <summary>
/// One column definition. Setup-only schema: <see cref="TableView"/> captures every value here
/// exactly once, at its first <c>Loaded</c>. Changing a value afterwards is unsupported.
/// </summary>
public sealed partial class TableColumn : DependencyObject
{
    /// <summary>Stable, unique, non-empty persistence key.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Non-empty localized plain-text name used by generated menus and UI Automation.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Header content. When null and <see cref="HeaderTemplate"/> is null the table
    /// generates a trimmed one-line label from <see cref="DisplayName"/>.</summary>
    public object? Header { get; set; }

    public DataTemplate? HeaderTemplate { get; set; }

    /// <summary>Cell content template. It receives the row item as its content.</summary>
    public DataTemplate? CellTemplate { get; set; }

    /// <summary>Baseline width in DIPs. Finite and greater than zero.</summary>
    public double DefaultWidth { get; set; } = 150;

    /// <summary>Lower width bound in DIPs. Finite and non-negative.</summary>
    public double MinWidth { get; set; } = 48;

    /// <summary>Upper width bound in DIPs. A finite positive value or positive infinity.</summary>
    public double MaxWidth { get; set; } = double.PositiveInfinity;

    public bool IsVisibleByDefault { get; set; } = true;

    public bool CanHide { get; set; } = true;

    public bool CanResize { get; set; } = true;

    public bool CanSort { get; set; }

    public HorizontalAlignment CellHorizontalAlignment { get; set; } = HorizontalAlignment.Left;

    public IComparer<object>? SortComparer { get; set; }
}
