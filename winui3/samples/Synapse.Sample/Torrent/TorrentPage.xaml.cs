using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Synapse;
using Windows.Foundation;

namespace Synapse_Sample;

/// <summary>
/// The torrent host profile: the layer the specification keeps outside the component. It owns the
/// eleven columns, the cell templates, the domain filters, the text search, the row menu, and the
/// queue order a reorder request asks it to change. <see cref="TableView"/> supplies only table
/// mechanics.
/// </summary>
public sealed partial class TorrentPage : Page
{
    private const int RowCount = 2000;

    /// <summary>Present only while an agent measures the page.</summary>
    private const string DiagnosticsFlagPath =
        "C:/SynoSoftware/TinyTorrent/winui3/torrent-diag.flag";

    /// <summary>
    /// Whether this launch is a measurement. The argument is the way to ask for one; the file is
    /// kept because it is the only way to reach a packaged launch, which inherits no arguments.
    /// </summary>
    /// <remarks>
    /// The file switch has a trap the argument does not, and the owner fell into it: it belongs to
    /// the machine rather than to a launch, so a run left behind by an agent turns the owner's next
    /// launch into a measurement — the window resizes itself, the table sorts itself, and the app
    /// closes at the end, which reads exactly like a hang. Ask with the argument unless the build
    /// is packaged.
    /// </remarks>
    private bool MeasuringThisLaunch()
    {
        bool asked = File.Exists(DiagnosticsFlagPath);

        foreach (string argument in Environment.GetCommandLineArgs())
        {
            if (!argument.StartsWith("--measure", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            asked = true;

            // --measure runs everything; --measure:R or --measure:K,N runs those sections and
            // leaves the rest of the pass out, which is the difference between six minutes of the
            // app driving itself and a few seconds of it.
            int colon = argument.IndexOf(':');
            if (colon >= 0)
            {
                _only = new HashSet<string>(
                    argument[(colon + 1)..].Split(',', StringSplitOptions.RemoveEmptyEntries),
                    StringComparer.OrdinalIgnoreCase);
            }
        }

        return asked;
    }

    private static readonly IReadOnlyList<TorrentRowViewModel> NoRows = Array.Empty<TorrentRowViewModel>();

    /// <summary>When the pointer last went down on the table, so a sort can be timed from the press.</summary>
    private long _pressedAt;

    /// <summary>
    /// How long a pause ends a word. Chosen, not derived, and said plainly because the alternative
    /// misleads: Windows publishes no metric for when a user has stopped typing, and the nearest
    /// candidate — the double-click time, which is about two mouse events forming one act — carries
    /// a 500 ms default that would leave the list half a second behind the word. This is short
    /// enough that the result reads as following the typing and long enough to swallow a burst.
    /// If a projection lands between two keystrokes at an ordinary typing rate, it is too short.
    /// </summary>
    private static readonly TimeSpan SearchSettleInterval = TimeSpan.FromMilliseconds(200);

    private TorrentCatalog? _catalog;
    private DispatcherQueueTimer? _searchDue;

    /// <summary>Set while the page is out of the tree, so a queued tick does not rebuild into it.</summary>
    private bool _detached;
    private string _stateFilter = "all";
    private string _searchText = string.Empty;
    private bool _simulateEmptySource;
    private int _projectedCount;

    /// <summary>The last published layout, so the log can report what a fit or a resize changed.</summary>
    private TableLayoutState? _layout;

    public TorrentPage()
    {
        InitializeComponent();
        AttachComparers();

        // A ghost is a row the daemon has not confirmed. It renders, and nothing else: it cannot be
        // selected, invoked, given a menu, or joined to a reorder packet.
        Table.CanInteractWithItem = item => item is TorrentRowViewModel { IsGhost: false };

        // handledEventsToo: the header marks the press handled once it has decided it is a sort.
        Table.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler(OnTablePressed), true);

        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    /// <summary>Every table event the host received, newest first.</summary>
    public ObservableCollection<string> Events { get; } = new();

    /// <summary>
    /// Each sortable column needs its own comparer over the row type. They are attached here, in
    /// code, because the schema is captured at the table's first <c>Loaded</c>.
    /// </summary>
    private void AttachComparers()
    {
        Dictionary<string, IComparer<object>> comparers = new(StringComparer.Ordinal)
        {
            ["name"] = TorrentComparers.Name,
            ["progress"] = TorrentComparers.Progress,
            ["status"] = TorrentComparers.Status,
            ["queue"] = TorrentComparers.Queue,
            ["eta"] = TorrentComparers.Eta,
            ["speed"] = TorrentComparers.Speed,
            ["peers"] = TorrentComparers.Peers,
            ["size"] = TorrentComparers.Size,
            ["ratio"] = TorrentComparers.Ratio,
            ["added"] = TorrentComparers.Added,
            ["completedOn"] = TorrentComparers.CompletedOn,
        };

        foreach (TableColumn column in Table.Columns)
        {
            if (comparers.TryGetValue(column.Id, out IComparer<object>? comparer))
            {
                column.SortComparer = comparer;
            }
        }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;

        // Loading presentation: no rows yet, IsLoading true.
        Table.IsLoading = true;
        Table.ItemsSource = NoRows;
        StatusLine.Text = "Contacting the daemon";

        await Task.Delay(1000);

        _catalog = new TorrentCatalog(DispatcherQueue, RowCount);
        _catalog.ViewAffectingChange += OnViewAffectingChange;
        _catalog.TickFailed += OnTickFailed;

        // Closing the window does not always unload its content first, so the ticker is stopped
        // from both signals. Whichever arrives first stops it, and stopping a stopped timer does
        // nothing.
        if (MainWindow.Instance is Window window)
        {
            window.Closed += (_, _) => _catalog?.Stop();
        }

        Table.IsLoading = false;
        ApplyProjection();
        _catalog.Start();

        if (!MeasuringThisLaunch())
        {
            return;
        }

        try
        {
            await RunDiagnosticsAsync();
        }
        catch (Exception ex)
        {
            W("*** DIAGNOSTICS THREW: " + ex);
        }

        Finish();
    }

    /// <summary>
    /// Stop this page's timers with the page. They belong to the dispatcher, not to this page, so
    /// nothing else stops them: they go on firing into a tree that is being taken apart, and a tick
    /// that lands mid-teardown throws from whichever object has gone already.
    /// </summary>
    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        Unloaded -= OnUnloaded;
        _detached = true;
        _catalog?.Stop();
        _searchDue?.Stop();
    }

    // ------------------------------------------------------- host projection

    /// <summary>
    /// The host's own pipeline: semantic queue order, then the state filter, then the text filter.
    /// Only the finished projection reaches the table, which never filters.
    /// </summary>
    /// <summary>
    /// How many times this page has published a projection. The measurement harness needs it: a
    /// window in which the daemon happened to complete nothing publishes nothing, and a count of
    /// zero notifications then says nothing about the table at all.
    /// </summary>
    internal int ProjectionRuns { get; private set; }

    private void ApplyProjection()
    {
        ProjectionRuns++;

        IReadOnlyList<TorrentRowViewModel> source =
            _simulateEmptySource || _catalog is null ? NoRows : _catalog.Rows;

        List<TorrentRowViewModel> projected = new(source.Count);
        foreach (TorrentRowViewModel row in source)
        {
            if (MatchesState(row) && MatchesText(row))
            {
                projected.Add(row);
            }
        }

        // Empty means the daemon has nothing; NoResults means a host filter excluded everything.
        Table.EmptyState = source.Count == 0 ? TableEmptyState.Empty : TableEmptyState.NoResults;
        Table.ItemsSource = projected;

        _projectedCount = projected.Count;
        StatusLine.Text = $"{projected.Count} of {source.Count} torrents shown " +
                          $"— filter {_stateFilter}" +
                          (_searchText.Length == 0 ? string.Empty : $", search \"{_searchText}\"");
    }

    /// <summary>Ghost rows bypass the state filter; a checking row belongs to both directions.</summary>
    private bool MatchesState(TorrentRowViewModel row) => _stateFilter switch
    {
        "downloading" => row.IsGhost || row.IsDownloading,
        "seeding" => row.IsGhost || row.IsSeeding,
        _ => true,
    };

    /// <summary>Text search is deliberately the host's. It matches the name and the ghost label.</summary>
    /// <remarks>
    /// Ordinal. This asks whether a file name contains what was typed, which is not an order the
    /// user reads, and a pass runs one substring search per row — 2,002 of them — for which
    /// culture-aware matching ran ICU collation. The visible difference is that a search no longer
    /// folds an accent or the Turkish dotless i onto its plain letter.
    /// </remarks>
    private bool MatchesText(TorrentRowViewModel row)
    {
        if (_searchText.Length == 0)
        {
            return true;
        }

        return row.Name.Contains(_searchText, StringComparison.OrdinalIgnoreCase)
            || (row.GhostLabel?.Contains(_searchText, StringComparison.OrdinalIgnoreCase) ?? false);
    }

    /// <summary>
    /// A tick that changed filter membership or order re-publishes the projection once. Speed and
    /// progress changes never come through here: they only redraw the cells.
    /// </summary>
    private void OnViewAffectingChange(object? sender, EventArgs e) => ApplyProjection();

    /// <summary>
    /// A tick that fails while the window is closing cannot report it: the status line is one of
    /// the objects that has already gone, and its setter throws E_UNEXPECTED. Throwing from here
    /// would leave the process with a stowed exception and no managed stack, which is the failure
    /// mode this handler exists to avoid, so a report that cannot be delivered is dropped.
    /// </summary>
    private void OnTickFailed(object? sender, Exception error)
    {
        W("*** TICK THREW: " + error);

        try
        {
            StatusLine.Text = "The update tick stopped: " + error.Message;
        }
        catch (COMException)
        {
        }
    }

    private void OnFilterClick(object sender, RoutedEventArgs e)
    {
        if (sender is not ToggleButton clicked || clicked.Tag is not string filter)
        {
            return;
        }

        _stateFilter = filter;
        FilterAll.IsChecked = filter == "all";
        FilterDownloading.IsChecked = filter == "downloading";
        FilterSeeding.IsChecked = filter == "seeding";

        ApplyProjection();
    }

    /// <summary>
    /// A keystroke starts the pause; it does not re-project. Narrowing 2,002 rows to a handful
    /// costs the table one collection notification per row that leaves, and running that from the
    /// keystroke made a six-letter word pay it six times over, each one blocking the letter after
    /// it. The text is read once, when the pause says the word is finished.
    /// </summary>
    private void OnSearchTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
        {
            return;
        }

        if (_searchDue is null)
        {
            _searchDue = DispatcherQueue.CreateTimer();
            _searchDue.IsRepeating = false;

            // How long a pause ends a word. The system's double-click time is the interval the
            // user has themselves set for "two input events are one act", so someone who has
            // slowed their input gets a longer pause; Windows publishes nothing closer for a
            // keyboard.
            _searchDue.Interval = SearchSettleInterval;
            _searchDue.Tick += (_, _) =>
            {
                // Stopping the timer does not recall a tick the dispatcher has already picked up,
                // and a page being taken apart is exactly where that lands. The same shape in
                // TableView's settle timer reached the owner as a COMException on exit.
                if (_detached)
                {
                    return;
                }

                _searchText = SearchBox.Text.Trim();
                ApplyProjection();
            };
        }

        _searchDue.Stop();
        _searchDue.Start();
    }

    private void OnEmptySourceToggled(object sender, RoutedEventArgs e)
    {
        _simulateEmptySource = EmptySourceToggle.IsChecked == true;
        ApplyProjection();
    }

    private void OnFitColumnsClick(object sender, RoutedEventArgs e) => Table.AutoFitVisibleColumns();

    // ------------------------------------------------------------- the event log

    private void OnClearEventsClick(object sender, RoutedEventArgs e) => Events.Clear();

    private void Log(string line)
    {
        Events.Insert(0, $"{DateTime.Now:HH:mm:ss}  {line}");

        while (Events.Count > 200)
        {
            Events.RemoveAt(Events.Count - 1);
        }
    }

    private void OnSelectionStateChanged(object? sender, TableSelectionStateChangedEventArgs e)
    {
        string current = e.CurrentItem is TorrentRowViewModel row ? row.Name : "none";
        Log($"SelectionStateChanged — {e.SelectedItems.Count} selected, current {current}");
    }

    private void OnLayoutChanged(object? sender, TableLayoutChangedEventArgs e)
    {
        Log($"LayoutChanged {e.Kind}{LayoutDetail(e)}");
        _layout = e.LayoutState;

        if (e.Kind == TableLayoutChangeKind.Sort)
        {
            ReportSortLatency();
        }
    }

    /// <summary>
    /// How long the table took to answer a click on a sort header, from the press itself rather
    /// than from anywhere inside the control.
    /// </summary>
    /// <remarks>
    /// Two numbers, because they answer different complaints. The first is the reorder: the press
    /// until the table had put the rows in their new order, which is the part the reconcile
    /// changed. The second is the one the owner feels: the press until the UI thread took work
    /// again, measured by a callback queued at low priority, which runs only once the layout and
    /// the frame for that change are done. A big gap between the two is not the sort — it is
    /// preparing the cells of the rows on screen.
    /// </remarks>
    private void ReportSortLatency()
    {
        if (_pressedAt == 0)
        {
            return;
        }

        long pressed = _pressedAt;
        _pressedAt = 0;
        double reordered = Stopwatch.GetElapsedTime(pressed).TotalMilliseconds;

        DispatcherQueue.TryEnqueue(
            Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,
            () => Log($"  sort answered: {reordered:0} ms to reorder, " +
                      $"{Stopwatch.GetElapsedTime(pressed).TotalMilliseconds:0} ms until the table " +
                      "was free again"));
    }

    private void OnTablePressed(object sender, PointerRoutedEventArgs e) =>
        _pressedAt = Stopwatch.GetTimestamp();

    private string LayoutDetail(TableLayoutChangedEventArgs e) => e.Kind switch
    {
        TableLayoutChangeKind.ColumnMove => " — " + string.Join(", ", e.LayoutState.ColumnOrder),
        TableLayoutChangeKind.AutoFit or TableLayoutChangeKind.ColumnResize =>
            " — " + WidthDelta(e.LayoutState),
        _ => string.Empty,
    };

    /// <summary>
    /// Which widths this change moved, and by how much. A column with no override yet is compared
    /// against the width this page declared for it.
    /// </summary>
    private string WidthDelta(TableLayoutState now)
    {
        List<string> changed = new();
        foreach ((string id, double width) in now.ColumnWidths)
        {
            double before = _layout is not null && _layout.ColumnWidths.TryGetValue(id, out double previous)
                ? previous
                : DeclaredWidth(id);

            if (Math.Abs(before - width) >= 0.5)
            {
                changed.Add($"{id} {before:0} → {width:0}");
            }
        }

        return changed.Count == 0 ? "no width changed" : string.Join(", ", changed);
    }

    private double DeclaredWidth(string id)
    {
        foreach (TableColumn column in Table.Columns)
        {
            if (column.Id == id)
            {
                return column.DefaultWidth;
            }
        }

        return 0;
    }

    // ---------------------------------------------------------- the queue order

    /// <summary>
    /// Section 16: the table reports a legal placement and changes nothing itself. Applying it is
    /// the host's, because only the host knows that a visual boundary means a queue position.
    /// </summary>
    private void OnRowsReorderRequested(object? sender, TableRowsReorderRequestedEventArgs e)
    {
        List<TorrentRowViewModel> packet = Packet(e.MovingItems);
        TorrentRowViewModel? before = e.InsertBeforeItem as TorrentRowViewModel;

        Log($"RowsReorderRequested — {Describe(packet)} before " +
            (before is null ? "the end" : before.Name));

        ApplyQueueChange(_catalog?.MoveBefore(packet, before) == true, packet, "Drop");
    }

    /// <summary>
    /// Section 16 requires the same move as a keyboard-reachable command. These call the same queue
    /// as the drop, so the two cannot disagree about what a legal destination is.
    /// </summary>
    private void MoveInQueue(IReadOnlyList<TorrentRowViewModel> packet, QueueMove move, string label) =>
        ApplyQueueChange(_catalog?.Move(packet, move) == true, packet, label);

    private void ApplyQueueChange(bool changed, IReadOnlyList<TorrentRowViewModel> packet, string label)
    {
        if (!changed)
        {
            Log($"  {label} left the queue unchanged");
            return;
        }

        ApplyProjection();
        Log($"  {label} applied — {Describe(packet)} now at queue {packet[0].QueueText}");
    }

    private static List<TorrentRowViewModel> Packet(IReadOnlyList<object> items)
    {
        List<TorrentRowViewModel> rows = new(items.Count);
        foreach (object item in items)
        {
            if (item is TorrentRowViewModel row)
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static string Describe(IReadOnlyList<TorrentRowViewModel> packet) => packet.Count switch
    {
        0 => "nothing",
        1 => packet[0].Name,
        _ => $"{packet.Count} torrents",
    };

    // ---------------------------------------------------------- the row menu

    /// <summary>
    /// Section 15: the table has already applied its selection rule, so the packet in the event is
    /// the one the menu acts on.
    /// </summary>
    private void OnRowContextRequested(object? sender, TableRowContextRequestedEventArgs e)
    {
        List<TorrentRowViewModel> packet = Packet(e.SelectedItems);
        Log($"RowContextRequested — {Describe(packet)}");
        ShowRowMenu(packet, e.PlacementTarget, e.RelativePoint);
    }

    /// <summary>Build and show the torrent menu at the supplied placement target.</summary>
    private MenuFlyout ShowRowMenu(
        IReadOnlyList<TorrentRowViewModel> packet, FrameworkElement target, Point? position)
    {
        MenuFlyout flyout = BuildRowMenu(packet);

        if (position is Point p)
        {
            flyout.ShowAt(target, new FlyoutShowOptions { Position = p });
        }
        else
        {
            flyout.ShowAt(target);
        }

        return flyout;
    }

    /// <summary>
    /// The domain menu. Enablement comes from current torrent state and current queue order, which
    /// only the host knows. Every command acts on the whole selected packet.
    /// </summary>
    private MenuFlyout BuildRowMenu(IReadOnlyList<TorrentRowViewModel> packet)
    {
        MenuFlyout flyout = new();

        // The library's own icon family, so this menu and the one the table generates for a header
        // draw from one set. Synapse publishes the key from its Themes/Generic.xaml.
        FontFamily icons = TableView.IconFontFamily;

        void Add(string text, string glyph, bool enabled, Action invoke)
        {
            MenuFlyoutItem item = new()
            {
                Text = text,
                IsEnabled = enabled,
                Icon = new FontIcon { FontFamily = icons, Glyph = glyph, FontSize = 20 },
            };
            item.Click += (_, _) => invoke();
            flyout.Items.Add(item);
        }

        void AddMove(string text, string glyph, QueueMove move) => Add(
            text,
            glyph,
            _catalog is not null && _catalog.CanMove(packet, move),
            () => MoveInQueue(packet, move, text));

        bool anyRunning = false;
        bool anyStopped = false;
        foreach (TorrentRowViewModel row in packet)
        {
            anyRunning |= row.Status != TorrentStatus.Stopped;
            anyStopped |= row.Status == TorrentStatus.Stopped;
        }

        Add("Pause", Lucide.Pause, anyRunning, () => Log($"Pause — {Describe(packet)}"));
        Add("Resume", Lucide.Play, anyStopped, () => Log($"Resume — {Describe(packet)}"));
        Add("Force recheck", Lucide.RefreshCw, true, () => Log($"Force recheck — {Describe(packet)}"));

        flyout.Items.Add(new MenuFlyoutSeparator());

        AddMove("Move to top", Lucide.ArrowUpToLine, QueueMove.Top);
        AddMove("Move up", Lucide.ChevronUp, QueueMove.Up);
        AddMove("Move down", Lucide.ChevronDown, QueueMove.Down);
        AddMove("Move to bottom", Lucide.ArrowDownToLine, QueueMove.Bottom);

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Open folder", Lucide.FolderOpen, true, () => Log($"Open folder — {Describe(packet)}"));
        Add("Copy hash", Lucide.Copy, true, () => Log($"Copy hash — {Describe(packet)}"));
        Add("Copy magnet link", Lucide.Link, true, () => Log($"Copy magnet link — {Describe(packet)}"));

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Remove", Lucide.Trash2, true, () => Log($"Remove — {Describe(packet)}"));

        return flyout;
    }
}
