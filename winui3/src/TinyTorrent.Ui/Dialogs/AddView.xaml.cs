using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.Windows.Storage.Pickers;
using Synapse;
using TinyTorrent;
using Transmission;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;

namespace TinyTorrent_Ui;

internal sealed record AddFile(int Index, string Name, long Length, string Size)
{
    public string FileName => Name[(Name.LastIndexOf('/') + 1)..];
    public string ParentPath => Name.Contains('/') ? Name[..Name.LastIndexOf('/')] : string.Empty;
}

public sealed partial class AddView : UserControl
{
    private readonly Session _session;
    private readonly nint _hwnd;
    private readonly Dialogs.Form _dialog;
    private readonly object _defaultMaxWidth;
    private readonly HashSet<int> _wanted = [];
    private Source? _source;
    private TorrentRef? _result;
    private DiskSpace? _space;
    private readonly ScrollViewer _viewport;
    private bool _publishing;
    private bool _arranging;

    internal AddView(Session session, XamlRoot root, nint hwnd, bool isLocal, string connectionName)
    {
        InitializeComponent();
        _session = session;
        _hwnd = hwnd;
        _dialog = new Dialogs.Form(root, "Add torrent", "Add") { Body = this, Apply = Commit };
        _viewport = (ScrollViewer)_dialog.Content;
        _defaultMaxWidth = Application.Current.Resources["ContentDialogMaxWidth"];
        _dialog.CanApply = () => _source is not null && Dialogs.Absolute(Destination) &&
            (_source is not FileSource || _wanted.Count != 0) && _session.State is SessionState.Live;
        _dialog.KeyDown += OnDialogKey;
        _viewport.SizeChanged += OnLayoutChanged;
        Files.MaxHeight = root.Size.Height;
        _dialog.Closed += (_, _) =>
        {
            _viewport.SizeChanged -= OnLayoutChanged;
        };
        _dialog.UncertainMessage = "Could not confirm addition.";
        _dialog.MakeReadOnly = () =>
        {
            LinkInput.IsReadOnly = RemotePath.IsReadOnly = Search.IsReadOnly = true;
            BrowseButton.IsEnabled = PasteButton.IsEnabled = ChangeButton.IsEnabled = SpaceButton.IsEnabled = false;
            AllButton.IsEnabled = NoneButton.IsEnabled = Files.IsEnabled = StartDownloading.IsEnabled = false;
        };
        LocalDestination.Visibility = isLocal ? Visibility.Visible : Visibility.Collapsed;
        RemotePath.Visibility = isLocal ? Visibility.Collapsed : Visibility.Visible;
        RemotePath.Header = "Folder on " + connectionName;
        RemotePath.AccessKey = isLocal ? string.Empty : "D";
        ToolTipService.SetToolTip(RemotePath, "This folder is on the remote computer.");
        AutomationProperties.SetHelpText(RemotePath, "This folder is on the remote computer.");
        Icons.Set(BrowseButton, Lucide.FolderOpen);
        Icons.Set(PasteButton, Lucide.ClipboardPaste);
        Icons.Set(ChangeButton, Lucide.FolderOpen);
        Icons.Set(CopyButton, Lucide.Copy);
        Icons.Set(SpaceButton, Lucide.HardDrive);
        Icons.Set(AllButton, Lucide.ListChecks);
        Icons.Set(NoneButton, Lucide.Square);
        Icons.Set(_dialog, Lucide.Plus);
        Loaded += (_, _) => Arrange();
        _dialog.Validate();
    }

    internal async Task<TorrentRef?> Show(string? source, AddAction action)
    {
        if (action == AddAction.Browse)
        {
            source = await PickFile();
            if (source is null)
            {
                return null;
            }
        }
        _dialog.Opened += async (_, _) =>
        {
            await _dialog.Work(async () =>
            {
                var defaults = await _session.Request(new SessionGet<AddDefaults>(), _dialog.Cancellation);
                RemotePath.Text = defaults.DownloadDir;
                StartDownloading.IsChecked = defaults.StartAddedTorrents;
            });
            if (_dialog.Cancellation.IsCancellationRequested)
                return;
            if (source is not null)
            {
                if (Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Scheme is "magnet" or "http" or "https")
                    EnterLink(source);
                else
                    await _dialog.Work(() => ReadFile(source));
            }
            else if (action == AddAction.Paste)
                await Paste();
            if (!_dialog.Cancellation.IsCancellationRequested)
                (LinkPanel.Visibility == Visibility.Visible ? LinkInput : (Control)BrowseButton).Focus(FocusState.Programmatic);
        };
        _dialog.Observe(_session);
        await _dialog.ShowAsync();
        return _result;
    }

    private string Destination => RemotePath.Text.Trim();

    public static Visibility TextVisibility(string text) => text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;

    private async Task Browse()
    {
        await _dialog.Work(async () =>
        {
            var path = await PickFile();
            if (path is not null)
                await ReadFile(path);
        });
        if (!_dialog.Cancellation.IsCancellationRequested)
            BrowseButton.Focus(FocusState.Programmatic);
    }

    private async Task<string?> PickFile()
    {
        var picker = new FileOpenPicker(Win32Interop.GetWindowIdFromWindow(_hwnd));
        picker.FileTypeFilter.Add(".torrent");
        return (await picker.PickSingleFileAsync())?.Path;
    }

    private async Task ReadFile(string path)
    {
        try
        {
            var bytes = await File.ReadAllBytesAsync(path, _dialog.Cancellation);
            var metadata = await Task.Run(() => Metainfo.Read(bytes));
            _dialog.Cancellation.ThrowIfCancellationRequested();
            var name = metadata[0].Name;
            var separator = name.IndexOf('/');
            if (separator >= 0)
                name = name[..separator];
            var files = metadata.Select((file, index) => new AddFile(index,
                separator >= 0 ? file.Name[(separator + 1)..] : file.Name,
                file.Length, _session.Torrents.Format.Size(file.Length))).ToArray();
            var source = new FileSource(name, bytes, files);
            _dialog.Cancellation.ThrowIfCancellationRequested();
            ResetSource();
            _source = source;
            LinkPanel.Visibility = UnknownFiles.Visibility = Visibility.Collapsed;
            SourceName.Text = name;
            SourceName.Visibility = Visibility.Visible;
            ToolTipService.SetToolTip(SourceName, Path.GetFileName(path));
            AutomationProperties.SetHelpText(SourceName, Path.GetFileName(path));
            _wanted.UnionWith(files.Select(file => file.Index));
            FileRegion.Visibility = Visibility.Visible;
            PublishFiles();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            throw new InvalidOperationException($"Could not read “{Path.GetFileName(path)}”: {exception.Message}", exception);
        }
    }

    private async Task Paste()
    {
        await _dialog.Work(async () =>
        {
            var content = Clipboard.GetContent();
            EnterLink(content.Contains(StandardDataFormats.Text) ? await content.GetTextAsync() : string.Empty);
        });
        if (!_dialog.Cancellation.IsCancellationRequested)
            LinkInput.Focus(FocusState.Programmatic);
    }

    private void EnterLink(string text)
    {
        LinkPanel.Visibility = Visibility.Visible;
        LinkInput.Text = text;
        ReadLink();
        LinkInput.Focus(FocusState.Programmatic);
    }

    private void ReadLink()
    {
        ResetSource();
        FileRegion.Visibility = Visibility.Collapsed;
        _dialog.Resources["ContentDialogMaxWidth"] = _defaultMaxWidth;
        ClearValue(MaxWidthProperty);
        var value = LinkInput.Text.Trim();
        SourceName.Visibility = UnknownFiles.Visibility = Visibility.Collapsed;
        LinkError.Text = string.Empty;
        if (value.Length == 0)
        {
            _dialog.Validate();
            return;
        }
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("magnet" or "http" or "https") ||
            (uri.Scheme != "magnet" && uri.Host.Length == 0))
        {
            LinkError.Text = "A magnet link, HTTP URL, or HTTPS URL is required.";
        }
        else
        {
            string name;
            if (uri.Scheme == "magnet")
            {
                var query = uri.Query.TrimStart('?').Split('&');
                if (!Metainfo.HasMagnetHash(uri.Query))
                {
                    LinkError.Text = "A valid torrent info hash is required.";
                    _dialog.Validate();
                    return;
                }
                var displayName = query.FirstOrDefault(part => part.StartsWith("dn=", StringComparison.OrdinalIgnoreCase));
                name = displayName is null ? "Magnet torrent" : Uri.UnescapeDataString(displayName[3..].Replace('+', ' '));
            }
            else
            {
                var file = Uri.UnescapeDataString(uri.AbsolutePath.Split('/').Last());
                name = file.Length == 0 ? uri.Host : file + " · " + uri.Host;
            }
            _source = new LinkSource(name, value);
            SourceName.Text = name;
            SourceName.Visibility = UnknownFiles.Visibility = Visibility.Visible;
            ToolTipService.SetToolTip(SourceName, value);
            AutomationProperties.SetHelpText(SourceName, value);
        }
        _dialog.Validate();
    }

    private void ResetSource()
    {
        _source = null;
        _wanted.Clear();
        _publishing = true;
        try
        {
            Search.Text = string.Empty;
            Files.ItemsSource = null;
        }
        finally { _publishing = false; }
        SelectionSummary.Text = string.Empty;
        SpaceWarning.IsOpen = false;
        if (_space is not null)
            SpaceResult.Text = _session.Torrents.Format.Size(_space.SizeBytes) + " available";
    }

    private void PublishFiles()
    {
        _publishing = true;
        try
        {
            var rows = _source is FileSource file ? file.Files : [];
            var search = Search.Text.Trim();
            Files.ItemsSource = rows.Where(row => row.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToArray();
            foreach (AddFile row in Files.Items)
                if (_wanted.Contains(row.Index))
                    Files.SelectedItems.Add(row);
        }
        finally { _publishing = false; }
        Summary();
    }

    private void Summary()
    {
        if (_source is not FileSource file)
            return;
        var size = file.Files.Where(row => _wanted.Contains(row.Index)).Sum(row => row.Length);
        var summary = $"{_wanted.Count:N0} of {file.Files.Length:N0} selected · {_session.Torrents.Format.Size(size)}";
        SelectionSummary.Text = summary;
        if (_wanted.Count == 0)
        {
            SelectionSummary.Text += " · At least one file required";
        }
        if (_space is not null)
        {
            SpaceWarning.IsOpen = size > _space.SizeBytes;
            SpaceWarning.Message = $"Selected {_session.Torrents.Format.Size(size)}; only {_session.Torrents.Format.Size(_space.SizeBytes)} available.";
            SpaceResult.Text = SpaceWarning.IsOpen ? string.Empty : _session.Torrents.Format.Size(_space.SizeBytes) + " available";
        }
        _dialog.Validate();
        Arrange();
    }

    private async Task<bool> Commit()
    {
        var source = _source;
        var destination = Destination;
        var paused = StartDownloading.IsChecked != true;
        if (source is null || !Dialogs.Absolute(destination) || source is FileSource && _wanted.Count == 0)
            return false;
        var unwanted = source is FileSource selected ? selected.Files.Where(file => !_wanted.Contains(file.Index)).Select(file => file.Index).ToArray() : null;
        _dialog.Message("Adding…", InfoBarSeverity.Informational);
        var metainfo = source is FileSource file ? await Task.Run(() => Convert.ToBase64String(file.Bytes)) : null;
        var result = await _session.Request(new TorrentAdd
        {
            Filename = source is LinkSource link ? link.Link : null,
            Metainfo = metainfo, DownloadDir = destination, Paused = paused, FilesUnwanted = unwanted
        });
        if (!result.IsDuplicate)
        {
            _result = result.Torrent;
            return true;
        }
        _dialog.KeyDown -= OnDialogKey;
        _dialog.Body = new TextBlock { Text = result.Torrent.Name, TextWrapping = TextWrapping.Wrap };
        _dialog.Message("This torrent is already in your list", InfoBarSeverity.Warning);
        _dialog.PrimaryButtonText = "Show";
        _dialog.CloseButtonText = "Close";
        _dialog.CanApply = () => true;
        _dialog.Apply = () => { _result = result.Torrent; return Task.FromResult(true); };
        Icons.Set(_dialog, Lucide.ArrowUpRight);
        return false;
    }

    private async void OnBrowse(object sender, RoutedEventArgs args) => await Browse();
    private async void OnPaste(object sender, RoutedEventArgs args) => await Paste();
    private void OnLinkChanged(object sender, TextChangedEventArgs args) { if (_dialog is not null) ReadLink(); }
    private void OnSearch(object sender, TextChangedEventArgs args) { if (_dialog is not null && !_publishing) PublishFiles(); }
    private void OnAll(object sender, RoutedEventArgs args)
    {
        if (_source is FileSource file) _wanted.UnionWith(file.Files.Select(row => row.Index));
        PublishFiles();
    }
    private void OnNone(object sender, RoutedEventArgs args) { _wanted.Clear(); PublishFiles(); }
    private void OnSelectionChanged(object sender, SelectionChangedEventArgs args)
    {
        if (_publishing || _dialog is null) return;
        foreach (AddFile row in args.RemovedItems) _wanted.Remove(row.Index);
        foreach (AddFile row in args.AddedItems) _wanted.Add(row.Index);
        Summary();
    }

    private async void OnChange(object sender, RoutedEventArgs args)
    {
        await _dialog.Work(async () =>
        {
            var folder = await new FolderPicker(Win32Interop.GetWindowIdFromWindow(_hwnd)).PickSingleFolderAsync();
            if (folder is not null) RemotePath.Text = folder.Path;
        });
        if (!_dialog.Cancellation.IsCancellationRequested) ChangeButton.Focus(FocusState.Programmatic);
    }
    private void OnPathChanged(object sender, TextChangedEventArgs args)
    {
        if (_dialog is null) return;
        var path = Destination;
        var trimmed = path.TrimEnd('\\', '/');
        var separator = Math.Max(trimmed.LastIndexOf('\\'), trimmed.LastIndexOf('/'));
        FolderParent.Text = separator >= 0 ? trimmed[..(separator + 1)] : string.Empty;
        FolderLeaf.Text = path.Length == 0 ? "No folder selected" : trimmed.Length == 0 ? path : trimmed[(separator + 1)..];
        ToolTipService.SetToolTip(PathDisplay, path);
        AutomationProperties.SetName(PathDisplay, path);
        ChangeButton.Content = path.Length == 0 ? "Browse" : "Change";
        Icons.Set(ChangeButton, Lucide.FolderOpen);
        CopyButton.IsEnabled = path.Length != 0;
        SpaceButton.IsEnabled = Dialogs.Absolute(path);
        _space = null;
        SpaceWarning.IsOpen = false;
        SpaceResult.Text = string.Empty;
        _dialog.Validate();
    }
    private void OnCopy(object sender, RoutedEventArgs args)
    {
        var data = new DataPackage(); data.SetText(Destination); Clipboard.SetContent(data);
    }
    private async void OnCheckSpace(object sender, RoutedEventArgs args)
    {
        await _dialog.Work(async () =>
        {
            var path = Destination;
            _space = null;
            SpaceWarning.IsOpen = false;
            SpaceResult.Text = "Checking…";
            try
            {
                var space = await _session.Request(new FreeSpace(path), _dialog.Cancellation);
                if (Destination == path)
                {
                    _space = space;
                    SpaceResult.Text = _session.Torrents.Format.Size(space.SizeBytes) + " available";
                    Summary();
                }
            }
            catch (Exception exception)
            {
                if (!_dialog.Cancellation.IsCancellationRequested && Destination == path)
                    SpaceResult.Text = "Space unavailable: " + exception.Message;
            }
        });
    }

    private void OnLayoutChanged(object sender, SizeChangedEventArgs args) => Arrange();
    private void Arrange()
    {
        if (PathDisplay.ActualWidth > 0) FolderLeaf.MaxWidth = PathDisplay.ActualWidth;
        if (_arranging || _source is not FileSource) return;
        _arranging = true;
        try
        {
            var widthChrome = Math.Max(0, _dialog.ActualWidth - _viewport.ActualWidth);
            _dialog.Resources["ContentDialogMaxWidth"] = 800d + widthChrome;
            MaxWidth = 800;
            int first = Files.ItemsPanelRoot is ItemsStackPanel panel ? Math.Max(0, panel.FirstVisibleIndex) : 0;
            var row = Files.ContainerFromIndex(first) as FrameworkElement;
            double rowHeight = row is { ActualHeight: > 0 } ? row.ActualHeight : (double)Application.Current.Resources["ListViewItemMinHeight"];
            var content = (FrameworkElement)_viewport.Content;
            var siblings = Math.Max(0, content.ActualHeight - ActualHeight);
            var height = _viewport.ViewportHeight - siblings;
            var other = SourceRegion.ActualHeight + DestinationRegion.ActualHeight + 2 * MainView.Spacing;
            var available = height - other - FileTools.ActualHeight - FileRegion.RowSpacing;
            var listChrome = Files.Padding.Top + Files.Padding.Bottom + Files.BorderThickness.Top + Files.BorderThickness.Bottom;
            Files.MaxHeight = Math.Max(rowHeight + listChrome, available);
        }
        finally { _arranging = false; }
    }

    private void OnSearchKey(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || Dialogs.Modifiers != VirtualKeyModifiers.None || Dialogs.HasPopup(_dialog)) return;
        if (args.Key == VirtualKey.Enter) { Files.Focus(FocusState.Keyboard); args.Handled = true; }
        else if (args.Key == VirtualKey.Escape) { Search.Text = string.Empty; Files.Focus(FocusState.Keyboard); args.Handled = true; }
    }
    private void OnFilesKey(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || Dialogs.HasPopup(_dialog)) return;
        VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        if (args.Key == VirtualKey.Enter && modifiers == VirtualKeyModifiers.None) args.Handled = true;
        if (args.Key == VirtualKey.A && modifiers == VirtualKeyModifiers.Control) { OnAll(sender, new RoutedEventArgs()); args.Handled = true; }
    }
    private void OnDialogKey(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || _dialog.IsWorking || Dialogs.HasPopup(_dialog)) return;
        VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        if (args.Key == VirtualKey.F && modifiers == VirtualKeyModifiers.Control && _source is FileSource)
        {
            Search.Focus(FocusState.Keyboard); args.Handled = true;
        }
        else if (args.Key == VirtualKey.F && modifiers == VirtualKeyModifiers.Menu && _source is FileSource)
        {
            Files.Focus(FocusState.Keyboard);
            args.Handled = true;
        }
        else if (args.Key == VirtualKey.A && modifiers == VirtualKeyModifiers.Menu) { _dialog.InvokePrimary(); args.Handled = true; }
        else if (args.Key == VirtualKey.N && modifiers == VirtualKeyModifiers.Menu && _source is FileSource) { OnNone(sender, new RoutedEventArgs()); args.Handled = true; }
        else if (args.Key == VirtualKey.F6 && modifiers is VirtualKeyModifiers.None or VirtualKeyModifiers.Shift)
        {
            Control navigationTarget = LinkPanel.Visibility == Visibility.Visible ? LinkInput : BrowseButton;
            var focused = FocusManager.GetFocusedElement(_dialog.XamlRoot) as DependencyObject;
            var navigation = Within(focused, SourceRegion) || Within(focused, Search);
            var content = Within(focused, FileRegion) || Within(focused, DestinationRegion);
            if (modifiers == VirtualKeyModifiers.Shift)
            {
                if (navigation) _dialog.FocusFooter();
                else if (content) navigationTarget.Focus(FocusState.Keyboard);
                else FocusContent();
            }
            else
            {
                if (navigation) FocusContent();
                else if (content) _dialog.FocusFooter();
                else navigationTarget.Focus(FocusState.Keyboard);
            }
            args.Handled = true;
        }
    }
    private void FocusContent()
    {
        if (_source is FileSource) Files.Focus(FocusState.Keyboard);
        else if (LocalDestination.Visibility == Visibility.Visible) ChangeButton.Focus(FocusState.Keyboard);
        else RemotePath.Focus(FocusState.Keyboard);
    }
    private static bool Within(DependencyObject? element, DependencyObject owner)
    {
        while (element is not null)
        {
            if (ReferenceEquals(element, owner)) return true;
            element = VisualTreeHelper.GetParent(element);
        }
        return false;
    }
    private abstract record Source(string Name);
    private sealed record FileSource(string Name, byte[] Bytes, AddFile[] Files) : Source(Name);
    private sealed record LinkSource(string Name, string Link) : Source(Name);
    private sealed record AddDefaults(string DownloadDir, bool StartAddedTorrents);
}
