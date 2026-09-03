using System.Globalization;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;
using Windows.System;
using Windows.UI.Core;

namespace Synapse;

/// <summary>
/// The one pointer-gesture arbiter of sections 13 to 16, and the keyboard set of section 13.
/// </summary>
/// <remarks>
/// Keyboard handling is gated on the focused element, not on <c>Handled</c>: a single-line
/// <c>TextBox</c> in a cell leaves the arrow keys unhandled, and gating on that would move the
/// current row while the caret is in the editor.
/// </remarks>
public sealed partial class TableView
{
    /// <summary>Movement below this is a click, not a drag or a marquee.</summary>
    private const double DragThresholdDips = 4;

    /// <summary>Groups the drag's destination announcements, so only the latest one is spoken.</summary>
    private const string RowDragActivityId = "SynapseRowDrag";

    private readonly TableMarquee _marquee = new();
    private readonly TableRowDrag _rowDrag = new();

    private GesturePhase _gesture;
    private uint _gesturePointerId;

    /// <summary>Set only while the table holds a capture of its own, so it releases nothing else.</summary>
    private Pointer? _gestureCapture;

    /// <summary>The press position, relative to the hosted list: the space the marquee measures in.</summary>
    private Point _gestureOrigin;

    private object? _gestureItem;
    private bool _gestureCtrl;
    private bool _gestureShift;

    /// <summary>Set when the click's selection change waits for release, so a drag keeps its packet.</summary>
    private bool _gestureDeferred;

    /// <summary>The selection as it stood at press, restored if a committed gesture is cancelled.</summary>
    private IReadOnlyList<object> _gestureSelection = Array.Empty<object>();

    /// <summary>
    /// Section 16's moving packet, resolved once when the drag begins. Nothing can move the
    /// selection under a live drag, so the drop reports the packet the gesture started with.
    /// </summary>
    private IReadOnlyList<object> _movingPacket = Array.Empty<object>();

    /// <summary>The boundary the live drag last announced. Negative is no live destination.</summary>
    private int _dragBoundary = -1;

    private ScrollViewer? _innerScrollViewer;

    private enum GesturePhase
    {
        /// <summary>No button is down on the row surface.</summary>
        None,

        /// <summary>Pressed, and no gesture has begun. Release here is a click.</summary>
        Pressed,

        /// <summary>Section 14's rectangle, from a press on empty row surface.</summary>
        Marquee,

        /// <summary>Section 16's row drag, from a press on a row.</summary>
        RowDrag,
    }

    /// <summary>What the press landed on.</summary>
    private enum TableHit
    {
        /// <summary>An interactive cell descendant, a suppressed subtree, or outside the rows.</summary>
        Suppressed,

        Row,

        /// <summary>Row-surface space below or beside the rows.</summary>
        EmptySurface,
    }

    private void AttachInput()
    {
        PreviewKeyDown += OnTablePreviewKeyDown;

        if (_itemsView is null)
        {
            return;
        }

        // The container handles pointer input first and marks it handled, so every one of these
        // must be registered with handledEventsToo.
        _itemsView.AddHandler(
            UIElement.PointerPressedEvent, new PointerEventHandler(OnRowsPointerPressed), true);
        _itemsView.AddHandler(
            UIElement.PointerMovedEvent, new PointerEventHandler(OnRowsPointerMoved), true);
        _itemsView.AddHandler(
            UIElement.PointerReleasedEvent, new PointerEventHandler(OnRowsPointerReleased), true);
        _itemsView.AddHandler(
            UIElement.PointerCanceledEvent, new PointerEventHandler(OnRowsPointerCanceled), true);
        _itemsView.AddHandler(
            UIElement.PointerCaptureLostEvent, new PointerEventHandler(OnRowsPointerCaptureLost), true);
        _itemsView.AddHandler(
            UIElement.DoubleTappedEvent, new DoubleTappedEventHandler(OnRowsDoubleTapped), true);

        // Deliberately not handledEventsToo: a cell control that shows its own context flyout marks
        // this handled, and section 15 leaves that control its own menu.
        _itemsView.ContextRequested += OnRowsContextRequested;
        _itemsView.SelectionChanged += OnHostedSelectionChanged;
    }

    private void DetachInput()
    {
        PreviewKeyDown -= OnTablePreviewKeyDown;
        CancelGesture();

        if (_itemsView is null)
        {
            return;
        }

        _itemsView.RemoveHandler(
            UIElement.PointerPressedEvent, new PointerEventHandler(OnRowsPointerPressed));
        _itemsView.RemoveHandler(
            UIElement.PointerMovedEvent, new PointerEventHandler(OnRowsPointerMoved));
        _itemsView.RemoveHandler(
            UIElement.PointerReleasedEvent, new PointerEventHandler(OnRowsPointerReleased));
        _itemsView.RemoveHandler(
            UIElement.PointerCanceledEvent, new PointerEventHandler(OnRowsPointerCanceled));
        _itemsView.RemoveHandler(
            UIElement.PointerCaptureLostEvent, new PointerEventHandler(OnRowsPointerCaptureLost));
        _itemsView.RemoveHandler(
            UIElement.DoubleTappedEvent, new DoubleTappedEventHandler(OnRowsDoubleTapped));
        _itemsView.ContextRequested -= OnRowsContextRequested;
        _itemsView.SelectionChanged -= OnHostedSelectionChanged;

        _innerScrollViewer = null;
    }

    // ------------------------------------------------------------------ pointer arbiter

    private void OnRowsPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        CancelGesture();

        if (_itemsView is null)
        {
            return;
        }

        PointerPoint point = e.GetCurrentPoint(_itemsView);
        bool mouseOrPen = e.Pointer.PointerDeviceType is PointerDeviceType.Mouse or PointerDeviceType.Pen;
        if (!mouseOrPen || !point.Properties.IsLeftButtonPressed)
        {
            return;
        }

        TableHit hit = HitTest(e.OriginalSource as DependencyObject, out object? item);
        if (hit == TableHit.Suppressed)
        {
            return;
        }

        SyncSelectionPolicy();

        _gesture = GesturePhase.Pressed;
        _gesturePointerId = e.Pointer.PointerId;
        _gestureOrigin = point.Position;
        _gestureItem = item;
        _gestureCtrl = IsDown(VirtualKey.Control);
        _gestureShift = IsDown(VirtualKey.Shift);
        _gestureSelection = SelectedItems;

        // A plain press waits for release whenever the drag it might become must not have changed
        // the selection first: an empty-surface marquee, a drag of the selected packet, and section
        // 16's drag of an unselected row, which leaves the existing selection standing.
        _gestureDeferred = item is null
            || (!_gestureCtrl && !_gestureShift
                && (_selection.IsSelected(item) || CanBeginRowDrag(item)));

        if (!_gestureDeferred && item is not null)
        {
            ApplyPointerSelection(item, _gestureCtrl, _gestureShift);
        }
        else
        {
            // Undo the container's own toggle inside the same input event.
            ApplySelectionToContainers();
        }
    }

    private void OnRowsPointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (_gesture == GesturePhase.None || e.Pointer.PointerId != _gesturePointerId)
        {
            return;
        }

        Point now = e.GetCurrentPoint(_itemsView).Position;

        if (_gesture == GesturePhase.Marquee)
        {
            _marquee.Track(now);
            return;
        }

        if (_gesture == GesturePhase.RowDrag)
        {
            UpdateDragDestination(_rowDrag.Track(now.Y));
            return;
        }

        if (Math.Abs(now.X - _gestureOrigin.X) < DragThresholdDips
            && Math.Abs(now.Y - _gestureOrigin.Y) < DragThresholdDips)
        {
            return;
        }

        CommitGesture(e.Pointer);
    }

    /// <summary>
    /// The threshold is crossed. Which gesture that becomes is decided once, here, and no selection
    /// change is committed on the way. A press that can become neither gesture stays a press, so
    /// its release still applies the click the press deferred.
    /// </summary>
    private void CommitGesture(Pointer pointer)
    {
        if (_itemsView is not ListView rows || !CanCommitGesture())
        {
            return;
        }

        // A committed gesture has to keep reporting once the pointer leaves the list, and has to
        // get the release that ends it wherever that happens.
        if (rows.CapturePointer(pointer))
        {
            _gestureCapture = pointer;
        }

        if (_gestureItem is object item)
        {
            BeginRowDrag(rows, item);
        }
        else
        {
            BeginMarquee(rows);
        }
    }

    /// <summary>
    /// Sections 5, 14 and 16: whether the host and the selection mode allow the gesture this press
    /// would become. The row answer is the one the press already used to decide whether to defer
    /// its selection change.
    /// </summary>
    private bool CanCommitGesture()
    {
        SyncSelectionPolicy();
        return _gestureItem is object item
            ? CanBeginRowDrag(item)
            : IsMarqueeSelectionEnabled && _selection.AllowsMultiple;
    }

    private void OnRowsPointerReleased(object sender, PointerRoutedEventArgs e)
    {
        bool ours = e.Pointer.PointerId == _gesturePointerId;

        if (ours && _gesture == GesturePhase.RowDrag)
        {
            // The drop ends the gesture itself, before the request reaches the host.
            CompleteRowDrag(e.GetCurrentPoint(_itemsView).Position.Y);
            return;
        }

        if (ours && _gesture == GesturePhase.Pressed)
        {
            DispatchClick();
        }

        CancelGesture();
    }

    /// <summary>
    /// Only the marquee has changed anything by this point: section 16 leaves the selection alone
    /// until the host acts on the request.
    /// </summary>
    private void OnRowsPointerCanceled(object sender, PointerRoutedEventArgs e)
    {
        if (_gesture == GesturePhase.Marquee && e.Pointer.PointerId == _gesturePointerId)
        {
            SetSelection(_gestureSelection, CurrentItem);
        }

        CancelGesture();
    }

    /// <summary>
    /// Losing the capture the table took ends the gesture where it stands, and leaves a marquee's
    /// result alone: the user has watched it apply row by row, and taking that back would be the
    /// surprise. The guard is on the table's own capture, not on the phase, because this event also
    /// reports captures the hosted list took and dropped for its own click handling.
    /// </summary>
    private void OnRowsPointerCaptureLost(object sender, PointerRoutedEventArgs e)
    {
        if (_gestureCapture is not null && e.Pointer.PointerId == _gesturePointerId)
        {
            CancelGesture();
        }
    }

    /// <summary>Release with no gesture running: the deferred plain click, or an empty-space clear.</summary>
    private void DispatchClick()
    {
        SyncSelectionPolicy();

        if (!_gestureDeferred)
        {
            return;
        }

        if (_gestureItem is object item)
        {
            ApplyPointerSelection(item, _gestureCtrl, _gestureShift);
        }
        else
        {
            CommitSelection(_selection.Clear());
        }
    }

    /// <summary>Section 13's pointer rules, applied through the table's own model.</summary>
    private void ApplyPointerSelection(object item, bool ctrl, bool shift)
    {
        SyncSelectionPolicy();
        CommitSelection(_selection.PointerSelect(item, ctrl, shift, View));
    }

    /// <summary>Section 14's rectangle over the empty row surface the press started from.</summary>
    private void BeginMarquee(ListView rows)
    {
        _gesture = GesturePhase.Marquee;
        _marquee.Begin(
            rows, InnerScrollViewer(), _marqueeOverlay, _gestureOrigin, ApplyMarqueeCoverage);
    }

    /// <summary>
    /// Section 16. A selected row moves the whole selected packet and any other row moves alone,
    /// resolved here because nothing can move the selection under a live drag. The marker shows the
    /// boundary from the first moment, and nothing else about the table changes until the host acts
    /// on the request this drag ends with.
    /// </summary>
    private void BeginRowDrag(ListView rows, object item)
    {
        _gesture = GesturePhase.RowDrag;
        _movingPacket = _selection.IsSelected(item) ? SelectedItems : new[] { item };

        _rowDrag.Begin(rows, _rowInsertionMarker);
        UpdateDragDestination(_rowDrag.Track(_gestureOrigin.Y));
        RowVisualsChanged?.Invoke(this, EventArgs.Empty);
    }

    private void CancelGesture()
    {
        bool wasDragging = _gesture == GesturePhase.RowDrag;

        _gesture = GesturePhase.None;
        _marquee.End();
        _rowDrag.End();
        UpdateDragDestination(-1);
        ReleaseGesturePointer();
        _gestureItem = null;
        _gestureDeferred = false;
        _gestureSelection = Array.Empty<object>();
        _movingPacket = Array.Empty<object>();

        if (wasDragging)
        {
            RowVisualsChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private void ReleaseGesturePointer()
    {
        if (_gestureCapture is Pointer pointer)
        {
            _gestureCapture = null;
            _itemsView?.ReleasePointerCapture(pointer);
        }
    }

    // ------------------------------------------------------------------ marquee

    /// <summary>
    /// Section 14's three compositions. The gesture's modifiers are the ones read at press, so a
    /// key pressed or released mid-drag does not change the rule the user started under.
    /// </summary>
    private void ApplyMarqueeCoverage()
    {
        List<object> items;
        if (_gestureShift)
        {
            items = MarqueeExtendedFromAnchor();
        }
        else if (_gestureCtrl)
        {
            items = MarqueeToggledAgainstStart();
        }
        else
        {
            items = MarqueeCovered();
        }

        CommitSelection(_selection.SetMarqueeSelection(items));
    }

    private List<object> MarqueeCovered()
    {
        List<object> items = new();
        foreach (int index in _marquee.CoveredIndices)
        {
            object item = View[index];
            if (_selection.IsEligible(item))
            {
                items.Add(item);
            }
        }

        return items;
    }

    /// <summary>Ctrl: each covered row flips against the selection as it stood at press.</summary>
    private List<object> MarqueeToggledAgainstStart()
    {
        HashSet<object> started = new(_gestureSelection, _identity);
        HashSet<object> covered = new(MarqueeCovered(), _identity);

        List<object> items = new();
        foreach (object item in View)
        {
            if (_selection.IsEligible(item) && started.Contains(item) != covered.Contains(item))
            {
                items.Add(item);
            }
        }

        return items;
    }

    /// <summary>Shift: the inclusive run from the anchor out to the far edge of what is covered.</summary>
    private List<object> MarqueeExtendedFromAnchor()
    {
        int anchor = IndexInView(_selection.Anchor);
        if (anchor < 0 || _marquee.CoveredIndices.Count == 0)
        {
            return new List<object>(_gestureSelection);
        }

        int low = Math.Min(anchor, _marquee.LowestCovered);
        int high = Math.Max(anchor, _marquee.HighestCovered);

        List<object> items = new();
        for (int i = low; i <= high; i++)
        {
            if (_selection.IsEligible(View[i]))
            {
                items.Add(View[i]);
            }
        }

        return items;
    }

    /// <summary>
    /// Section 14's Escape, and section 5.3's view-changing update: both end the marquee by putting
    /// back the selection the gesture started from. Reports whether that changed the logical state,
    /// so a caller with its own commit can raise the single event.
    /// </summary>
    private bool RestoreSelectionBeforeMarquee()
    {
        if (_gesture != GesturePhase.Marquee)
        {
            return false;
        }

        List<object> restored = new(_gestureSelection);
        CancelGesture();
        return _selection.SetMarqueeSelection(restored);
    }

    // ------------------------------------------------------------------ row drag

    /// <summary>
    /// Section 5: the gesture is offered only when the host enabled it, has somewhere to send the
    /// request, and the row is one the user may act on. The same answer decides whether the press
    /// defers its selection change, so a row that cannot be dragged still selects on press.
    /// </summary>
    private bool CanBeginRowDrag(object item) =>
        IsRowReorderingEnabled && RowsReorderRequested is not null && _selection.IsEligible(item);

    /// <summary>
    /// Section 16's drop. The gesture ends before the request is raised, so a handler that updates
    /// its source inside the event finds the table already idle.
    /// </summary>
    private void CompleteRowDrag(double y)
    {
        int boundary = _rowDrag.Track(y);
        IReadOnlyList<object> moving = _movingPacket;

        CancelGesture();
        RequestReorder(moving, boundary);
    }

    /// <summary>
    /// Section 16's rejections, all silent: nothing to move, no realized boundary to move it to,
    /// and a placement that leaves the order as it stands. A drop inside a packet that is already
    /// one block is that last one, because <see cref="InsertTarget"/> resolves past the packet to
    /// the row it already sits before. A scattered packet is gathered at the boundary instead,
    /// which does change the order.
    /// </summary>
    private void RequestReorder(IReadOnlyList<object> moving, int boundary)
    {
        if (moving.Count == 0 || boundary < 0)
        {
            return;
        }

        object? target = InsertTarget(boundary, moving);
        if (KeepsOrder(moving, target))
        {
            return;
        }

        RowsReorderRequested?.Invoke(this, new TableRowsReorderRequestedEventArgs(moving, target));
    }

    /// <summary>Section 16: the moving rows carry the platform's own dragged-item treatment.</summary>
    internal bool IsRowDragging(object? item)
    {
        if (item is null || _gesture != GesturePhase.RowDrag)
        {
            return false;
        }

        foreach (object moving in _movingPacket)
        {
            if (_selection.IsSame(moving, item))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Section 16: the destination, exposed as the table's automation status for as long as the
    /// drag is live and announced whenever it moves. The control claims no UI Automation drag/drop
    /// pattern — that would promise a drop-target tree it does not implement — so this status is
    /// the whole accessible account of a drag. A negative boundary means there is none.
    /// </summary>
    private void UpdateDragDestination(int boundary)
    {
        if (boundary == _dragBoundary)
        {
            return;
        }

        _dragBoundary = boundary;

        string status = DragDestination(boundary);
        AutomationProperties.SetItemStatus(this, status);

        if (status.Length > 0)
        {
            FrameworkElementAutomationPeer.FromElement(this)?.RaiseNotificationEvent(
                AutomationNotificationKind.Other,
                AutomationNotificationProcessing.MostRecent,
                status,
                RowDragActivityId);
        }
    }

    /// <summary>
    /// The destination as a position rather than the row's own name: a row's name is every cell it
    /// holds, which is too long to repeat on each boundary the pointer crosses.
    /// </summary>
    private string DragDestination(int boundary)
    {
        if (boundary < 0)
        {
            return string.Empty;
        }

        object? target = InsertTarget(boundary, _movingPacket);
        return target is null
            ? TableResources.DropAtEnd
            : string.Format(
                CultureInfo.CurrentCulture,
                TableResources.DropBeforeRow,
                IndexInView(target) + 1,
                View.Count);
    }

    /// <summary>
    /// Section 5.1's insertion anchor: the first row at or after the boundary that is not moving,
    /// or null for the end of the view. Naming the row rather than an index is what makes the
    /// request immune to the packet's own removal — once the host has taken the packet out, that
    /// row is still exactly the one the packet goes before, wherever it has ended up.
    /// </summary>
    private object? InsertTarget(int boundary, IReadOnlyList<object> moving)
    {
        HashSet<object> packet = new(moving, _identity);
        for (int i = boundary; i < View.Count; i++)
        {
            if (!packet.Contains(View[i]))
            {
                return View[i];
            }
        }

        return null;
    }

    /// <summary>
    /// Whether the placement leaves the view exactly as it is: the packet is already one block, and
    /// the row after that block is the one it would be inserted before. A scattered packet always
    /// moves, because the drop gathers it. A packet that is the whole view is the same test — its
    /// block ends the view and its target is null, which section 5.1 requires to raise nothing.
    /// </summary>
    private bool KeepsOrder(IReadOnlyList<object> moving, object? target)
    {
        int start = IndexInView(moving[0]);
        if (start < 0 || start + moving.Count > View.Count)
        {
            return false;
        }

        for (int i = 1; i < moving.Count; i++)
        {
            if (!_selection.IsSame(View[start + i], moving[i]))
            {
                return false;
            }
        }

        int after = start + moving.Count;
        return _selection.IsSame(after < View.Count ? View[after] : null, target);
    }

    /// <summary>
    /// Section 5.3: a source update, <see cref="RefreshView"/>, a sort change, or the host
    /// withdrawing <see cref="IsRowReorderingEnabled"/> all end a live drag, with no request.
    /// </summary>
    private void CancelRowDrag()
    {
        if (_gesture == GesturePhase.RowDrag)
        {
            CancelGesture();
        }
    }

    private void OnRowsDoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if (HitTest(e.OriginalSource as DependencyObject, out object? item) != TableHit.Row
            || item is null)
        {
            return;
        }

        SyncSelectionPolicy();
        if (!_selection.IsEligible(item))
        {
            return;
        }

        ItemInvoked?.Invoke(this, new TableItemInvokedEventArgs(item, SelectedItems));
        e.Handled = true;
    }

    // ------------------------------------------------------------------ context requests

    /// <summary>
    /// Section 15's context invocation. The platform raises this for right-click, touch
    /// press-and-hold, Menu, and Shift+F10 alike, so the table needs no long-press timer of its own
    /// and no second keyboard path.
    /// </summary>
    private void OnRowsContextRequested(UIElement sender, ContextRequestedEventArgs e)
    {
        if (_itemsView is null
            || HitTest(e.OriginalSource as DependencyObject, out object? item) == TableHit.Suppressed)
        {
            return;
        }

        // Menu and Shift+F10 address the current row wherever row focus physically sits. A pointer
        // request that landed on no row is empty surface, and asks for nothing.
        if (item is null)
        {
            if (e.TryGetPosition(_itemsView, out _))
            {
                return;
            }

            item = _selection.Current;
        }

        if (item is null || _itemsView.ContainerFromItem(item) is not FrameworkElement row)
        {
            return;
        }

        Point? relativePoint = e.TryGetPosition(row, out Point position) ? position : null;
        e.Handled = RequestRowContext(item, row, relativePoint);
    }

    /// <summary>Section 15's mechanics, completed before the request reaches the host.</summary>
    private bool RequestRowContext(object item, FrameworkElement placementTarget, Point? relativePoint)
    {
        SyncSelectionPolicy();
        if (!_selection.IsEligible(item))
        {
            return false;
        }

        // A right button pressed during a left-button press would otherwise leave the arbiter armed,
        // and its release would then re-select over this request's selection.
        CancelGesture();
        CommitSelection(SelectForContext(item));

        RowContextRequested?.Invoke(
            this,
            new TableRowContextRequestedEventArgs(item, SelectedItems, placementTarget, relativePoint));
        return true;
    }

    /// <summary>
    /// Walk from the input target up to the hosted list. An interactive descendant, an explicit
    /// <c>SuppressRowGestures</c> subtree, and the scroll bars all stop a table gesture; anything
    /// else that reaches the list without passing a container is empty row surface.
    /// </summary>
    private TableHit HitTest(DependencyObject? source, out object? item)
    {
        item = null;
        if (_itemsView is null)
        {
            return TableHit.Suppressed;
        }

        DependencyObject? node = source;
        while (node is not null && !ReferenceEquals(node, _itemsView))
        {
            if (node is ListViewItem container)
            {
                item = _itemsView.ItemFromContainer(container);
                return item is null ? TableHit.Suppressed : TableHit.Row;
            }

            if (node is ScrollBar || GetSuppressRowGestures(node))
            {
                return TableHit.Suppressed;
            }

            // A tab stop inside a cell is an editor, button, or selector and owns its own input.
            if (node is Control { IsTabStop: true })
            {
                return TableHit.Suppressed;
            }

            node = VisualTreeHelper.GetParent(node);
        }

        return node is null ? TableHit.Suppressed : TableHit.EmptySurface;
    }

    // ------------------------------------------------------------------ keyboard

    private void OnTablePreviewKeyDown(object sender, KeyRoutedEventArgs e)
    {
        // Escape belongs to the live gesture, not to the row surface: a committed gesture is driven
        // by a captured pointer and does not move focus, so the focus gate below would refuse it.
        if (e.Key == VirtualKey.Escape && CancelCommittedGesture())
        {
            e.Handled = true;
            return;
        }

        if (_itemsView is null || RowSurfaceFocusState() == FocusState.Unfocused)
        {
            return;
        }

        bool ctrl = IsDown(VirtualKey.Control);
        bool shift = IsDown(VirtualKey.Shift);

        e.Handled = e.Key switch
        {
            VirtualKey.Up => MoveCurrentBy(-1, shift),
            VirtualKey.Down => MoveCurrentBy(1, shift),
            VirtualKey.PageUp => MoveCurrentBy(-RowsPerPage(), shift),
            VirtualKey.PageDown => MoveCurrentBy(RowsPerPage(), shift),
            VirtualKey.Home => MoveCurrentToEdge(first: true, shift),
            VirtualKey.End => MoveCurrentToEdge(first: false, shift),
            VirtualKey.A when ctrl => SelectAllFromKeyboard(),
            VirtualKey.Enter => InvokeCurrentItem(),
            _ => false,
        };
    }

    /// <summary>
    /// Section 14 and section 16's Escape. The marquee has already changed the selection and puts it
    /// back; a row drag has changed nothing and simply stops, with no request.
    /// </summary>
    private bool CancelCommittedGesture()
    {
        if (_gesture == GesturePhase.Marquee)
        {
            CommitSelection(RestoreSelectionBeforeMarquee());
            return true;
        }

        if (_gesture == GesturePhase.RowDrag)
        {
            CancelGesture();
            return true;
        }

        return false;
    }

    /// <summary>
    /// The table's keys apply only from the passive row surface. A focused cell editor, button, or
    /// any other interactive descendant is not one of these elements, so it keeps its own keys.
    /// </summary>
    /// <summary>
    /// How the row surface holds focus, or <see cref="FocusState.Unfocused"/> when it does not.
    /// </summary>
    /// <remarks>
    /// The state matters as much as the fact. The platform draws its focus visual for
    /// <see cref="FocusState.Keyboard"/> and <see cref="FocusState.Programmatic"/> but not for
    /// <see cref="FocusState.Pointer"/>, which is why clicking anything in Windows leaves no focus
    /// ring while tabbing to it does. Restoring focus after a snapshot has to restore the state the
    /// row already had; asking for Programmatic instead turns every pointer click, and every tick
    /// of a live source, into a keyboard-style ring around the row.
    /// </remarks>
    private FocusState RowSurfaceFocusState()
    {
        if (_itemsView is null || XamlRoot is null)
        {
            return FocusState.Unfocused;
        }

        if (FocusManager.GetFocusedElement(XamlRoot) is not DependencyObject focused)
        {
            return FocusState.Unfocused;
        }

        if (ReferenceEquals(focused, this) || ReferenceEquals(focused, _itemsView))
        {
            return ((Control)focused).FocusState;
        }

        return focused is ListViewItem row && IsInsideRows(focused)
            ? row.FocusState
            : FocusState.Unfocused;
    }

    private bool IsInsideRows(DependencyObject node)
    {
        DependencyObject? current = node;
        while (current is not null)
        {
            if (ReferenceEquals(current, _itemsView))
            {
                return true;
            }

            current = VisualTreeHelper.GetParent(current);
        }

        return false;
    }

    private bool MoveCurrentBy(int delta, bool extend)
    {
        List<object> eligible = EligibleItems();
        if (eligible.Count == 0)
        {
            return false;
        }

        int index = IndexOfCurrent(eligible);
        int target = index < 0
            ? (delta > 0 ? 0 : eligible.Count - 1)
            : Math.Clamp(index + delta, 0, eligible.Count - 1);

        return MoveCurrentTo(eligible[target], extend);
    }

    private bool MoveCurrentToEdge(bool first, bool extend)
    {
        List<object> eligible = EligibleItems();
        if (eligible.Count == 0)
        {
            return false;
        }

        return MoveCurrentTo(first ? eligible[0] : eligible[^1], extend);
    }

    private bool MoveCurrentTo(object item, bool extend)
    {
        CommitSelection(extend
            ? _selection.Range(item, add: false, View)
            : _selection.Replace(item));

        ScrollItemIntoView(item);

        // Keyboard navigation is the one path that should show the platform's focus ring: this is
        // reached from the arrow, Home, End and page keys, and section 19 requires a visible focus
        // cue for exactly this case.
        FocusRow(item, FocusState.Keyboard);
        return true;
    }

    private bool SelectAllFromKeyboard()
    {
        SyncSelectionPolicy();
        if (!_selection.AllowsMultiple)
        {
            return false;
        }

        CommitSelection(_selection.SelectAll(View));
        return true;
    }

    private bool InvokeCurrentItem()
    {
        SyncSelectionPolicy();
        if (_selection.Current is not object item || !_selection.IsEligible(item))
        {
            return false;
        }

        ItemInvoked?.Invoke(this, new TableItemInvokedEventArgs(item, SelectedItems));
        return true;
    }

    private List<object> EligibleItems()
    {
        SyncSelectionPolicy();

        List<object> eligible = new();
        foreach (object item in View)
        {
            if (_selection.IsEligible(item))
            {
                eligible.Add(item);
            }
        }

        return eligible;
    }

    private int IndexOfCurrent(List<object> eligible)
    {
        for (int i = 0; i < eligible.Count; i++)
        {
            if (_selection.IsSame(eligible[i], _selection.Current))
            {
                return i;
            }
        }

        return -1;
    }

    private int RowsPerPage()
    {
        double viewport = InnerScrollViewer()?.ViewportHeight ?? 0;
        double rowHeight = FirstVisibleRowHeight();
        return viewport > 0 && rowHeight > 0 ? Math.Max(1, (int)(viewport / rowHeight)) : 1;
    }

    /// <summary>The height of the first row in the viewport, or 0 while no row is realized.</summary>
    private double FirstVisibleRowHeight()
    {
        if (_itemsView?.ItemsPanelRoot is not ItemsStackPanel rows || rows.FirstVisibleIndex < 0)
        {
            return 0;
        }

        return _itemsView.ContainerFromIndex(rows.FirstVisibleIndex) is FrameworkElement container
            ? container.ActualHeight
            : 0;
    }

    /// <summary>
    /// With <c>ItemsStackPanel</c> the first call lands one row short while the extent is still
    /// estimated, so the request is repeated.
    /// </summary>
    private void ScrollItemIntoView(object item)
    {
        _itemsView?.ScrollIntoView(item);
        _itemsView?.ScrollIntoView(item);
    }

    /// <summary>
    /// Put row focus back where it was before the view changed, in the state it was in.
    /// </summary>
    /// <remarks>
    /// The state has to be captured before the change, not read back after it. When the framework
    /// removes the container holding focus it rescues focus itself, and it hands the leaving
    /// element's own focus state to whatever it lands on. That target is not scoped to this
    /// control, so focus can leave the table entirely: measured here, a sort with a focused row
    /// left focus on the host page's own Clear button. Restoring from the captured state puts it
    /// back on the row the table says is current.
    /// </remarks>
    private void RestoreRowFocus(FocusState was)
    {
        if (was != FocusState.Unfocused)
        {
            FocusCurrentRow(was);
        }
    }

    private void FocusCurrentRow(FocusState state)
    {
        if (_selection.Focus is not object item || _itemsView is null)
        {
            return;
        }

        if (_itemsView.ContainerFromItem(item) is Control container)
        {
            container.Focus(state);
            return;
        }

        DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () =>
        {
            if (_selection.IsSame(item, _selection.Focus)
                && _itemsView?.ContainerFromItem(item) is Control realized)
            {
                realized.Focus(state);
            }
        });
    }

    private void FocusRow(object item, FocusState state)
    {
        if (_itemsView is null)
        {
            return;
        }

        // A realized row takes focus as it is. The forced layout pass is only for a row that
        // ScrollIntoView has just asked for and the list has not built yet.
        Control? container = _itemsView.ContainerFromItem(item) as Control;
        if (container is null)
        {
            _itemsView.UpdateLayout();
            container = _itemsView.ContainerFromItem(item) as Control;
        }

        container?.Focus(state);
    }

    private ScrollViewer? InnerScrollViewer()
    {
        if (_innerScrollViewer is not null || _itemsView is null)
        {
            return _innerScrollViewer;
        }

        _innerScrollViewer = FindDescendant<ScrollViewer>(_itemsView);
        return _innerScrollViewer;
    }

    private static T? FindDescendant<T>(DependencyObject root)
        where T : DependencyObject
    {
        int count = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                return match;
            }

            if (FindDescendant<T>(child) is T deeper)
            {
                return deeper;
            }
        }

        return null;
    }

    private static bool IsDown(VirtualKey key) => InputKeyboardSource
        .GetKeyStateForCurrentThread(key)
        .HasFlag(CoreVirtualKeyStates.Down);
}
