using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Synapse;
using TinyTorrent;
using Transmission;
using Windows.Foundation;

namespace TinyTorrent_Ui;

/// <summary>
/// The torrent host profile: the layer the specification keeps outside the component. It owns the
/// eleven columns, the cell templates, the domain filters, the text search, the row menu, and the
/// queue order a reorder request asks it to change. <see cref="TableView"/> supplies only table
/// mechanics, and <see cref="Session"/> supplies the rows.
/// </summary>
public sealed partial class TorrentPage : Page
{
    private static readonly IReadOnlyList<Torrent> NoRows = Array.Empty<Torrent>();

    /// <summary>
    /// How long a pause ends a word. Chosen, not derived, and said plainly because the alternative
    /// misleads: Windows publishes no metric for when a user has stopped typing, and the nearest
    /// candidate — the double-click time, which is about two mouse events forming one act — carries
    /// a 500 ms default that would leave the list half a second behind the word. This is short
    /// enough that the result reads as following the typing and long enough to swallow a burst.
    /// </summary>
    private static readonly TimeSpan SearchSettleInterval = TimeSpan.FromMilliseconds(200);

    private Session? _session;
    private DispatcherQueueTimer? _searchDue;

    /// <summary>Set while the page is out of the tree, so a queued tick does not rebuild into it.</summary>
    private bool _detached;
    private string _stateFilter = "all";
    private string _searchText = string.Empty;

    /// <summary>
    /// Which kinds of change make the projection itself different, and which only make its order
    /// different. Recomputed when the filter or the sort changes, never per tick.
    /// </summary>
    private TorrentFields _projectionFields = TorrentFields.Membership | TorrentFields.Queue;
    private TorrentFields _sortFields = TorrentFields.None;

    /// <summary>How many rows the last projection published, for the status line.</summary>
    private int _shown;

    public TorrentPage()
    {
        InitializeComponent();

        // The row type, stated once. A row the daemon is still being asked to remove renders
        // nothing and cannot be selected, invoked, given a menu, or joined to a reorder packet.
        // Each column is named by the field the XAML compiler generates for its x:Name, so
        // renaming a column here is a build break rather than a lookup that stops matching.
        Table.Schema<Torrent>()
            .Key(row => row.Hash)
            .CanInteract(row => row.IsPresent)
            .Sort(NameColumn, row => row.NameOrder)
            .Sort(ProgressColumn, row => row.Progress)
            .Sort(StatusColumn, row => (int)row.Activity)
            .Sort(QueueColumn, row => row.QueuePosition)
            .Sort(EtaColumn, row => row.Eta?.TotalSeconds ?? double.MaxValue)
            .Sort(SpeedColumn, row => row.ActiveSpeed)
            .Sort(PeersColumn, row => row.PeersConnected)
            .Sort(SizeColumn, row => row.TotalSize)
            .Sort(RatioColumn, row => row.Ratio)
            .Sort(AddedColumn, row => row.Added)
            .Sort(CompletedOnColumn, row => row.CompletedOn ?? DateTimeOffset.MaxValue);

        Loaded += OnLoaded;
        Unloaded += OnUnloaded;

        // The accent is a resource key the cell resolves, so a theme change alters what the key
        // names without changing the key. Nothing would ask for it again on its own.
        ActualThemeChanged += (_, _) => _session?.Torrents.InvalidateStatusAccents();
    }

    /// <summary>Every event the host received, newest first.</summary>
    public ObservableCollection<string> Events { get; } = new();

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;

        Table.Placeholder = TablePlaceholder.Loading;
        Table.ItemsSource = NoRows;

        if (Engine.Address() is not Uri address)
        {
            Table.Placeholder = TablePlaceholder.Empty;
            StatusLine.Text = "No engine port. Open TinyTorrent from the tray icon.";
            Log("No engine port on the command line and none in HKCU\\Software\\TinyTorrent.");
            return;
        }

        _session = new Session(address);
        _session.StateChanged += OnSessionStateChanged;
        _session.Changed += OnSessionChanged;
        _session.Failed += (_, message) => Log("Command failed — " + message);

        // Closing the window does not always unload its content first, so the session is stopped
        // from both signals. Whichever arrives first stops it, and stopping a stopped one does
        // nothing.
        if (MainWindow.Instance is Window window)
        {
            window.Closed += (_, _) => _session?.Dispose();
        }

        _session.Connect();
    }

    /// <summary>
    /// Stop this page's timers and its poll with the page. They belong to the dispatcher, not to
    /// this page, so nothing else stops them: they go on firing into a tree that is being taken
    /// apart, and a tick that lands mid-teardown throws from whichever object has gone already.
    /// </summary>
    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        Unloaded -= OnUnloaded;
        _detached = true;
        _session?.Dispose();
        _searchDue?.Stop();
    }

    // ---------------------------------------------------------- the session

    /// <summary>
    /// Three outcomes, one branch. A change that alters what the projection holds or what order it
    /// is in republishes it; a change that only alters the active sort's input asks the table to
    /// re-sort once; anything else is already on screen, because the cells redraw themselves.
    /// </summary>
    private void OnSessionChanged(object? sender, TorrentFields fields)
    {
        if (_detached)
        {
            return;
        }

        if ((fields & _projectionFields) != 0)
        {
            ApplyProjection();
        }
        else if ((fields & _sortFields) != 0)
        {
            Table.RefreshView();
        }

        ReportStatus();
    }

    private void OnSessionStateChanged(object? sender, SessionState state)
    {
        if (_detached)
        {
            return;
        }

        Log("Session — " + Describe(state));

        // Live stays on the loading presentation: the cache is empty until the first sweep lands,
        // and projecting an empty cache would show "no torrents yet" for one round trip.
        if (state is SessionState.Connecting or SessionState.Retrying or SessionState.Live)
        {
            Table.Placeholder = TablePlaceholder.Loading;
        }

        ReportStatus();
    }

    private static string Describe(SessionState state) => state switch
    {
        SessionState.Idle => "not connected",
        SessionState.Connecting connecting => $"connecting to {connecting.Address}",
        SessionState.Live live => $"live on {live.Address}",
        SessionState.Retrying retrying => $"retrying — {retrying.Reason}",
        SessionState.Blocked blocked => $"{blocked.Fault} — {blocked.Reason}",
        _ => state.ToString(),
    };

    /// <summary>
    /// A report that cannot be delivered is dropped. Closing the window does not always unload
    /// this page first, so the status line can be one of the objects that has already gone, and
    /// its setter then throws E_UNEXPECTED into a dispatcher continuation with no managed stack.
    /// </summary>
    private void ReportStatus()
    {
        try
        {
            StatusLine.Text = Summary();
        }
        catch (COMException)
        {
        }
    }

    private string Summary()
    {
        if (_session is null)
        {
            return "No engine port.";
        }

        if (_session.State is SessionState.Blocked blocked)
        {
            return blocked.Reason;
        }

        if (_session.State is not SessionState.Live)
        {
            return Describe(_session.State);
        }

        SessionStatistics? stats = _session.Stats;
        TorrentFormat format = _session.Torrents.Format;
        string rates = stats is null
            ? string.Empty
            : $" — ↓ {format.Rate(stats.DownloadSpeed)} ↑ {format.Rate(stats.UploadSpeed)}";

        return $"{_shown} of {_session.Torrents.Count} torrents shown" +
               $" — filter {_stateFilter}" +
               (_searchText.Length == 0 ? string.Empty : $", search \"{_searchText}\"") +
               rates;
    }

    // ------------------------------------------------------- host projection

    /// <summary>
    /// The host's own pipeline: the daemon's queue order, then the state filter, then the text
    /// filter. Only the finished projection reaches the table, which never filters.
    /// </summary>
    private void ApplyProjection()
    {
        IReadOnlyList<Torrent> source = _session is null ? NoRows : _session.Torrents.Rows;

        List<Torrent> projected = new(source.Count);
        foreach (Torrent row in source)
        {
            if (row.IsPresent && MatchesState(row) && MatchesText(row))
            {
                projected.Add(row);
            }
        }

        // Empty means the daemon has nothing; NoResults means a host filter excluded everything.
        Table.Placeholder = source.Count == 0 ? TablePlaceholder.Empty : TablePlaceholder.NoResults;
        Table.ItemsSource = projected;

        _shown = projected.Count;
    }

    /// <summary>A checking row belongs to both directions.</summary>
    private bool MatchesState(Torrent row) => _stateFilter switch
    {
        "downloading" => row.IsDownloading,
        "seeding" => row.IsSeeding,
        _ => true,
    };

    /// <summary>Text search is deliberately the host's. It matches the name.</summary>
    /// <remarks>
    /// Ordinal. This asks whether a file name contains what was typed, which is not an order the
    /// user reads, and a pass runs one substring search per row for which culture-aware matching
    /// ran ICU collation. The visible difference is that a search no longer folds an accent or the
    /// Turkish dotless i onto its plain letter.
    /// </remarks>
    private bool MatchesText(Torrent row) =>
        _searchText.Length == 0 || row.Name.Contains(_searchText, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Which changes force which response. Membership and the queue order always change the
    /// projection; the two filters only make their own inputs matter when they are switched on,
    /// which is why this is recomputed here rather than assumed.
    /// </summary>
    private void RecomputeProjectionFields()
    {
        _projectionFields = TorrentFields.Membership | TorrentFields.Queue;

        if (_stateFilter != "all")
        {
            _projectionFields |= TorrentFields.Activity;
        }

        if (_searchText.Length > 0)
        {
            _projectionFields |= TorrentFields.Name;
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

        RecomputeProjectionFields();
        ApplyProjection();
        ReportStatus();
    }

    /// <summary>
    /// A keystroke starts the pause; it does not re-project. Narrowing the list to a handful costs
    /// the table one collection notification per row that leaves, and running that from the
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
            _searchDue.Interval = SearchSettleInterval;
            _searchDue.Tick += (_, _) =>
            {
                // Stopping the timer does not recall a tick the dispatcher has already picked up,
                // and a page being taken apart is exactly where that lands.
                if (_detached)
                {
                    return;
                }

                _searchText = SearchBox.Text.Trim();
                RecomputeProjectionFields();
                ApplyProjection();
                ReportStatus();
            };
        }

        _searchDue.Stop();
        _searchDue.Start();
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
        string current = e.Selection.Current is Torrent row ? row.Name : "none";
        Log($"SelectionStateChanged — {e.Selection.Items.Count} selected, current {current}");
    }

    /// <summary>
    /// Which fields the active sort reads. A speed tick under a name sort then costs nothing at
    /// all, and a speed tick under a speed sort costs one re-sort, which is what was asked for.
    /// </summary>
    private void OnLayoutChanged(object? sender, TableLayoutChangeKind kind)
    {
        if (kind != TableLayoutChangeKind.Sort)
        {
            return;
        }

        TableColumn? column = Table.Sort?.Column;

        _sortFields =
            column == NameColumn ? TorrentFields.Name
            : column == ProgressColumn ? TorrentFields.Progress
            : column == StatusColumn ? TorrentFields.Activity
            : column == EtaColumn ? TorrentFields.Eta
            : column == SpeedColumn ? TorrentFields.Speed
            : column == PeersColumn ? TorrentFields.Peers
            : column == SizeColumn ? TorrentFields.Size
            : column == RatioColumn ? TorrentFields.Ratio
            : column == AddedColumn ? TorrentFields.Added
            : column == CompletedOnColumn ? TorrentFields.CompletedOn
            : TorrentFields.None;
    }

    // ---------------------------------------------------------- the queue order

    /// <summary>
    /// Section 16: the table reports a legal placement and changes nothing itself. Applying it is
    /// the host's, because only the host knows that a visual boundary means a queue position.
    /// </summary>
    private void OnRowsReorderRequested(object? sender, TableRowsReorderRequestedEventArgs e)
    {
        List<Torrent> packet = Packet(e.MovingItems);
        Torrent? before = e.InsertBeforeItem as Torrent;

        Log($"Drop — {Describe(packet)} before " + (before is null ? "the end" : before.Name));

        if (_session is { } session)
        {
            Run(session.Reorder(packet, before));
        }
    }

    private void MoveInQueue(IReadOnlyList<Torrent> packet, QueueMove move, string label)
    {
        Log($"{label} — {Describe(packet)}");

        if (_session is { } session)
        {
            Run(session.Reorder(packet, move));
        }
    }

    private static List<Torrent> Packet(IReadOnlyList<object> items)
    {
        List<Torrent> rows = new(items.Count);
        foreach (object item in items)
        {
            if (item is Torrent row)
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static string Describe(IReadOnlyList<Torrent> packet) => packet.Count switch
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
        List<Torrent> packet = Packet(e.SelectedItems);
        ShowRowMenu(packet, e.PlacementTarget, e.RelativePoint);
    }

    private void ShowRowMenu(IReadOnlyList<Torrent> packet, FrameworkElement target, Point? position)
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
    }

    /// <summary>
    /// The domain menu. Enablement comes from current torrent state and current queue order, which
    /// only the host knows. Every command acts on the whole selected packet.
    /// </summary>
    private MenuFlyout BuildRowMenu(IReadOnlyList<Torrent> packet)
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
            _session?.CanReorder(packet, move) == true,
            () => MoveInQueue(packet, move, text));

        bool anyRunning = false;
        bool anyStopped = false;
        foreach (Torrent row in packet)
        {
            anyRunning |= row.Status != TorrentStatus.Stopped;
            anyStopped |= row.Status == TorrentStatus.Stopped;
        }

        Session? session = _session;
        bool live = session?.State is SessionState.Live;

        Add("Pause", Lucide.Pause, live && anyRunning, () => Run(session!.Stop(packet)));
        Add("Resume", Lucide.Play, live && anyStopped, () => Run(session!.Start(packet)));
        Add("Force start", Lucide.FastForward, live && anyStopped, () => Run(session!.StartNow(packet)));
        Add("Force recheck", Lucide.RefreshCw, live, () => Run(session!.Verify(packet)));

        flyout.Items.Add(new MenuFlyoutSeparator());

        AddMove("Move to top", Lucide.ArrowUpToLine, QueueMove.Top);
        AddMove("Move up", Lucide.ChevronUp, QueueMove.Up);
        AddMove("Move down", Lucide.ChevronDown, QueueMove.Down);
        AddMove("Move to bottom", Lucide.ArrowDownToLine, QueueMove.Bottom);

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Open folder", Lucide.FolderOpen, packet.Count == 1, () => OpenFolder(packet[0]));
        Add("Copy hash", Lucide.Copy, packet.Count == 1, () => Copy(packet[0].Hash));
        Add("Copy magnet link", Lucide.Link, packet.Count == 1, () => Copy(packet[0].MagnetLink));

        flyout.Items.Add(new MenuFlyoutSeparator());

        Add("Remove", Lucide.Trash2, live, () => Run(session!.Remove(packet, deleteData: false)));
        Add("Remove and delete data", Lucide.Trash2, live, () => Run(session!.Remove(packet, deleteData: true)));

        return flyout;
    }

    /// <summary>
    /// A menu click cannot await. The command reports its own failure through the session, so the
    /// only thing left to do here is make sure a throw does not reach a dispatcher continuation,
    /// where it would tear the process down with no managed stack.
    /// </summary>
    private async void Run(Task command)
    {
        try
        {
            await command;
        }
        catch (Exception error)
        {
            Log("Command failed — " + error.Message);
        }
    }

    private void OpenFolder(Torrent row)
    {
        try
        {
            using Process? explorer = Process.Start(new ProcessStartInfo(row.DownloadDir)
            {
                UseShellExecute = true,
            });
        }
        catch (Exception error)
        {
            Log("Could not open " + row.DownloadDir + " — " + error.Message);
        }
    }

    private static void Copy(string text)
    {
        Windows.ApplicationModel.DataTransfer.DataPackage package = new();
        package.SetText(text);
        Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
    }
}
