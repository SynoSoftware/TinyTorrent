using Microsoft.UI.Xaml;
using Windows.Foundation;

namespace Synapse;

/// <summary>
/// Payload of <see cref="TableView.SelectionStateChanged"/>. An immutable post-mechanics snapshot;
/// <see cref="SelectedItems"/> is in current visual row order.
/// </summary>
public sealed class TableSelectionStateChangedEventArgs : EventArgs
{
    public TableSelectionStateChangedEventArgs(IReadOnlyList<object> selectedItems, object? currentItem)
    {
        SelectedItems = selectedItems;
        CurrentItem = currentItem;
    }

    public IReadOnlyList<object> SelectedItems { get; }

    public object? CurrentItem { get; }
}

/// <summary>
/// Payload of <see cref="TableView.ItemInvoked"/>. The selection is the one that stands after the
/// invoking input was processed.
/// </summary>
public sealed class TableItemInvokedEventArgs : EventArgs
{
    public TableItemInvokedEventArgs(object item, IReadOnlyList<object> selectedItems)
    {
        Item = item;
        SelectedItems = selectedItems;
    }

    public object Item { get; }

    public IReadOnlyList<object> SelectedItems { get; }
}

/// <summary>
/// Payload of <see cref="TableView.RowContextRequested"/>. The host builds and shows its own menu
/// at <see cref="PlacementTarget"/> while the handler runs; the target is presentation context for
/// that moment, not state to keep.
/// </summary>
public sealed class TableRowContextRequestedEventArgs : EventArgs
{
    public TableRowContextRequestedEventArgs(
        object item,
        IReadOnlyList<object> selectedItems,
        FrameworkElement placementTarget,
        Point? relativePoint)
    {
        Item = item;
        SelectedItems = selectedItems;
        PlacementTarget = placementTarget;
        RelativePoint = relativePoint;
    }

    public object Item { get; }

    public IReadOnlyList<object> SelectedItems { get; }

    /// <summary>The realized row the request came from.</summary>
    public FrameworkElement PlacementTarget { get; }

    /// <summary>Relative to <see cref="PlacementTarget"/>; null for a keyboard invocation.</summary>
    public Point? RelativePoint { get; }
}
