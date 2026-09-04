using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;

namespace Synapse;

/// <summary>
/// The table-owned selection surface of specification sections 5, 5.3 and 13. The table is the
/// single interactive selection owner: the hosted list's own <c>SelectionChanged</c> is never
/// treated as truth, and the authoritative state is re-applied to it after every change.
/// </summary>
public sealed partial class TableView
{
    public static readonly DependencyProperty IsMarqueeSelectionEnabledProperty =
        DependencyProperty.Register(
            nameof(IsMarqueeSelectionEnabled),
            typeof(bool),
            typeof(TableView),
            new PropertyMetadata(false, OnMarqueeSelectionEnabledChanged));

    public static readonly DependencyProperty IsRowReorderingEnabledProperty =
        DependencyProperty.Register(
            nameof(IsRowReorderingEnabled),
            typeof(bool),
            typeof(TableView),
            new PropertyMetadata(true, OnRowReorderingEnabledChanged));

    /// <summary>
    /// Section 7's escape hatch for a custom interactive control the table cannot recognize. Set
    /// on the control's root or an ancestor inside a cell template.
    /// </summary>
    public static readonly DependencyProperty SuppressRowGesturesProperty =
        DependencyProperty.RegisterAttached(
            "SuppressRowGestures",
            typeof(bool),
            typeof(TableView),
            new PropertyMetadata(false));

    private readonly TableItemIdentity _identity = new();

    private IReadOnlyList<object>? _selectedPacket;

    /// <summary>Set while the table is writing the hosted list's selection, to stop re-entry.</summary>
    private bool _syncingContainers;

    /// <summary>Set while a snapshot is being applied to the private view.</summary>
    private bool _reconcilingView;

    /// <summary>
    /// Raised once after any completed selection or current-item change, including the ones caused
    /// by <see cref="SetSelection"/> and by source reconciliation. Never raised for a rehydration
    /// or a reorder that leaves the logical packet unchanged.
    /// </summary>
    public event EventHandler<TableSelectionStateChangedEventArgs>? SelectionStateChanged;

    /// <summary>Raised after the table has processed the input that invoked a row.</summary>
    public event EventHandler<TableItemInvokedEventArgs>? ItemInvoked;

    /// <summary>
    /// Raised after the table has applied section 15's context mechanics, so a handler that reads
    /// <see cref="SelectedItems"/> sees the packet the menu will act on.
    /// </summary>
    public event EventHandler<TableRowContextRequestedEventArgs>? RowContextRequested;

    /// <summary>
    /// Raised once for a completed row drag that asks for a new order. The table has changed
    /// nothing: it never mutates the source, and it does not infer that the host accepted the
    /// request.
    /// </summary>
    public event EventHandler<TableRowsReorderRequestedEventArgs>? RowsReorderRequested;

    /// <summary>Row visuals re-read the table's selected and current state when this fires.</summary>
    internal event EventHandler? RowVisualsChanged;

    /// <summary>Setup-only. Default <see cref="ListViewSelectionMode.Extended"/>.</summary>
    public ListViewSelectionMode SelectionMode { get; set; } = ListViewSelectionMode.Extended;

    /// <summary>
    /// Setup-only. Optional stable, non-empty, unique ordinal key per item. Without it identity is
    /// object reference.
    /// </summary>
    public Func<object, string>? ItemKeySelector { get; set; }

    /// <summary>Setup-only. Null means every item is interactive.</summary>
    public Func<object, bool>? CanInteractWithItem { get; set; }

    /// <summary>Observational. The selected packet in current visual row order.</summary>
    public IReadOnlyList<object> SelectedItems => _selectedPacket ??= BuildSelectedPacket();

    /// <summary>Observational. The logical current row; it may be selected or unselected.</summary>
    public object? CurrentItem => _selection.Current;

    public bool IsMarqueeSelectionEnabled
    {
        get => (bool)GetValue(IsMarqueeSelectionEnabledProperty);
        set => SetValue(IsMarqueeSelectionEnabledProperty, value);
    }

    public bool IsRowReorderingEnabled
    {
        get => (bool)GetValue(IsRowReorderingEnabledProperty);
        set => SetValue(IsRowReorderingEnabledProperty, value);
    }

    /// <summary>The private view, in current visual row order.</summary>
    internal IReadOnlyList<object> View => _view;

    internal bool IsRowSelected(object? item) => item is not null && _selection.IsSelected(item);

    internal bool IsRowCurrent(object? item) =>
        item is not null && _selection.IsSame(item, _selection.Current);

    /// <summary>
    /// Whether this row should draw the "you are here" cue: it holds focus, and selection is not
    /// already saying so.
    /// </summary>
    /// <remarks>
    /// Clicking a row both selects it and focuses it, so drawing focus unconditionally puts a
    /// second mark on a row that is already marked, and two selected rows then look different with
    /// no cause the user can see. The cue is therefore drawn only where selection does not already
    /// carry it — a row reached with Ctrl and the arrow keys, which moves focus without selecting.
    /// The platform's own focus visual is off for rows, so this is the only thing left saying where
    /// the keyboard is.
    /// </remarks>
    /// <remarks>
    /// The identity test comes first on purpose. Every realized row asks this whenever the row
    /// visuals are told to repaint, and only one of them can be the focus row, so putting the
    /// cheap test in front means the walk that <see cref="RowSurfaceFocusState"/> does — a focus
    /// manager query and a climb up the visual tree — runs once per repaint rather than once per
    /// row on screen.
    /// </remarks>
    internal bool IsRowFocused(object? item) =>
        item is not null
        && _selection.IsSame(item, _selection.Focus)
        && !IsRowSelected(item)
        && RowSurfaceFocusState() != FocusState.Unfocused;

    /// <summary>Section 5.3: withdrawing the marquee mid-gesture cancels it before the flag applies.</summary>
    private static void OnMarqueeSelectionEnabledChanged(
        DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TableView table && !(bool)e.NewValue && table._gesture == GesturePhase.Marquee)
        {
            table.CommitSelection(table.RestoreSelectionBeforeMarquee());
        }
    }

    /// <summary>Section 5.3: withdrawing reordering mid-drag cancels it, and raises no request.</summary>
    private static void OnRowReorderingEnabledChanged(
        DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TableView table && !(bool)e.NewValue)
        {
            table.CancelRowDrag();
        }
    }

    private int IndexInView(object? item)
    {
        if (item is null)
        {
            return -1;
        }

        for (int i = 0; i < View.Count; i++)
        {
            if (_selection.IsSame(View[i], item))
            {
                return i;
            }
        }

        return -1;
    }

    public static void SetSuppressRowGestures(DependencyObject element, bool value) =>
        element.SetValue(SuppressRowGesturesProperty, value);

    public static bool GetSuppressRowGestures(DependencyObject element) =>
        (bool)element.GetValue(SuppressRowGesturesProperty);

    /// <summary>
    /// The only programmatic selection entry point. Idempotent: an equal logical request raises no
    /// event, so a host can project selection out and push it back in without a suppression flag.
    /// </summary>
    public void SetSelection(IEnumerable<object> items, object? currentItem = null)
    {
        ArgumentNullException.ThrowIfNull(items);

        SyncSelectionPolicy();
        CancelGesture();
        CommitSelection(_selection.SetSelection(items, currentItem, View));
    }

    /// <summary>
    /// Section 15: an already-selected row keeps the whole selected packet, and any other row
    /// becomes the selection. Both make the row current, focused, and the next range anchor, so a
    /// context request on an already-selected row still reports the moved current item.
    /// </summary>
    private bool SelectForContext(object item) => _selection.SetSelection(
        _selection.IsSelected(item) ? SelectedItems : new[] { item }, item, View);

    /// <summary>
    /// Re-evaluate the current source snapshot after a batch changed values the active sort or
    /// <see cref="CanInteractWithItem"/> depends on. It re-sorts and reconciles, and does not
    /// re-enumerate the source.
    /// </summary>
    public void RefreshView() => RebuildView();

    // ------------------------------------------------------------------ view reconciliation

    /// <summary>
    /// Apply the current snapshot, under the current sort, to the private view and then to the
    /// table-owned selection. Specification 5.3 leaves the mechanism open — "the implementation may
    /// update a private view incrementally or rebuild it, but the observable result MUST be the
    /// same" — and the observable result is settled below, not by the collection notifications:
    /// selection is re-applied from the table's own model, and at most one event is raised.
    /// </summary>
    private void RebuildView()
    {
        // Section 5.3: a view-changing update cancels a live row drag with no request, and drops the
        // marquee's own result first, so what gets reconciled to the new view is the selection the
        // gesture started from.
        CancelRowDrag();
        bool restored = RestoreSelectionBeforeMarquee();

        ValidateItemKeys(_source.Snapshot);

        // Capture how the rows hold focus, not merely that they do, and capture it before the view
        // changes. Once the focused row's container is gone the framework has already rescued
        // focus, carrying that container's state to whatever it landed on, which is not the row's.
        FocusState rowFocus = RowSurfaceFocusState();

        // The hosted list keeps a selection of its own and revises it on every single removal and
        // insertion. A re-sort of 2,002 rows sends it about 3,800 of those, and none of that
        // bookkeeping survives: the table's own selection is re-applied a few lines below, over
        // whatever the list decided. Taking the list out of selection for the duration removes
        // that work per notification rather than once.
        ListViewSelectionMode hosted = _itemsView?.SelectionMode ?? ListViewSelectionMode.None;

        _reconcilingView = true;
        try
        {
            if (_itemsView is not null)
            {
                _itemsView.SelectionMode = ListViewSelectionMode.None;
            }

            _view.Reconcile(ViewOrder());
        }
        finally
        {
            if (_itemsView is not null)
            {
                _itemsView.SelectionMode = hosted;
            }

            _reconcilingView = false;
        }

        ReconcileSelection(restored, rowFocus);
        UpdateStateLayer();
    }

    /// <summary>
    /// Section 5.3: a null, empty, or duplicate configured key is a source-contract error, so the
    /// snapshot is checked before anything reconciles against it.
    /// </summary>
    private void ValidateItemKeys(IReadOnlyList<object> snapshot)
    {
        if (ItemKeySelector is not { } key)
        {
            return;
        }

        HashSet<string> seen = new(StringComparer.Ordinal);
        foreach (object item in snapshot)
        {
            string value = key(item);
            if (string.IsNullOrEmpty(value))
            {
                throw ConfigurationError("ItemKeySelector returned a null or empty key.");
            }

            if (!seen.Add(value))
            {
                throw ConfigurationError($"ItemKeySelector returned the duplicate key '{value}'.");
            }
        }
    }

    /// <summary>
    /// Re-apply the table-owned state after a snapshot. The hosted list drops a row from its own
    /// selection as soon as that row is removed, and a reorder is a removal, so its selection and
    /// its focus are restored from the model here rather than trusted.
    /// </summary>
    private void ReconcileSelection(bool alreadyChanged, FocusState rowFocus)
    {
        SyncSelectionPolicy();

        bool changed = _selection.Reconcile(View);
        CommitSelection(changed || alreadyChanged);

        RestoreRowFocus(rowFocus);
    }

    // ------------------------------------------------------------------ commit

    /// <summary>The setup-only policy the model needs. Read live; changing it late is a config error.</summary>
    private void SyncSelectionPolicy()
    {
        _selection.Mode = SelectionMode;
        _selection.Eligible = CanInteractWithItem;
    }

    /// <summary>
    /// One exit point for every selection change: invalidate the packet, push the authoritative
    /// state to the hosted list and the row visuals, then raise at most one event.
    /// </summary>
    private void CommitSelection(bool changed)
    {
        _selectedPacket = null;
        ApplySelectionToContainers();
        RowVisualsChanged?.Invoke(this, EventArgs.Empty);

        if (changed)
        {
            SelectionStateChanged?.Invoke(
                this, new TableSelectionStateChangedEventArgs(SelectedItems, CurrentItem));
        }
    }

    private IReadOnlyList<object> BuildSelectedPacket()
    {
        List<object> packet = new();
        foreach (object item in View)
        {
            if (_selection.IsSelected(item))
            {
                packet.Add(item);
            }
        }

        return packet;
    }

    /// <summary>
    /// The container selects itself on a press, a tap, and Space, and removing a row drops it from
    /// the list's selection. Every one of those arrives here, and every one of them is overwritten
    /// with the table's own state. Measured: without this the hosted list and the table disagree
    /// after a real click.
    /// </summary>
    private void OnHostedSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // A reconcile raises this synchronously on each removal, with a row the table has not
        // finished moving already gone. Reading the list there would record a selection that was
        // never real; RebuildView re-applies the state itself once the whole snapshot is applied.
        if (!_syncingContainers && !_reconcilingView)
        {
            ApplySelectionToContainers();
        }
    }

    /// <summary>
    /// Bring the hosted list's selection to the table's. Only the rows that differ are touched, and
    /// they are touched as index ranges: the list's <c>SelectedItems</c> is a vector, so adding rows
    /// one at a time is a container update per row and a linear search per check, while
    /// <c>SelectRange</c> and <c>DeselectRange</c> are one call per run of rows.
    /// </summary>
    private void ApplySelectionToContainers()
    {
        if (_itemsView is null || _syncingContainers)
        {
            return;
        }

        int count = View.Count;
        if (count == 0)
        {
            return;
        }

        bool[] listed = new bool[count];
        foreach (ItemIndexRange range in _itemsView.SelectedRanges)
        {
            int last = Math.Min(range.LastIndex, count - 1);
            for (int i = Math.Max(range.FirstIndex, 0); i <= last; i++)
            {
                listed[i] = true;
            }
        }

        _syncingContainers = true;
        try
        {
            int start = -1;
            bool selecting = false;

            for (int i = 0; i <= count; i++)
            {
                bool wanted = i < count && _selection.IsSelected(View[i]);
                bool differs = i < count && wanted != listed[i];

                if (start >= 0 && (!differs || wanted != selecting))
                {
                    ApplyRange(start, i - start, selecting);
                    start = -1;
                }

                if (differs && start < 0)
                {
                    start = i;
                    selecting = wanted;
                }
            }
        }
        finally
        {
            _syncingContainers = false;
        }
    }

    private void ApplyRange(int first, int length, bool select)
    {
        ItemIndexRange range = new(first, (uint)length);
        if (select)
        {
            _itemsView!.SelectRange(range);
        }
        else
        {
            _itemsView!.DeselectRange(range);
        }
    }
}
