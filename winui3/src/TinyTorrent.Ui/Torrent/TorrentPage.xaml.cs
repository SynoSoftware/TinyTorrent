using System.Diagnostics;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Synapse;
using TinyTorrent;
using Transmission;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;

namespace TinyTorrent_Ui;

public sealed partial class TorrentPage : Page
{
    private static readonly IReadOnlyList<Torrent> NoRows = Array.Empty<Torrent>();
    private static readonly TimeSpan SearchSettleInterval = TimeSpan.FromMilliseconds(200);

    private sealed record Addition(string Source, ConnectionProfile? Profile)
    {
        internal bool AwaitingDraft { get; set; }
    }

    private Session? _session;
    private CancellationTokenSource? _connection;
    private DispatcherQueueTimer? _searchDue;
    private bool _detached = true;
    private bool _dialogOpen;
    private object? _connectionRequest;
    private bool _altSpeedChanging;
    private double? _inspectorHeight;
    private TableSelection _acceptedSelection = TableSelection.Empty;
    private TableSelection? _selectionRequest;
    private (double Minimum, double Row) _tableMetrics;
    private string? _revealHash;
    private readonly Queue<Addition> _adds = new();
    private string _stateFilter = "all";
    private string _searchText = string.Empty;
    private TorrentFields _projectionFields = TorrentFields.Membership | TorrentFields.Queue;
    private TorrentFields _sortFields;
    private int _shown;

    internal MainWindow? Window { get; set; }

    internal double InitialWidth => Table.Columns.Where(column => column.IsVisible).Sum(column => column.Width) +
        Shell.Padding.Left + Shell.Padding.Right;

    public TorrentPage()
    {
        InitializeComponent();
        Inspector.ShowDialog = ShowDialog;
        Inspector.DraftResolved += (_, _) => DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, ShowNextAdd);
        Inspector.CloseRequested += OnDetailsClose;
        Inspector.OpenFolder = OpenFolder;
        Inspector.OpenPath = OpenPath;
        Inspector.CopyText = Copy;
        Inspector.ChangeLocation = () =>
        {
            if (Inspector.BoundTorrent is Torrent row && _session is Session session)
            {
                ChangeLocation(session, [row], (Connections.SelectedItem as ConnectionProfile)?.Id);
            }
        };
        InspectorDivider.SetHeight = SetRequestedHeight;
        KeyDown += OnShellKeyDown;
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
        AddButton.Icon = Icons.Create(Lucide.Plus);
        StartButton.Icon = Icons.Create(Lucide.Play);
        PauseButton.Icon = Icons.Create(Lucide.Pause);
        RemoveButton.Icon = Icons.Create(Lucide.Trash2);
        DetailsButton.Icon = Icons.Create(Lucide.PanelBottom);
        FitButton.Icon = Icons.Create(Lucide.Columns3);
        PreferencesButton.Icon = Icons.Create(Lucide.Settings);
        AppearanceButton.Icon = Icons.Create(Lucide.Sun);
        Icons.Set(ConnectionsButton, Lucide.Plug);
        Icons.Set(RetryButton, Lucide.RefreshCw);
        Icons.Set(DetailsBack, Lucide.ArrowLeft);
        Icons.Set(EmptyAddButton, Lucide.Plus);
        Icons.Set(AltSpeedButton, Lucide.Gauge);
        Icons.Set(FilterButton, Lucide.ListFilter);
        Icons.Set(ResetButton, Lucide.RotateCcw);
        LabelsMenu.Icon = Icons.Create(Lucide.Tags);
        RadioMenuFlyoutItem.SetAreCheckStatesEnabled(LabelsMenu, true);
        foreach (RadioMenuFlyoutItem item in Filters.Items.OfType<RadioMenuFlyoutItem>())
        {
            item.Icon = Icons.Create(item.Tag switch
            {
                "downloading" => Lucide.Download,
                "seeding" => Lucide.Upload,
                "paused" => Lucide.Pause,
                "error" => Lucide.TriangleAlert,
                _ => Lucide.ListFilter
            });
        }
        if (AppearanceButton.Flyout is MenuFlyout appearance)
        {
            foreach (MenuFlyoutItem item in appearance.Items.OfType<MenuFlyoutItem>())
            {
                item.Icon = Icons.Create(item.Tag as string == "Dark" ? Lucide.Moon : Lucide.Sun);
            }
        }
        Loaded += OnLoaded;
        Unloaded += (_, _) => Close();
        ActualThemeChanged += (_, _) => _session?.Torrents.InvalidateStatusAccents();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        _detached = false;
        if (Window?.Settings.Layout is TableLayout layout)
        {
            Table.Layout = layout;
        }
        DetailsButton.IsChecked = Window?.Settings.InspectorVisible ?? true;
        _inspectorHeight = Window?.Settings.InspectorHeight is double height && double.IsFinite(height) && height > 0
            ? height : null;
        if (Window is not null && Enum.IsDefined(Window.Settings.InspectorTab))
        {
            Inspector.SelectedTab = Window.Settings.InspectorTab;
        }
        ReloadConnections();
        if (_adds.Count > 0)
        {
            _detached = true;
            Connections.SelectedIndex = 0;
            _detached = false;
        }
        ConnectSelected();
    }

    internal void Close()
    {
        if (_detached)
        {
            return;
        }
        _detached = true;
        if (Window is not null)
        {
            Window.Settings.Layout = Table.Layout;
            Window.Settings.InspectorVisible = DetailsButton.IsChecked == true;
            Window.Settings.InspectorTab = Inspector.SelectedTab;
            Window.Settings.InspectorHeight = _inspectorHeight;
        }
        _connection?.Cancel();
        _connection?.Dispose();
        _connection = null;
        _searchDue?.Stop();
        DetachSession();
    }

    private void ReloadConnections(ConnectionProfile? selected = null)
    {
        bool wasDetached = _detached;
        _detached = true;
        for (int i = Connections.Items.Count - 1; i >= 0; i--)
        {
            Connections.Items.RemoveAt(i);
        }
        Connections.Items.Add("This computer");
        object chosen = Connections.Items[0];
        string? failure = null;
        try
        {
            string? id = selected?.Id ?? ConnectionProfiles.SelectedId;
            foreach (ConnectionProfile profile in ConnectionProfiles.Load())
            {
                Connections.Items.Add(profile);
                if (profile.Id == id)
                {
                    chosen = profile;
                }
            }
        }
        catch (Exception error)
        {
            failure = error.Message;
        }
        Connections.SelectedItem = chosen;
        _detached = wasDetached;
        if (failure is not null)
        {
            ShowFailure(failure);
        }
    }

    private async void OnConnectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_detached)
        {
            return;
        }
        object? requested = Connections.SelectedItem;
        object? previous = e.RemovedItems.FirstOrDefault();
        _detached = true;
        Connections.SelectedItem = previous;
        _detached = false;
        if (_connectionRequest is not null || requested is null)
        {
            return;
        }
        _connectionRequest = requested;
        UpdateCommands();
        try
        {
            DraftResolution resolution = await Inspector.ResolveDraft();
            if (resolution != DraftResolution.Accepted)
            {
                if (_adds.TryPeek(out var pending) && pending.Profile?.Id == (requested as ConnectionProfile)?.Id)
                {
                    if (resolution == DraftResolution.Canceled)
                        _adds.Dequeue();
                    else
                        pending.AwaitingDraft = true;
                }
                return;
            }
            if (_detached || Window is null || Window.IsClosing)
            {
                return;
            }
            _detached = true;
            Connections.SelectedItem = requested;
            _detached = false;
            ConnectSelected();
        }
        finally
        {
            _connectionRequest = null;
            if (!_detached)
            {
                UpdateCommands();
                ShowNextAdd();
            }
        }
    }

    private async void ConnectSelected()
    {
        _connection?.Cancel();
        _connection?.Dispose();
        CancellationTokenSource connection = new();
        _connection = connection;
        _revealHash = null;
        DetachSession();
        Table.ItemsSource = NoRows;
        Table.Placeholder = TablePlaceholder.Loading;
        AltSpeedButton.IsChecked = null;
        SpaceText.Text = "Free space unavailable";
        LoadingText.Text = "Connecting to " + Connections.SelectedItem;
        ConnectionNotice.IsOpen = false;
        ToolTipService.SetToolTip(RetryButton, null);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetHelpText(RetryButton, string.Empty);
        UpdateCommands();

        try
        {
            ConnectionProfile? profile = Connections.SelectedItem as ConnectionProfile;
            try
            {
                ConnectionProfiles.SelectedId = profile?.Id;
            }
            catch (Exception error)
            {
                ShowFailure("The selected connection could not be saved. " + error.Message);
            }
            Uri address = profile?.Endpoint ?? await Engine.EnsureAddress(connection.Token);
            if (_detached || connection.IsCancellationRequested)
            {
                return;
            }
            _session = new Session(address, profile is null ? null : ConnectionProfiles.ResolveCredentials(profile));
            _session.StateChanged += OnSessionStateChanged;
            _session.Changed += OnSessionChanged;
            _session.Failed += OnCommandFailed;
            _session.Connect();
        }
        catch (OperationCanceledException) when (connection.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            if (!_detached && ReferenceEquals(_connection, connection))
            {
                ConnectionNotice.Title = "Cannot connect";
                ConnectionNotice.Message = error.Message;
                if (Connections.SelectedItem is not ConnectionProfile)
                {
                    string help = error is FileNotFoundException
                        ? "Reinstall TinyTorrent to restore its local engine."
                        : "Check the TinyTorrent log folder before retrying.";
                    ToolTipService.SetToolTip(RetryButton, help);
                    Microsoft.UI.Xaml.Automation.AutomationProperties.SetHelpText(RetryButton, help);
                }
                ConnectionNotice.Severity = InfoBarSeverity.Error;
                ConnectionNotice.IsOpen = true;
                EmptyHeadline.Text = "Connection unavailable";
                Table.Placeholder = TablePlaceholder.Empty;
                StatusLine.Text = error.Message;
                UpdateCommands();
            }
        }
    }

    private void DetachSession()
    {
        Inspector.Bind(null, null);
        Inspector.Visibility = Visibility.Collapsed;
        InspectorDivider.Visibility = Visibility.Collapsed;
        InspectorRow.Height = GridLength.Auto;
        if (_session is not Session session)
        {
            return;
        }
        _session = null;
        session.StateChanged -= OnSessionStateChanged;
        session.Changed -= OnSessionChanged;
        session.Failed -= OnCommandFailed;
        session.Dispose();
    }

    private void OnSessionChanged(object? sender, TorrentFields fields)
    {
        if (_detached || sender is not Session session || !ReferenceEquals(session, _session))
        {
            return;
        }
        if ((fields & (TorrentFields.Membership | TorrentFields.Labels)) != 0 &&
            NormalizeFilter(_stateFilter) != _stateFilter)
        {
            SetFilter("all");
        }
        else if ((fields & _projectionFields) != 0 || Table.Placeholder == TablePlaceholder.Loading)
        {
            ApplyProjection();
        }
        else if ((fields & _sortFields) != 0)
        {
            Table.RefreshView();
        }
        UpdateCommands();
        ReportStatus();
        if (!_altSpeedChanging)
        {
            AltSpeedButton.IsChecked = session.AltSpeedEnabled;
        }
        SpaceText.Text = session.Space is DiskSpace space
            ? session.Torrents.Format.Size(space.SizeBytes) + " free" : "Free space unavailable";
        SpaceTooltip.Content = session.SpaceError ?? session.DownloadDir;
        RevealAddedTorrent();
        ShowNextAdd();
    }

    private void OnSessionStateChanged(object? sender, SessionState state)
    {
        if (_detached || !ReferenceEquals(sender, _session))
        {
            return;
        }
        ConnectionNotice.IsOpen = state is SessionState.Retrying or SessionState.Blocked;
        ConnectionNotice.Severity = state is SessionState.Blocked ? InfoBarSeverity.Error : InfoBarSeverity.Warning;
        ConnectionNotice.Title = state is SessionState.Blocked ? "Connection needs attention" : "Connection interrupted";
        ConnectionNotice.Message = state switch
        {
            SessionState.Retrying retrying => retrying.Reason + " Retrying automatically; displayed rows may be out of date.",
            SessionState.Blocked blocked => blocked.Reason,
            _ => string.Empty,
        };
        if (state is SessionState.Connecting && _session?.Torrents.Count == 0)
        {
            Table.Placeholder = TablePlaceholder.Loading;
        }
        else if (state is SessionState.Blocked && _session?.Torrents.Count == 0)
        {
            EmptyHeadline.Text = "Connection unavailable";
            Table.Placeholder = TablePlaceholder.Empty;
        }
        UpdateCommands();
        ReportStatus();
    }

    private void OnCommandFailed(object? sender, string message)
    {
        if (!_detached && ReferenceEquals(sender, _session))
        {
            ShowFailure(message);
        }
    }

    internal void ShowFailure(string message)
    {
        if (!_detached)
        {
            CommandNotice.Message = message;
            CommandNotice.IsOpen = true;
        }
    }

    private void ReportStatus()
    {
        if (_detached || _session is not Session session)
        {
            return;
        }
        string state = session.State switch
        {
            SessionState.Connecting => "Connecting",
            SessionState.Retrying => "Offline · retrying",
            SessionState.Blocked => "Connection blocked",
            SessionState.Live => "Connected",
            _ => "Disconnected",
        };
        string totals = $"{_shown} of {session.Torrents.Count} torrents";
        string rates = session.Stats is SessionStatistics stats
            ? $" · ↓ {session.Torrents.Format.Rate(stats.DownloadSpeed)} · ↑ {session.Torrents.Format.Rate(stats.UploadSpeed)}"
            : string.Empty;
        StatusLine.Text = $"{state} · {totals}" + rates;
    }

    private void ApplyProjection()
    {
        IReadOnlyList<Torrent> source = _session?.Torrents.Rows ?? NoRows;
        List<Torrent> projected = new(source.Count);
        foreach (Torrent row in source)
        {
            if (row.IsPresent && MatchesFilter(row, _stateFilter) && MatchesText(row))
            {
                projected.Add(row);
            }
        }
        EmptyHeadline.Text = "No torrents yet";
        Table.Placeholder = source.Count == 0 ? TablePlaceholder.Empty : TablePlaceholder.NoResults;
        Table.ItemsSource = projected;
        _shown = projected.Count;
    }

    private static bool MatchesFilter(Torrent row, string filter) => filter switch
    {
        "downloading" => row.IsDownloading,
        "seeding" => row.IsSeeding,
        "paused" => row.Status == TorrentStatus.Stopped,
        "error" => row.HasError,
        _ when filter.StartsWith("label:", StringComparison.Ordinal) => row.Labels.Contains(filter[6..]),
        _ => true,
    };

    private bool MatchesText(Torrent row) => _searchText.Length == 0 ||
        row.Name.Contains(_searchText, StringComparison.OrdinalIgnoreCase);

    private void RecomputeProjectionFields()
    {
        _projectionFields = TorrentFields.Membership | TorrentFields.Queue;
        if (_stateFilter is "downloading" or "seeding" or "paused")
        {
            _projectionFields |= TorrentFields.Activity;
        }
        else if (_stateFilter == "error")
        {
            _projectionFields |= TorrentFields.Error;
        }
        else if (_stateFilter.StartsWith("label:", StringComparison.Ordinal))
        {
            _projectionFields |= TorrentFields.Labels;
        }
        if (_searchText.Length > 0)
        {
            _projectionFields |= TorrentFields.Name;
        }
    }

    private void SetFilter(string filter)
    {
        _stateFilter = NormalizeFilter(filter);
        bool label = _stateFilter.StartsWith("label:", StringComparison.Ordinal);
        string text = label ? _stateFilter[6..]
            : Filters.Items.OfType<RadioMenuFlyoutItem>().First(item => (string)item.Tag == _stateFilter).Text;
        FilterButton.Content = _stateFilter == "all" ? "Filter" : text;
        string name = _stateFilter == "all" ? "Filter torrents" : "Filter: " + (label ? "Label: " : string.Empty) + text;
        AutomationProperties.SetName(FilterButton, name);
        ToolTipService.SetToolTip(FilterButton, name + " (Ctrl+Shift+F)");
        RecomputeProjectionFields();
        ApplyProjection();
        ReportStatus();
    }

    private string NormalizeFilter(string filter) =>
        filter.StartsWith("label:", StringComparison.Ordinal) &&
        !(_session?.Torrents.Rows ?? NoRows).Any(row => row.IsPresent && MatchesFilter(row, filter))
            ? "all" : filter;

    private void OnFilterClick(object sender, RoutedEventArgs args)
    {
        if (sender is not RadioMenuFlyoutItem { Tag: string filter }) return;
        Filters.Closed += Apply;

        async void Apply(object? source, object closed)
        {
            Filters.Closed -= Apply;
            if (_detached || _dialogOpen) return;
            filter = NormalizeFilter(filter);
            if (Inspector.BoundTorrent is Torrent row && (!MatchesFilter(row, filter) || !MatchesText(row)) &&
                await Inspector.ResolveDraft() != DraftResolution.Accepted) return;
            if (_detached) return;
            SetFilter(filter);
            FocusRows();
        }
    }

    private void OnFiltersOpening(object sender, object args)
    {
        foreach (RadioMenuFlyoutItem item in Filters.Items.OfType<RadioMenuFlyoutItem>())
            item.IsChecked = (string)item.Tag == _stateFilter;

        SortedSet<string> labels = new(StringComparer.Ordinal);
        foreach (Torrent row in _session?.Torrents.Rows ?? NoRows)
        {
            if (row.IsPresent)
            {
                foreach (string label in row.Labels)
                {
                    labels.Add(label);
                }
            }
        }
        foreach (string label in labels)
        {
            RadioMenuFlyoutItem item = new()
            {
                Text = label, Tag = "label:" + label, GroupName = "TorrentFilter",
                Icon = Icons.Create(Lucide.Tags), IsChecked = _stateFilter == "label:" + label
            };
            item.Click += OnFilterClick;
            LabelsMenu.Items.Add(item);
        }
        LabelsMenu.IsEnabled = labels.Count > 0;
    }

    private void OnFiltersClosed(object sender, object args)
    {
        for (int i = LabelsMenu.Items.Count - 1; i >= 0; i--) LabelsMenu.Items.RemoveAt(i);
    }

    private void OnSearchLayoutChanged(object sender, SizeChangedEventArgs args)
    {
        if (SearchTools is null || SearchFields is null || FilterButton is null || SearchBox is null) return;
        double width = SearchTools.ActualWidth;
        if (width <= 0) return;
        FilterButton.MaxWidth = Math.Min(SearchBox.MaxWidth, width);
        double filterWidth = FilterButton.ActualWidth;
        SearchFields.Width = Math.Min(width, SearchBox.MaxWidth + filterWidth + SearchFields.ColumnSpacing);
        bool stacked = width < SearchBox.MinWidth + filterWidth + SearchFields.ColumnSpacing;
        Grid.SetColumn(FilterButton, stacked ? 0 : 1);
        Grid.SetRow(FilterButton, stacked ? 1 : 0);
        SearchFields.RowSpacing = stacked ? SearchFields.ColumnSpacing : 0;
    }

    private void OnSearchTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (_detached || args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
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
                if (!_detached)
                {
                    _searchText = SearchBox.Text.Trim();
                    RecomputeProjectionFields();
                    ApplyProjection();
                    ReportStatus();
                }
            };
        }
        _searchDue.Stop();
        _searchDue.Start();
    }

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

    private List<Torrent> Selected() => Packet(Table.Selection.Items);

    private async void OnSelectionStateChanged(object? sender, TableSelectionStateChangedEventArgs e)
    {
        if (_selectionRequest is not null || _connectionRequest is not null)
        {
            Table.Selection = _acceptedSelection;
            return;
        }
        Torrent? target = DetailsButton.IsChecked == true && e.Selection.Items.Count == 1
            ? e.Selection.Items[0] as Torrent : null;
        if (!ReferenceEquals(target, Inspector.BoundTorrent))
        {
            TableSelection requested = e.Selection;
            _selectionRequest = requested;
            Table.Selection = _acceptedSelection;
            if (_dialogOpen || await Inspector.ResolveDraft() != DraftResolution.Accepted)
            {
                _selectionRequest = null;
                return;
            }
            _acceptedSelection = requested;
            Inspector.Bind(_session, DetailsButton.IsChecked == true ? target : null, requested.Items.Count);
            _selectionRequest = null;
            Table.Selection = requested;
        }
        else
        {
            _acceptedSelection = e.Selection;
        }
        UpdateCommands();
    }

    private void UpdateCommands()
    {
        IReadOnlyList<Torrent> selected = _selectionRequest is null ? Selected() : Packet(_acceptedSelection.Items);
        bool live = _session?.State is SessionState.Live && !_dialogOpen && _connectionRequest is null;
        AddButton.IsEnabled = live;
        EmptyAddButton.IsEnabled = live;
        EmptyAddButton.Visibility = _session?.State is SessionState.Blocked || _session is null
            ? Visibility.Collapsed : Visibility.Visible;
        StartButton.IsEnabled = live && selected.Any(row => row.Status == TorrentStatus.Stopped);
        PauseButton.IsEnabled = live && selected.Any(row => row.Status != TorrentStatus.Stopped);
        RemoveButton.IsEnabled = live && selected.Count > 0;
        PreferencesButton.IsEnabled = live;
        AltSpeedButton.IsEnabled = live && !_altSpeedChanging && _session?.AltSpeedEnabled is not null;
        Connections.IsEnabled = !_dialogOpen && _connectionRequest is null;
        SetInspectorHeight(DetailsButton.IsChecked == true);
        Inspector.Configure(Connections.SelectedItem is not ConnectionProfile, ConnectionName);
        Torrent? row = InspectorHost.Visibility == Visibility.Visible && selected.Count == 1 ? selected[0] : null;
        if (_selectionRequest is null && !Inspector.IsCommitting &&
            (!Inspector.HasDraft || ReferenceEquals(row, Inspector.BoundTorrent)))
        {
            Inspector.Bind(_session, row, selected.Count);
        }
    }

    private void OnFitColumnsClick(object sender, RoutedEventArgs e) => Table.AutoFitVisibleColumns();
    private async void OnDetailsClick(object sender, RoutedEventArgs e)
    {
        if (DetailsButton.IsChecked != true)
        {
            DetailsButton.IsChecked = true;
            if (await Inspector.ResolveDraft() == DraftResolution.Accepted)
            {
                DetailsButton.IsChecked = false;
            }
        }
        UpdateCommands();
        if (DetailsButton.IsChecked == true)
        {
            Inspector.FocusView();
        }
    }

    private async void OnDetailsClose(object? sender, EventArgs e)
    {
        if (await Inspector.ResolveDraft() == DraftResolution.Accepted)
        {
            DetailsButton.IsChecked = false;
            UpdateCommands();
            FocusRows();
        }
    }

    private void OnDetailsBack(object sender, RoutedEventArgs e) => OnDetailsClose(sender, EventArgs.Empty);

    private (double Available, double TableMinimum, double InspectorMinimum) PaneSizes()
    {
        double available = Math.Max(0, ContentArea.ActualHeight - InspectorDivider.Height);
        double header = VisualHeight(Table, element => element.Name == "PART_HeaderStrip");
        double row = VisualHeight(Table, element => element is ListViewItem);
        if (header > 0)
        {
            _tableMetrics = (header + Math.Max(header, row), row > 0 ? row : header);
        }
        double tableMinimum = _tableMetrics.Minimum;
        double inspectorMinimum = Inspector.MinimumHeight;
        if (Inspector.BoundTorrent is not null && Inspector.SelectedTab is InspectorTab.Files or InspectorTab.Peers or InspectorTab.Trackers)
        {
            inspectorMinimum += VisualHeight(Inspector, element => element.Name == "PART_HeaderStrip");
            double inspectorRow = VisualHeight(Inspector, element => element is TreeViewItem or ListViewItem);
            if (inspectorRow > 0)
            {
                inspectorMinimum += inspectorRow;
            }
            else if (FindElement(Inspector, element => element.Name == "PART_StateLayer") is { } state)
            {
                inspectorMinimum += VisualHeight(state, element => element is TextBlock or ProgressRing);
            }
        }
        return (available, tableMinimum, inspectorMinimum);
    }

    private void SetInspectorHeight(bool show)
    {
        var sizes = PaneSizes();
        bool split = sizes.Available >= sizes.TableMinimum + sizes.InspectorMinimum;
        InspectorHost.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
        Table.Visibility = show && !split ? Visibility.Collapsed : Visibility.Visible;
        DetailsBack.Visibility = show && !split ? Visibility.Visible : Visibility.Collapsed;
        InspectorDivider.Visibility = show && split ? Visibility.Visible : Visibility.Collapsed;
        Grid.SetRow(InspectorHost, split ? 2 : 0);
        InspectorRow.Height = show && split ? new GridLength(InspectorHeight()) : GridLength.Auto;
        double maximum = Math.Max(0, sizes.Available - sizes.TableMinimum);
        InspectorDivider.SetRange(Math.Min(sizes.InspectorMinimum, maximum), maximum, InspectorHeight(), _tableMetrics.Row);
    }

    private double InspectorHeight()
    {
        var sizes = PaneSizes();
        double maximum = Math.Max(0, sizes.Available - sizes.TableMinimum);
        return Math.Clamp(_inspectorHeight ?? sizes.Available * 0.4, Math.Min(sizes.InspectorMinimum, maximum), maximum);
    }

    internal static void FocusNavigation(NavigationView navigation)
    {
        FrameworkElement? selected = FindElement(navigation, element => ReferenceEquals(element, navigation.SelectedItem));
        if (selected is Control item && item.IsEnabled)
        {
            Windows.Foundation.Point origin = item.TransformToVisual(navigation).TransformPoint(new(0, 0));
            if (origin.X >= 0 && origin.Y >= 0 && origin.X + item.ActualWidth <= navigation.ActualWidth
                && origin.Y + item.ActualHeight <= navigation.ActualHeight && item.Focus(FocusState.Keyboard)) return;
        }
        if (FindElement(navigation, element => element.Name == "TopNavOverflowButton") is Control overflow && overflow.IsEnabled)
            overflow.Focus(FocusState.Keyboard);
    }
    internal static double VisualHeight(DependencyObject root, Func<FrameworkElement, bool> match)
        => FindElement(root, match)?.ActualHeight ?? 0;

    internal static FrameworkElement? FindElement(DependencyObject root, Func<FrameworkElement, bool> match)
    {
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is FrameworkElement { Visibility: Visibility.Collapsed }) continue;
            if (child is FrameworkElement element && match(element) && element.ActualHeight > 0)
            {
                return element;
            }
            FrameworkElement? found = FindElement(child, match);
            if (found is not null)
            {
                return found;
            }
        }
        return null;
    }

    internal static bool Within(DependencyObject? element, DependencyObject ancestor)
    {
        while (element is not null)
        {
            if (ReferenceEquals(element, ancestor))
            {
                return true;
            }
            element = VisualTreeHelper.GetParent(element);
        }
        return false;
    }

    internal static bool IsEditor(DependencyObject? element)
    {
        while (element is not null)
        {
            if (element is TextBox or RichEditBox or PasswordBox or NumberBox or AutoSuggestBox)
            {
                return true;
            }
            element = VisualTreeHelper.GetParent(element);
        }
        return false;
    }

    private void OnShellKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (_dialogOpen || _connectionRequest is not null || _detached || e.Handled || Dialogs.HasPopup(this))
        {
            return;
        }
        DependencyObject? focused = FocusManager.GetFocusedElement(XamlRoot) as DependencyObject;
        Windows.System.VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        bool control = modifiers == Windows.System.VirtualKeyModifiers.Control;
        bool alt = modifiers == Windows.System.VirtualKeyModifiers.Menu;
        bool plain = modifiers == Windows.System.VirtualKeyModifiers.None;
        bool editor = IsEditor(focused);
        if (plain && Within(focused, SearchBox) && e.Key is Windows.System.VirtualKey.Enter or Windows.System.VirtualKey.Escape)
        {
            _searchDue?.Stop();
            if (e.Key == Windows.System.VirtualKey.Escape)
            {
                SearchBox.Text = string.Empty;
            }
            _searchText = SearchBox.Text.Trim();
            RecomputeProjectionFields();
            ApplyProjection();
            ReportStatus();
            FocusRows();
        }
        else if (control && e.Key == Windows.System.VirtualKey.F)
        {
            SearchBox.Focus(FocusState.Keyboard);
        }
        else if (control && e.Key == Windows.System.VirtualKey.O)
        {
            OpenAdd(AddAction.Browse);
        }
        else if (control && e.Key == Windows.System.VirtualKey.V && !editor)
        {
            OpenAdd(AddAction.Paste);
        }
        // VK_OEM_COMMA is the Windows punctuation key used by Ctrl+,.
        else if (control && (int)e.Key == 0xBC)
        {
            OnPreferencesClick(this, new RoutedEventArgs());
        }
        else if (e.Key == Windows.System.VirtualKey.F && modifiers == (Windows.System.VirtualKeyModifiers.Control | Windows.System.VirtualKeyModifiers.Shift) ||
            alt && e.Key == Windows.System.VirtualKey.N && !Within(focused, InspectorHost))
        {
            FilterButton.Focus(FocusState.Keyboard);
            Filters.ShowAt(FilterButton);
        }
        else if (alt && e.Key == Windows.System.VirtualKey.Z && !Within(focused, InspectorHost) && InspectorDivider.Visibility == Visibility.Visible)
        {
            InspectorDivider.Focus(FocusState.Keyboard);
        }
        else if (alt && e.Key == Windows.System.VirtualKey.D && !Within(focused, InspectorHost))
        {
            DetailsButton.IsChecked = true;
            UpdateCommands();
            Inspector.FocusView();
        }
        else if (alt && e.Key == Windows.System.VirtualKey.Left && DetailsBack.Visibility == Visibility.Visible)
        {
            OnDetailsClose(this, EventArgs.Empty);
        }
        else if (e.Key == Windows.System.VirtualKey.F6 && modifiers is Windows.System.VirtualKeyModifiers.None or Windows.System.VirtualKeyModifiers.Shift)
        {
            CycleFocus(focused, modifiers == Windows.System.VirtualKeyModifiers.Shift);
        }
        else if (!editor && Within(focused, Table) && alt && e.Key == Windows.System.VirtualKey.S)
        {
            if (StartButton.IsEnabled)
            {
                OnStartClick(this, new RoutedEventArgs());
            }
        }
        else if (!editor && Within(focused, Table) && alt && e.Key == Windows.System.VirtualKey.P)
        {
            if (PauseButton.IsEnabled)
            {
                OnPauseClick(this, new RoutedEventArgs());
            }
        }
        else if (!editor && Within(focused, Table) && plain && e.Key == Windows.System.VirtualKey.Delete)
        {
            if (RemoveButton.IsEnabled)
            {
                OnRemoveClick(this, new RoutedEventArgs());
            }
        }
        else
        {
            return;
        }
        e.Handled = true;
    }

    private void CycleFocus(DependencyObject? focused, bool reverse)
    {
        int current = Within(focused, Table) ? 1 : Within(focused, InspectorHost) ? 2 : 0;
        for (int step = 1; step <= 3; step++)
        {
            int next = (current + (reverse ? -step : step) + 3) % 3;
            if (next == 0)
            {
                SearchBox.Focus(FocusState.Keyboard);
                return;
            }
            if (next == 1 && Table.Visibility == Visibility.Visible)
            {
                FocusRows();
                return;
            }
            if (next == 2 && InspectorHost.Visibility == Visibility.Visible)
            {
                Inspector.FocusView();
                return;
            }
        }
    }

    private void OnContentSizeChanged(object sender, SizeChangedEventArgs e)
    {
        SetInspectorHeight(DetailsButton.IsChecked == true);
    }

    private void OnInspectorSizeChanged(object sender, SizeChangedEventArgs e) => OnContentSizeChanged(sender, e);

    private void ResizeInspector(double change)
    {
        SetRequestedHeight(InspectorHeight() + change);
    }

    private void SetRequestedHeight(double height)
    {
        _inspectorHeight = height;
        _inspectorHeight = InspectorHeight();
        InspectorRow.Height = new GridLength(_inspectorHeight.Value);
        SetInspectorHeight(true);
    }

    private void OnInspectorDragDelta(object sender, DragDeltaEventArgs e) => ResizeInspector(-e.VerticalChange);

    private void OnInspectorKeyDown(object sender, Microsoft.UI.Xaml.Input.KeyRoutedEventArgs e)
    {
        if (e.Handled || Dialogs.Modifiers != Windows.System.VirtualKeyModifiers.None || Dialogs.HasPopup(this)) return;
        if (e.Key is Windows.System.VirtualKey.Home or Windows.System.VirtualKey.End)
        {
            SetRequestedHeight(e.Key == Windows.System.VirtualKey.Home ? InspectorDivider.Minimum : InspectorDivider.Maximum);
            e.Handled = true;
        }
        else if (e.Key is Windows.System.VirtualKey.Up or Windows.System.VirtualKey.Down)
        {
            double row = _tableMetrics.Row;
            ResizeInspector(e.Key == Windows.System.VirtualKey.Up ? row : -row);
            e.Handled = true;
        }
    }
    private void OnRetryClick(object sender, RoutedEventArgs e)
    {
        if (_session is Session session)
        {
            session.Retry();
        }
        else
        {
            ConnectSelected();
        }
    }

    private async void OnAltSpeedClick(object sender, RoutedEventArgs e)
    {
        if (_session is not { State: SessionState.Live } session)
        {
            return;
        }
        _altSpeedChanging = true;
        UpdateCommands();
        try
        {
            await session.Request(new SessionSet<Settings>(new Settings { AltSpeedEnabled = AltSpeedButton.IsChecked == true }));
        }
        catch (Exception error)
        {
            if (ReferenceEquals(_session, session))
            {
                AltSpeedButton.IsChecked = session.AltSpeedEnabled;
                ShowFailure(error.Message);
            }
        }
        finally
        {
            _altSpeedChanging = false;
            if (!_detached)
            {
                UpdateCommands();
            }
        }
    }
    private void OnStartClick(object sender, RoutedEventArgs e)
    {
        if (_session is Session session)
        {
            Run(session.Start(Selected()));
        }
    }
    private void OnPauseClick(object sender, RoutedEventArgs e)
    {
        if (_session is Session session)
        {
            Run(session.Stop(Selected()));
        }
    }
    private void OnRemoveClick(object sender, RoutedEventArgs e)
    {
        if (_session is Session session)
        {
            Run(ConfirmRemove(session, Selected(), false, (Connections.SelectedItem as ConnectionProfile)?.Id));
        }
    }
    private void OnAddClick(object sender, RoutedEventArgs e)
    {
        OpenAdd();
    }
    private string ConnectionName => (Connections.SelectedItem as ConnectionProfile)?.Name ?? "Local engine";

    private void OpenAdd(AddAction action = AddAction.None, string? source = null)
    {
        if (_session is not { State: SessionState.Live } session || Window is null)
        {
            return;
        }
        bool local = Connections.SelectedItem is not ConnectionProfile;
        string name = ConnectionName;
        _ = ShowDialog(async () =>
        {
            TorrentRef? added = await Dialogs.ShowAdd(session, XamlRoot, Window.Handle, local, name, source, action);
            if (added is not null && ReferenceEquals(session, _session))
            {
                _revealHash = added.HashString;
            }
        });
    }
    private void OnPreferencesClick(object sender, RoutedEventArgs e)
    {
        if (_session is { State: SessionState.Live } session && Window is not null)
        {
            bool local = Connections.SelectedItem is not ConnectionProfile;
            string name = ConnectionName;
            nint hwnd = Window.Handle;
            _ = ShowDialog(() => PreferencesDialog.Show(session, XamlRoot, hwnd, name, local));
        }
    }
    private async void OnConnectionsClick(object sender, RoutedEventArgs e)
    {
        if (_connectionRequest is not null)
        {
            return;
        }
        if (await Inspector.ResolveDraft() != DraftResolution.Accepted)
        {
            return;
        }
        await ShowDialog(async () =>
        {
            string? previous = (Connections.SelectedItem as ConnectionProfile)?.Id;
            ConnectionProfile? profile = await ConnectionProfiles.Show(XamlRoot);
            ReloadConnections(profile);
            if (profile is not null || (Connections.SelectedItem as ConnectionProfile)?.Id != previous)
            {
                ConnectSelected();
            }
        });
    }

    private void OnThemeClick(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem { Tag: string value } && Enum.TryParse(value, out ElementTheme theme) && Window is not null)
        {
            Window.SetTheme(theme);
        }
    }

    private async Task ShowDialog(Func<Task> show)
    {
        if (_dialogOpen || _detached)
        {
            return;
        }
        _dialogOpen = true;
        Control? invoker = FocusManager.GetFocusedElement(XamlRoot) as Control;
        UpdateCommands();
        try
        {
            await show();
        }
        catch (Exception error)
        {
            ShowFailure(error.Message);
        }
        finally
        {
            _dialogOpen = false;
            if (!_detached)
            {
                UpdateCommands();
                if (!RevealAddedTorrent() && !(invoker is { IsEnabled: true, Visibility: Visibility.Visible } &&
                    Within(invoker, this) && invoker.Focus(FocusState.Keyboard)))
                {
                    if (Table.Visibility == Visibility.Visible)
                    {
                        FocusRows();
                    }
                    else
                    {
                        Inspector.FocusView();
                    }
                }
                DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, ShowNextAdd);
            }
        }
    }

    internal void AddSource(string source, ConnectionProfile? profile = null)
    {
        _adds.Enqueue(new(source, profile));
        if (_detached)
        {
            return;
        }
        ShowNextAdd();
    }

    private void ShowNextAdd()
    {
        if (_detached || _dialogOpen || _connectionRequest is not null || _selectionRequest is not null ||
            Inspector.IsCommitting || _adds.Count == 0 || Window is null || Window.IsClosing)
        {
            return;
        }
        Addition addition = _adds.Peek();
        if (addition.AwaitingDraft && Inspector.HasDraft)
        {
            return;
        }
        ConnectionProfile? profile = addition.Profile;
        if ((Connections.SelectedItem as ConnectionProfile)?.Id != profile?.Id)
        {
            object? destination = profile is null ? Connections.Items[0] :
                Connections.Items.OfType<ConnectionProfile>().FirstOrDefault(candidate => candidate.Id == profile.Id);
            if (destination is null)
            {
                _adds.Dequeue();
                ShowFailure("The connection for this torrent is no longer available.");
                return;
            }
            Connections.SelectedItem = destination;
            return;
        }
        if (_session is not { State: SessionState.Live } session)
        {
            return;
        }
        string source = _adds.Dequeue().Source;
        OpenAdd(source: source);
    }

    private bool RevealAddedTorrent()
    {
        if (_dialogOpen || _revealHash is null || _session is null)
        {
            return false;
        }
        Torrent? row = _session.Torrents.Rows.FirstOrDefault(candidate => candidate.IsPresent &&
            string.Equals(candidate.Hash, _revealHash, StringComparison.OrdinalIgnoreCase));
        if (row is null)
        {
            return false;
        }
        _revealHash = null;
        ResetFilters();
        Table.Selection = new TableSelection([row], row);
        FocusRows();
        return true;
    }

    private void OnResetClick(object sender, RoutedEventArgs args)
    {
        if (_detached || _dialogOpen || _connectionRequest is not null || _selectionRequest is not null) return;
        ResetFilters();
        FocusRows();
    }

    private void ResetFilters()
    {
        _searchDue?.Stop();
        _searchText = string.Empty;
        SearchBox.Text = string.Empty;
        SetFilter("all");
    }

    internal async Task<bool> CanClose()
    {
        if (_dialogOpen || _connectionRequest is not null || _selectionRequest is not null)
        {
            return false;
        }
        return await Inspector.ResolveDraft() == DraftResolution.Accepted;
    }

    internal void ResumeAdds() => ShowNextAdd();

    private void FocusRows()
    {
        if (_shown == 0 && Table.Placeholder == TablePlaceholder.NoResults && ResetButton.Focus(FocusState.Keyboard))
        {
            return;
        }
        if (FindElement(Table, element => element.Name == "PART_ItemsView") is not ListView list)
        {
            Table.Focus(FocusState.Keyboard);
            return;
        }
        object? current = Table.Selection.Current ?? list.Items.FirstOrDefault();
        if (current is null)
        {
            list.Focus(FocusState.Keyboard);
            return;
        }
        if (Table.Selection.Current is null)
        {
            Table.Selection = new TableSelection(Table.Selection.Items, current);
        }
        // The table's ItemsStackPanel requires the second request while its extent is estimated.
        list.ScrollIntoView(current);
        list.ScrollIntoView(current);
        if (list.ContainerFromItem(current) is Control row)
        {
            row.Focus(FocusState.Keyboard);
        }
        else
        {
            DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () =>
            {
                if (ReferenceEquals(Table.Selection.Current, current) && list.ContainerFromItem(current) is Control realized)
                {
                    realized.Focus(FocusState.Keyboard);
                }
            });
        }
    }

    private void OnDragOver(object sender, DragEventArgs args)
    {
        bool canAdd = _session?.State is SessionState.Live &&
            (args.DataView.Contains(StandardDataFormats.StorageItems) || args.DataView.Contains(StandardDataFormats.Text) ||
             args.DataView.Contains(StandardDataFormats.WebLink));
        args.AcceptedOperation = canAdd ? DataPackageOperation.Copy : DataPackageOperation.None;
        if (canAdd)
        {
            args.DragUIOverride.Caption = "Add torrent";
        }
        args.Handled = true;
    }

    private async void OnDrop(object sender, DragEventArgs args)
    {
        args.Handled = true;
        if (_session?.State is not SessionState.Live)
        {
            return;
        }
        DragOperationDeferral deferral = args.GetDeferral();
        ConnectionProfile? profile = Connections.SelectedItem as ConnectionProfile;
        try
        {
            if (args.DataView.Contains(StandardDataFormats.StorageItems))
            {
                bool added = false;
                foreach (Windows.Storage.IStorageItem file in await args.DataView.GetStorageItemsAsync())
                {
                    if (file.Path.EndsWith(".torrent", StringComparison.OrdinalIgnoreCase))
                    {
                        AddSource(file.Path, profile);
                        added = true;
                    }
                }
                if (!added)
                {
                    ShowFailure("Drop a torrent file, a magnet link, or a torrent URL.");
                }
            }
            else if (args.DataView.Contains(StandardDataFormats.WebLink))
            {
                AddSource((await args.DataView.GetWebLinkAsync()).AbsoluteUri, profile);
            }
            else if (args.DataView.Contains(StandardDataFormats.Text))
            {
                AddSource((await args.DataView.GetTextAsync()).Trim(), profile);
            }
        }
        catch (Exception error)
        {
            ShowFailure(error.Message);
        }
        finally
        {
            deferral.Complete();
        }
    }

    private async Task ConfirmRemove(Session session, IReadOnlyList<Torrent> packet, bool deleteData, string? profileId)
    {
        if (!ReferenceEquals(session, _session) || (Connections.SelectedItem as ConnectionProfile)?.Id != profileId)
        {
            return;
        }
        if (packet.Any(row => ReferenceEquals(row, Inspector.BoundTorrent)) &&
            await Inspector.ResolveDraft() != DraftResolution.Accepted)
        {
            return;
        }
        if (ReferenceEquals(_session, session) && (Connections.SelectedItem as ConnectionProfile)?.Id == profileId)
        {
            await ShowDialog(() => Remove(session, packet, deleteData));
        }
    }

    private async Task Remove(Session session, IReadOnlyList<Torrent> packet, bool deleteData)
    {
        if (!ReferenceEquals(session, _session) || session.State is not SessionState.Live || packet.Count == 0)
        {
            return;
        }
        CheckBox delete = new() { Content = "Delete downloaded files", IsChecked = deleteData };
        StackPanel content = new() { Spacing = 12 };
        content.Children.Add(new TextBlock
        {
            Text = packet.Count == 1 ? packet[0].Name : $"{packet.Count} selected torrents",
            TextWrapping = TextWrapping.Wrap,
        });
        content.Children.Add(delete);
        ContentDialog dialog = new()
        {
            XamlRoot = XamlRoot,
            Title = "Remove torrent" + (packet.Count == 1 ? "?" : "s?"),
            Content = new ScrollViewer
            {
                Content = content,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                IsTabStop = false
            },
            PrimaryButtonText = "Remove",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        Icons.Set(dialog, Lucide.Trash2);
        if (await dialog.ShowAsync() == ContentDialogResult.Primary && ReferenceEquals(_session, session))
        {
            await session.Remove(packet, delete.IsChecked == true);
        }
    }

    private void OnRowsReorderRequested(object? sender, TableRowsReorderRequestedEventArgs e)
    {
        if (_session is Session session)
        {
            Run(session.Reorder(Packet(e.MovingItems), e.InsertBeforeItem as Torrent));
        }
    }

    private static List<Torrent> Packet(IReadOnlyList<object> items)
    {
        List<Torrent> rows = new(items.Count);
        foreach (object item in items)
        {
            if (item is Torrent row && row.IsPresent)
            {
                rows.Add(row);
            }
        }
        return rows;
    }

    private void OnRowContextRequested(object? sender, TableRowContextRequestedEventArgs e)
    {
        List<Torrent> packet = Packet(e.SelectedItems);
        MenuFlyout flyout = BuildRowMenu(packet);
        if (e.RelativePoint is Point point)
        {
            flyout.ShowAt(e.PlacementTarget, new FlyoutShowOptions { Position = point });
        }
        else
        {
            flyout.ShowAt(e.PlacementTarget);
        }
    }

    private MenuFlyout BuildRowMenu(IReadOnlyList<Torrent> packet)
    {
        MenuFlyout flyout = new();
        void Add(string text, string glyph, bool enabled, Action invoke)
        {
            MenuFlyoutItem item = new() { Text = text, IsEnabled = enabled, Icon = Icons.Create(glyph) };
            item.KeyboardAcceleratorTextOverride = text switch
            {
                "Start" => "Alt+S",
                "Pause" => "Alt+P",
                "Remove" => "Delete",
                _ => string.Empty,
            };
            item.Click += (_, _) => invoke();
            flyout.Items.Add(item);
        }
        Session? session = _session;
        string? profileId = (Connections.SelectedItem as ConnectionProfile)?.Id;
        bool live = session?.State is SessionState.Live && packet.Count > 0 && !_dialogOpen && _connectionRequest is null;
        Add("Pause", Lucide.Pause, live && packet.Any(row => row.Status != TorrentStatus.Stopped), () => Run(session!.Stop(packet)));
        Add("Start", Lucide.Play, live && packet.Any(row => row.Status == TorrentStatus.Stopped), () => Run(session!.Start(packet)));
        Add("Force start", Lucide.FastForward, live, () => Run(session!.StartNow(packet)));
        Add("Verify", Lucide.CheckCheck, live, () => Run(session!.Verify(packet)));
        Add("Reannounce", Lucide.RefreshCw, live, () => Run(session!.Request(new TorrentReannounce(Ids(packet)))));
        flyout.Items.Add(new MenuFlyoutSeparator());
        MenuFlyoutSubItem queue = new() { Text = "Queue", AccessKey = "Q", Icon = Icons.Create(Lucide.ListOrdered), IsEnabled = live };
        void AddMove(string text, string key, string glyph, QueueMove move)
        {
            MenuFlyoutItem item = new()
            {
                Text = text,
                AccessKey = key,
                KeyboardAcceleratorTextOverride = key,
                Icon = Icons.Create(glyph),
                IsEnabled = live && session!.CanReorder(packet, move),
            };
            item.Click += (_, _) => Run(session!.Reorder(packet, move));
            queue.Items.Add(item);
        }
        AddMove("Top", "T", Lucide.ArrowUpToLine, QueueMove.Top);
        AddMove("Up", "U", Lucide.ChevronUp, QueueMove.Up);
        AddMove("Down", "D", Lucide.ChevronDown, QueueMove.Down);
        AddMove("Bottom", "B", Lucide.ArrowDownToLine, QueueMove.Bottom);
        flyout.Items.Add(queue);
        flyout.Items.Add(new MenuFlyoutSeparator());
        Add("Change", Lucide.FolderOpen, live, () => ChangeLocation(session!, packet, profileId));
        Add("Labels", Lucide.Tags, live, () => { _ = ShowDialog(() => Dialogs.ShowLabels(session!, XamlRoot, packet)); });
        MenuFlyoutSubItem priorities = new() { Text = "Priority", Icon = Icons.Create(Lucide.ArrowUpDown), IsEnabled = live };
        foreach (Priority priority in new[] { Priority.High, Priority.Normal, Priority.Low })
        {
            MenuFlyoutItem item = new() { Text = priority.ToString(), Icon = Icons.Create(Lucide.ArrowUpDown) };
            item.Click += (_, _) => Run(session!.Request(new TorrentSet(Ids(packet)) { BandwidthPriority = priority }));
            priorities.Items.Add(item);
        }
        flyout.Items.Add(priorities);
        Add("Open", Lucide.FolderOpen, packet.Count == 1 && Connections.SelectedItem is not ConnectionProfile, () => OpenFolder(packet[0]));
        Add("Copy hash", Lucide.Copy, packet.Count == 1, () => Copy(packet[0].Hash));
        Add("Copy magnet", Lucide.Copy, live && packet.Count == 1, () => Run(CopyMagnet(session!, packet[0])));
        flyout.Items.Add(new MenuFlyoutSeparator());
        Add("Remove", Lucide.Trash2, live, () => Run(ConfirmRemove(session!, packet, false, profileId)));
        Add("Remove data", Lucide.Trash2, live, () => Run(ConfirmRemove(session!, packet, true, profileId)));
        return flyout;
    }

    private static TorrentIds Ids(IReadOnlyList<Torrent> packet) => TorrentIds.Of(packet.Select(row => row.Hash).ToArray());

    private void ChangeLocation(Session session, IReadOnlyList<Torrent> packet, string? profileId)
    {
        if (ReferenceEquals(_session, session) && session.State is SessionState.Live && Window is not null &&
            (Connections.SelectedItem as ConnectionProfile)?.Id == profileId)
        {
            nint hwnd = Window.Handle;
            bool local = Connections.SelectedItem is not ConnectionProfile;
            string name = ConnectionName;
            _ = ShowDialog(() => Dialogs.ShowLocation(session, XamlRoot, packet, hwnd, local, name));
        }
    }

    private sealed record Magnet(string MagnetLink);

    private async Task CopyMagnet(Session session, Torrent row)
    {
        if (!ReferenceEquals(_session, session) || session.State is not SessionState.Live)
        {
            return;
        }
        TorrentGetResult<Magnet> result = await session.Request(new TorrentGet<Magnet>(TorrentIds.Of(row.Hash)));
        if (_detached || !ReferenceEquals(_session, session))
        {
            return;
        }
        if (result.Torrents.Count == 0)
        {
            ShowFailure("This torrent is no longer available.");
            return;
        }
        Copy(result.Torrents[0].MagnetLink);
    }

    private async void Run(Task command)
    {
        try
        {
            await command;
        }
        catch (Exception error)
        {
            ShowFailure(error.Message);
        }
    }

    private void OpenFolder(Torrent row) => _ = OpenPath(row.DownloadDir, false);

    private async Task OpenPath(string path, bool reveal)
    {
        try
        {
            if (reveal)
            {
                Windows.Storage.StorageFile file = await Windows.Storage.StorageFile.GetFileFromPathAsync(path);
                Windows.Storage.StorageFolder folder = await file.GetParentAsync();
                Windows.System.FolderLauncherOptions options = new();
                options.ItemsToSelect.Add(file);
                if (!await Windows.System.Launcher.LaunchFolderAsync(folder, options)) throw new InvalidOperationException("Windows could not open the folder.");
            }
            else
            {
                using Process? process = Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            }
        }
        catch (Exception error)
        {
            ShowFailure(error.Message);
        }
    }

    private static void Copy(string text)
    {
        Windows.ApplicationModel.DataTransfer.DataPackage package = new();
        package.SetText(text);
        Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
    }
}
