using System.Diagnostics;
using System.Reflection;
using System.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Synapse;
using Windows.Foundation;
using Windows.Storage.Streams;
using Windows.System;
using Windows.UI.Input.Preview.Injection;

namespace Synapse_Sample;

/// <summary>
/// The measurement harness for <see cref="TorrentPage"/>. It runs only when the diagnostics flag
/// file is present, writes what it observed to a results file, and closes the app. None of this
/// is part of the torrent host profile.
/// </summary>
public sealed partial class TorrentPage
{
    private readonly StringBuilder _log = new();
    // ------------------------------------------------------------ diagnostics

    private void W(string line) => _log.AppendLine(line);

    private void Section(string title)
    {
        // Flushed per section: a crash later in the pass must not cost the findings so far.
        Flush();
        W(string.Empty);
        W("========================================================================");
        W(title);
        W("========================================================================");
    }

    private void Flush()
    {
        try
        {
            File.WriteAllText(
                "C:/SynoSoftware/TinyTorrent/winui3/torrent-host-results.txt", _log.ToString());
        }
        catch
        {
            // the results file is diagnostics only
        }
    }

    private async Task RunDiagnosticsAsync()
    {
        try
        {
            MainWindow.Instance?.AppWindow.ResizeClient(new Windows.Graphics.SizeInt32(1400, 820));
        }
        catch (Exception ex)
        {
            W("resize failed: " + ex.Message);
        }

        await Settle(900);

        W($"torrent host profile {DateTime.Now:O}");

        Section("A. Columns actually realized in the header");
        TableHeaderStrip? strip = FindDescendant<TableHeaderStrip>(Table);
        List<TableHeaderCell> header = new();
        if (strip is not null)
        {
            FindAll(strip, header);
        }

        W($"header cells = {header.Count} (expected 7 visible of 11 declared)");
        foreach (TableHeaderCell cell in header)
        {
            string label = FindDescendant<TextBlock>(cell)?.Text ?? "(no label)";
            W($"  '{label}' width={cell.ActualWidth:0.##} x={XOf(cell):0.##}");
        }

        Section("B. Rows realized and what the templates rendered");
        ListView? list = FindDescendant<ListView>(Table);
        List<ListViewItem> containers = new();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        W($"projection count = {_projectedCount}; realized containers = {containers.Count}");
        for (int i = 0; i < containers.Count && i < 4; i++)
        {
            if (containers[i].Content is not TorrentRowViewModel row)
            {
                continue;
            }

            List<TextBlock> texts = new();
            FindAll(containers[i], texts);
            W($"  row {i}: {row.Name}");
            W($"    rendered text = [{string.Join(" | ", texts.Select(t => t.Text))}]");

            List<Microsoft.UI.Xaml.Shapes.Path> paths = new();
            FindAll(containers[i], paths);
            int points = 0;
            if (paths.Count > 0 && paths[0].Data is PathGeometry geometry && geometry.Figures.Count > 0
                && geometry.Figures[0].Segments.Count > 0
                && geometry.Figures[0].Segments[0] is PolyLineSegment segment)
            {
                points = segment.Points.Count + 1;
            }

            W($"    sparkline Path count = {paths.Count}, points = {points}, " +
              $"revision = {row.SpeedRevision}");

            List<ProgressBar> bars = new();
            FindAll(containers[i], bars);
            W($"    ProgressBar count = {bars.Count}, value = " +
              (bars.Count > 0 ? bars[0].Value.ToString("0.0") : "n/a"));
        }

        Section("C. The 1 Hz ticker moves live values");
        TorrentRowViewModel? live = _catalog?.Rows.FirstOrDefault(r => r.Status == TorrentStatus.Downloading);
        if (live is null)
        {
            W("no downloading row found");
        }
        else
        {
            W($"row {live.Name}");
            for (int t = 0; t < 3; t++)
            {
                W($"  t{t}: speed={live.SpeedText} progress={live.ProgressText} " +
                  $"eta={live.EtaText} transferred={live.TransferredText} peers={live.PeersText} " +
                  $"peak={live.SpeedHistory.Peak:0}");
                await Settle(1100);
            }
        }

        Section("D. Status pill covers all seven states plus stalled");
        foreach (TorrentStatus status in Enum.GetValues<TorrentStatus>())
        {
            TorrentRowViewModel probe = new("0") { Status = status, PeersConnected = 5, PeersTotal = 5 };
            W($"  {status,-15} glyph=U+{(int)probe.StatusGlyph[0]:X4} label='{probe.StatusLabel}'");
        }

        TorrentRowViewModel stalled = new("0") { Status = TorrentStatus.Downloading, PeersConnected = 0 };
        W($"  stalled (downloading, 0 peers) glyph=U+{(int)stalled.StatusGlyph[0]:X4} " +
          $"label='{stalled.StatusLabel}' IsStalled={stalled.IsStalled}");

        Section("E. Host filters and the three presentations");
        await SetFilter("all");
        await SetFilter("downloading");
        await SetFilter("seeding");
        await SetFilter("all");

        await SetSearch("arch");
        await SetSearch("ubuntu");
        await SetSearch("zzzz-no-such-torrent");
        W($"  NoResults presentation visible = {StateLayerVisible()}");
        await SetSearch(string.Empty);

        await SetSearch("zzzz-no-such-torrent");
        await CaptureAsync("torrent-no-results.bmp", this);
        await SetSearch(string.Empty);

        EmptySourceToggle.IsChecked = true;
        _simulateEmptySource = true;
        ApplyProjection();
        await Settle(400);
        W($"  simulated empty source: EmptyState={Table.EmptyState} rows={_projectedCount} " +
          $"presentation visible = {StateLayerVisible()}");
        await CaptureAsync("torrent-empty.bmp", this);

        EmptySourceToggle.IsChecked = false;
        _simulateEmptySource = false;
        ApplyProjection();
        await Settle(400);

        // The ticker republishes the projection when a download completes, which would put the
        // rows straight back. Pause it for the loading probe.
        _catalog?.Stop();
        Table.IsLoading = true;
        Table.ItemsSource = NoRows;
        await Settle(500);
        W($"  loading presentation visible = {StateLayerVisible()}, rows in view = " +
          $"{FindDescendant<ListView>(Table)?.Items.Count}");
        await CaptureAsync("torrent-loading.bmp", this);
        Table.IsLoading = false;
        ApplyProjection();
        _catalog?.Start();
        await Settle(500);

        Section("F. Row context menu");
        containers.Clear();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        ListViewItem? menuTarget = containers.FirstOrDefault(c => c.Content is TorrentRowViewModel);
        if (menuTarget?.Content is TorrentRowViewModel menuRow)
        {
            MenuFlyout flyout = ShowRowMenu(new[] { menuRow }, menuTarget, new Point(24, 12));
            await Settle(500);
            W($"  target row = {menuRow.Name}");
            W($"  flyout IsOpen = {flyout.IsOpen}, items = {flyout.Items.Count}");
            foreach (MenuFlyoutItemBase item in flyout.Items)
            {
                W(item is MenuFlyoutItem entry
                    ? $"    '{entry.Text}' enabled={entry.IsEnabled}"
                    : "    ----");
            }

            // The flyout renders in a popup layer, outside the page's visual subtree, so the page
            // capture cannot contain it. Capture the popup's own root instead.
            foreach (Popup popup in VisualTreeHelper.GetOpenPopupsForXamlRoot(XamlRoot))
            {
                if (popup.Child is UIElement child)
                {
                    await CaptureAsync("torrent-menu.bmp", child);
                }
            }

            await CaptureAsync("torrent-rows.bmp", this);
            flyout.Hide();
            await Settle(300);

            await ExerciseMenuKeyAsync(menuTarget);
            await ReportRowHeightsAsync("after the row menu");
        }
        else
        {
            W("  no realized row to place a menu on");
        }

        Section("G. Ghost rows are display only");
        TorrentRowViewModel? ghost = _catalog?.Rows.FirstOrDefault(r => r.IsGhost);
        W(ghost is null
            ? "  no ghost row generated"
            : $"  ghost '{ghost.Name}' label='{ghost.GhostLabel}' opacity={ghost.RowOpacity}");

        Section("K. The UI thread under the 1 Hz tick, and what one projection change costs");
        containers.Clear();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        W($"  {DateTime.Now:HH:mm:ss.fff} realized containers = {containers.Count}");
        await MeasureFramesAsync();
        MeasureProjectionCosts();
        await MeasureAfterSortAsync();

        // The sorts reset the list, which sends every container through its recycle pool. Whether
        // the pooled ones keep costing the tick shows up as the difference between the two frame
        // measurements.
        containers.Clear();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        W($"  {DateTime.Now:HH:mm:ss.fff} containers in the tree after the sorts = {containers.Count}");
        await MeasureFramesAsync();
        await Settle(1500);

        Section("L. What each visible column costs a re-list");
        MeasureColumnCosts();
        await Settle(500);

        Section("M2. What a selected row looks like");
        await CaptureSelectedRowsAsync();

        Section("M. A sort leaves no focus ring on a row");
        await MeasureFocusAfterSortAsync();

        Section("N. What one sort costs, and what the row transitions cost inside it");
        await MeasureSortCostAsync();

        Section("H. Fit commands, and what the event log says about them");
        await ExerciseFitAsync();

        Section("I. A reorder request reaches the queue");
        await ExerciseQueueAsync();

        Section("J. Screen capture");
        await Settle(1200);
        await CaptureAsync("torrent-page.bmp", this);
    }

    /// <summary>
    /// The two fit commands this page offers, and the log line each produces. The fit itself is the
    /// table's; what is measured here is that the host reaches it and reports it.
    /// </summary>
    private async Task ExerciseFitAsync()
    {
        // 'name' is the first declared column and is visible, so it is the first header cell.
        double NameHeaderWidth()
        {
            TableHeaderStrip? bar = FindDescendant<TableHeaderStrip>(Table);
            List<TableHeaderCell> cells = new();
            if (bar is not null)
            {
                FindAll(bar, cells);
            }

            return cells.Count > 0 ? cells[0].ActualWidth : double.NaN;
        }

        Events.Clear();
        W($"  name header width before = {NameHeaderWidth():0.##} (declared 150)");

        Table.AutoFitColumn("name");
        await Settle(300);
        W($"  after AutoFitColumn(\"name\") = {NameHeaderWidth():0.##}");

        OnFitColumnsClick(this, new RoutedEventArgs());
        await Settle(300);
        W($"  after the Fit all columns button, name = {NameHeaderWidth():0.##}");

        W($"  log lines raised = {Events.Count}");
        foreach (string line in Events.Reverse())
        {
            W("    " + line);
        }
    }

    /// <summary>
    /// Drive the host's half of section 16: the request the table would raise, the queue change it
    /// produces, the same drop repeated, and the menu commands that mirror it. The table's own drag
    /// is not exercised here — this measures what the host does with the result.
    /// </summary>
    private async Task ExerciseQueueAsync()
    {
        if (_catalog is null || _catalog.Rows.Count < 10)
        {
            W("  no catalog to reorder");
            return;
        }

        string Queue(int count) =>
            string.Join(" ", _catalog.Rows.Take(count).Select(r => r.Id[..4]));

        List<object> moving = new() { _catalog.Rows[0], _catalog.Rows[2] };
        object target = _catalog.Rows[7];
        string movingIds = string.Join(" ", moving.Cast<TorrentRowViewModel>().Select(r => r.Id[..4]));

        W($"  moving {movingIds} before {((TorrentRowViewModel)target).Id[..4]}");
        W($"  queue before = {Queue(9)}");

        Events.Clear();
        OnRowsReorderRequested(Table, new TableRowsReorderRequestedEventArgs(moving, target));
        await Settle(300);

        W($"  queue after  = {Queue(9)}");
        W($"  packet queue numbers = " +
          string.Join(", ", moving.Cast<TorrentRowViewModel>().Select(r => r.QueueText)));
        W($"  log lines raised = {Events.Count}");
        foreach (string line in Events.Reverse())
        {
            W("    " + line);
        }

        Events.Clear();
        OnRowsReorderRequested(Table, new TableRowsReorderRequestedEventArgs(moving, target));
        await Settle(200);
        W($"  the same drop repeated: queue = {Queue(9)}");
        foreach (string line in Events.Reverse())
        {
            W("    " + line);
        }

        List<TorrentRowViewModel> packet = moving.Cast<TorrentRowViewModel>().ToList();
        W("  --- the menu commands that mirror the drop ---");
        foreach (QueueMove move in Enum.GetValues<QueueMove>())
        {
            W($"    CanMove {move} = {_catalog.CanMove(packet, move)}");
        }

        Events.Clear();
        _catalog.Move(packet, QueueMove.Top);
        ApplyProjection();
        await Settle(200);
        W($"  after Move to top: queue = {Queue(9)}, packet numbers = " +
          string.Join(", ", packet.Select(r => r.QueueText)));
        W($"    CanMove Top now = {_catalog.CanMove(packet, QueueMove.Top)}, " +
          $"Up = {_catalog.CanMove(packet, QueueMove.Up)}");

        MenuFlyout menu = BuildRowMenu(packet);
        foreach (MenuFlyoutItemBase item in menu.Items)
        {
            if (item is MenuFlyoutItem entry && entry.Text.StartsWith("Move", StringComparison.Ordinal))
            {
                W($"    menu '{entry.Text}' enabled={entry.IsEnabled}");
            }
        }
    }

    /// <summary>
    /// Raise the menu the way a keyboard user does. This goes through the real routed
    /// <c>ContextRequested</c> path and <see cref="OnRowContextRequested"/>, not through the
    /// builder directly, so it proves the row resolution as well as the menu.
    /// </summary>
    private async Task ExerciseMenuKeyAsync(ListViewItem target)
    {
        W("  --- Menu key through the routed ContextRequested path ---");

        MainWindow.Instance?.Activate();
        bool focused = target.Focus(FocusState.Programmatic);
        await Settle(250);
        W($"    row focused = {focused}");

        // Injection goes to whatever window has focus. Record whether any injected key reached
        // this page at all, so a silent failure is not mistaken for a missing menu.
        int keysSeen = 0;
        void CountKey(object s, KeyRoutedEventArgs a) => keysSeen++;
        AddHandler(UIElement.KeyDownEvent, new KeyEventHandler(CountKey), handledEventsToo: true);

        InputInjector? injector = null;
        try
        {
            injector = InputInjector.TryCreate();
        }
        catch (Exception ex)
        {
            W("    input injector unavailable: " + ex.Message);
        }

        if (injector is null)
        {
            W("    input injector unavailable; menu key not exercised");
            return;
        }

        // Injection is refused outright when another application holds the foreground. That is a
        // fact about the session, not a result, and it must not abandon the rest of the pass.
        bool Inject(params InjectedInputKeyboardInfo[] keys)
        {
            try
            {
                injector.InjectKeyboardInput(keys);
                return true;
            }
            catch (Exception ex)
            {
                W($"    key injection refused: {ex.GetType().Name}: {ex.Message}");
                return false;
            }
        }

        bool injected =
            Inject(new InjectedInputKeyboardInfo { VirtualKey = (ushort)VirtualKey.Application });
        await Settle(150);
        injected &= Inject(new InjectedInputKeyboardInfo
        {
            VirtualKey = (ushort)VirtualKey.Application,
            KeyOptions = InjectedInputKeyOptions.KeyUp,
        });
        await Settle(600);

        if (!injected)
        {
            RemoveHandler(UIElement.KeyDownEvent, new KeyEventHandler(CountKey));
            return;
        }

        int menus = 0;
        int items = 0;
        foreach (Popup popup in VisualTreeHelper.GetOpenPopupsForXamlRoot(XamlRoot))
        {
            if (popup.Child is not DependencyObject child)
            {
                continue;
            }

            MenuFlyoutPresenter? presenter = child as MenuFlyoutPresenter
                ?? FindDescendant<MenuFlyoutPresenter>(child);
            if (presenter is null)
            {
                continue;
            }

            menus++;
            List<MenuFlyoutItem> entries = new();
            FindAll(presenter, entries);
            items = entries.Count;
            W("    menu items: " + string.Join(", ", entries.Select(x => x.Text)));
        }

        W($"    injected key presses this page received = {keysSeen}");
        W($"    menus open after the Menu key = {menus}, items = {items}");
        RemoveHandler(UIElement.KeyDownEvent, new KeyEventHandler(CountKey));

        if (menus > 0)
        {
            Inject(
                new InjectedInputKeyboardInfo { VirtualKey = (ushort)VirtualKey.Escape },
                new InjectedInputKeyboardInfo
                {
                    VirtualKey = (ushort)VirtualKey.Escape,
                    KeyOptions = InjectedInputKeyOptions.KeyUp,
                });
            await Settle(400);
        }
    }

    /// <summary>
    /// Frame intervals over five seconds of ticking. A subscribed Rendering handler runs once per
    /// frame, so a long UI-thread task shows up as one long interval.
    /// </summary>
    private async Task MeasureFramesAsync()
    {
        List<double> intervals = new();
        Stopwatch clock = Stopwatch.StartNew();
        double last = 0;

        void OnRendering(object? sender, object e)
        {
            double now = clock.Elapsed.TotalMilliseconds;
            intervals.Add(now - last);
            last = now;
        }

        CompositionTarget.Rendering += OnRendering;
        await Task.Delay(5000);
        CompositionTarget.Rendering -= OnRendering;

        intervals.RemoveAt(0);
        intervals.Sort();
        W($"  frames in 5 s = {intervals.Count}; interval median {intervals[intervals.Count / 2]:0.0} ms, " +
          $"p99 {intervals[(int)(intervals.Count * 0.99)]:0.0} ms, max {intervals[^1]:0.0} ms; " +
          $"frames over 33 ms = {intervals.Count(i => i > 33)}");
    }

    /// <summary>Each host projection change the page can make, timed to the end of its layout.</summary>
    private void MeasureProjectionCosts()
    {
        W("  " + Timed("one catalog tick", () => _catalog!.Tick()));
        W($"  rows with a bound listener = {BoundRows()} of {_catalog!.Rows.Count}");
        W("  " + Timed("projection with nothing changed", ApplyProjection));

        ListView? list = FindDescendant<ListView>(Table);
        Dictionary<ListViewItem, TextBlock?> cellsBefore = CellIdentity(list);
        W("  " + Timed("filter downloading, 900 rows leave", () => { _stateFilter = "downloading"; ApplyProjection(); }));
        W("  " + Timed("filter all, 900 rows return", () => { _stateFilter = "all"; ApplyProjection(); }));
        W("  " + ReusedCells(list, cellsBefore));
        W($"  rows with a bound listener after the filter churn = {BoundRows()}");
        W("  " + Timed("sort name ascending", () => Table.ApplyLayoutState(Sorted("name", TableSortDirection.Ascending))));
        W("  " + Timed("sort name descending, every row moves", () => Table.ApplyLayoutState(Sorted("name", TableSortDirection.Descending))));
        W("  " + Timed("sort cleared", () => Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending))));
    }

    /// <summary>
    /// What a full re-sort of every row costs, measured so that this machine's mood cannot decide
    /// the answer. Two configurations — the row transitions live, and the same sort with them
    /// switched off — are alternated inside one trial, so whatever load is present is shared
    /// between them, and five trials are taken. The figure to read is the median, and the cost per
    /// collection notification rather than the wall time, because the notification count is fixed
    /// by the data and does not move with the machine.
    /// </summary>
    private async Task MeasureSortCostAsync()
    {
        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ItemsSource is not System.Collections.Specialized.INotifyCollectionChanged feed)
        {
            W("  the list's source raises no notifications to count");
            return;
        }

        int notifications = 0;
        System.Collections.Specialized.NotifyCollectionChangedEventHandler tally = (_, _) => notifications++;

        Microsoft.UI.Xaml.Media.Animation.TransitionCollection? live = list.ItemContainerTransitions;
        List<double> withMotion = new();
        List<double> without = new();
        int counted = 0;

        // The tick is stopped for the whole measurement: a 1 Hz projection landing inside a timed
        // sort is exactly the kind of contamination this section exists to remove.
        _catalog!.Stop();

        for (int trial = 0; trial < 5; trial++)
        {
            foreach (bool motion in new[] { true, false })
            {
                list.ItemContainerTransitions = motion ? live : new Microsoft.UI.Xaml.Media.Animation.TransitionCollection();

                // Setup, not measured: put the view in ascending order so the timed call below is
                // always the same worst case, a full reversal.
                Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
                await Settle(600);

                notifications = 0;
                feed.CollectionChanged += tally;
                Stopwatch clock = Stopwatch.StartNew();
                Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Descending));
                double applied = clock.Elapsed.TotalMilliseconds;
                feed.CollectionChanged -= tally;

                (motion ? withMotion : without).Add(applied);
                counted = notifications;
                await Settle(600);
            }
        }

        list.ItemContainerTransitions = live;
        _catalog.Start();

        W($"  a full reversal of {list.Items.Count} rows raises {counted} collection notifications");
        Report("row transitions live", withMotion, counted);
        Report("the same sort, transitions off", without, counted);

        void Report(string label, List<double> samples, int count)
        {
            samples.Sort();
            double median = samples[samples.Count / 2];
            W($"  {label}: median {median:0} ms, best {samples[0]:0} ms, worst {samples[^1]:0} ms" +
              (count > 0 ? $" — {median * 1000 / count:0} us per notification" : string.Empty));
        }
    }

    /// <summary>
    /// Two selected rows among unselected ones, with nothing covering them, so the selected cue can
    /// be looked at rather than described.
    /// </summary>
    private async Task CaptureSelectedRowsAsync()
    {
        ListView? list = FindDescendant<ListView>(Table);
        ScrollViewer? scroller = list is null ? null : FindDescendant<ScrollViewer>(list);

        if (list?.ItemsPanelRoot is not ItemsStackPanel panel)
        {
            W("  no items panel");
            return;
        }

        // The state of the virtualizing panel, printed before anything else touches it: the owner
        // has twice photographed a table holding every row and drawing none.
        int alive = 0;
        int flat = 0;
        for (int i = panel.FirstCacheIndex; i <= panel.LastCacheIndex && i >= 0; i++)
        {
            if (list.ContainerFromIndex(i) is FrameworkElement c)
            {
                alive++;
                if (c.ActualHeight < 1)
                {
                    flat++;
                }
            }
        }

        W($"  the list holds {list.Items.Count} rows; panel visible {panel.FirstVisibleIndex}.." +
          $"{panel.LastVisibleIndex}, cache {panel.FirstCacheIndex}..{panel.LastCacheIndex}; " +
          $"{alive} containers exist, {flat} of them measure nothing");
        W($"  scroller: offset {scroller?.VerticalOffset:0}, extent {scroller?.ExtentHeight:0}, " +
          $"viewport {scroller?.ViewportHeight:0}");

        if (panel.FirstVisibleIndex < 0)
        {
            W("  no rows on screen to select");
            await CaptureAsync("torrent-selected.bmp", Table);
            return;
        }

        // Rows the capture will actually contain: the selected cue is only worth looking at where
        // it is drawn, and SetSelection does not scroll.
        List<object> rows = new();
        for (int i = panel.FirstVisibleIndex + 2; i <= panel.FirstVisibleIndex + 3; i++)
        {
            if (list.Items[i] is TorrentRowViewModel row)
            {
                rows.Add(row);
            }
        }

        Table.SetSelection(rows, rows.Count > 0 ? rows[0] : null);
        await Settle(400);

        W($"  selected the {rows.Count} rows at view index " +
          $"{panel.FirstVisibleIndex + 2} and {panel.FirstVisibleIndex + 3}: " +
          string.Join(", ", rows.Cast<TorrentRowViewModel>().Select(r => r.Name)));
        await CaptureAsync("torrent-selected.bmp", Table);

        Table.SetSelection(Array.Empty<object>());
        await Settle(200);
    }

    /// <summary>
    /// Whether the rows the list says it has realized actually occupy space. A container whose
    /// cells were unhooked and never re-realized still exists, still reports its index, and
    /// measures nothing, which reads on screen as a table that has gone blank while the status
    /// line still counts every row.
    /// </summary>
    private async Task ReportRowHeightsAsync(string when)
    {
        await Settle(300);

        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ItemsPanelRoot is not ItemsStackPanel panel)
        {
            W($"  row heights {when}: no items panel");
            return;
        }

        int realized = 0;
        int empty = 0;
        for (int index = panel.FirstCacheIndex; index <= panel.LastCacheIndex && index >= 0; index++)
        {
            if (list.ContainerFromIndex(index) is not FrameworkElement container)
            {
                continue;
            }

            realized++;
            if (container.ActualHeight < 1)
            {
                empty++;
            }
        }

        W($"  row heights {when}: {realized} realized, {empty} measuring nothing");
    }

    /// <summary>
    /// The platform draws its focus ring for Keyboard and Programmatic focus, and not for Pointer.
    /// A row the user clicked holds Pointer focus, so it wears no ring; the question is what state
    /// that row, or any row, is left in once a sort has taken its container away.
    /// </summary>
    private async Task MeasureFocusAfterSortAsync()
    {
        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ContainerFromIndex(3) is not Control row)
        {
            W("  no realized row to focus");
            return;
        }

        row.Focus(FocusState.Pointer);
        await Settle(200);
        W($"  a clicked row holds focus as {Described(FocusManager.GetFocusedElement(Table.XamlRoot))}");

        Table.ApplyLayoutState(Sorted("name", TableSortDirection.Ascending));
        await Settle(700);
        W($"  after sorting by name, focus is {Described(FocusManager.GetFocusedElement(Table.XamlRoot))}");

        Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
        await Settle(700);
        W($"  after clearing the sort, focus is {Described(FocusManager.GetFocusedElement(Table.XamlRoot))}");
    }

    /// <summary>What holds focus and in which state, since only the state decides the ring.</summary>
    private static string Described(object? focused) => focused switch
    {
        ListViewItem row => $"a row, {row.FocusState}" +
            (row.FocusState is FocusState.Keyboard or FocusState.Programmatic
                ? " — THE RING IS DRAWN"
                : " — no ring"),
        Control other => $"{other.GetType().Name}, {other.FocusState}",
        null => "nothing",
        _ => focused.GetType().Name,
    };

    /// <summary>
    /// Whether anything on the rows is still moving once a sort has been laid out. Two renders of
    /// the table, about 60 ms and 600 ms after the sort, with the tick stopped so that only an
    /// animation can make them differ. A re-list that appears in one step gives close to zero; a
    /// transition still running at the first render gives a large share of the table.
    /// </summary>
    private async Task MeasureAfterSortAsync()
    {
        // Let the transitions of the sorts just measured finish, so only this sort's remain.
        await Settle(700);
        _catalog!.Stop();
        Table.ApplyLayoutState(Sorted("name", TableSortDirection.Ascending));
        Table.UpdateLayout();
        await Task.Delay(60);
        byte[] early = (await RenderAsync(Table)).pixels;
        await Task.Delay(540);
        byte[] settled = (await RenderAsync(Table)).pixels;
        _catalog.Start();

        int differing = 0;
        int total = Math.Min(early.Length, settled.Length) / 4;
        for (int i = 0; i + 3 < early.Length && i + 3 < settled.Length; i += 4)
        {
            if (Math.Abs(early[i] - settled[i]) > 8
                || Math.Abs(early[i + 1] - settled[i + 1]) > 8
                || Math.Abs(early[i + 2] - settled[i + 2]) > 8)
            {
                differing++;
            }
        }

        W("  pixels still changing between 60 ms and 600 ms after a sort: " +
          $"{(total == 0 ? 0 : (double)differing / total):P1} of the table");
    }

    /// <summary>
    /// How many rows some cell is still listening to. A realized row has listeners; so does a
    /// recycled container that kept its last row, and those rows keep paying for every tick.
    /// </summary>
    private int BoundRows()
    {
        FieldInfo? handlers = typeof(TorrentRowViewModel).GetField(
            nameof(TorrentRowViewModel.PropertyChanged), BindingFlags.Instance | BindingFlags.NonPublic);

        int bound = 0;
        foreach (TorrentRowViewModel row in _catalog!.Rows)
        {
            if (handlers?.GetValue(row) is Delegate)
            {
                bound++;
            }
        }

        return bound;
    }

    /// <summary>
    /// The first text element inside each container, to tell a reused cell tree from a rebuilt
    /// one after the containers have been through the recycle pool.
    /// </summary>
    private static Dictionary<ListViewItem, TextBlock?> CellIdentity(ListView? list)
    {
        Dictionary<ListViewItem, TextBlock?> map = new();
        if (list is null)
        {
            return map;
        }

        List<ListViewItem> containers = new();
        FindAll(list, containers);
        foreach (ListViewItem container in containers)
        {
            map[container] = FindDescendant<TextBlock>(container);
        }

        return map;
    }

    private static string ReusedCells(ListView? list, Dictionary<ListViewItem, TextBlock?> before)
    {
        int kept = 0;
        int rebuilt = 0;
        int created = 0;

        foreach (KeyValuePair<ListViewItem, TextBlock?> now in CellIdentity(list))
        {
            if (!before.TryGetValue(now.Key, out TextBlock? was))
            {
                created++;
            }
            else if (was is not null && ReferenceEquals(was, now.Value))
            {
                kept++;
            }
            else
            {
                rebuilt++;
            }
        }

        return $"containers after the churn: {kept} kept their cell tree, {rebuilt} rebuilt it, {created} are new";
    }

    /// <summary>Stamped with the wall clock so an external frame recorder can be lined up with it.</summary>
    private string Timed(string what, Action action)
    {
        string at = DateTime.Now.ToString("HH:mm:ss.fff");
        Stopwatch clock = Stopwatch.StartNew();
        action();
        double applied = clock.Elapsed.TotalMilliseconds;
        Table.UpdateLayout();
        return $"{at} {what}: applied in {applied:0.0} ms, laid out in {clock.Elapsed.TotalMilliseconds:0.0} ms";
    }

    /// <summary>
    /// A sort re-lists the viewport, so every visible cell is rebound and laid out once. Sorting by
    /// queue makes the comparer free; hiding one column at a time attributes the rest. Each figure
    /// is the best of three, because a single Debug sample wanders by tens of milliseconds.
    /// </summary>
    private void MeasureColumnCosts()
    {
        IReadOnlyList<string> order = Table.GetLayoutState().ColumnOrder;
        string[] visible = { "name", "progress", "status", "queue", "speed", "peers", "size" };

        TableLayoutState Layout(string? hidden, TableSortDirection direction)
        {
            Dictionary<string, bool> visibility = new();
            if (hidden is not null)
            {
                visibility[hidden] = false;
            }

            return new TableLayoutState(order, visibility, new Dictionary<string, double>(), "queue", direction);
        }

        double Relist(string? hidden)
        {
            double best = double.MaxValue;
            for (int attempt = 0; attempt < 3; attempt++)
            {
                Table.ApplyLayoutState(Layout(hidden, TableSortDirection.Ascending));
                Table.UpdateLayout();

                Stopwatch clock = Stopwatch.StartNew();
                Table.ApplyLayoutState(Layout(hidden, TableSortDirection.Descending));
                Table.UpdateLayout();
                best = Math.Min(best, clock.Elapsed.TotalMilliseconds);
            }

            return best;
        }

        double all = Relist(null);
        W($"  re-list with all seven columns, sorted by queue: {all:0.0} ms");
        foreach (string id in visible)
        {
            double without = Relist(id);
            W($"  without {id,-8}: {without,6:0.0} ms, so {id} accounts for about {all - without,5:0.0} ms");
        }

        Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
        Table.UpdateLayout();
    }

    private TableLayoutState Sorted(string? column, TableSortDirection direction) => new(
        Table.GetLayoutState().ColumnOrder,
        new Dictionary<string, bool>(),
        new Dictionary<string, double>(),
        column,
        direction);

    private bool StateLayerVisible()
    {
        ContentPresenter? layer = FindByName<ContentPresenter>(Table, "PART_StateLayer");
        return layer?.Visibility == Visibility.Visible;
    }

    private async Task SetFilter(string filter)
    {
        _stateFilter = filter;
        FilterAll.IsChecked = filter == "all";
        FilterDownloading.IsChecked = filter == "downloading";
        FilterSeeding.IsChecked = filter == "seeding";
        ApplyProjection();
        await Settle(350);
        W($"  filter '{filter}' -> {_projectedCount} rows, EmptyState={Table.EmptyState}");
    }

    private async Task SetSearch(string text)
    {
        _searchText = text;
        SearchBox.Text = text;
        ApplyProjection();
        await Settle(350);
        W($"  search '{text}' -> {_projectedCount} rows, EmptyState={Table.EmptyState}");
    }

    private async Task Settle(int ms)
    {
        UpdateLayout();
        await Task.Delay(ms);
        UpdateLayout();
        await Task.Delay(60);
    }

    /// <summary>
    /// Save a 32-bit top-down BMP of the element. A packaged app cannot open an arbitrary path
    /// through StorageFile, so the bytes are written directly.
    /// </summary>
    private async Task CaptureAsync(string fileName, UIElement element)
    {
        DateTime started = DateTime.Now;
        try
        {
            (byte[] pixels, int width, int height) = await RenderAsync(element);
            if (width == 0 || height == 0)
            {
                W($"  capture {fileName}: empty bitmap");
                return;
            }

            byte[] bmp = new byte[54 + pixels.Length];
            BitConverter.GetBytes((ushort)0x4D42).CopyTo(bmp, 0);
            BitConverter.GetBytes(bmp.Length).CopyTo(bmp, 2);
            BitConverter.GetBytes(54).CopyTo(bmp, 10);
            BitConverter.GetBytes(40).CopyTo(bmp, 14);
            BitConverter.GetBytes(width).CopyTo(bmp, 18);
            BitConverter.GetBytes(-height).CopyTo(bmp, 22);
            BitConverter.GetBytes((ushort)1).CopyTo(bmp, 26);
            BitConverter.GetBytes((ushort)32).CopyTo(bmp, 28);
            BitConverter.GetBytes(0).CopyTo(bmp, 30);
            BitConverter.GetBytes(pixels.Length).CopyTo(bmp, 34);

            // RenderTargetBitmap gives premultiplied BGRA; force alpha opaque so the BMP reads back.
            for (int i = 0; i + 3 < pixels.Length; i += 4)
            {
                pixels[i + 3] = 255;
            }

            pixels.CopyTo(bmp, 54);

            string path = "C:/SynoSoftware/TinyTorrent/winui3/" + fileName;
            File.WriteAllBytes(path, bmp);
            W($"  {started:HH:mm:ss.fff} capture {fileName}: {width}x{height} -> {path}");
        }
        catch (Exception ex)
        {
            W($"  capture {fileName} failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    /// <summary>The element as rendered now: premultiplied BGRA, top-down.</summary>
    private static async Task<(byte[] pixels, int width, int height)> RenderAsync(UIElement element)
    {
        RenderTargetBitmap rtb = new();
        await rtb.RenderAsync(element);
        IBuffer buffer = await rtb.GetPixelsAsync();
        byte[] pixels = new byte[buffer.Length];
        DataReader.FromBuffer(buffer).ReadBytes(pixels);
        return (pixels, rtb.PixelWidth, rtb.PixelHeight);
    }

    private bool _finished;

    private void Finish()
    {
        if (_finished)
        {
            return;
        }

        _finished = true;
        _catalog?.Stop();
        Flush();
        Application.Current.Exit();
    }

    // ------------------------------------------------------------- utilities

    private double XOf(FrameworkElement element)
    {
        try
        {
            return element.TransformToVisual(Table).TransformPoint(new Point(0, 0)).X;
        }
        catch
        {
            return double.NaN;
        }
    }

    private static T? FindDescendant<T>(DependencyObject root) where T : DependencyObject
    {
        int count = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                return match;
            }

            T? deeper = FindDescendant<T>(child);
            if (deeper is not null)
            {
                return deeper;
            }
        }

        return null;
    }

    private static T? FindByName<T>(DependencyObject root, string name) where T : FrameworkElement
    {
        List<T> all = new();
        FindAll(root, all);
        return all.FirstOrDefault(e => e.Name == name);
    }

    private static void FindAll<T>(DependencyObject root, List<T> into) where T : DependencyObject
    {
        int count = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                into.Add(match);
            }

            FindAll(child, into);
        }
    }
}
