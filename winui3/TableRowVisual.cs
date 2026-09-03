using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Synapse;

/// <summary>
/// The table-drawn selected, current, and dragged cues. The row template's root, wrapping the
/// cells panel.
/// </summary>
/// <remarks>
/// The container cannot supply either cue. Its own selected fill measures 1.08:1 in Light and
/// 1.18:1 in Dark against section 19's 3:1 requirement, and none of its nine visual states
/// expresses a current row that is not selected.
/// </remarks>
public sealed partial class TableRowVisual : ContentControl
{
    private TableView? _owner;

    public TableRowVisual()
    {
        DefaultStyleKey = typeof(TableRowVisual);
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        DataContextChanged += OnRowItemChanged;
    }

    protected override void OnApplyTemplate()
    {
        base.OnApplyTemplate();
        UpdateStates(useTransitions: false);
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_owner is not null)
        {
            return;
        }

        _owner = FindOwner(this);
        if (_owner is not null)
        {
            _owner.RowVisualsChanged += OnRowVisualsChanged;
        }

        UpdateStates(useTransitions: false);
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        if (_owner is null)
        {
            return;
        }

        _owner.RowVisualsChanged -= OnRowVisualsChanged;
        _owner = null;
    }

    /// <summary>A recycled container gets a new row item and must repaint before it is shown.</summary>
    private void OnRowItemChanged(FrameworkElement sender, DataContextChangedEventArgs args) =>
        UpdateStates(useTransitions: false);

    private void OnRowVisualsChanged(object? sender, EventArgs e) => UpdateStates(useTransitions: true);

    private void UpdateStates(bool useTransitions)
    {
        object? item = DataContext;
        bool selected = _owner is not null && _owner.IsRowSelected(item);
        bool current = _owner is not null && _owner.IsRowCurrent(item);
        bool dragging = _owner is not null && _owner.IsRowDragging(item);

        VisualStateManager.GoToState(this, selected ? "Selected" : "Unselected", useTransitions);
        VisualStateManager.GoToState(this, current ? "Current" : "NotCurrent", useTransitions);
        VisualStateManager.GoToState(this, dragging ? "Dragging" : "NotDragging", useTransitions);
    }

    internal static TableView? FindOwner(DependencyObject node)
    {
        DependencyObject? current = VisualTreeHelper.GetParent(node);
        while (current is not null)
        {
            if (current is TableView table)
            {
                return table;
            }

            current = VisualTreeHelper.GetParent(current);
        }

        return null;
    }
}
