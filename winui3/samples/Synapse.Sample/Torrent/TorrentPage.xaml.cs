using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
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

    /// <summary>Present only while an agent measures the page. A packaged launch inherits no
    /// environment variables, so the switch is a file.</summary>
    private const string DiagnosticsFlagPath =
        "C:/SynoSoftware/TinyTorrent/winui3/torrent-diag.flag";

    private static readonly IReadOnlyList<TorrentRowViewModel> NoRows = Array.Empty<TorrentRowViewModel>();

    private TorrentCatalog? _catalog;
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

        Loaded += OnLoaded;
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

        Table.IsLoading = false;
        ApplyProjection();
        _catalog.Start();

        if (!File.Exists(DiagnosticsFlagPath))
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

    // ------------------------------------------------------- host projection

    /// <summary>
    /// The host's own pipeline: semantic queue order, then the state filter, then the text filter.
    /// Only the finished projection reaches the table, which never filters.
    /// </summary>
    private void ApplyProjection()
    {
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
    private bool MatchesText(TorrentRowViewModel row)
    {
        if (_searchText.Length == 0)
        {
            return true;
        }

        return row.Name.Contains(_searchText, StringComparison.CurrentCultureIgnoreCase)
            || (row.GhostLabel?.Contains(_searchText, StringComparison.CurrentCultureIgnoreCase) ?? false);
    }

    /// <summary>
    /// A tick that changed filter membership or order re-publishes the projection once. Speed and
    /// progress changes never come through here: they only redraw the cells.
    /// </summary>
    private void OnViewAffectingChange(object? sender, EventArgs e) => ApplyProjection();

    private void OnTickFailed(object? sender, Exception error)
    {
        StatusLine.Text = "The update tick stopped: " + error.Message;
        W("*** TICK THREW: " + error);
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

    private void OnSearchTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
        {
            return;
        }

        _searchText = sender.Text.Trim();
        ApplyProjection();
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
    }

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

        void Add(string text, string glyph, bool enabled, Action invoke)
        {
            MenuFlyoutItem item = new()
            {
                Text = text,
                IsEnabled = enabled,
                Icon = new FontIcon { Glyph = glyph },
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

        Add("Pause", "\uE769", anyRunning, () => Log($"Pause — {Describe(packet)}"));
        Add("Resume", "\uE768", anyStopped, () => Log($"Resume — {Describe(packet)}"));
        Add("Force recheck", "\uE895", true, () => Log($"Force recheck — {Describe(packet)}"));

        flyout.Items.Add(new MenuFlyoutSeparator());

        AddMove("Move to top", "\uE74A", QueueMove.Top);
        AddMove("Move up", "\uE70E", QueueMove.Up);
        AddMove("Move down", "\uE70D", QueueMove.Down);
        AddMove("Move to bottom", "\uE74B", QueueMove.Bottom);

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Open folder", "\uE838", true, () => Log($"Open folder — {Describe(packet)}"));
        Add("Copy hash", "\uE8C8", true, () => Log($"Copy hash — {Describe(packet)}"));
        Add("Copy magnet link", "\uE71B", true, () => Log($"Copy magnet link — {Describe(packet)}"));

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Remove", "\uE74D", true, () => Log($"Remove — {Describe(packet)}"));

        return flyout;
    }
}
