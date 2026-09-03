using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Synapse;

/// <summary>
/// The one panel type used by both the header strip and the row template. It reads the resolved
/// layout, realizes one child per visible column, and arranges each child at its cumulative x
/// minus the table-owned horizontal offset.
/// </summary>
/// <remarks>
/// A pure horizontal-offset change arrives as <see cref="LayoutInvalidationReason.Offset"/> and
/// calls <see cref="UIElement.InvalidateArrange"/> only, so no measure pass runs.
/// </remarks>
public sealed partial class TableCellsPanel : Panel
{
    private TableView? _owner;
    private ResolvedLayout? _layout;
    private bool _isHeaderPanel;

    public TableCellsPanel()
    {
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        DataContextChanged += OnDataContextChanged;
    }

    /// <summary>Claimed by <see cref="TableHeaderStrip"/> before the panel is ever loaded.</summary>
    internal void AttachAsHeader(TableView owner)
    {
        _isHeaderPanel = true;
        Attach(owner);
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_owner is not null)
        {
            Attach(_owner);
            return;
        }

        TableView? owner = FindOwner();
        if (owner is not null)
        {
            Attach(owner);
        }
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        if (_layout is null)
        {
            return;
        }

        _layout.Invalidated -= OnLayoutInvalidated;
        _layout = null;
    }

    private void Attach(TableView owner)
    {
        _owner = owner;
        if (_layout is not null)
        {
            return;
        }

        _layout = owner.Layout;
        _layout.Invalidated += OnLayoutInvalidated;
        SyncChildren();
        InvalidateMeasure();
    }

    private TableView? FindOwner()
    {
        DependencyObject? node = VisualTreeHelper.GetParent(this);
        while (node is not null)
        {
            if (node is TableView table)
            {
                return table;
            }

            node = VisualTreeHelper.GetParent(node);
        }

        return null;
    }

    private void OnLayoutInvalidated(object? sender, LayoutInvalidationReason reason)
    {
        if (reason == LayoutInvalidationReason.Offset)
        {
            InvalidateArrange();
            return;
        }

        SyncChildren();
        InvalidateMeasure();
    }

    private void OnDataContextChanged(FrameworkElement sender, DataContextChangedEventArgs args)
    {
        if (_isHeaderPanel || _layout is null)
        {
            return;
        }

        foreach (UIElement child in Children)
        {
            if (child is ContentPresenter presenter)
            {
                presenter.Content = args.NewValue;
            }
        }
    }

    private void SyncChildren()
    {
        if (_layout is null)
        {
            return;
        }

        IReadOnlyList<VisibleColumn> visible = _layout.VisibleColumns;

        while (Children.Count > visible.Count)
        {
            Children.RemoveAt(Children.Count - 1);
        }

        for (int i = 0; i < visible.Count; i++)
        {
            TableColumn column = visible[i].Column.Column;
            if (i < Children.Count)
            {
                UpdateChild(Children[i], column);
            }
            else
            {
                Children.Add(CreateChild(column));
            }
        }
    }

    /// <summary>
    /// Re-apply each header cell's sort indicator. Sorting changes no geometry, so nothing else
    /// republishes the header.
    /// </summary>
    internal void RefreshHeaderCells()
    {
        if (_isHeaderPanel)
        {
            SyncChildren();
        }
    }

    private UIElement CreateChild(TableColumn column)
    {
        if (_isHeaderPanel)
        {
            TableHeaderCell cell = new();
            UpdateChild(cell, column);
            return cell;
        }

        ContentPresenter presenter = new()
        {
            VerticalContentAlignment = VerticalAlignment.Stretch,
        };
        UpdateChild(presenter, column);
        return presenter;
    }

    private void UpdateChild(UIElement child, TableColumn column)
    {
        if (child is TableHeaderCell cell)
        {
            cell.SetColumn(column);
            cell.SetSort(_owner?.SortDirectionOf(column));
            return;
        }

        if (child is ContentPresenter presenter)
        {
            presenter.ContentTemplate = column.CellTemplate;
            presenter.HorizontalContentAlignment = column.CellHorizontalAlignment;
            presenter.Content = DataContext;
        }
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        if (_layout is null)
        {
            return new Size(0, 0);
        }

        IReadOnlyList<VisibleColumn> visible = _layout.VisibleColumns;
        int count = Math.Min(Children.Count, visible.Count);
        double height = 0;

        for (int i = 0; i < count; i++)
        {
            UIElement child = Children[i];
            child.Measure(new Size(visible[i].Width, double.PositiveInfinity));
            height = Math.Max(height, child.DesiredSize.Height);
        }

        return new Size(_layout.TotalWidth, height);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        if (_layout is null)
        {
            return finalSize;
        }

        IReadOnlyList<VisibleColumn> visible = _layout.VisibleColumns;
        int count = Math.Min(Children.Count, visible.Count);
        double offset = _layout.HorizontalOffset;

        for (int i = 0; i < count; i++)
        {
            Children[i].Arrange(new Rect(
                visible[i].Offset - offset,
                0,
                visible[i].Width,
                finalSize.Height));
        }

        return finalSize;
    }
}
