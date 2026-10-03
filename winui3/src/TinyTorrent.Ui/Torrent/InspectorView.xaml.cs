using System.ComponentModel;
using System.Collections.ObjectModel;
using System.Globalization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using TinyTorrent;
using Transmission;
using Synapse;
using Windows.System;
namespace TinyTorrent_Ui;
internal enum DraftResolution { Accepted, Canceled, Failed }

public sealed partial class InspectorView : UserControl
{
    private enum Editor { General, Trackers }
    private enum EditPhase { Clean, Dirty, Saving }
    private sealed record EditSession(string Hash, Editor Editor, object Baseline, EditPhase Phase);
    private Session? _session;
    private TinyTorrent.Torrent? _row;
    private InspectorTab _view;
    private EditSession? _edit;
    private InspectorFile[]? _files;
    private ObservableCollection<InspectorFile>? _roots;
    private enum FileField { Name, Size, Progress, Priority, Wanted }
    private (FileField Field, ListSortDirection Direction) _fileSort = (FileField.Name, ListSortDirection.Ascending);
    private sealed record FileKey(InspectorFile File, string Name, string Path, long Length, long Completed, int? Priority, int? Wanted);
    private int _fileSortRevision;
    private InspectorFile? _fileSortFocus;
    private bool _rendering, _committing, _local;
    private bool _fileLayoutQueued;
    private sealed record FileTarget(string Hash, string Root, string Relative, string? File, string? Folder);
    private FileTarget? _fileTarget;
    private bool _checkingFiles;
    internal event EventHandler? DraftResolved;
    private readonly TextBlock _fileMeasure = new();
    public InspectorView()
    {
        InitializeComponent();
        _rendering = true;
        Views.SelectedItem = Views.MenuItems[0];
        _rendering = false;
        PiecesMap.SummaryChanged += (_, _) => PiecesText.Text = PiecesMap.Summary;
        PiecesMap.CopyText = text => Copy(text);
        SpeedChart.CopyText = text => Copy(text);
        Icons.Set(StalledPeersButton, Lucide.Users);
        Icons.Set(StalledPiecesButton, Lucide.Grid2x2);
        Icons.Set(RetryDetails, Lucide.RefreshCw);
        PeersList.Schema<InspectorPeer>().Key(peer => peer.Address).Sort(PeerAddressColumn, peer => peer.Address).Sort(PeerClientColumn, peer => peer.Client).Sort(PeerProgressColumn, peer => peer.Value.Progress).Sort(PeerDownloadColumn, peer => peer.Value.RateToClient).Sort(PeerUploadColumn, peer => peer.Value.RateToPeer);
        TrackersList.Schema<InspectorTracker>().Key(tracker => tracker.Value.Id.ToString()).Sort(TrackerAddressColumn, tracker => tracker.Value.Announce).Sort(TrackerStateColumn, tracker => tracker.State).Sort(TrackerNextColumn, tracker => tracker.Value.NextAnnounceTime).Sort(TrackerSeedsColumn, tracker => tracker.Value.SeederCount).Sort(TrackerLeechesColumn, tracker => tracker.Value.LeecherCount);
        PeersList.SelectionStateChanged += (_, _) => UpdatePeerFacts();
        TrackersList.SelectionStateChanged += (_, _) => UpdateTrackerFacts();
        TrackerEditor.Changed += TrackersEdited;
        foreach (NumberBox number in new[] { DownLimit, UpLimit, RatioLimit, IdleLimit, PeerLimit }) number.RegisterPropertyChangedCallback(NumberBox.TextProperty, (_, _) => MarkOptions());
        foreach ((Button button, string glyph) in new[] { (CloseButton, Lucide.X), (OpenButton, Lucide.FolderOpen), (ChangeButton, Lucide.Pencil), (CopyPathButton, Lucide.Copy), (CopyHashButton, Lucide.Copy), (CopyMagnetButton, Lucide.Copy), (ApplyOptions, Lucide.Check), (DiscardOptions, Lucide.Undo2), (EditTrackersButton, Lucide.Pencil), (ReannounceButton, Lucide.RefreshCw), (ApplyTrackers, Lucide.Save), (CancelTrackers, Lucide.X) }) Icons.Set(button, glyph);
        DownloadFilesButton.Icon = Icons.Create(Lucide.Download);
        OpenFileButton.Icon = Icons.Create(Lucide.File);
        FileFolderButton.Icon = Icons.Create(Lucide.FolderOpen);
        FileSortButton.Icon = Icons.Create(Lucide.ArrowDownUp);
        foreach (RadioMenuFlyoutItem item in FileSortMenu.Items.OfType<RadioMenuFlyoutItem>()) item.Icon = Icons.Create(Lucide.ArrowDownUp);
        UpdateFileSort();
        FilePiecesButton.Icon = Icons.Create(Lucide.Grid2x2);
        SkipFilesButton.Icon = Icons.Create(Lucide.CircleSlash);
        PriorityButton.Icon = Icons.Create(Lucide.ArrowUpDown);
        RenameButton.Icon = Icons.Create(Lucide.Pencil);
        foreach (MenuFlyoutItem item in ((MenuFlyout)PriorityButton.Flyout).Items) item.Icon = Icons.Create(Lucide.ArrowUpDown);
        Unloaded += (_, _) => Bind(null, null);
    }
    internal Func<Func<Task>, Task>? ShowDialog { get; set; }
    internal Action<TinyTorrent.Torrent>? OpenFolder { get; set; }
    internal Func<string, bool, Task>? OpenPath { get; set; }
    internal Action? ChangeLocation { get; set; }
    internal Action<string>? CopyText { get; set; }
    internal event EventHandler? CloseRequested;
    internal TinyTorrent.Torrent? BoundTorrent => _row;
    internal bool HasDraft => _edit?.Phase is EditPhase.Dirty or EditPhase.Saving;
    internal bool IsCommitting => _edit?.Phase == EditPhase.Saving || _committing;
    internal double MinimumHeight
    {
        get
        {
            double chrome = TitleRow.ActualHeight + Root.RowSpacing + ViewContent.RowSpacing * 2
                + Math.Max(0, Views.ActualHeight - ViewContent.ActualHeight);
            if (ErrorBar.IsOpen) chrome += ErrorBar.ActualHeight;
            if (UnavailableRow.Visibility == Visibility.Visible) chrome += UnavailableRow.ActualHeight;
            if (_row is null) return chrome + EmptyText.ActualHeight;
            double editorHeight = TrackerEditor.MinimumHeight;
            return chrome + (_view switch
            {
                InspectorTab.General => PrimaryRow.ActualHeight
                    + (GeneralFooter.Visibility == Visibility.Visible ? GeneralFooter.ActualHeight + GeneralView.RowSpacing : 0),
                InspectorTab.Files => FileSearch.ActualHeight + FilesEditor.ActualHeight + FileHeader.ActualHeight + FileFacts.ActualHeight + FilesView.RowSpacing * 4,
                InspectorTab.Peers => PeerText.ActualHeight + PeerFactsScroll.ActualHeight + PeersView.RowSpacing * 2,
                InspectorTab.Trackers => TrackerCommands.ActualHeight + TrackersView.RowSpacing * 2
                    + (TrackerEditView.Visibility == Visibility.Visible
                        ? editorHeight + TrackerFooter.ActualHeight + TrackerEditView.RowSpacing
                        : TrackerFactsScroll.ActualHeight),
                InspectorTab.Speed => SpeedText.ActualHeight + SpeedWindow.ActualHeight + SpeedView.RowSpacing * 2,
                _ => PiecesText.ActualHeight + PiecesLegend.ActualHeight + PiecesViewPanel.RowSpacing * 2,
            });
        }
    }
    internal InspectorTab SelectedTab { get => _view; set => SelectView(value); }
    private bool CanWrite => _session?.State is SessionState.Live && _row is { } row && _session.Torrents.Rows.Any(candidate => candidate.Hash == row.Hash && candidate.IsPresent);
    private TorrentGeneral? General => _session?.Detail is { Tab: InspectorTab.General, Value: TorrentGeneral value } detail && detail.Hash == _row?.Hash ? value : null;
    internal void Configure(bool isLocal, string engineName) { _local = isLocal; LocationLabel.Text = isLocal ? "Folder" : $"Folder on {engineName}"; OpenButton.Visibility = isLocal ? Visibility.Visible : Visibility.Collapsed; }
    public void Bind(Session? session, TinyTorrent.Torrent? row, int selectionCount = 0)
    {
        if (ReferenceEquals(_session, session) && ReferenceEquals(_row, row))
        {
            if (row is null) TitleText.Text = EmptyText.Text = selectionCount > 1 ? "Multiple torrents" : "No selection";
            UpdateAvailability(); return;
        }
        if (IsCommitting) return;
        if (_session is { } previous) { previous.DetailChanged -= DetailChanged; previous.Failed -= Failed; previous.Changed -= TickChanged; previous.StateChanged -= StateChanged; previous.Inspect(null, _view); }
        if (_row is { } previousRow) previousRow.PropertyChanged -= RowChanged;
        bool sameTarget = ReferenceEquals(_session, session) && _row?.Hash == row?.Hash;
        _session = session; _row = row;
        if (!sameTarget) { _edit = null; Limits.IsExpanded = false; TrackerEditView.Visibility = Visibility.Collapsed; }
        Release(); TitleText.Text = row?.Name ?? (selectionCount > 1 ? "Multiple torrents" : "No selection"); EmptyText.Text = TitleText.Text; EmptyText.Visibility = row is null ? Visibility.Visible : Visibility.Collapsed; UpdateViews();
        if (session is not null) { session.DetailChanged += DetailChanged; session.Failed += Failed; session.Changed += TickChanged; session.StateChanged += StateChanged; if (row is not null) { row.PropertyChanged += RowChanged; session.Inspect(row, _view); } }
        UpdateAvailability();
    }
    private void SelectView(InspectorTab view) { if (IsCommitting) { UpdateViews(); return; } if (_view != view) { _view = view; Release(); _session?.Inspect(_row, view); } UpdateViews(); ShowSpeed(); }
    private void UpdateViews()
    {
        _rendering = true;
        Views.SelectedItem = Views.MenuItems[(int)_view];
        _rendering = false;
        FrameworkElement[] panels = [GeneralView, FilesView, PeersView, TrackersView, SpeedView, PiecesViewPanel];
        for (int i = 0; i < panels.Length; i++) panels[i].Visibility = _row is not null && i == (int)_view ? Visibility.Visible : Visibility.Collapsed;
        TrackerEditView.Visibility = _view == InspectorTab.Trackers && _edit?.Editor == Editor.Trackers ? Visibility.Visible : Visibility.Collapsed;
        TrackersList.Visibility = TrackerEditView.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible; TrackerFactsScroll.Visibility = TrackersList.Visibility; UpdateAvailability();
    }
    private void ViewChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (!_rendering && args.SelectedItem is { } item)
            SelectView((InspectorTab)sender.MenuItems.IndexOf(item));
    }
    private void Release()
    {
        _fileSortRevision++;
        _fileSortFocus = null;
        _fileTarget = null;
        PeerSources.IsExpanded = false;
        PeerSourcesText.Text = WebseedUrls.Text = "";
        _fileLayoutQueued = false;
        _fileMeasure.Text = "";
        FileHeader.Padding = new Thickness(0);
        for (int column = 1; column < FileHeader.ColumnDefinitions.Count; column++)
            FileHeader.ColumnDefinitions[column].Width = new GridLength(0);
        _files = null; _roots = null; FilesList.ItemsSource = null; PeersList.ItemsSource = TrackersList.ItemsSource = null;
        PeersList.Placeholder = TrackersList.Placeholder = _row is null ? TablePlaceholder.Empty : TablePlaceholder.Loading; PiecesMap.Release(); SpeedChart.Update(null);
        StatusText.Text = _row?.StatusLabel ?? ""; GeneralText.Text = _row is null ? "" : "Reading torrent details…"; ProgressBar.IsIndeterminate = _row is not null; FileFacts.Text = _row is null ? "" : "Reading files…";
        PeerText.Text = PiecesText.Text = PeerFacts.Text = TrackerFacts.Text = SpeedText.Text = SpeedWindow.Text = ""; EngineError.Visibility = Visibility.Collapsed;
        if (_edit is null) LocationText.Text = TransferText.Text = MetadataText.Text = RatesText.Text = StoppingText.Text = "";
        if (_edit?.Editor != Editor.Trackers) TrackerEditor.Release();
        UpdateAvailability();
    }
    private void DetailChanged(object? sender, TorrentDetail? detail)
    {
        if (detail is null) { Release(); return; } if (detail.Hash != _row?.Hash || detail.Tab != _view) return;
        switch (detail.Value) {
            case TorrentGeneral general: ShowGeneral(general); break;
            case TorrentFiles files: ShowFiles(files); break;
            case TorrentPeers peers:
                PeersList.Placeholder = TablePlaceholder.Empty;
                PeersList.ItemsSource = peers.Peers.Select(peer => new InspectorPeer(peer)).ToArray();
                UpdatePeerFacts();
                PeerText.Text = $"{peers.Peers.Count:N0} connected · {peers.Peers.Count(peer => peer.IsDownloadingFrom):N0} supplying · {peers.Peers.Count(peer => peer.IsUploadingTo):N0} receiving";
                if (peers.WebseedsSendingToUs > 0) PeerText.Text += $" · {peers.WebseedsSendingToUs:N0} active webseeds";
                PeerCounts sources = peers.PeersFrom;
                PeerSourcesText.Text = $"Tracker {sources.FromTracker:N0} · DHT {sources.FromDht:N0} · PEX {sources.FromPex:N0} · Local {sources.FromLpd:N0}\nIncoming {sources.FromIncoming:N0} · Cache {sources.FromCache:N0} · Extension {sources.FromLtep:N0}";
                string urls = string.Join(Environment.NewLine, peers.Webseeds);
                if (WebseedUrls.Text != urls) WebseedUrls.Text = urls;
                break;
            case TorrentTrackers trackers:
                TrackersList.Placeholder = TablePlaceholder.Empty;
                TrackersList.ItemsSource = trackers.TrackerStats.OrderBy(tracker => tracker.Tier).ThenBy(tracker => tracker.IsBackup).Select(tracker => new InspectorTracker(tracker)).ToArray();
                UpdateTrackerFacts();
                break;
            case TorrentPieces pieces: PiecesMap.Update(pieces); break; }
        UpdateAvailability();
    }
    private void UpdatePeerFacts()
    {
        PeerFacts.Text = (PeersList.Selection.Current as InspectorPeer)?.Facts ?? "";
        PeerFacts.Visibility = PeerFacts.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    }
    private void UpdateTrackerFacts() => TrackerFacts.Text = (TrackersList.Selection.Current as InspectorTracker)?.Facts ?? "";
    private void FactsSizeChanged(object sender, SizeChangedEventArgs args)
    {
        PeerFactsScroll.MaxHeight = Math.Max(0, PeersView.ActualHeight - PeerText.ActualHeight - PeersView.RowSpacing * 2) / 3;
        WebseedUrls.MaxHeight = PeerFactsScroll.MaxHeight;
        TrackerFactsScroll.MaxHeight = Math.Max(0, TrackersView.ActualHeight - TrackerCommands.ActualHeight - TrackersView.RowSpacing * 2) / 3;
    }
    private void Failed(object? sender, string message) => Error(message);
    private void StateChanged(object? sender, SessionState state)
    {
        if (state is not SessionState.Live && _edit is not null)
        {
            StatusText.Text = $"{_row?.StatusLabel} · Disconnected";
            ProgressBar.IsIndeterminate = false;
        }
        UpdateAvailability();
    }
    private void TickChanged(object? sender, TorrentFields fields) { ShowSpeed(); UpdateAvailability(); }
    private void RowChanged(object? sender, PropertyChangedEventArgs args) { TitleText.Text = _row?.Name ?? "No selection"; ShowSpeed(); }
    private void ShowGeneral(TorrentGeneral value)
    {
        TorrentFormat format = TorrentFormat.Default;
        StatusText.Text = _row?.StatusLabel ?? "";
        EngineError.Text = _row?.ErrorString ?? ""; EngineError.Visibility = string.IsNullOrEmpty(EngineError.Text) ? Visibility.Collapsed : Visibility.Visible;
        bool metadata = value.MetadataPercentComplete < 1;
        bool checking = _row?.Status is TorrentStatus.Check or TorrentStatus.CheckWait;
        double percent = metadata ? value.MetadataPercentComplete : checking ? value.RecheckProgress : value.PercentDone;
        ProgressBar.IsIndeterminate = false; ProgressBar.Value = percent * 100;
        string label = metadata ? "Metadata" : checking ? "Verification" : value.SizeWhenDone < value.TotalSize ? "Selected files" : "Downloaded";
        GeneralText.Text = $"{label} {percent:P1}";
        if (!metadata && !checking) GeneralText.Text += $" · {format.Size(Math.Max(0, value.SizeWhenDone - value.LeftUntilDone))} / {format.Size(value.SizeWhenDone)}";
        if (!metadata && value.SizeWhenDone < value.TotalSize) GeneralText.Text += $" · Total size {format.Size(value.TotalSize)}";
        if (_row?.IsDownloading == true && !metadata && !checking) GeneralText.Text += $" · Remaining {TorrentFormat.Duration(_row.Eta)}";
        RatesText.Text = $"Download {format.Rate(_row?.DownloadSpeed ?? 0)} · Upload {format.Rate(_row?.UploadSpeed ?? 0)}";
        StoppingText.Text = _row?.IsSeeding == true ? $"Uploaded {format.Size(value.UploadedEver)} · Ratio {value.UploadRatio:0.00}\n{StoppingRule(value)}" : "";
        if (_row?.IsStalled == true)
        {
            if (StoppingText.Text.Length > 0) StoppingText.Text += "\n";
            StoppingText.Text += $"Connected peers {_row.PeersConnected:N0} · Wanted bytes available {format.Size(value.DesiredAvailable)}";
        }
        StalledActions.Visibility = _row?.IsStalled == true ? Visibility.Visible : Visibility.Collapsed;
        LocationText.Text = value.DownloadDir;
        TransferText.Text = $"Uploaded {format.Size(value.UploadedEver)} · Ratio {value.UploadRatio:0.00}\nDownloaded total {format.Size(value.DownloadedEver)}\nVerified {format.Size(value.HaveValid)} · Remaining {format.Size(value.LeftUntilDone)}";
        if (value.HaveUnchecked > 0) TransferText.Text += $"\nUnchecked {format.Size(value.HaveUnchecked)}";
        if (value.CorruptEver > 0) TransferText.Text += $"\nDiscarded corrupt data {format.Size(value.CorruptEver)}";
        TransferText.Text += $"\nAll files {value.PercentComplete:P1}\nAdded {Date(value.AddedDate)}\nCompleted {(value.DoneDate > 0 ? Date(value.DoneDate) : "Not completed")}";
        if (value.ActivityDate > 0) TransferText.Text += $"\nLast activity {Date(value.ActivityDate)}";
        MetadataText.Text = $"Hash {value.HashString}\n{(value.IsPrivate ? "Private" : "Public")}";
        if (!string.IsNullOrWhiteSpace(value.Creator)) MetadataText.Text += $"\nCreator {value.Creator}";
        if (value.DateCreated > 0) MetadataText.Text += $"\nCreated {Date(value.DateCreated)}";
        if (!string.IsNullOrWhiteSpace(value.Comment)) MetadataText.Text += $"\nComment {value.Comment}";
        if (_edit is not { Editor: Editor.General, Phase: not EditPhase.Clean })
        {
            LoadOptions(value);
            if (Limits.IsExpanded && _edit is null && _row is { } row) _edit = new(row.Hash, Editor.General, value, EditPhase.Clean);
            else if (_edit is { Editor: Editor.General, Phase: EditPhase.Clean } edit) _edit = edit with { Baseline = value };
        }
    }
    private string StoppingRule(TorrentGeneral value)
    {
        SeedingLimits? globals = _session?.SeedingLimits;
        double? ratio = value.SeedRatioMode == RatioMode.Single ? value.SeedRatioLimit : value.SeedRatioMode == RatioMode.Global && globals?.RatioLimited == true ? globals.RatioLimit : null;
        int? idle = value.SeedIdleMode == IdleMode.Single ? value.SeedIdleLimit : value.SeedIdleMode == IdleMode.Global && globals?.IdleLimited == true ? globals.IdleMinutes : null;
        if (globals is null && (value.SeedRatioMode == RatioMode.Global || value.SeedIdleMode == IdleMode.Global)) return "Seeding limit Unknown";
        return ratio is null && idle is null ? "Seeding unlimited" : string.Join(" · ", new[] { ratio is { } r ? $"Stop at ratio {r:0.00}" : null, idle is { } minutes ? $"Stop after {minutes:N0} idle minutes" : null }.Where(text => text is not null));
    }
    private void LoadOptions(TorrentGeneral value)
    {
        _rendering = true;
        SessionLimits.IsChecked = value.HonorsSessionLimits;
        DownEnabled.IsChecked = value.DownloadLimited; DownLimit.Value = value.DownloadLimit;
        UpEnabled.IsChecked = value.UploadLimited; UpLimit.Value = value.UploadLimit;
        RatioChoice.SelectedIndex = (int)value.SeedRatioMode; RatioLimit.Value = value.SeedRatioLimit;
        IdleChoice.SelectedIndex = (int)value.SeedIdleMode; IdleLimit.Value = value.SeedIdleLimit;
        PeerLimit.Value = value.PeerLimit; BandwidthChoice.SelectedIndex = (int)value.BandwidthPriority + 1; Sequential.IsChecked = value.SequentialDownload;
        _rendering = false;
    }
    private async void LimitsOpening(Expander sender, ExpanderExpandingEventArgs args)
    {
        if (_rendering) return;
        if (_edit?.Editor == Editor.Trackers && await ResolveDraft() != DraftResolution.Accepted) { Limits.IsExpanded = false; return; }
        if (_edit is null && General is { } value && _row is { } row) _edit = new(row.Hash, Editor.General, value, EditPhase.Clean);
        UpdateAvailability();
        DispatcherQueue.TryEnqueue(() =>
        {
            if (_view == InspectorTab.General && Limits.IsExpanded && GeneralEditor.IsEnabled)
                SessionLimits.Focus(FocusState.Keyboard);
        });
    }
    private void OptionChanged(object sender, RoutedEventArgs args) => MarkOptions();
    private void NumberChanged(NumberBox sender, NumberBoxValueChangedEventArgs args) => MarkOptions();
    private void ChoiceChanged(object sender, SelectionChangedEventArgs args) => MarkOptions();
    private void MarkOptions()
    {
        if (!_rendering && _edit is { Editor: Editor.General, Phase: not EditPhase.Saving } edit && GeneralEditor.IsEnabled) _edit = edit with { Phase = EditPhase.Dirty };
        if (Sequential is not null) UpdateAvailability();
    }
    private void UpdateAvailability()
    {
        if (Sequential is null) return;
        StoppingText.Visibility = string.IsNullOrEmpty(StoppingText.Text) ? Visibility.Collapsed : Visibility.Visible;
        bool saving = IsCommitting;
        string? failure = _session?.DetailError;
        bool unavailable = _row is not null && (failure is not null || _session?.State is not SessionState.Live);
        UnavailableRow.Visibility = unavailable ? Visibility.Visible : Visibility.Collapsed;
        UnavailableText.Text = failure is not null ? $"{_view} unavailable · {failure}" : "Disconnected";
        RetryDetails.Visibility = failure is not null ? Visibility.Visible : Visibility.Collapsed;
        RetryDetails.IsEnabled = CanWrite && failure is not null && !saving;
        PeersList.EmptyContent = unavailable ? "Peers unavailable" : "No connected peers";
        TrackersList.EmptyContent = unavailable ? "Trackers unavailable" : "No trackers";
        if (unavailable)
        {
            ProgressBar.IsIndeterminate = false;
            GeneralText.Text = "Details unavailable";
            FileFacts.Text = "Files unavailable";
            PeersList.Placeholder = TrackersList.Placeholder = TablePlaceholder.Empty;
            PiecesText.Text = "Pieces unavailable";
        }
        PiecesMap.IsEnabled = _row is not null && !saving;
        Limits.IsEnabled = !saving;
        CloseButton.IsEnabled = !saving;
        foreach (NavigationViewItem item in Views.MenuItems) item.IsEnabled = !saving;
        GeneralEditor.IsEnabled = CanWrite && !saving && (General is not null || _edit?.Editor == Editor.General);
        DownLimit.IsEnabled = DownEnabled.IsChecked == true; UpLimit.IsEnabled = UpEnabled.IsChecked == true;
        RatioLimit.IsEnabled = RatioChoice.SelectedIndex == 1; IdleLimit.IsEnabled = IdleChoice.SelectedIndex == 1;
        GeneralFooter.Visibility = _edit is { Editor: Editor.General, Phase: not EditPhase.Clean } && _view == InspectorTab.General ? Visibility.Visible : Visibility.Collapsed;
        ApplyOptions.IsEnabled = ApplyTrackers.IsEnabled = CanWrite && HasDraft && !saving;
        DiscardOptions.IsEnabled = CancelTrackers.IsEnabled = !saving;
        TrackerEditor.IsEnabled = CanWrite && !saving;
        EditTrackersButton.IsEnabled = ReannounceButton.IsEnabled = CanWrite && !saving && _session?.Detail?.Value is TorrentTrackers;
        FilesEditor.IsEnabled = !saving && _files is not null;
        FileSortButton.IsEnabled = _files is not null && !saving;
        DownloadFilesButton.IsEnabled = SkipFilesButton.IsEnabled = PriorityButton.IsEnabled = CanWrite && !saving && FilesList.SelectedItems.Count > 0;
        RenameButton.IsEnabled = CanWrite && !saving && SelectedPaths().Count == 1;
        OpenButton.IsEnabled = _local && _row is not null; ChangeButton.IsEnabled = CanWrite && !saving;
        CopyPathButton.IsEnabled = General is not null && !string.IsNullOrEmpty(LocationText.Text);
        CopyMagnetButton.IsEnabled = General is { MagnetLink.Length: > 0 };
        PeerSources.Visibility = PeerSourcesText.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        WebseedUrls.Visibility = WebseedUrls.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        UpdateFileActions();
    }

    private InspectorFile? SelectedFile => SelectedPaths() is { Count: 1 } selected ? selected[0] : null;
    private void UpdateFileActions()
    {
        InspectorFile? file = SelectedFile;
        bool current = _local && _row is { } row && _fileTarget is { } target && target.Hash == row.Hash && target.Root == row.DownloadDir && target.Relative == file?.Path;
        OpenFileButton.IsEnabled = current && _fileTarget?.File is not null;
        FileFolderButton.IsEnabled = current && _fileTarget?.Folder is not null;
        FilePiecesButton.IsEnabled = file is { Index: >= 0, Length: > 0 } && file.BeginPiece >= 0 && file.EndPiece > file.BeginPiece;
        if (_view == InspectorTab.Files && _local && file is not null && _row is not null && !_checkingFiles) _ = ProbeFile(file);
    }
    private async Task ProbeFile(InspectorFile file)
    {
        if (_row is not { } row) return;
        _checkingFiles = true;
        Session? session = _session;
        string hash = row.Hash, root = row.DownloadDir, relative = file.Path;
        bool folder = file.Index < 0;
        FileTarget target = await Task.Run(() =>
        {
            string? localFile = null, localFolder = null;
            try
            {
                if (System.IO.Path.IsPathFullyQualified(root) && !System.IO.Path.IsPathRooted(relative))
                {
                    string directory = System.IO.Path.GetFullPath(root);
                    if (!System.IO.Path.EndsInDirectorySeparator(directory)) directory += System.IO.Path.DirectorySeparatorChar;
                    string path = System.IO.Path.GetFullPath(relative, directory);
                    if (path.StartsWith(directory, StringComparison.OrdinalIgnoreCase))
                    {
                        if (!folder && File.Exists(path)) localFile = path;
                        string? parent = folder ? path : System.IO.Path.GetDirectoryName(path);
                        if (Directory.Exists(parent)) localFolder = parent;
                    }
                }
            }
            catch (Exception error) when (error is ArgumentException or IOException or NotSupportedException or UnauthorizedAccessException) { }
            return new FileTarget(hash, root, relative, localFile, localFolder);
        });
        _checkingFiles = false;
        if (_view == InspectorTab.Files && _local && ReferenceEquals(session, _session) && _row?.Hash == hash && _row.DownloadDir == root && SelectedFile?.Path == relative)
        {
            _fileTarget = target;
            OpenFileButton.IsEnabled = target.File is not null;
            FileFolderButton.IsEnabled = target.Folder is not null;
        }
        else UpdateFileActions();
    }
    private async void OpenFile(object sender, RoutedEventArgs args)
    {
        if (OpenFileButton.IsEnabled && _fileTarget?.File is { } path && OpenPath is { } open) await open(path, false);
    }
    private async void OpenFileFolder(object sender, RoutedEventArgs args)
    {
        if (FileFolderButton.IsEnabled && _fileTarget is { Folder: { } folder } target && OpenPath is { } open) await open(target.File ?? folder, target.File is not null);
    }
    private void ShowFilePieces(object sender, RoutedEventArgs args)
    {
        if (IsCommitting || !FilePiecesButton.IsEnabled || _row is not { } row || SelectedFile is not { } file) return;
        SelectView(InspectorTab.Pieces);
        PiecesMap.ShowFile(row.Hash, file.Name, file.BeginPiece, file.EndPiece);
        FocusView();
    }
    private bool FlushNumbers()
    {
        foreach ((NumberBox field, string label, bool integer, int minimum) in new[] { (DownLimit,"Download limit",true,0), (UpLimit,"Upload limit",true,0), (RatioLimit,"Ratio",false,0), (IdleLimit,"Idle minutes",true,0), (PeerLimit,"Peer limit",true,1) })
        {
            if (!field.IsEnabled) continue;
            if (!double.TryParse(field.Text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.CurrentCulture, out double value) || !double.IsFinite(value) || value < minimum || integer && (value > int.MaxValue || value != Math.Truncate(value)))
            { Error($"{label} must be {(integer ? "a whole number" : "a number")} of at least {minimum}."); Limits.IsExpanded = true; field.Focus(FocusState.Programmatic); return false; }
            field.Value = value;
        }
        return true;
    }
    private async Task<bool> SaveDraft()
    {
        if (_edit is not { Phase: EditPhase.Dirty } edit || !CanWrite || _session is not { } session) return false;
        TorrentSet request;
        if (edit.Editor == Editor.General)
        {
            if (!FlushNumbers()) return false;
            request = new(TorrentIds.Of(edit.Hash)) { HonorsSessionLimits = SessionLimits.IsChecked == true,
                DownloadLimited = DownEnabled.IsChecked == true, DownloadLimit = DownEnabled.IsChecked == true ? (int)DownLimit.Value : null,
                UploadLimited = UpEnabled.IsChecked == true, UploadLimit = UpEnabled.IsChecked == true ? (int)UpLimit.Value : null,
                SeedRatioMode = (RatioMode)RatioChoice.SelectedIndex, SeedRatioLimit = RatioChoice.SelectedIndex == 1 ? RatioLimit.Value : null,
                SeedIdleMode = (IdleMode)IdleChoice.SelectedIndex, SeedIdleLimit = IdleChoice.SelectedIndex == 1 ? (int)IdleLimit.Value : null,
                PeerLimit = (int)PeerLimit.Value, BandwidthPriority = (Priority)(BandwidthChoice.SelectedIndex - 1), SequentialDownload = Sequential.IsChecked == true };
        }
        else
        {
            if (TrackerEditor.Validate() is { } error) { Error(error); return false; }
            request = new(TorrentIds.Of(edit.Hash)) { TrackerList = TrackerEditor.Serialize() };
        }
        _edit = edit with { Phase = EditPhase.Saving }; UpdateAvailability();
        try { await session.Request(request); _edit = null; TrackerEditor.Release(); TrackerEditView.Visibility = Visibility.Collapsed; Limits.IsExpanded = false; ErrorBar.Severity = InfoBarSeverity.Success; ErrorBar.Message = "Changes saved"; ErrorBar.IsOpen = true; UpdateViews(); FocusView(); DraftResolved?.Invoke(this, EventArgs.Empty); return true; }
        catch (Exception error) { _edit = edit; Error(error.Message); return false; }
        finally { UpdateAvailability(); }
    }
    internal async Task<DraftResolution> ResolveDraft()
    {
        if (IsCommitting) return DraftResolution.Failed;
        if (_edit?.Editor == Editor.General) FlushNumbers();
        if (!HasDraft) { _edit = null; TrackerEditor.Release(); return DraftResolution.Accepted; }
        if (ShowDialog is null) return DraftResolution.Failed;
        DraftResolution resolution = DraftResolution.Failed;
        await ShowDialog(async () => {
            ContentDialog dialog = new()
            {
                XamlRoot = XamlRoot, Title = "Unsaved changes",
                Content = new ScrollViewer
                {
                    Content = new TextBlock { Text = _row?.Name ?? _edit?.Hash, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true },
                    VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                    HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                    IsTabStop = false
                },
                PrimaryButtonText = "Save", SecondaryButtonText = "Discard", CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Close, IsPrimaryButtonEnabled = CanWrite
            };
            Icons.Set(dialog, Lucide.Save, Lucide.Undo2, Lucide.X);
            ContentDialogResult result = await dialog.ShowAsync();
            if (result == ContentDialogResult.Primary)
                resolution = await SaveDraft() ? DraftResolution.Accepted : DraftResolution.Failed;
            else if (result == ContentDialogResult.Secondary)
            {
                DiscardDraft();
                resolution = DraftResolution.Accepted;
            }
            else resolution = DraftResolution.Canceled;
        });
        if (resolution != DraftResolution.Accepted) { SelectView(_edit?.Editor == Editor.Trackers ? InspectorTab.Trackers : InspectorTab.General); FocusView(); }
        return resolution;
    }
    private void DiscardDraft() { if (IsCommitting) return; if (_edit?.Baseline is TorrentGeneral baseline) LoadOptions(baseline); _edit = null; TrackerEditor.Release(); TrackerEditView.Visibility = Visibility.Collapsed; Limits.IsExpanded = false; UpdateViews(); DraftResolved?.Invoke(this, EventArgs.Empty); }
    private async void ApplyGeneral(object sender, RoutedEventArgs args) => await SaveDraft();
    private void DiscardGeneral(object sender, RoutedEventArgs args) { DiscardDraft(); Limits.Focus(FocusState.Programmatic); }
    private async void SaveTrackers(object sender, RoutedEventArgs args) => await SaveDraft();
    private async void CancelTrackerEdit(object sender, RoutedEventArgs args) { if (await ResolveDraft() == DraftResolution.Accepted) { DiscardDraft(); EditTrackersButton.Focus(FocusState.Programmatic); } }
    private async void EditTrackers(object sender, RoutedEventArgs args)
    {
        if (_edit?.Editor == Editor.General && await ResolveDraft() != DraftResolution.Accepted) return;
        if (_session?.Detail is not { Value: TorrentTrackers value } || _row is not { } row) return;
        if (_edit is null)
        {
            _edit = new(row.Hash, Editor.Trackers, value, EditPhase.Clean);
            TrackerStat? selected = (TrackersList.Selection.Current as InspectorTracker)?.Value;
            TrackerEditor.Begin(value.TrackerList, selected?.Tier, selected?.Announce);
        }
        UpdateViews(); TrackerEditor.FocusUrl();
    }
    private void TrackersEdited(object? sender, EventArgs args) { if (_edit is { Editor: Editor.Trackers, Phase: not EditPhase.Saving } edit) { _edit = edit with { Phase = EditPhase.Dirty }; UpdateAvailability(); } }
    private void ShowFiles(TorrentFiles value)
    {
        InspectorFile[] files = _files ?? [];
        bool newFiles = _files is null || files.Length != value.Files.Count || value.Files.Where((file, index) => file.Name != files[index].Path).Any();
        if (newFiles) { files = value.Files.Select((file, index) => new InspectorFile(index, file)).ToArray(); _files = files; _roots = InspectorFile.Tree(files); }
        for (int i = 0; i < files.Length && i < value.FileStats.Count; i++) files[i].Update(value.FileStats[i]);
        if (_roots is not null) foreach (InspectorFile root in _roots) root.RefreshFolders();
        if (newFiles) FilterFiles();
        FileFacts.Text = value.Files.Count == 0 ? "Metadata unavailable" : SelectedFileFacts();
        QueueFileLayout();
    }
    private void SearchFiles(object sender, TextChangedEventArgs args) { if (FilesList is not null) FilterFiles(); }
    private void FileRowLoaded(object sender, RoutedEventArgs args)
    {
        Grid row = (Grid)sender;
        for (int column = 1; column < row.ColumnDefinitions.Count; column++)
        {
            BindingOperations.SetBinding(row.ColumnDefinitions[column], ColumnDefinition.WidthProperty,
                new Binding { Source = FileHeader.ColumnDefinitions[column], Path = new PropertyPath(nameof(ColumnDefinition.Width)), Mode = BindingMode.OneWay });
            FrameworkElement cell = (FrameworkElement)row.Children[column];
            cell.SetBinding(UIElement.VisibilityProperty,
                new Binding { Source = FileHeader.Children[column], Path = new PropertyPath(nameof(Visibility)), Mode = BindingMode.OneWay });
            cell.SetBinding(FrameworkElement.MarginProperty,
                new Binding { Source = FileHeader.Children[column], Path = new PropertyPath(nameof(Margin)), Mode = BindingMode.OneWay });
        }
        QueueFileLayout();
    }
    private void FileLayoutChanged(object sender, SizeChangedEventArgs args) => QueueFileLayout();
    private void QueueFileLayout()
    {
        if (_fileLayoutQueued || _view != InspectorTab.Files || _files is null) return;
        _fileLayoutQueued = true;
        if (!DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () =>
        {
            if (!_fileLayoutQueued) return;
            _fileLayoutQueued = false;
            UpdateFileLayout();
        })) _fileLayoutQueued = false;
    }
    private void UpdateFileLayout()
    {
        if (_view != InspectorTab.Files || _files is null || FilesList.ActualWidth <= 0) return;
        Grid[] rows = FileRows(FilesList).ToArray();
        double[] widths = new double[4];
        for (int column = 1; column < FileHeader.Children.Count; column++)
        {
            TextBlock header = (TextBlock)FileHeader.Children[column];
            double width = Measure(header);
            foreach (Grid row in rows) width = Math.Max(width, Measure((TextBlock)row.Children[column]));
            widths[column - 1] = width + header.Margin.Left + header.Margin.Right;
        }
        if (rows.FirstOrDefault() is { } first)
        {
            Windows.Foundation.Point origin = first.TransformToVisual(FilesList).TransformPoint(new(0, 0));
            double indent = 0;
            for (DependencyObject? parent = VisualTreeHelper.GetParent(first); parent is not null; parent = VisualTreeHelper.GetParent(parent))
            {
                if (parent is not TreeViewItem item) continue;
                indent = item.TreeViewItemTemplateSettings.Indentation.Left;
                break;
            }
            FileHeader.Padding = new Thickness(Math.Max(0, origin.X - indent), 0,
                Math.Max(0, FilesList.ActualWidth - origin.X - first.ActualWidth), 0);
        }
        double available = FileHeader.ActualWidth - FileHeader.Padding.Left - FileHeader.Padding.Right;
        if (rows.Length > 0) available = Math.Min(available, rows.Min(row => row.ActualWidth));
        double needed = Measure((TextBlock)FileHeader.Children[0]) + widths.Sum();
        for (int column = widths.Length - 1; column >= 2 && needed > available; column--)
        {
            needed -= widths[column];
            widths[column] = 0;
        }
        for (int column = 1; column < FileHeader.ColumnDefinitions.Count; column++)
        {
            FileHeader.ColumnDefinitions[column].Width = new GridLength(widths[column - 1]);
            FileHeader.Children[column].Visibility = widths[column - 1] > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        double Measure(TextBlock text)
        {
            _fileMeasure.Text = text.Text;
            _fileMeasure.FontFamily = text.FontFamily;
            _fileMeasure.FontSize = text.FontSize;
            _fileMeasure.FontWeight = text.FontWeight;
            _fileMeasure.FontStyle = text.FontStyle;
            _fileMeasure.FontStretch = text.FontStretch;
            _fileMeasure.CharacterSpacing = text.CharacterSpacing;
            _fileMeasure.IsTextScaleFactorEnabled = text.IsTextScaleFactorEnabled;
            _fileMeasure.Language = text.Language;
            _fileMeasure.FlowDirection = text.FlowDirection;
            _fileMeasure.Measure(new(double.PositiveInfinity, double.PositiveInfinity));
            return _fileMeasure.DesiredSize.Width;
        }
        static IEnumerable<Grid> FileRows(DependencyObject parent)
        {
            for (int child = 0; child < VisualTreeHelper.GetChildrenCount(parent); child++)
            {
                DependencyObject element = VisualTreeHelper.GetChild(parent, child);
                if (element is FrameworkElement { Visibility: Visibility.Collapsed }) continue;
                if (element is Grid { Name: "FileRow", ActualWidth: > 0 } row) yield return row;
                else foreach (Grid descendant in FileRows(element)) yield return descendant;
            }
        }
    }
    private void LimitColumnsChanged(object sender, SizeChangedEventArgs args)
    {
        Grid grid = (Grid)sender;
        DownEnabled.Measure(new(double.PositiveInfinity, double.PositiveInfinity));
        UpEnabled.Measure(new(double.PositiveInfinity, double.PositiveInfinity));
        bool stacked = DownEnabled.DesiredSize.Width + UpEnabled.DesiredSize.Width + grid.ColumnSpacing > args.NewSize.Width;
        Grid.SetColumn(UploadLimits, stacked ? 0 : 1);
        Grid.SetRow(UploadLimits, stacked ? 1 : 0);
        grid.ColumnDefinitions[1].Width = stacked ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
    }
    private void FilterFiles()
    {
        _ = SortFiles(true);
    }
    private void UpdateFileSort()
    {
        foreach (RadioMenuFlyoutItem item in FileSortMenu.Items.OfType<RadioMenuFlyoutItem>())
            item.IsChecked = (string)item.Tag == _fileSort.Field.ToString() || (string)item.Tag == _fileSort.Direction.ToString();
        ToolTipService.SetToolTip(FileSortButton, $"{_fileSort.Field} · {_fileSort.Direction}\nApply again to refresh order (Alt+S)");
    }
    private void FileSortOpening(object sender, object args) => _fileSortFocus = FilesList.SelectedItem as InspectorFile;
    private void FileSortClosed(object sender, object args)
    {
        InspectorFile? file = _fileSortFocus;
        _fileSortFocus = null;
        if (_view == InspectorTab.Files && !Dialogs.HasPopup(this)) FocusFile(file);
    }
    private async void FileSortChanged(object sender, RoutedEventArgs args)
    {
        string choice = (string)((RadioMenuFlyoutItem)sender).Tag;
        if (Enum.TryParse(choice, out FileField field)) _fileSort = (field, _fileSort.Direction);
        else _fileSort = (_fileSort.Field, Enum.Parse<ListSortDirection>(choice));
        UpdateFileSort();
        await SortFiles(false);
    }
    private async Task SortFiles(bool newListing)
    {
        int revision = ++_fileSortRevision;
        if (_files is null || _roots is not { } roots || _row is not { } row) return;
        Session? session = _session;
        string hash = row.Hash, filter = FileSearch.Text;
        var sort = _fileSort;
        CompareInfo names = CultureInfo.CurrentCulture.CompareInfo;
        List<(ObservableCollection<InspectorFile> Source, FileKey[] Keys)> groups = [];
        ObservableCollection<InspectorFile> listing = roots;
        if (!string.IsNullOrWhiteSpace(filter))
        {
            InspectorFile[] matches = _files.Where(file => file.Path.Contains(filter, StringComparison.CurrentCultureIgnoreCase)).ToArray();
            HashSet<InspectorFile> matching = matches.ToHashSet();
            listing = !newListing && FilesList.ItemsSource is ObservableCollection<InspectorFile> current && current != roots
                && current.Count == matches.Length && current.All(matching.Contains) ? current : new(matches);
        }
        groups.Add((listing, listing.Select(Snapshot).ToArray()));
        await Task.Run(() =>
        {
            foreach (var group in groups) Array.Sort(group.Keys, Compare);
        });
        if (revision != _fileSortRevision || _view != InspectorTab.Files || !ReferenceEquals(roots, _roots)
            || !ReferenceEquals(session, _session) || _row?.Hash != hash || FileSearch.Text != filter || _fileSort != sort) return;

        InspectorFile[] selected = FilesList.SelectedItems.Cast<InspectorFile>().ToArray();
        HashSet<string> expanded = Nodes(FilesList.RootNodes).Where(node => node.IsExpanded)
            .Select(node => ((InspectorFile)node.Content).Path).ToHashSet(StringComparer.Ordinal);
        DependencyObject? focusBefore = FocusManager.GetFocusedElement(XamlRoot) as DependencyObject;
        InspectorFile? focused = null;
        for (DependencyObject? element = focusBefore; element is not null; element = VisualTreeHelper.GetParent(element))
            if (element is TreeViewItem item) { focused = FilesList.ItemFromContainer(item) as InspectorFile; break; }
        foreach (var group in groups)
        {
            for (int index = 0; index < group.Keys.Length; index++)
            {
                InspectorFile file = group.Keys[index].File;
                if (ReferenceEquals(group.Source[index], file)) continue;
                group.Source.RemoveAt(group.Source.IndexOf(file));
                group.Source.Insert(index, file);
            }
        }
        if (!ReferenceEquals(FilesList.ItemsSource, listing)) FilesList.ItemsSource = listing;
        foreach (TreeViewNode node in Nodes(FilesList.RootNodes)) node.IsExpanded = expanded.Contains(((InspectorFile)node.Content).Path);
        HashSet<InspectorFile> present = groups.SelectMany(group => group.Keys).Select(key => key.File).ToHashSet();
        foreach (InspectorFile file in selected.Where(present.Contains))
            if (!FilesList.SelectedItems.Contains(file)) FilesList.SelectedItems.Add(file);
        FileFacts.Text = SelectedFileFacts();
        UpdateAvailability();
        QueueFileLayout();
        if (focused is not null) DispatcherQueue.TryEnqueue(() =>
        {
            DependencyObject? focusNow = FocusManager.GetFocusedElement(XamlRoot) as DependencyObject;
            if (revision == _fileSortRevision && _view == InspectorTab.Files && ReferenceEquals(roots, _roots)
                && (focusNow is null || ReferenceEquals(focusNow, focusBefore) || TorrentPage.Within(focusNow, FilesList))) FocusFile(focused);
        });

        FileKey Snapshot(InspectorFile file)
        {
            if (file.Index >= 0) return new(file, file.Name, file.Path, file.Length, file.Completed, file.PriorityValue, file.WantedValue);
            FileKey[] children = file.Children.Select(Snapshot).ToArray();
            groups.Add((file.Children, children));
            int?[] priorities = children.Select(child => child.Priority).Distinct().ToArray();
            int?[] wanted = children.Select(child => child.Wanted).Distinct().ToArray();
            return new(file, file.Name, file.Path, children.Sum(child => child.Length), children.Sum(child => child.Completed),
                priorities.Length == 1 ? priorities[0] : 2, wanted.Length == 1 ? wanted[0] : 1);
        }
        int Compare(FileKey left, FileKey right)
        {
            bool leftFolder = left.File.Index < 0, rightFolder = right.File.Index < 0;
            if (leftFolder != rightFolder) return leftFolder ? -1 : 1;
            int? leftValue = sort.Field == FileField.Priority ? left.Priority : left.Wanted;
            int? rightValue = sort.Field == FileField.Priority ? right.Priority : right.Wanted;
            if ((sort.Field is FileField.Priority or FileField.Wanted) && leftValue.HasValue != rightValue.HasValue)
                return leftValue.HasValue ? -1 : 1;
            int order = sort.Field switch
            {
                FileField.Name => NaturalName(),
                FileField.Size => left.Length.CompareTo(right.Length),
                FileField.Progress => (left.Length == 0 ? 0 : (double)left.Completed / left.Length).CompareTo(right.Length == 0 ? 0 : (double)right.Completed / right.Length),
                _ => Nullable.Compare(leftValue, rightValue),
            };
            if (order != 0) return sort.Direction == ListSortDirection.Descending ? -Math.Sign(order) : order;
            order = NaturalName();
            return order != 0 ? order : StringComparer.Ordinal.Compare(left.Path, right.Path);
            int NaturalName() => names.Compare(left.Name, right.Name, CompareOptions.IgnoreCase | CompareOptions.NumericOrdering);
        }
        static IEnumerable<TreeViewNode> Nodes(IEnumerable<TreeViewNode> nodes)
        {
            foreach (TreeViewNode node in nodes)
            {
                yield return node;
                foreach (TreeViewNode child in Nodes(node.Children)) yield return child;
            }
        }
    }
    private void FocusFile(InspectorFile? file)
    {
        if (file is not null && FilesList.ContainerFromItem(file) is Control item && item.Focus(FocusState.Keyboard))
            item.StartBringIntoView();
        else FilesList.Focus(FocusState.Keyboard);
    }
    private void FilesSelected(TreeView sender, TreeViewSelectionChangedEventArgs args) { FileFacts.Text = SelectedFileFacts(); UpdateAvailability(); }
    private string SelectedFileFacts()
    {
        IReadOnlyList<InspectorFile> selected = SelectedPaths();
        if (selected.Count == 0 || _files is null) return "";
        if (selected.Count == 1 && selected[0].Index >= 0) return selected[0].Facts;

        int[] indices = selected.SelectMany(file => file.Indices()).Distinct().ToArray();
        long length = 0;
        long completed = 0;
        string wanted = _files[indices[0]].Wanted;
        foreach (int index in indices)
        {
            InspectorFile file = _files[index];
            length += file.Length;
            completed += file.Completed;
            if (file.Wanted != wanted) wanted = "Mixed";
        }
        TorrentFormat format = TorrentFormat.Default;
        return $"{indices.Length:N0} files · Wanted {wanted} · {format.Size(completed)} / {format.Size(length)}";
    }
    private IReadOnlyList<InspectorFile> SelectedPaths()
    {
        if (FilesList is null) return [];
        InspectorFile[] selected = FilesList.SelectedItems.Cast<InspectorFile>().ToArray();
        return selected.Where(file => !selected.Any(parent => parent != file && file.Path.StartsWith(parent.Path + "/", StringComparison.Ordinal))).ToArray();
    }
    private async void DownloadFiles(object sender, RoutedEventArgs args) => await ChangeFiles(true, null);
    private async void SkipFiles(object sender, RoutedEventArgs args) => await ChangeFiles(false, null);
    private async void SetFilePriority(object sender, RoutedEventArgs args) => await ChangeFiles(null, (Priority)int.Parse((string)((MenuFlyoutItem)sender).Tag, CultureInfo.InvariantCulture));
    private async Task ChangeFiles(bool? wanted, Priority? priority)
    {
        if (!CanWrite || IsCommitting || _row is not { } row || _session is not { } session) return;
        int[] indices = SelectedPaths().SelectMany(file => file.Indices()).Distinct().Order().ToArray(); if (indices.Length == 0) return;
        _committing = true; UpdateAvailability();
        try { await session.Request(new TorrentSet(TorrentIds.Of(row.Hash)) { FilesWanted = wanted == true ? indices : null, FilesUnwanted = wanted == false ? indices : null, PriorityLow = priority == Priority.Low ? indices : null, PriorityNormal = priority == Priority.Normal ? indices : null, PriorityHigh = priority == Priority.High ? indices : null }); }
        catch (Exception error) { Error(error.Message); } finally { _committing = false; UpdateAvailability(); }
    }
    private async void RenameFile(object sender, RoutedEventArgs args) { if (ShowDialog is not null) await ShowDialog(RenameSelected); }
    private async Task RenameSelected()
    {
        IReadOnlyList<InspectorFile> selected = SelectedPaths();
        if (!CanWrite || IsCommitting || _row is not { } row || _session is not { } session || selected.Count != 1) return;
        InspectorFile file = selected[0];
        string hash = row.Hash;
        TextBox name = new() { Header = "Name", Text = file.Name };
        Dialogs.Form form = new(XamlRoot, file.Index < 0 ? "Rename folder" : "Rename file", "Rename");
        Icons.Set(form, Lucide.Pencil);
        const string nameHelp = "Enter one file or folder name without path separators";
        ToolTipService.SetToolTip(name, nameHelp);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetHelpText(name, nameHelp);
        TextBlock invalidName = new() { Text = "Invalid name", Visibility = Visibility.Collapsed };
        invalidName.SetBinding(TextBlock.ForegroundProperty, new Microsoft.UI.Xaml.Data.Binding
        {
            Source = EngineError,
            Path = new PropertyPath(nameof(TextBlock.Foreground)),
        });
        form.Fields.Children.Add(new TextBlock { Text = $"{row.Name}\n{file.Path}", TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true });
        form.Fields.Children.Add(name);
        form.Fields.Children.Add(invalidName);
        bool ValidName() => !string.IsNullOrWhiteSpace(name.Text) &&
            name.Text is not ("." or "..") && name.Text.IndexOfAny(['/', '\\', '\0']) < 0;
        name.TextChanged += (_, _) =>
        {
            invalidName.Visibility = ValidName() ? Visibility.Collapsed : Visibility.Visible;
            form.Validate();
        };
        form.CanApply = () => ValidName() && name.Text != file.Name && session.State is SessionState.Live &&
            session.Torrents.Rows.Any(candidate => candidate.Hash == hash && candidate.IsPresent);
        form.MakeReadOnly = () => name.IsReadOnly = true;
        form.UncertainMessage = "Could not confirm the rename";
        form.Observe(session, [hash]);
        form.SaveShortcut();
        form.Opened += (_, _) => { name.Focus(FocusState.Programmatic); name.SelectAll(); };
        form.Apply = async () =>
        {
            _committing = true;
            UpdateAvailability();
            try
            {
                await session.Request(new TorrentRenamePath(TorrentIds.Of(hash), file.Path, name.Text));
                return true;
            }
            catch (Exception error) when (error is not (RpcTransportException or OperationCanceledException))
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    if (!form.Cancellation.IsCancellationRequested && !form.IsWorking && name.IsEnabled)
                    {
                        name.Focus(FocusState.Programmatic);
                        name.SelectAll();
                    }
                });
                throw;
            }
            finally
            {
                _committing = false;
                UpdateAvailability();
            }
        };
        form.Validate();
        await form.ShowAsync();
    }
    private async void Reannounce(object sender, RoutedEventArgs args)
    {
        if (!CanWrite || IsCommitting || _row is not { } row || _session is not { } session) return;
        _committing = true;
        UpdateAvailability();
        try { await session.Request(new TorrentReannounce(TorrentIds.Of(row.Hash))); }
        catch (Exception error) { Error(error.Message); }
        finally { _committing = false; UpdateAvailability(); }
    }
    private void ShowSpeed()
    {
        if (_view != InspectorTab.Speed || _row is not { } row) return;
        IReadOnlyList<SpeedSample>? samples = _session?.SpeedHistory; SpeedChart.Update(samples);
        SpeedText.Text = $"Download {TorrentFormat.Default.Rate(row.DownloadSpeed)} (solid) · Upload {TorrentFormat.Default.Rate(row.UploadSpeed)} (dashed)";
        SpeedWindow.Text = samples is { Count: > 0 } ? $"{(samples[^1].Time - samples[0].Time).TotalSeconds:0} seconds · Peak download {TorrentFormat.Default.Rate(samples.Max(sample => sample.Download))} · Peak upload {TorrentFormat.Default.Rate(samples.Max(sample => sample.Upload))}" : "Collecting speed history…";
    }
    internal void FocusView()
    {
        if (IsCommitting) return;
        bool generalDraft = _edit is { Editor: Editor.General, Phase: EditPhase.Dirty };
        if (_row is null || (_view == InspectorTab.General && !generalDraft))
        {
            FocusNavigation();
            return;
        }
        if (_view == InspectorTab.General && generalDraft)
            Limits.IsExpanded = true;
        if (_view == InspectorTab.Trackers && _edit?.Editor == Editor.Trackers && TrackerEditor.IsEnabled)
        {
            TrackerEditor.FocusUrl();
            return;
        }
        Control target = _view switch
        {
            InspectorTab.General => Limits.IsExpanded && GeneralEditor.IsEnabled ? SessionLimits : Limits,
            InspectorTab.Files => FileSearch,
            InspectorTab.Peers => PeersList,
            InspectorTab.Trackers => TrackersList,
            InspectorTab.Speed => SpeedChart,
            _ => PiecesMap,
        };
        if (!target.IsEnabled || !target.Focus(FocusState.Keyboard)) FocusNavigation();
    }
    internal void FocusNavigation() => TorrentPage.FocusNavigation(Views);
    private async void InspectorKeyDown(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || Dialogs.HasPopup(this)) return;
        VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        bool control = modifiers == VirtualKeyModifiers.Control;
        bool alt = modifiers == VirtualKeyModifiers.Menu;
        bool reverse = modifiers == (VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift);
        if (args.Key == VirtualKey.F5 && modifiers == VirtualKeyModifiers.None && RetryDetails.IsEnabled)
        {
            args.Handled = true;
            RetryInspector(this, new());
            return;
        }
        if (alt && args.Key >= VirtualKey.Number1 && args.Key <= VirtualKey.Number6) { SelectView((InspectorTab)((int)args.Key - (int)VirtualKey.Number1)); FocusView(); args.Handled = true; return; }
        if ((control || reverse) && args.Key == VirtualKey.Tab) { SelectView((InspectorTab)(((int)_view + (reverse ? 5 : 1)) % 6)); FocusView(); args.Handled = true; return; }
        if (control && args.Key == VirtualKey.S && _edit is { } edit && ((edit.Editor == Editor.General && _view == InspectorTab.General && Limits.IsExpanded) || (edit.Editor == Editor.Trackers && _view == InspectorTab.Trackers))) { args.Handled = true; await SaveDraft(); return; }
        if (_view == InspectorTab.Files && control && args.Key == VirtualKey.F) { FileSearch.Focus(FocusState.Programmatic); args.Handled = true; }
        else if (_view == InspectorTab.Trackers && modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.F2) { EditTrackers(EditTrackersButton, new()); args.Handled = true; }
        else if (_view == InspectorTab.Files && modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.F2) { RenameFile(RenameButton, new()); args.Handled = true; }
        else if (_view == InspectorTab.Files && modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.Enter && TorrentPage.IsEditor(FocusManager.GetFocusedElement(XamlRoot) as DependencyObject)) { FilesList.Focus(FocusState.Programmatic); args.Handled = true; }
        else if (_view == InspectorTab.Files && modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.Enter && OpenFileButton.IsEnabled && TorrentPage.Within(FocusManager.GetFocusedElement(XamlRoot) as DependencyObject, FilesList)) { OpenFile(OpenFileButton, new()); args.Handled = true; }
        else if (_view == InspectorTab.Files && modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.Escape && FileSearch.Text.Length > 0) { FileSearch.Text = ""; FilesList.Focus(FocusState.Programmatic); args.Handled = true; }
        else if (control && args.Key == VirtualKey.C && !TorrentPage.IsEditor(FocusManager.GetFocusedElement(XamlRoot) as DependencyObject))
        {
            string? text = _view switch
            {
                InspectorTab.Files => string.Join(Environment.NewLine, SelectedPaths().Select(file => file.Path)),
                InspectorTab.Peers => (PeersList.Selection.Current as InspectorPeer)?.Address,
                InspectorTab.Trackers => _edit?.Editor == Editor.Trackers ? TrackerEditor.SelectedUrl : (TrackersList.Selection.Current as InspectorTracker)?.Value.Announce,
                _ => null,
            };
            if (!string.IsNullOrEmpty(text)) { Copy(text); args.Handled = true; }
        }
        else if (modifiers == VirtualKeyModifiers.None && args.Key == VirtualKey.Escape && _edit is not null)
        { args.Handled = true; if (await ResolveDraft() == DraftResolution.Accepted) { DiscardDraft(); if (_view == InspectorTab.Trackers) TrackersList.Focus(FocusState.Programmatic); else Limits.Focus(FocusState.Programmatic); } }
    }
    private void RetryInspector(object sender, RoutedEventArgs args)
    {
        if (RetryDetails.IsEnabled && !Dialogs.HasPopup(this)) _session?.Retry();
    }
    private void CloseInspector(object sender, RoutedEventArgs args) { if (!IsCommitting) CloseRequested?.Invoke(this, EventArgs.Empty); }
    private void OpenLocation(object sender, RoutedEventArgs args) { if (_local && _row is { } row) OpenFolder?.Invoke(row); }
    private void ChangeFolder(object sender, RoutedEventArgs args) => ChangeLocation?.Invoke();
    private void ShowStalledPeers(object sender, RoutedEventArgs args) { SelectView(InspectorTab.Peers); FocusView(); }
    private void ShowStalledPieces(object sender, RoutedEventArgs args) { SelectView(InspectorTab.Pieces); FocusView(); }
    private void CopyPath(object sender, RoutedEventArgs args) => Copy(LocationText.Text);
    private void CopyHash(object sender, RoutedEventArgs args) { if (_row is { } row) Copy(row.Hash); }
    private void CopyMagnet(object sender, RoutedEventArgs args) { if (General is { } value) Copy(value.MagnetLink); }
    private void Copy(string text) => CopyText?.Invoke(text);
    private void Error(string message) { ErrorBar.Severity = InfoBarSeverity.Error; ErrorBar.Message = message; ErrorBar.IsOpen = true; }
    internal static string Date(long seconds) => seconds > 0 ? TorrentFormat.Absolute(DateTimeOffset.FromUnixTimeSeconds(seconds)) : "Unknown";
}
public sealed class InspectorFile : INotifyPropertyChanged
{
    private readonly TorrentFile? _file;
    private FileStat? _stat;
    public event PropertyChangedEventHandler? PropertyChanged;
    public int Index { get; } = -1;
    public string Path { get; }
    public string Name => Path[(Path.LastIndexOf('/') + 1)..];
    public ObservableCollection<InspectorFile> Children { get; } = [];
    internal int? PriorityValue => _stat is { } stat ? (int)stat.Priority : null;
    internal int? WantedValue => _stat is { } stat ? stat.Wanted ? 2 : 0 : null;
    internal long Length => _file?.Length ?? Children.Sum(child => child.Length);
    internal int BeginPiece => _file?.BeginPiece ?? -1;
    internal int EndPiece => _file?.EndPiece ?? -1;
    internal long Completed => _file is { } file ? _stat?.BytesCompleted ?? file.BytesCompleted : Children.Sum(child => child.Completed);
    public string Size => TorrentFormat.Default.Size(Length);
    public string Progress => Length == 0 ? "0%" : ((double)Completed / Length).ToString("P0");
    public string Wanted => Index >= 0 ? _stat is null ? "Unknown" : _stat.Wanted ? "Yes" : "No" : Aggregate(child => child.Wanted);
    public string Priority => Index >= 0 ? _stat?.Priority.ToString() ?? "Unknown" : Aggregate(child => child.Priority);
    public string Facts => $"{Path} · Wanted {Wanted} · {Progress} · Size {Size} · Priority {Priority}";
    private string Aggregate(Func<InspectorFile, string> value) { string[] values = Children.Select(value).Distinct().ToArray(); return values.Length == 1 ? values[0] : "Mixed"; }
    public InspectorFile(int index, TorrentFile file) { Index = index; _file = file; Path = file.Name; }
    private InspectorFile(string path) => Path = path;
    internal static ObservableCollection<InspectorFile> Tree(IReadOnlyList<InspectorFile> files)
    {
        ObservableCollection<InspectorFile> roots = []; Dictionary<string, InspectorFile> folders = new(StringComparer.Ordinal);
        foreach (InspectorFile file in files) {
            ObservableCollection<InspectorFile> children = roots; string[] segments = file.Path.Split('/'); string path = "";
            for (int i = 0; i < segments.Length - 1; i++) { path = i == 0 ? segments[i] : path + "/" + segments[i]; if (!folders.TryGetValue(path, out InspectorFile? folder)) { folder = new(path); folders.Add(path, folder); children.Add(folder); } children = folder.Children; }
            children.Add(file); }
        return roots;
    }
    internal IEnumerable<int> Indices() { if (Index >= 0) { yield return Index; yield break; } foreach (InspectorFile child in Children) foreach (int index in child.Indices()) yield return index; }
    public void Update(FileStat stat) { if (_stat == stat) return; _stat = stat; Notify(); }
    internal void RefreshFolders() { if (Index >= 0) return; foreach (InspectorFile child in Children) child.RefreshFolders(); Notify(); }
    private void Notify() { foreach (string name in new[] { nameof(Progress), nameof(Size), nameof(Wanted), nameof(Priority), nameof(Facts) }) PropertyChanged?.Invoke(this, new(name)); }
}
public sealed class InspectorPeer(Peer peer)
{
    public Peer Value { get; } = peer;
    public string Address => Value.Address.Contains(':') ? $"[{Value.Address}]:{Value.Port}" : $"{Value.Address}:{Value.Port}";
    public string Client => string.IsNullOrWhiteSpace(Value.ClientName) ? "Unknown" : Value.ClientName;
    public string Progress => Value.Progress.ToString("P0");
    public string Download => TorrentFormat.Default.Rate(Value.RateToClient);
    public string Upload => TorrentFormat.Default.Rate(Value.RateToPeer);
    public string State => $"{(Value.IsIncoming ? "Incoming" : "Outgoing")} · {(Value.IsUtp ? "µTP" : "TCP")} · {(Value.IsEncrypted ? "Encrypted" : "Unencrypted")}";
    public string Facts
    {
        get
        {
            string download = $"{(Value.IsDownloadingFrom ? "Receiving" : "Not receiving")} · {(Value.ClientIsInterested ? "We are interested" : "We are not interested")} · {(Value.ClientIsChoked ? "Choked by peer" : "Unchoked by peer")}";
            string upload = $"{(Value.IsUploadingTo ? "Sending" : "Not sending")} · {(Value.PeerIsInterested ? "Peer interested" : "Peer not interested")} · {(Value.PeerIsChoked ? "Peer choked by us" : "Peer unchoked by us")}";
            return $"{Address}\nDownload: {download}\nUpload: {upload}";
        }
    }
}
public sealed class InspectorTracker(TrackerStat tracker)
{
    public TrackerStat Value { get; } = tracker;
    public string Address => $"Tier {Value.Tier + 1} · {(Value.IsBackup ? "Backup" : "Primary")} · {Value.Host}";
    public string State => Value.AnnounceState switch
    {
        TrackerState.Active => "Announcing",
        TrackerState.Queued => "Queued",
        _ => Outcome,
    };
    private string Outcome => !Value.HasAnnounced ? "Not contacted" : Value.LastAnnounceTimedOut ? "Timed out" : Value.LastAnnounceSucceeded ? "Success" : "Failed";
    public string Seeds => Count(Value.SeederCount);
    public string Leeches => Count(Value.LeecherCount);
    public string Next
    {
        get
        {
            if (Value.AnnounceState == TrackerState.Inactive) return "Not scheduled";
            if (Value.AnnounceState is TrackerState.Active or TrackerState.Queued) return "—";
            if (Value.NextAnnounceTime <= 0) return "Unknown";
            TimeSpan remaining = DateTimeOffset.FromUnixTimeSeconds(Value.NextAnnounceTime) - DateTimeOffset.UtcNow;
            if (remaining.Duration().TotalDays >= 365) return InspectorView.Date(Value.NextAnnounceTime);
            return remaining > TimeSpan.Zero ? $"In {TorrentFormat.Duration(remaining)}" : $"Due {TorrentFormat.Duration(-remaining)} ago";
        }
    }
    public string Facts
    {
        get
        {
            var announce = Value.HasAnnounced ? InspectorView.Date(Value.LastAnnounceTime) : "Not contacted";
            if (Value.HasAnnounced)
            {
                announce += " · " + Outcome;
                if (!string.IsNullOrWhiteSpace(Value.LastAnnounceResult) && !string.Equals(Value.LastAnnounceResult, Outcome, StringComparison.OrdinalIgnoreCase))
                    announce += " · " + Value.LastAnnounceResult;
            }
            var peers = Value.HasAnnounced ? Count(Value.LastAnnouncePeerCount) : "Unknown";
            var scrape = Value.HasScraped ? InspectorView.Date(Value.LastScrapeTime) : "Not contacted";
            if (Value.HasScraped && !string.IsNullOrWhiteSpace(Value.LastScrapeResult))
                scrape += " · " + Value.LastScrapeResult;
            string next = Value.AnnounceState == TrackerState.Waiting && Value.NextAnnounceTime > 0 ? $"\nNext announce {InspectorView.Date(Value.NextAnnounceTime)}" : "";
            return $"{Value.Announce}\nLast announce {announce} · Returned peers {peers}{next}\nLast scrape {scrape}";
        }
    }
    private static string Count(int value) => value < 0 ? "Unknown" : value.ToString("N0");
}

