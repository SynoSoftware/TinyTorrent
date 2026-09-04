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

#if DEBUG
    private const string Configuration = "Debug";
#else
    private const string Configuration = "Release";
#endif

    /// <summary>Notifications the list has been sent since the last reset.</summary>
    private int _notifications;

    /// <summary>Containers the list has prepared since the last reset.</summary>
    private int _realizations;

    private ListView? _counted;

    // ------------------------------------------------------------ diagnostics

    private void W(string line) => _log.AppendLine(line);

    /// <summary>
    /// The one stopwatch in this file. Every duration reported anywhere is this pair, so two
    /// sections timing the same operation cannot disagree because one measured a different span.
    /// The first number is the collection change alone; the second is the layout pass it caused,
    /// and never the two added together.
    /// </summary>
    private (double Mutation, double Layout) Time(Action operation)
    {
        // Empty the heap first. A gen 2 collection landing inside a timed sort is worth more than
        // the sort, and that is the whole of why two sections reported the same reversal as 141 ms
        // and 700 ms: the one that ran early in the pass collected nothing inside its measurement
        // and the one that ran late collected twice. This does not remove a cost the owner pays; it
        // removes it from the comparison between two designs, and the counts reported beside every
        // figure say whether it worked.
        //
        // Collect only. Never WaitForPendingFinalizers here: this runs on the UI thread, WinRT
        // objects have finalizers that marshal back to the UI thread, and waiting for them from the
        // thread they are waiting for is a deadlock with no timeout. It froze the window solid, and
        // a frozen window during a measurement pass reads as the table having hung.
        GC.Collect();

        int gen0 = GC.CollectionCount(0);
        int gen2 = GC.CollectionCount(2);

        Stopwatch clock = Stopwatch.StartNew();
        operation();
        double mutation = clock.Elapsed.TotalMilliseconds;
        Table.UpdateLayout();

        _collections = $"{GC.CollectionCount(0) - gen0}/{GC.CollectionCount(2) - gen2}";
        return (mutation, clock.Elapsed.TotalMilliseconds - mutation);
    }

    /// <summary>
    /// Gen 0 and gen 2 collections that happened inside the last <see cref="Time"/>. A reconcile
    /// allocates a dictionary and three integer arrays the length of the view, so a collection
    /// landing inside a timed sort is a real candidate for why one sort costs three times another.
    /// </summary>
    private string _collections = "0/0";

    /// <summary>
    /// Counting notifications is on for the whole pass: it is one increment per notification and it
    /// costs every figure the same. Counting container preparations is not, and must never be: see
    /// <see cref="Realizations"/>.
    /// </summary>
    private void AttachCounters()
    {
        _counted = FindDescendant<ListView>(Table);
        if (_counted?.ItemsSource is System.Collections.Specialized.INotifyCollectionChanged feed)
        {
            feed.CollectionChanged += OnCountedNotification;
        }
    }

    private void DetachCounters()
    {
        if (_counted?.ItemsSource is System.Collections.Specialized.INotifyCollectionChanged feed)
        {
            feed.CollectionChanged -= OnCountedNotification;
        }

        _counted = null;
    }

    /// <summary>
    /// Runs <paramref name="work"/> with a <c>ContainerContentChanging</c> subscriber attached and
    /// reports how many containers it prepared.
    /// </summary>
    /// <remarks>
    /// Counts come from their own pass so that no reported duration is measured with this
    /// subscriber attached. That was first done on the suspicion that subscribing changes how the
    /// list prepares a container and would explain why two sections disagreed about the same
    /// reversal. Measured, it does not: the same reversal came back at 591 ms clean and 591 ms
    /// watched. The separation stays because a count and a duration have no business sharing a
    /// pass, but it is not load-bearing and it was not the answer.
    /// </remarks>
    private (int Realized, double Watched) Realizations(Action work)
    {
        _realizations = 0;
        if (_counted is null)
        {
            work();
            return (0, 0);
        }

        _counted.ContainerContentChanging += OnCountedRealization;
        (double mutation, double layout) = Time(work);
        _counted.ContainerContentChanging -= OnCountedRealization;
        return (_realizations, mutation + layout);
    }

    private void OnCountedNotification(
        object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e) =>
        _notifications++;

    private void OnCountedRealization(ListViewBase sender, ContainerContentChangingEventArgs args)
    {
        if (!args.InRecycleQueue)
        {
            _realizations++;
        }
    }

    /// <summary>
    /// The sections this launch was asked for, or null for all of them. Set from the launch
    /// argument: <c>--measure</c> runs everything, <c>--measure:R</c> runs one section.
    /// </summary>
    /// <remarks>
    /// A whole pass takes five or six minutes, during which the app resizes its own window, sorts
    /// itself and scrolls itself. That is indistinguishable from a hang to anyone watching, and the
    /// owner killed it as one more than once while waiting on a single figure. Almost every
    /// measurement wants one section; asking for one should cost seconds.
    /// </remarks>
    private HashSet<string>? _only;

    /// <summary>Whether this launch asked for something other than <paramref name="section"/>.</summary>
    private bool Skip(string section) => _only is not null && !_only.Contains(section);

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
        W($"  {Configuration} {System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}, " +
          $"every duration below measured by {nameof(Time)}");

        // Notification counting is on for the whole pass rather than switched on around the
        // operations that report a count, so its cost is in every figure equally and cancels out of
        // every comparison between them.
        AttachCounters();

        // TEMPORARY: --measure:Z runs the owner's reported sequence and nothing else. The sections
        // below are inline rather than gated, so without this asking for one of them still costs
        // the whole pass.
        if (_only is not null && _only.Count == 1 && _only.Contains("Z"))
        {
            Section("Z. TEMPORARY: sort, then Downloading, then All");
            await ProbeFilterBlanksAsync();
            DetachCounters();
            return;
        }

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

        Section("P. Where a press lands on the row surface");
        await ProbeRowSurfaceAsync();

        Section("Q. A sort takes the queue away, and rows stop being draggable with it");
        await ProbeQueueGateAsync();

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
        await MeasureProjectionCostsAsync();
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

        Section("O. Do two columns ever land on the same place");
        await ProbeColumnOverlapAsync();

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

        Section("R. The list is told only about the rows it holds");
        await ProbeQuietPlacementAsync();

        Section("S. Does a sort still cost what the screen costs at ten times the rows");
        await ProbeScaleAsync();

        Section("Z. TEMPORARY: sort, then Downloading, then All");
        await ProbeFilterBlanksAsync();

        Section("J. Screen capture");
        await Settle(1200);
        await CaptureAsync("torrent-page.bmp", this);

        DetachCounters();
    }

    /// <summary>
    /// The claim the whole change is for: what a sort costs now follows the number of rows on the
    /// screen and not the number of rows in the table. Every other figure in this file is taken at
    /// 2,002 rows, which cannot tell the difference between a cost that scales and one that does
    /// not. This runs the same reversal against ten times the rows and reports both.
    /// </summary>
    /// <remarks>
    /// The bigger catalogue is never started, so nothing ticks underneath the measurement, and the
    /// page's own projection is put back at the end.
    /// </remarks>
    private async Task ProbeScaleAsync()
    {
        if (Skip("S")) { return; }

        async Task<string> Reversal(string what, IReadOnlyList<TorrentRowViewModel> rows)
        {
            Table.ItemsSource = rows;
            Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
            await Settle(900);

            _notifications = 0;
            (double changed, double laidOut) =
                Time(() => Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Descending)));

            return $"  {what}: {rows.Count} rows, {_notifications} notifications, " +
                   $"{_collections} collections, changed in {changed:0} ms, laid out in {laidOut:0} ms, " +
                   $"{changed + laidOut:0} ms in all";
        }

        _catalog!.Stop();

        TorrentCatalog? bigger = null;
        try
        {
            W(await Reversal("as the page runs", _catalog.Rows));

            bigger = new TorrentCatalog(DispatcherQueue, 20000);
            W(await Reversal("ten times the rows", bigger.Rows));
        }
        catch (Exception ex)
        {
            W($"  the larger catalogue failed: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            bigger?.Stop();
            Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
            ApplyProjection();
            await Settle(900);
            _catalog.Start();
        }
    }

    /// <summary>
    /// The claim the reconcile now rests on: the list keeps nothing for a position it has not
    /// realized, so a reorder can be announced only where it holds a container and every other
    /// position changed quietly. If that is wrong, a container shows a row the view does not have
    /// there, and every case below is a different way of asking whether one does.
    /// </summary>
    private async Task ProbeQuietPlacementAsync()
    {
        if (Skip("R")) { return; }

        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ItemsSource is not System.Collections.IList view
            || list.ItemsPanelRoot is not Panel panel)
        {
            W("  no hosted list to probe");
            return;
        }

        ScrollViewer? scroller = FindDescendant<ScrollViewer>(list);

        /// <summary>Every container the panel holds, against the row the view has at its index.</summary>
        string Disagreements()
        {
            int checked_ = 0;
            List<string> wrong = new();

            foreach (UIElement child in panel.Children)
            {
                int index = list.IndexFromContainer(child);
                if (index < 0 || child is not ListViewItem container)
                {
                    continue;
                }

                checked_++;
                object? shown = container.Content;
                object? expected = index < view.Count ? view[index] : null;
                if (!ReferenceEquals(shown, expected))
                {
                    wrong.Add($"{index} shows " +
                        $"{(shown as TorrentRowViewModel)?.Name ?? "nothing"} but the view has " +
                        $"{(expected as TorrentRowViewModel)?.Name ?? "nothing"}");
                }
            }

            return wrong.Count == 0
                ? $"{checked_} containers, all showing the view's row"
                : $"{checked_} containers, {wrong.Count} wrong: {string.Join("; ", wrong.Take(4))}";
        }

        _catalog!.Stop();
        Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
        await Settle(600);

        // 0. The mechanism, before any symptom. Scroll away from the top so the realized run sits
        //    well above index 0, remove the row at 0, and ask a container what index it is at before
        //    any layout has run. Dropped by one means the panel updates its map inside the
        //    notification, so two reconciles in one callback cannot read a stale set and no forced
        //    layout is needed. Unchanged means the map is deferred and the forced layout is part of
        //    the design rather than a fallback.
        scroller?.ChangeView(null, 700 * 40.0, null, disableAnimation: true);
        list.UpdateLayout();
        await Settle(400);

        UIElement? sample = panel.Children.FirstOrDefault(c => list.IndexFromContainer(c) > 0);
        if (sample is not null && view.Count > 1)
        {
            int before = list.IndexFromContainer(sample);
            object first = view[0]!;
            view.RemoveAt(0);
            int after = list.IndexFromContainer(sample);
            view.Insert(0, first);

            W($"  0. a container at {before}; after removing the row at 0, and before any layout, " +
              $"it reports {after} — the panel's map is " +
              (after == before - 1 ? "updated inside the notification" : "deferred to the next measure"));
        }
        else
        {
            W("  0. no container above index 0 to ask");
        }

        await Settle(400);

        // 1. The reversal itself.
        Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
        await Settle(600);
        _notifications = 0;
        (double changed, double laidOut) =
            Time(() => Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Descending)));

        W($"  1. a full reversal: {_notifications} notifications, {_collections} collections, " +
          $"changed in {changed:0} ms and laid out in {laidOut:0} ms");
        W($"     {Disagreements()}");

        // Whether the rows reach the bottom of the viewport, which is a different question from
        // whether the containers that exist are right, and the one that catches the failure this
        // design can have: rows placed without a notification give the panel no reason to re-examine
        // which rows it should hold, so it goes on holding the ones it had and the foot of the
        // viewport stays empty until something else pokes it. Asked immediately, then after a
        // settle: if the first answer is short and the second is not, the panel was told too late.
        W($"     {Fill()}");
        await Settle(1200);
        W($"     after settling: {Fill()}");

        string Fill()
        {
            double viewport = scroller?.ViewportHeight ?? list.ActualHeight;
            double reached = 0;
            int held = 0;

            foreach (UIElement child in panel.Children)
            {
                if (child is not FrameworkElement row || list.IndexFromContainer(child) < 0)
                {
                    continue;
                }

                held++;
                reached = Math.Max(
                    reached,
                    row.TransformToVisual(list)
                        .TransformBounds(new Rect(0, 0, row.ActualWidth, row.ActualHeight))
                        .Bottom);
            }

            return $"{held} containers reaching {reached:0} of the {viewport:0} the viewport shows" +
                   (reached >= viewport - 1 ? string.Empty : " — the foot of the viewport is empty");
        }

        // 2. Far scrolls, where a quietly placed row would first be seen.
        foreach (int row in new[] { 700, 1400, 1990 })
        {
            scroller?.ChangeView(null, row * 40.0, null, disableAnimation: true);
            list.UpdateLayout();
            await Settle(400);
            W($"  2. after scrolling to about row {row}: {Disagreements()}");
        }

        // 3. The row a scroll request brings in.
        scroller?.ChangeView(null, 0, null, disableAnimation: true);
        await Settle(400);
        if (view.Count > 1500)
        {
            object wanted = view[1500]!;
            list.ScrollIntoView(wanted);
            list.ScrollIntoView(wanted);
            list.UpdateLayout();
            await Settle(400);

            object? arrived = (list.ContainerFromItem(wanted) as ListViewItem)?.Content;
            W($"  3. ScrollIntoView of view index 1500 arrived holding " +
              $"{(ReferenceEquals(arrived, wanted) ? "that row" : "something else")}; {Disagreements()}");
        }

        // 5. Two reconciles before one layout, which is a publish or the settle timer landing in
        //    the same callback as a sort.
        scroller?.ChangeView(null, 700 * 40.0, null, disableAnimation: true);
        list.UpdateLayout();
        await Settle(400);

        Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
        Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Descending));

        // Asserting between the two reconciles and their layout finds no containers to assert on:
        // the list answers no index for any of them until it has laid out. That is a fact about
        // when the question can be asked, not a pass, so the line below says so rather than
        // reporting nothing wrong out of nothing checked.
        W($"  5. two reconciles in one callback, before their layout: {Disagreements()} — nothing " +
          "can be asked of the list here, it answers no index until it lays out");
        list.UpdateLayout();
        await Settle(400);
        W($"     after the layout, which is where this case is decided: {Disagreements()}");

        // 6. The same thing with the host publishing underneath it.
        _catalog.Start();
        Table.ApplyLayoutState(Sorted("speed", TableSortDirection.Descending));
        TimeSpan restore = Table.SortSettleInterval;
        Table.SortSettleInterval = TimeSpan.Zero;
        for (int slice = 0; slice < 15; slice++)
        {
            await Task.Delay(1000);
            string state = Disagreements();
            if (!state.EndsWith("showing the view's row", StringComparison.Ordinal))
            {
                W($"  6. second {slice} under a live publish: {state}");
            }
        }

        W("  6. fifteen seconds sorted by speed with settling off, publishing every second: " +
          Disagreements());

        Table.SortSettleInterval = restore;
        Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
        _catalog.Stop();
        scroller?.ChangeView(null, 0, null, disableAnimation: true);
        await Settle(600);
        _catalog.Start();
    }

    /// <summary>
    /// Where a press lands on the row surface, and what a rectangle drawn beside the columns
    /// covers. Both were assumptions until this ran. A row is only as wide as its columns, so the
    /// space to its right has to reach the arbiter as empty surface rather than as a row, and a
    /// rectangle drawn entirely in that space has to still cover the rows it spans vertically.
    /// </summary>
    private async Task ProbeRowSurfaceAsync()
    {
        if (Skip("P")) { return; }

        await ProbeSurfaceAsync("columns narrower than the window");

        // The other state, and the one that decides whether the gesture is always reachable: with
        // the columns wider than the window there is no space beside them, so a row line is row all
        // the way across and, while the rows can be dragged, a marquee can only be started below
        // the last row. Narrowing the window is how a user reaches it, so it is how this reaches it
        // too.
        MainWindow.Instance?.AppWindow.ResizeClient(new Windows.Graphics.SizeInt32(700, 820));
        await Settle(700);
        await ProbeSurfaceAsync("columns wider than the window");

        MainWindow.Instance?.AppWindow.ResizeClient(new Windows.Graphics.SizeInt32(1400, 820));
        await Settle(700);
    }

    private async Task ProbeSurfaceAsync(string state)
    {
        W($"  --- {state} ---");
        ListView? list = FindDescendant<ListView>(Table);
        List<ListViewItem> containers = new();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        ListViewItem? first = containers.FirstOrDefault(c => c.Content is TorrentRowViewModel);
        if (list is null || first is null)
        {
            W("  no realized row to probe");
            return;
        }

        Rect band = first
            .TransformToVisual(list)
            .TransformBounds(new Rect(0, 0, first.ActualWidth, first.ActualHeight));

        W($"  list is {list.ActualWidth:0.##} wide; the row band runs x {band.Left:0.##}..{band.Right:0.##}");
        W($"  space beside the columns = {list.ActualWidth - band.Right:0.##}");

        // The arbiter's own decision, taken from the element the platform reports at that point.
        MethodInfo? hitTest = typeof(TableView)
            .GetMethod("HitTest", BindingFlags.NonPublic | BindingFlags.Instance);

        void Probe(string what, double x)
        {
            Point inList = new(x, band.Top + (band.Height / 2));
            Point inHost = list.TransformToVisual(null).TransformPoint(inList);

            List<UIElement> hits = VisualTreeHelper
                .FindElementsInHostCoordinates(inHost, Table)
                .ToList();

            string top = hits.Count > 0 ? hits[0].GetType().Name : "nothing";
            bool overARow = hits.Any(h => h is ListViewItem);

            string decision = "not reached";
            if (hitTest is not null && hits.Count > 0)
            {
                object?[] args = { hits[0], null };
                decision = $"{hitTest.Invoke(Table, args)}";
                if (args[1] is TorrentRowViewModel row)
                {
                    decision += $" ({row.Name})";
                }
            }

            W($"  x={x:0.##} {what}: topmost {top}, inside a row container = {overARow}, arbiter says {decision}");
        }

        Probe("over a cell", band.Left + 20);
        if (band.Right + 8 < list.ActualWidth)
        {
            Probe("just past the last column", band.Right + 8);
        }

        Probe("at the right edge of the surface", list.ActualWidth - 8);

        // A rectangle drawn straight down the space beside the columns, never crossing a cell.
        object? marquee = typeof(TableView)
            .GetField("_marquee", BindingFlags.NonPublic | BindingFlags.Instance)
            ?.GetValue(Table);

        if (marquee is null || band.Right + 8 >= list.ActualWidth)
        {
            W("  no space beside the columns to draw in");
            return;
        }

        Type type = marquee.GetType();
        double drawAt = band.Right + 8;
        type.GetMethod("Begin", BindingFlags.NonPublic | BindingFlags.Instance)?.Invoke(
            marquee,
            new object?[] { list, null, null, new Point(drawAt, band.Top + 2), (Action)(() => { }) });
        type.GetMethod("Track", BindingFlags.NonPublic | BindingFlags.Instance)?.Invoke(
            marquee, new object?[] { new Point(drawAt, band.Top + (band.Height * 4)) });

        int covered = (type.GetProperty("CoveredIndices", BindingFlags.NonPublic | BindingFlags.Instance)
            ?.GetValue(marquee) as IReadOnlyCollection<int>)?.Count ?? -1;

        type.GetMethod("End", BindingFlags.NonPublic | BindingFlags.Instance)?.Invoke(marquee, null);

        W($"  a rectangle four rows tall drawn at x={drawAt:0.##} covers {covered} rows");
        await Settle(200);
    }

    /// <summary>
    /// Sorting by a column that is not the queue means a dropped row has no queue position to land
    /// on, so the table withholds the drag while such a sort is active: the queue column declares
    /// itself the row order, and this page no longer touches the flag for a sort. Sorting is driven
    /// here through the strip's own click path rather than through
    /// <see cref="TableView.ApplyLayoutState"/>, which reports nothing back to the host precisely
    /// because the host asked for it. The column is cycled all the way back to unsorted, so the
    /// sections after this one see the table as they would have.
    /// </summary>
    private async Task ProbeQueueGateAsync()
    {
        if (Skip("Q")) { return; }

        TableHeaderStrip? strip = FindDescendant<TableHeaderStrip>(Table);
        List<TableHeaderCell> cells = new();
        if (strip is not null)
        {
            FindAll(strip, cells);
        }

        TableHeaderCell? name = cells.FirstOrDefault();
        TextBlock? label = name is null ? null : FindDescendant<TextBlock>(name);
        MethodInfo? activate = typeof(TableHeaderStrip)
            .GetMethod("ActivateSortFrom", BindingFlags.NonPublic | BindingFlags.Instance);

        if (strip is null || label is null || activate is null)
        {
            W("  no sortable header to click");
            return;
        }

        // The table's own answer, not the host flag: the flag stays true through a sort, and the
        // table withholds the drag itself under any sort but the queue column's.
        MethodInfo? canDrag = typeof(TableView)
            .GetMethod("CanBeginRowDrag", BindingFlags.NonPublic | BindingFlags.Instance);
        string DragOffered()
        {
            object? row = (Table.ItemsSource as System.Collections.IEnumerable)?
                .Cast<object>()
                .FirstOrDefault(r => r is TorrentRowViewModel { IsGhost: false });
            return row is null || canDrag is null
                ? "unknown"
                : ((bool)canDrag.Invoke(Table, new[] { row })!).ToString();
        }

        W($"  unsorted: a row can be dragged = {DragOffered()}");

        foreach (string step in new[] { "ascending", "descending", "cleared" })
        {
            activate.Invoke(strip, new object?[] { label });
            await Settle(400);
            W($"  after clicking '{label.Text}' ({step}): sorted by " +
                $"{_layout?.SortColumnId ?? "nothing"}, a row can be dragged = {DragOffered()}");
        }
    }

    /// <summary>
    /// The two fit commands this page offers, and the log line each produces. The fit itself is the
    /// table's; what is measured here is that the host reaches it and reports it.
    /// </summary>
    private async Task ExerciseFitAsync()
    {
        if (Skip("H")) { return; }

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
        if (Skip("I")) { return; }

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
        if (Skip("K")) { return; }

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

    /// <summary>
    /// Each host projection change the page can make, timed to the end of its layout.
    /// </summary>
    /// <remarks>
    /// The three sorts settle first, because section N's do. This section and that one reported the
    /// same reversal as two different figures for a long time, and the difference was never the
    /// operation: a change applied while the tree still has work pending returns quickly and pays in
    /// the layout that follows, and the same change applied to a quiet tree pays as it goes. The
    /// totals were always the same size. Settling both is what makes the two comparable at all.
    /// </remarks>
    private async Task MeasureProjectionCostsAsync()
    {
        if (Skip("K")) { return; }

        W("  " + Timed("one catalog tick", () => _catalog!.Tick()));
        W($"  rows with a bound listener = {BoundRows()} of {_catalog!.Rows.Count}");
        W("  " + Timed("projection with nothing changed", ApplyProjection));

        ListView? list = FindDescendant<ListView>(Table);
        Dictionary<ListViewItem, TextBlock?> cellsBefore = CellIdentity(list);
        W("  " + Timed("filter downloading, 900 rows leave", () => { _stateFilter = "downloading"; ApplyProjection(); }));
        W("  " + Timed("filter all, 900 rows return", () => { _stateFilter = "all"; ApplyProjection(); }));
        W("  " + ReusedCells(list, cellsBefore));
        W($"  rows with a bound listener after the filter churn = {BoundRows()}");

        await Settle(600);
        W("  " + Timed("sort name ascending", () => Table.ApplyLayoutState(Sorted("name", TableSortDirection.Ascending))));
        await Settle(600);
        W("  " + Timed("sort name descending, every row moves", () => Table.ApplyLayoutState(Sorted("name", TableSortDirection.Descending))));
        await Settle(600);
        W("  " + Timed("sort cleared", () => Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending))));
    }

    /// <summary>
    /// What a re-sort costs, split so the answer depends neither on this machine's mood nor on
    /// which span of the operation a stopwatch happened to cover. Two sorts are compared — the one
    /// section K times, and a full reversal — and each is measured twice over: the collection
    /// mutation on its own, then the layout pass that follows it. Beside them are two counts that
    /// do not move with load at all: how many notifications the list is sent, and how many times it
    /// realizes a container while handling them.
    /// </summary>
    private async Task MeasureSortCostAsync()
    {
        if (Skip("N")) { return; }

        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ItemsSource is not System.Collections.Specialized.INotifyCollectionChanged feed)
        {
            W("  the list's source raises no notifications to count");
            return;
        }

        Microsoft.UI.Xaml.Media.Animation.TransitionCollection? live = list.ItemContainerTransitions;

        (string Label, TableLayoutState From, TableLayoutState To, bool Motion)[] cases =
        {
            ("natural order to name order", Sorted(null, TableSortDirection.Ascending),
                Sorted("name", TableSortDirection.Ascending), true),
            ("queue ascending to descending", Sorted("queue", TableSortDirection.Ascending),
                Sorted("queue", TableSortDirection.Descending), true),
            ("queue reversal with the row transitions off", Sorted("queue", TableSortDirection.Ascending),
                Sorted("queue", TableSortDirection.Descending), false),
        };

        Dictionary<string, List<double>> mutation = new();
        Dictionary<string, List<double>> layout = new();
        Dictionary<string, (int Notifications, int Realizations)> counts = new();
        Dictionary<string, string> collected = new();

        // The tick is stopped throughout: a 1 Hz projection landing inside a timed sort is exactly
        // the contamination this section exists to remove.
        _catalog!.Stop();

        // Cases outside, trials inside, so the transitions are switched once for a case instead of
        // twice for every trial of it. Assigning a TransitionCollection is not free and it was
        // landing between the settle and the measurement.
        foreach ((string label, TableLayoutState from, TableLayoutState to, bool motion) in cases)
        {
            if (!motion)
            {
                list.ItemContainerTransitions =
                    new Microsoft.UI.Xaml.Media.Animation.TransitionCollection();
            }

            mutation[label] = new List<double>();
            layout[label] = new List<double>();

            // Five trials, not three. A single sample of this operation moved by a factor of two
            // between runs on a machine sitting at about forty percent load, so one number is not a
            // measurement; the spread reported below is.
            for (int trial = 0; trial < 5; trial++)
            {
                Table.ApplyLayoutState(from);
                await Settle(600);

                _notifications = 0;
                (double changed, double laidOut) = Time(() => Table.ApplyLayoutState(to));

                mutation[label].Add(changed);
                layout[label].Add(laidOut);
                collected[label] = _collections;
                counts[label] = (_notifications, 0);

                await Settle(600);
            }

            // The container count, from a pass of its own so that no reported duration is measured
            // with a ContainerContentChanging subscriber attached.
            Table.ApplyLayoutState(from);
            await Settle(600);
            (int realized, double _) = Realizations(() => Table.ApplyLayoutState(to));
            counts[label] = (counts[label].Notifications, realized);
            await Settle(600);

            if (!motion)
            {
                list.ItemContainerTransitions = live;
            }
        }

        // What a sort costs standing still is only half the question. The bench stops the tick, and
        // the owner does not: if a live source makes the sorted order differ on every tick, the
        // table pays a whole re-sort once a second for as long as the sort is applied, which no
        // amount of making one sort cheaper would fix. Sorting on speed, which every tick changes,
        // is the worst case; sorting on name, which no tick changes, is the control.
        foreach ((string column, TimeSpan settle) in new[]
        {
            ("speed", Table.SortSettleInterval),
            ("speed", TimeSpan.Zero),
            ("name", Table.SortSettleInterval),
        })
        {
            TimeSpan restore = Table.SortSettleInterval;
            Table.SortSettleInterval = settle;
            Table.ApplyLayoutState(Sorted(column, TableSortDirection.Descending));
            await Settle(600);
            _catalog.Start();

            // One publish either reorders the whole view or is held, so counting the publishes that
            // reordered is the measure. Per publish is the wrong unit and per second is too: the
            // first divides out the very publishes settling makes free, and the second is hostage
            // to how many torrents the simulated daemon happened to finish. Fifteen seconds, so
            // that at three seconds of settling a cap can show at all.
            int reorders = 0;
            int sinceLast = 0;
            System.Collections.Specialized.NotifyCollectionChangedEventHandler burst =
                (_, _) => sinceLast++;

            _notifications = 0;
            int publishedBefore = ProjectionRuns;
            int seenPublishes = publishedBefore;
            feed.CollectionChanged += burst;

            for (int slice = 0; slice < 150; slice++)
            {
                await Task.Delay(100);
                if (ProjectionRuns == seenPublishes)
                {
                    continue;
                }

                seenPublishes = ProjectionRuns;
                if (sinceLast > 0)
                {
                    reorders++;
                }

                sinceLast = 0;
            }

            feed.CollectionChanged -= burst;
            _catalog.Stop();

            int published = ProjectionRuns - publishedBefore;
            W($"  sorted by {column}, settle {settle.TotalSeconds:0.#}s: {published} publishes in " +
              $"15 s, {reorders} of them reordered the view, {_notifications} notifications in total");

            Table.SortSettleInterval = restore;
        }

        Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
        await Settle(400);
        _catalog.Start();

        foreach ((string label, TableLayoutState _, TableLayoutState _, bool _) in cases)
        {
            List<double> changing = mutation[label];
            List<double> after = layout[label];
            (int sent, int realized) = counts[label];

            // Totals per trial first: the two halves are sorted below for their own medians, and
            // adding a sorted list to another sorted list pairs numbers from different trials.
            List<double> totals = new();
            for (int i = 0; i < changing.Count; i++)
            {
                totals.Add(changing[i] + after[i]);
            }

            totals.Sort();
            changing.Sort();
            after.Sort();
            double whole = totals[totals.Count / 2];

            W($"  {label}:");
            W($"    {sent} notifications sent, a container realized {realized} times, " +
              $"{collected[label]} gen0/gen2 collections in the last trial");
            // No per-notification figure. It meant something while a sort raised one for every row
            // that moved; now that it raises one only where the list holds a container, dividing the
            // whole cost by a few dozen notifications describes nothing.
            W($"    change plus layout: median {whole:0} ms, {totals[0]:0} to {totals[^1]:0} across " +
              $"{totals.Count} trials");
            W($"    of which the change was {changing[changing.Count / 2]:0} ms and the layout " +
              $"{after[after.Count / 2]:0} ms, a split that moves with what was already pending and " +
              "is not a stable quantity");
        }
    }

    /// <summary>
    /// The owner photographed two columns drawn on top of each other, and said afterwards that he
    /// had been dragging a resize separator while the measurement loop was hiding columns. This
    /// replays that shape: a width change and a visibility change arriving together, repeatedly,
    /// with no settling between them. Two competing explanations are separated by what it reports.
    /// A visible column of zero width would put the next one at the same offset, because the layout
    /// accumulates offsets by adding each width. Cells outnumbering visible columns would instead
    /// leave a stale one arranged where it last was, since measure and arrange both stop at the
    /// smaller of the two counts.
    /// </summary>
    private async Task ProbeColumnOverlapAsync()
    {
        if (Skip("O")) { return; }

        IReadOnlyList<string> order = Table.GetLayoutState().ColumnOrder;
        string[] hideable = { "peers", "size", "speed", "status", "queue" };

        int worstOverlaps = 0;
        int worstZero = 0;
        int worstExtraCells = 0;
        string detail = string.Empty;

        for (int round = 0; round < 15; round++)
        {
            Dictionary<string, bool> visibility = new(StringComparer.Ordinal)
            {
                [hideable[round % hideable.Length]] = false,
            };
            Dictionary<string, double> widths = new(StringComparer.Ordinal)
            {
                ["name"] = 140 + (round % 6 * 35),
                ["progress"] = 110 + (round % 4 * 45),
            };

            Table.ApplyLayoutState(
                new TableLayoutState(order, visibility, widths, "queue", TableSortDirection.Ascending));
            Table.UpdateLayout();

            TableHeaderStrip? strip = FindDescendant<TableHeaderStrip>(Table);
            List<TableHeaderCell> cells = new();
            if (strip is not null)
            {
                FindAll(strip, cells);
            }

            List<(double X, double Width)> boxes = new();
            int zero = 0;
            foreach (TableHeaderCell cell in cells)
            {
                if (cell.Visibility != Visibility.Visible)
                {
                    continue;
                }

                boxes.Add((XOf(cell), cell.ActualWidth));
                if (cell.ActualWidth < 1)
                {
                    zero++;
                }
            }

            boxes.Sort((a, b) => a.X.CompareTo(b.X));
            int overlaps = 0;
            for (int i = 1; i < boxes.Count; i++)
            {
                if (boxes[i].X - boxes[i - 1].X < 1)
                {
                    overlaps++;
                }
            }

            // One cell per visible column is the contract. More means one is unaccounted for.
            int visibleColumns = order.Count - visibility.Count;
            int extra = boxes.Count - visibleColumns;

            if (overlaps > worstOverlaps || zero > worstZero || extra > worstExtraCells)
            {
                worstOverlaps = Math.Max(worstOverlaps, overlaps);
                worstZero = Math.Max(worstZero, zero);
                worstExtraCells = Math.Max(worstExtraCells, extra);
                detail = $" first at round {round}, hiding {hideable[round % hideable.Length]}";
            }

            await Settle(60);
        }

        W($"  15 rounds of a width change and a visibility change together: " +
          $"{worstOverlaps} pairs sharing an offset, {worstZero} visible columns of zero width, " +
          $"{worstExtraCells} header cells beyond the visible column count.{detail}");

        Table.ApplyLayoutState(Sorted(null, TableSortDirection.Ascending));
        await Settle(300);
    }

    /// <summary>
    /// Two selected rows among unselected ones, with nothing covering them, so the selected cue can
    /// be looked at rather than described.
    /// </summary>
    private async Task CaptureSelectedRowsAsync()
    {
        if (Skip("M2")) { return; }

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
        if (Skip("M")) { return; }

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
        if (Skip("K")) { return; }

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

    /// <summary>
    /// Stamped with the wall clock so an external frame recorder can be lined up with it. Both
    /// numbers come from <see cref="Time"/>, so they mean what section N's mean. The second used to
    /// be the total of the two, which is one of the reasons the same reversal could be read as two
    /// different figures depending on which section printed it.
    /// </summary>
    private string Timed(string what, Action action)
    {
        string at = DateTime.Now.ToString("HH:mm:ss.fff");
        _notifications = 0;
        (double mutation, double layout) = Time(action);
        return $"{at} {what}: changed in {mutation:0.0} ms, laid out in {layout:0.0} ms, " +
               $"{_notifications} notifications, {_collections} collections";
    }

    /// <summary>
    /// A sort re-lists the viewport, so every visible cell is rebound and laid out once. Sorting by
    /// queue makes the comparer free; hiding one column at a time attributes the rest. Each figure
    /// is the best of three, because a single Debug sample wanders by tens of milliseconds.
    /// </summary>
    private void MeasureColumnCosts()
    {
        if (Skip("L")) { return; }

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

                // The sum of Time's two numbers, so this section's figure can be laid beside K's
                // and N's for the same reversal instead of beside neither.
                (double mutation, double layout) = Time(
                    () => Table.ApplyLayoutState(Layout(hidden, TableSortDirection.Descending)));
                best = Math.Min(best, mutation + layout);
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

    /// <summary>
    /// TEMPORARY. The owner's report: sort, press Downloading, press All, and the list is left with
    /// blank bands where rows should be. A blank row of the right height is a container the panel is
    /// arranging with no data on it, so this counts containers whose DataContext is null separately
    /// from containers showing the wrong row.
    /// </summary>
    private async Task ProbeFilterBlanksAsync()
    {
        if (Skip("Z")) { return; }

        ListView? list = FindDescendant<ListView>(Table);
        if (list?.ItemsSource is not System.Collections.IList view
            || list.ItemsPanelRoot is not ItemsStackPanel panel)
        {
            W("  no hosted list to probe");
            return;
        }

        ScrollViewer? scroller = FindDescendant<ScrollViewer>(list);

        string State(string when)
        {
            int blank = 0;
            int wrong = 0;
            int held = 0;
            List<string> detail = new();

            foreach (UIElement child in panel.Children)
            {
                if (child is not ListViewItem container)
                {
                    continue;
                }

                int index = list.IndexFromContainer(child);
                held++;

                // Content, not DataContext: a ListViewItem carries the row on Content and leaves
                // its own DataContext null, so testing DataContext calls every container blank.
                if (container.Content is null)
                {
                    blank++;

                    // Where it was arranged. A recycled container parked outside the viewport is
                    // housekeeping; one arranged among the rows is a blank band on screen, which is
                    // what the owner reported.
                    double y = double.NaN;
                    try
                    {
                        y = container
                            .TransformToVisual(scroller ?? (UIElement)list)
                            .TransformPoint(new Windows.Foundation.Point(0, 0)).Y;
                    }
                    catch (Exception)
                    {
                        // Not in the tree at all, which is the parked answer.
                    }

                    detail.Add($"{index} blank y={y:F0} h={container.ActualHeight:F0} {container.Visibility}");
                }
                else if (index >= 0 && index < view.Count
                    && !ReferenceEquals(container.Content, view[index]))
                {
                    wrong++;
                    detail.Add($"{index} shows {(container.Content as TorrentRowViewModel)?.Name}");
                }
            }

            // A blank band of the right height is either a container drawing nothing or no
            // container at all, and the two have different causes. This is the second question:
            // which positions the viewport covers have nothing standing at them.
            List<int> missing = new();
            for (int i = panel.FirstVisibleIndex; i >= 0 && i <= panel.LastVisibleIndex; i++)
            {
                if (list.ContainerFromIndex(i) is null)
                {
                    missing.Add(i);
                }
            }

            return $"  {when}: view={view.Count} containers={held} " +
                $"cache={panel.FirstCacheIndex}..{panel.LastCacheIndex} " +
                $"vis={panel.FirstVisibleIndex}..{panel.LastVisibleIndex} " +
                $"blank={blank} wrong={wrong} noContainer={missing.Count}" +
                (missing.Count == 0 ? string.Empty : " at " + string.Join(",", missing.Take(12))) +
                (detail.Count == 0 ? string.Empty : "\n      " + string.Join("\n      ", detail.Take(10)));
        }

        // Live, the way the owner had it: the daemon keeps publishing across the filter changes.
        // Section R stops it, and a stopped daemon takes the sort settle out of the picture
        // entirely — which is half of what runs during the owner's sequence.
        _catalog?.Start();

        // The owner's window, not the harness's: about 24 rows in the viewport rather than 12, so
        // the panel's cache is twice the size and the realized run is twice as wide.
        try
        {
            MainWindow.Instance?.AppWindow.ResizeClient(new Windows.Graphics.SizeInt32(1460, 1080));
        }
        catch (Exception ex)
        {
            W("  resize failed: " + ex.Message);
        }

        await Settle(700);

        Table.ApplyLayoutState(Sorted("queue", TableSortDirection.Ascending));
        await Settle(700);
        W(State("after the sort"));

        // Scrolled down first. Every filter change below then happens with the realized run in the
        // middle of the list rather than at index 0, which is where the owner was: both screenshots
        // are mid-list. At offset 0 the run starts at index 0 and the arithmetic that decides what
        // to announce has the easiest case there is.
        scroller?.ChangeView(null, 500 * 40.0, null, disableAnimation: true);
        await Settle(700);
        W(State("scrolled to row 500"));

        // The owner did this once and saw it. Doing it at a range of scroll offsets, in both filter
        // directions, is the same sequence with the one variable that is certainly different
        // between their run and this one moved through its range.
        int found = 0;
        foreach (int top in new[] { 0, 13, 120, 500, 1200, 1800 })
        {
            scroller?.ChangeView(null, top * 40.0, null, disableAnimation: true);
            await Settle(400);

            foreach (string filter in new[] { "downloading", "all", "seeding", "all" })
            {
                _stateFilter = filter;
                ApplyProjection();
                await Settle(350);

                string cells = Cells();
                if (!cells.StartsWith("every", StringComparison.Ordinal))
                {
                    found++;
                    W($"      at row {top} after '{filter}': {cells}");
                }

                await Settle(700);
                cells = Cells();
                if (!cells.StartsWith("every", StringComparison.Ordinal))
                {
                    found++;
                    W($"      at row {top} after '{filter}', settled: {cells}");
                }
            }
        }

        W($"  24 filter changes across six scroll offsets: {found} left a blank row");

        await SetFilter("all");
        await Settle(1200);
        W(State("after All, settled"));
        W("      cells: " + Cells());

        // The owner's screenshots are mid-list, not at the top.
        scroller?.ChangeView(null, 24 * 40.0, null, disableAnimation: true);
        await Settle(900);
        W(State("scrolled to row 24"));

        // A container can hold the right row and still draw nothing, if the cells panel inside it
        // has no children or its cells have no content. That is the shape of the owner's report: a
        // band of the right height with nothing in it. Recycling is what exercises it, so this
        // walks the list the way a person does.
        string Cells()
        {
            List<string> empty = new();

            for (int i = panel.FirstVisibleIndex; i >= 0 && i <= panel.LastVisibleIndex; i++)
            {
                if (list.ContainerFromIndex(i) is not ListViewItem container)
                {
                    empty.Add($"{i}:noContainer");
                    continue;
                }

                TableCellsPanel? cells = FindDescendant<TableCellsPanel>(container);
                if (cells is null)
                {
                    empty.Add($"{i}:noPanel");
                    continue;
                }

                int filled = 0;
                foreach (UIElement child in cells.Children)
                {
                    if (child is ContentPresenter { Content: not null })
                    {
                        filled++;
                    }
                }

                if (filled == 0)
                {
                    empty.Add($"{i}:{cells.Children.Count}cells/0filled h={cells.ActualHeight:F0}");
                }
            }

            return empty.Count == 0 ? "every visible row drew its cells" : string.Join(" ", empty.Take(12));
        }

        for (int top = 0; top <= 600; top += 60)
        {
            scroller?.ChangeView(null, top * 40.0, null, disableAnimation: true);
            await Settle(260);
            string cells = Cells();
            if (!cells.StartsWith("every", StringComparison.Ordinal))
            {
                W($"      at row {top}: {cells}");
            }
        }

        W("  scrolled 0..600 in steps of 60: " + Cells());

        // What the owner actually reported is visual. If the numbers above stay clean, the picture
        // says whether this sequence reproduces it at all.
        scroller?.ChangeView(null, 24 * 40.0, null, disableAnimation: true);
        await Settle(600);
        await CaptureAsync("torrent-blanks.bmp", this);

        // Every visible row, with what the container is drawing it at. A row at opacity 0 occupies
        // its height and shows nothing, which looks exactly like a container that never arrived.
        for (int i = panel.FirstVisibleIndex; i >= 0 && i <= panel.LastVisibleIndex; i++)
        {
            TorrentRowViewModel? row = i < view.Count ? view[i] as TorrentRowViewModel : null;
            ListViewItem? container = list.ContainerFromIndex(i) as ListViewItem;
            W($"      {i}: queue={row?.QueueText} ghost={row?.IsGhost} rowOpacity={row?.RowOpacity:F2} " +
              $"container={(container is null ? "none" : $"opacity={container.Opacity:F2} h={container.ActualHeight:F0}")} " +
              $"'{row?.Name}'");
        }

        scroller?.ChangeView(null, 0, null, disableAnimation: true);
        await Settle(600);
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
