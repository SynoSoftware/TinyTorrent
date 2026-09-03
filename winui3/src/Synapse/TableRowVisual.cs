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

        // The cells panel is this control's content, so it already exists when the template is
        // applied, during the first measure. Given its owner here it realizes its cells in this
        // layout pass, instead of after Loaded in a second one.
        if (Content is TableCellsPanel cells && (_owner ?? FindOwner(this)) is TableView owner)
        {
            cells.Attach(owner);
        }

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
        // Current is not read here on purpose: WinUI paints no current-row cue and neither do we.
        // Selection is read for the accent bar only. The selected background stays the
        // container's, because drawing one here put a second fill over it.
        object? item = DataContext;
        bool selected = _owner is not null && _owner.IsRowSelected(item);
        bool focused = _owner is not null && _owner.IsRowFocused(item);
        bool dragging = _owner is not null && _owner.IsRowDragging(item);

        VisualStateManager.GoToState(this, selected ? "Selected" : "Rest", useTransitions);
        VisualStateManager.GoToState(this, focused ? "RowFocused" : "RowUnfocused", useTransitions);
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
