using System.Collections;
using System.Collections.Specialized;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Windows.System;
using Windows.UI.Core;

namespace Synapse;

/// <summary>
/// A generic table surface: one vertical scrolling owner, one effective column layout shared by
/// the header strip and every realized row, and a table-owned horizontal axis.
/// </summary>
public sealed partial class TableView : Control
{
    private const string HeaderStripPartName = "PART_HeaderStrip";
    private const string ItemsViewPartName = "PART_ItemsView";
    private const string StateLayerPartName = "PART_StateLayer";
    private const string HorizontalScrollBarPartName = "PART_HorizontalScrollBar";
    private const string MarqueeOverlayPartName = "PART_MarqueeOverlay";
    private const string RowInsertionMarkerPartName = "PART_RowInsertionMarker";

    private const double WheelStepDips = 48;
    private const double WheelNotch = 120;

    private readonly TableSourceView _source;
    private readonly TableItemsView _view;
    private readonly List<ResolvedColumn> _resolved = new();
    private readonly TableSelectionModel _selection;

    private TableHeaderStrip? _headerStrip;
    private ListView? _itemsView;
    private ContentPresenter? _stateLayer;
    private ScrollBar? _horizontalScrollBar;
    private FrameworkElement? _marqueeOverlay;
    private FrameworkElement? _rowInsertionMarker;

    private bool _schemaCaptured;
    private TableLayoutState? _pendingLayoutState;

    public TableView()
    {
        DefaultStyleKey = typeof(TableView);
        _view = new TableItemsView(_identity);
        _selection = new TableSelectionModel(_identity);
        _source = new TableSourceView(DispatcherQueue);
        _source.SnapshotChanged += OnSnapshotChanged;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    /// <summary>
    /// Set while the table is out of the tree, so a settle that is already on the queue does not
    /// rebuild against template parts that have gone. Stopping the timer is not enough on its own:
    /// stopping it does not recall a tick the dispatcher has already picked up.
    /// </summary>
    private bool _detached;

    /// <summary>
    /// Raised once after each completed effective sort, column move, resize, fit, visibility, or
    /// reset. Never raised by initial setup or by <see cref="ApplyLayoutState"/>.
    /// </summary>
    public event EventHandler<TableLayoutChangedEventArgs>? LayoutChanged;

    /// <summary>
    /// The icon font the control's own generated menu draws from, so a host building the row menu
    /// section 15 gives it can draw from the same set.
    /// </summary>
    /// <remarks>
    /// The family is vendored inside this library and addressed by a path into this library's own
    /// packaged folder, which is not something a host can be expected to know or to repeat. Without
    /// this the host's only route to it was the theme dictionary's key, and a library's
    /// Themes/Generic.xaml is not part of <c>Application.Current.Resources</c>: looking it up there
    /// throws, which is what the torrent sample's row menu did.
    /// </remarks>
    public static Microsoft.UI.Xaml.Media.FontFamily IconFontFamily => TableIcons.Font;

    /// <summary>The single geometry source read by the header panel and every realized row panel.</summary>
    internal ResolvedLayout Layout { get; } = new();

    /// <summary>An independent snapshot of the current effective layout. Overrides only.</summary>
    public TableLayoutState GetLayoutState()
    {
        List<string> order = new();
        Dictionary<string, bool> visibility = new(StringComparer.Ordinal);
        Dictionary<string, double> widths = new(StringComparer.Ordinal);

        if (_schemaCaptured)
        {
            foreach (ResolvedColumn column in Layout.Order)
            {
                order.Add(column.Id);

                if (column.VisibilityOverride is bool visible && visible != column.BaselineVisibility)
                {
                    visibility[column.Id] = visible;
                }

                if (column.WidthOverride is double width && width != column.BaselineWidth)
                {
                    widths[column.Id] = width;
                }
            }
        }
        else
        {
            foreach (TableColumn column in Columns)
            {
                order.Add(column.Id);
            }
        }

        return new TableLayoutState(order, visibility, widths, _sortColumn?.Id, _sortDirection);
    }

    /// <summary>
    /// Restore a persisted layout defensively. Silent: it never raises
    /// <see cref="LayoutChanged"/>. Called before the first <c>Loaded</c> it is held and resolved
    /// immediately after schema capture.
    /// </summary>
    public void ApplyLayoutState(TableLayoutState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        if (!_schemaCaptured)
        {
            _pendingLayoutState = state;
            return;
        }

        // A restored sort changes the private view. Schema capture rebuilds it itself, so only the
        // post-load path needs this, and only when the effective sort actually moved.
        if (ApplyLayoutStateCore(state))
        {
            RebuildView();
        }
    }

    protected override void OnApplyTemplate()
    {
        base.OnApplyTemplate();
        DetachTemplateParts();

        _headerStrip = GetTemplateChild(HeaderStripPartName) as TableHeaderStrip;
        _itemsView = GetTemplateChild(ItemsViewPartName) as ListView;
        _stateLayer = GetTemplateChild(StateLayerPartName) as ContentPresenter;
        _horizontalScrollBar = GetTemplateChild(HorizontalScrollBarPartName) as ScrollBar;
        _marqueeOverlay = GetTemplateChild(MarqueeOverlayPartName) as FrameworkElement;
        _rowInsertionMarker = GetTemplateChild(RowInsertionMarkerPartName) as FrameworkElement;

        _headerStrip?.Attach(this);

        if (_itemsView is not null)
        {
            _itemsView.ItemsSource = _view;
            _itemsView.SizeChanged += OnBodySizeChanged;
            _itemsView.AddHandler(
                UIElement.PointerWheelChangedEvent,
                new PointerEventHandler(OnBodyPointerWheelChanged),
                handledEventsToo: true);
        }

        if (_horizontalScrollBar is not null)
        {
            _horizontalScrollBar.IndicatorMode = ScrollingIndicatorMode.MouseIndicator;
            _horizontalScrollBar.ValueChanged += OnHorizontalScrollBarValueChanged;
        }

        Layout.Invalidated += OnLayoutInvalidated;

        AttachInput();

        UpdateStateLayer();
        UpdateHorizontalRange();
        ApplySelectionToContainers();
    }

    private void DetachTemplateParts()
    {
        DetachInput();

        if (_itemsView is not null)
        {
            _itemsView.SizeChanged -= OnBodySizeChanged;
            _itemsView.RemoveHandler(
                UIElement.PointerWheelChangedEvent,
                new PointerEventHandler(OnBodyPointerWheelChanged));
        }

        if (_horizontalScrollBar is not null)
        {
            _horizontalScrollBar.ValueChanged -= OnHorizontalScrollBarValueChanged;
        }

        // A settle waiting to fire would rebuild a view whose template parts have just been taken
        // away, and would hold this table alive to do it.
        _settleDue?.Stop();

        Layout.Invalidated -= OnLayoutInvalidated;
    }

    /// <summary>
    /// Leaving the tree, which for the last table in an application is the window closing. Until
    /// this existed the settle timer was stopped only when the control was re-templated, so a table
    /// whose sort was still settling went on ticking into a torn-down XAML core and the tick failed
    /// inside the hosted list. Reloading is ordinary — a tab or a navigation frame does it — so
    /// this only pauses the settle; <see cref="OnLoaded"/> lets it run again.
    /// </summary>
    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        _detached = true;
        _settleDue?.Stop();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _detached = false;

        if (_schemaCaptured)
        {
            return;
        }

        CaptureSchema();
    }

    // ---------------------------------------------------------------- schema

    /// <summary>
    /// Capture the setup-only schema exactly once, validate it, and resolve the first effective
    /// layout — including a layout state the host applied before load.
    /// </summary>
    private void CaptureSchema()
    {
        ValidateColumns();

        _resolved.Clear();
        foreach (TableColumn column in Columns)
        {
            _resolved.Add(new ResolvedColumn(column));
        }

        _schemaCaptured = true;
        Columns.CollectionChanged += OnColumnsMutatedAfterCapture;

        // Identity is setup-only. Anything selected before this point was bucketed by reference.
        _identity.KeySelector = ItemKeySelector;
        _selection.RehashIdentity();

        Layout.SetOrder(_resolved);

        if (_pendingLayoutState is not null)
        {
            TableLayoutState pending = _pendingLayoutState;
            _pendingLayoutState = null;
            ApplyLayoutStateCore(pending);
        }

        UpdateHorizontalRange();
        RebuildView();
    }

    private void ValidateColumns()
    {
        HashSet<string> ids = new(StringComparer.Ordinal);
        bool anyVisible = false;

        foreach (TableColumn column in Columns)
        {
            if (column is null)
            {
                throw ConfigurationError("Columns contains a null entry.");
            }

            if (string.IsNullOrEmpty(column.Id))
            {
                throw ConfigurationError("Every column needs a non-empty Id.");
            }

            if (!ids.Add(column.Id))
            {
                throw ConfigurationError($"Duplicate column Id '{column.Id}'.");
            }

            if (string.IsNullOrEmpty(column.DisplayName))
            {
                throw ConfigurationError($"Column '{column.Id}' needs a non-empty DisplayName.");
            }

            if (!double.IsFinite(column.DefaultWidth) || column.DefaultWidth <= 0)
            {
                throw ConfigurationError(
                    $"Column '{column.Id}' needs a finite DefaultWidth greater than zero.");
            }

            if (!double.IsFinite(column.MinWidth) || column.MinWidth < 0)
            {
                throw ConfigurationError(
                    $"Column '{column.Id}' needs a finite, non-negative MinWidth.");
            }

            bool maxWidthValid = double.IsPositiveInfinity(column.MaxWidth)
                || (double.IsFinite(column.MaxWidth) && column.MaxWidth > 0);
            if (!maxWidthValid)
            {
                throw ConfigurationError(
                    $"Column '{column.Id}' needs a finite positive MaxWidth or positive infinity.");
            }

            if (column.MinWidth > column.MaxWidth)
            {
                throw ConfigurationError(
                    $"Column '{column.Id}' has MinWidth greater than MaxWidth.");
            }

            // Section 6.1: "a column is sortable only when CanSort is true and it has a pure
            // comparer". Without one the header would offer a sort that cannot order anything.
            if (column.CanSort && column.SortComparer is null)
            {
                throw ConfigurationError(
                    $"Column '{column.Id}' declares CanSort without a SortComparer.");
            }

            if (column.IsVisibleByDefault)
            {
                anyVisible = true;
            }
        }

        if (Columns.Count > 0 && !anyVisible)
        {
            throw ConfigurationError("At least one column must be visible by default.");
        }

        // Section 6.1: one row order. Under a sort by either of two claimants, a drop would name a
        // place in an order the other column contradicts.
        if (Columns.Count(column => column.DefinesRowOrder) > 1)
        {
            throw ConfigurationError("At most one column may set DefinesRowOrder.");
        }
    }

    private void OnColumnsMutatedAfterCapture(object? sender, NotifyCollectionChangedEventArgs e) =>
        throw ConfigurationError(
            "Columns is setup-only. Adding, removing, or replacing a column after the first " +
            "Loaded is a configuration error.");

    private static InvalidOperationException ConfigurationError(string message) => new(message);

    // ------------------------------------------------------- layout persistence

    /// <returns>True when the restored sort is not the one that was already in force.</returns>
    private bool ApplyLayoutStateCore(TableLayoutState state)
    {
        Dictionary<string, ResolvedColumn> byId = new(StringComparer.Ordinal);
        foreach (ResolvedColumn column in _resolved)
        {
            byId[column.Id] = column;
        }

        // Order: known IDs first, duplicates dropped after their first valid occurrence, then any
        // newly introduced column appended in definition order.
        List<ResolvedColumn> ordered = new();
        HashSet<string> placed = new(StringComparer.Ordinal);

        if (state.ColumnOrder is not null)
        {
            foreach (string id in state.ColumnOrder)
            {
                if (id is null || !byId.TryGetValue(id, out ResolvedColumn? column) || !placed.Add(id))
                {
                    continue;
                }

                ordered.Add(column);
            }
        }

        foreach (ResolvedColumn column in _resolved)
        {
            if (placed.Add(column.Id))
            {
                ordered.Add(column);
            }
        }

        // Both maps are complete override maps: an omitted ID clears any earlier override.
        foreach (ResolvedColumn column in ordered)
        {
            column.WidthOverride = null;
            column.VisibilityOverride = null;
        }

        if (state.ColumnWidths is not null)
        {
            foreach (KeyValuePair<string, double> entry in state.ColumnWidths)
            {
                if (entry.Key is null || !byId.TryGetValue(entry.Key, out ResolvedColumn? column))
                {
                    continue;
                }

                if (!column.Column.CanResize || !double.IsFinite(entry.Value) || entry.Value <= 0)
                {
                    continue;
                }

                column.WidthOverride = ResolvedColumn.Clamp(
                    entry.Value, column.Column.MinWidth, column.Column.MaxWidth);
            }
        }

        if (state.ColumnVisibility is not null)
        {
            foreach (KeyValuePair<string, bool> entry in state.ColumnVisibility)
            {
                if (entry.Key is null || !byId.TryGetValue(entry.Key, out ResolvedColumn? column))
                {
                    continue;
                }

                // A required column saved as hidden is restored.
                if (!entry.Value && !column.Column.CanHide)
                {
                    continue;
                }

                column.VisibilityOverride = entry.Value;
            }
        }

        EnsureOneVisibleColumn(ordered);

        bool sortChanged = RestoreSort(state, byId);

        // SetOrder republishes the geometry, which re-applies each header cell's sort indicator.
        Layout.SetOrder(ordered);
        UpdateHorizontalRange();
        return sortChanged;
    }

    private static void EnsureOneVisibleColumn(List<ResolvedColumn> ordered)
    {
        if (ordered.Count == 0)
        {
            return;
        }

        foreach (ResolvedColumn column in ordered)
        {
            if (column.IsVisible)
            {
                return;
            }
        }

        ResolvedColumn fallback = ordered[0];
        foreach (ResolvedColumn column in ordered)
        {
            if (column.BaselineVisibility)
            {
                fallback = column;
                break;
            }
        }

        fallback.VisibilityOverride = true;
    }

    // ---------------------------------------------------------------- source

    private void SetItemsSource(IEnumerable? source) => _source.SetSource(source);

    private void OnSnapshotChanged(object? sender, EventArgs e) => RebuildView();

    // ---------------------------------------------------- horizontal offset

    private void OnLayoutInvalidated(object? sender, LayoutInvalidationReason reason)
    {
        if (reason == LayoutInvalidationReason.Geometry)
        {
            UpdateHorizontalRange();
        }
    }

    private void OnBodySizeChanged(object sender, SizeChangedEventArgs e) => UpdateHorizontalRange();

    private void UpdateHorizontalRange()
    {
        double viewport = _itemsView?.ActualWidth ?? 0;
        double maximum = Math.Max(0, Layout.TotalWidth - viewport);

        if (Layout.HorizontalOffset > maximum)
        {
            Layout.HorizontalOffset = maximum;
        }

        if (_horizontalScrollBar is null)
        {
            return;
        }

        _horizontalScrollBar.Minimum = 0;
        _horizontalScrollBar.Maximum = maximum;
        _horizontalScrollBar.ViewportSize = viewport;
        _horizontalScrollBar.LargeChange = Math.Max(1, viewport);
        _horizontalScrollBar.SmallChange = WheelStepDips;
        _horizontalScrollBar.Value = Layout.HorizontalOffset;
        _horizontalScrollBar.Visibility = maximum > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    /// <summary>
    /// Every way the scroll bar's value can change moves the table: thumb drag, track click,
    /// arrow button, keyboard, and the RangeValue automation pattern. <c>Scroll</c> alone covers
    /// only the pointer paths, which leaves the bar and the content disagreeing.
    /// </summary>
    private void OnHorizontalScrollBarValueChanged(object sender, RangeBaseValueChangedEventArgs e) =>
        SetHorizontalOffset(e.NewValue);

    /// <summary>
    /// Shift+wheel and horizontal wheel drive the table's own offset. The inner ScrollViewer's
    /// horizontal axis is disabled, so the event is marked handled to stop it scrolling.
    /// </summary>
    private void OnBodyPointerWheelChanged(object sender, PointerRoutedEventArgs e)
    {
        PointerPointProperties properties = e.GetCurrentPoint(this).Properties;

        bool horizontalWheel = properties.IsHorizontalMouseWheel;
        bool shiftDown = InputKeyboardSource
            .GetKeyStateForCurrentThread(VirtualKey.Shift)
            .HasFlag(CoreVirtualKeyStates.Down);

        if (!horizontalWheel && !shiftDown)
        {
            return;
        }

        double notches = properties.MouseWheelDelta / WheelNotch;
        double delta = horizontalWheel ? notches : -notches;
        SetHorizontalOffset(Layout.HorizontalOffset + (delta * WheelStepDips));
        e.Handled = true;
    }

    private void SetHorizontalOffset(double value)
    {
        double viewport = _itemsView?.ActualWidth ?? 0;
        double maximum = Math.Max(0, Layout.TotalWidth - viewport);
        double clamped = Math.Clamp(value, 0, maximum);

        Layout.HorizontalOffset = clamped;

        if (_horizontalScrollBar is not null)
        {
            _horizontalScrollBar.Value = clamped;
        }
    }

    // ------------------------------------------------- loading / empty states

    /// <summary>
    /// Section 17's three-way precedence. It reads the resolved view, not <see cref="IsLoading"/>,
    /// so existing rows stay visible during a refresh.
    /// </summary>
    private void UpdateStateLayer()
    {
        if (_stateLayer is null)
        {
            return;
        }

        if (_view.Count > 0)
        {
            _stateLayer.Content = null;
            _stateLayer.ContentTemplate = null;
            _stateLayer.Visibility = Visibility.Collapsed;
            return;
        }

        object? content;
        DataTemplate? template;

        if (IsLoading)
        {
            content = LoadingContent;
            template = LoadingContentTemplate;
        }
        else if (EmptyState == TableEmptyState.NoResults)
        {
            content = NoResultsContent;
            template = NoResultsContentTemplate;
        }
        else
        {
            content = EmptyContent;
            template = EmptyContentTemplate;
        }

        _stateLayer.Content = content;
        _stateLayer.ContentTemplate = template;
        _stateLayer.Visibility = content is null && template is null
            ? Visibility.Collapsed
            : Visibility.Visible;
    }
}
