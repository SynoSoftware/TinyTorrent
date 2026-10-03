using Microsoft.UI;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Media;
using Microsoft.Windows.Storage.Pickers;
using Synapse;
using TinyTorrent;
using Transmission;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;
using Windows.UI.Core;
using Torrent = TinyTorrent.Torrent;

namespace TinyTorrent_Ui;

internal enum AddAction { None, Browse, Paste }

internal static class Dialogs
{
    public static Task<TorrentRef?> ShowAdd(Session session, XamlRoot root, nint hwnd,
        bool isLocal, string connectionName, string? source = null, AddAction action = AddAction.None) =>
        new AddView(session, root, hwnd, isLocal, connectionName).Show(source, action);

    public static async Task ShowLocation(Session session, XamlRoot root, IReadOnlyList<Torrent> torrents,
        nint hwnd, bool isLocal, string connectionName)
    {
        if (torrents.Count == 0)
            return;
        var hashes = torrents.Select(torrent => torrent.Hash).ToArray();
        var ids = TorrentIds.Of(hashes);
        var path = new TextBox { Header = "Folder on " + connectionName, Visibility = isLocal ? Visibility.Collapsed : Visibility.Visible, AccessKey = isLocal ? string.Empty : "D" };
        var move = new CheckBox { Content = "Move files", IsChecked = true, AccessKey = "M" };
        Help(path, "This folder is on the remote computer.");
        Help(move, "Move existing files to this folder. Turn off to find files already stored there.");
        var form = new Form(root, "Download location", "Save");
        Icons.Set(form, Lucide.Save);
        var local = new StackPanel { Spacing = 8, Visibility = isLocal ? Visibility.Visible : Visibility.Collapsed };
        local.Children.Add(new TextBlock { Text = "Folder" });
        var row = new Grid { ColumnSpacing = 8 };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var display = new Grid { ColumnSpacing = 2, VerticalAlignment = VerticalAlignment.Center };
        display.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        display.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var parent = new TextBlock { TextTrimming = TextTrimming.CharacterEllipsis };
        var leaf = new TextBlock { Text = "No folder selected", TextTrimming = TextTrimming.CharacterEllipsis };
        Grid.SetColumn(leaf, 1);
        display.Children.Add(parent);
        display.Children.Add(leaf);
        display.SizeChanged += (_, _) => { if (display.ActualWidth > 0) leaf.MaxWidth = display.ActualWidth; };
        var change = new Button { Content = "Change", AccessKey = "D" };
        var copy = new Button { Content = "Copy", IsEnabled = false };
        Icons.Set(change, Lucide.FolderOpen);
        Icons.Set(copy, Lucide.Copy);
        Help(change, "Choose a folder on this computer.");
        Help(copy, "Copy the full folder path.");
        Grid.SetColumn(copy, 1);
        row.Children.Add(change);
        row.Children.Add(copy);
        local.Children.Add(display);
        local.Children.Add(row);
        path.TextChanged += (_, _) =>
        {
            var value = path.Text.Trim();
            var trimmed = value.TrimEnd('/', '\\');
            var separator = Math.Max(trimmed.LastIndexOf('/'), trimmed.LastIndexOf('\\'));
            parent.Text = separator >= 0 ? trimmed[..(separator + 1)] : string.Empty;
            leaf.Text = value.Length == 0 ? "No folder selected" : trimmed.Length == 0 ? value : trimmed[(separator + 1)..];
            Help(display, value);
            AutomationProperties.SetName(display, value);
            copy.IsEnabled = value.Length != 0;
            form.Validate();
        };
        change.Click += async (_, _) =>
        {
            await form.Work(async () =>
            {
                var picker = new FolderPicker(Win32Interop.GetWindowIdFromWindow(hwnd));
                var folder = await picker.PickSingleFolderAsync();
                if (folder is not null) path.Text = folder.Path;
            });
            if (!form.Cancellation.IsCancellationRequested) change.Focus(FocusState.Programmatic);
        };
        copy.Click += (_, _) =>
        {
            var content = new DataPackage();
            content.SetText(path.Text.Trim());
            Clipboard.SetContent(content);
        };
        form.Fields.Children.Add(Identity(torrents));
        form.Fields.Children.Add(local);
        form.Fields.Children.Add(path);
        form.Fields.Children.Add(move);
        var space = Space(session, path, form);
        form.CanApply = () => Absolute(path.Text.Trim()) && Available(session, hashes);
        form.MakeReadOnly = () =>
        {
            path.IsReadOnly = true;
            move.IsEnabled = change.IsEnabled = space.IsEnabled = false;
        };
        form.SaveShortcut();
        form.Observe(session, hashes);
        form.Load(session, async () =>
        {
            var result = await session.Request(new TorrentGet<LocationFields>(ids), form.Cancellation);
            if (result.Torrents.Count != hashes.Length)
                throw new InvalidOperationException("Selected torrents removed");
            string first = result.Torrents[0].DownloadDir;
            bool mixed = result.Torrents.Any(torrent => !string.Equals(torrent.DownloadDir, first, StringComparison.Ordinal));
            path.Text = mixed ? string.Empty : first;
            if (mixed)
            {
                if (isLocal) leaf.Text = "Multiple folders";
                else form.Message("Multiple folders", InfoBarSeverity.Informational);
            }
            form.Apply = async () =>
            {
                var destination = path.Text.Trim();
                var moveFiles = move.IsChecked == true;
                await session.Request(new TorrentSetLocation(ids, destination, moveFiles));
                return true;
            };
        }, isLocal ? change : path);
        form.Validate();
        await form.ShowAsync();
    }

    public static async Task ShowLabels(Session session, XamlRoot root, IReadOnlyList<Torrent> torrents)
    {
        if (torrents.Count == 0)
            return;
        var hashes = torrents.Select(torrent => torrent.Hash).ToArray();
        var ids = TorrentIds.Of(hashes);
        var labels = new TextBox { Header = "Labels", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
        Help(labels, "One label per line. Replaces labels on every selected torrent. Leave empty to remove all labels.");
        var form = new Form(root, "Labels", "Save") { DefaultButton = ContentDialogButton.None };
        Icons.Set(form, Lucide.Save);
        form.Fields.Children.Add(Identity(torrents));
        form.Fields.Children.Add(labels);
        form.CanApply = () => Available(session, hashes);
        form.MakeReadOnly = () => labels.IsReadOnly = true;
        form.SaveShortcut();
        form.Observe(session, hashes);
        form.Load(session, async () =>
        {
            var result = await session.Request(new TorrentGet<LabelFields>(ids), form.Cancellation);
            if (result.Torrents.Count != hashes.Length)
                throw new InvalidOperationException("Selected torrents removed");
            var common = result.Torrents[0].Labels.AsEnumerable();
            var first = result.Torrents[0].Labels.ToHashSet(StringComparer.Ordinal);
            bool mixed = result.Torrents.Any(torrent => !first.SetEquals(torrent.Labels));
            foreach (var torrent in result.Torrents.Skip(1))
                common = common.Intersect(torrent.Labels, StringComparer.Ordinal);
            labels.Text = string.Join(Environment.NewLine, common);
            if (mixed)
            {
                form.Message("Different labels", InfoBarSeverity.Informational);
                form.PrimaryButtonText = "Replace";
            }
            form.Apply = async () =>
            {
                var values = labels.Text.Split('\n').Select(label => label.Trim())
                    .Where(label => label.Length != 0).Distinct(StringComparer.Ordinal).ToArray();
                await session.Request(new TorrentSet(ids) { Labels = values });
                return true;
            };
        }, labels);
        form.Validate();
        await form.ShowAsync();
    }

    private static TextBlock Identity(IReadOnlyList<Torrent> torrents) => new()
    {
        Text = torrents.Count == 1 ? torrents[0].Name : $"{torrents.Count:N0} selected torrents",
        Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"],
        TextWrapping = TextWrapping.Wrap,
        IsTextSelectionEnabled = true
    };

    private static bool Available(Session session, IReadOnlyList<string> hashes) => session.State is SessionState.Live &&
        hashes.All(hash => session.Torrents.Rows.Any(row => row.Hash == hash));

    private static void Help(DependencyObject control, string text)
    {
        ToolTipService.SetToolTip(control, text);
        AutomationProperties.SetHelpText(control, text);
    }

    internal static VirtualKeyModifiers Modifiers
    {
        get
        {
            VirtualKeyModifiers modifiers = VirtualKeyModifiers.None;
            if (Down(VirtualKey.Control)) modifiers |= VirtualKeyModifiers.Control;
            if (Down(VirtualKey.Shift)) modifiers |= VirtualKeyModifiers.Shift;
            if (Down(VirtualKey.Menu)) modifiers |= VirtualKeyModifiers.Menu;
            if (Down(VirtualKey.LeftWindows) || Down(VirtualKey.RightWindows)) modifiers |= VirtualKeyModifiers.Windows;
            return modifiers;
        }
    }

    private static bool Down(VirtualKey key) =>
        (InputKeyboardSource.GetKeyStateForCurrentThread(key) & CoreVirtualKeyStates.Down) != 0;

    internal static bool HasPopup(FrameworkElement scope)
    {
        foreach (var popup in VisualTreeHelper.GetOpenPopupsForXamlRoot(scope.XamlRoot))
        {
            if (!popup.IsOpen || popup.Child is null or ToolTip) continue;
            DependencyObject? content = scope is ContentDialog dialog
                ? dialog.Content as DependencyObject ?? dialog : scope;
            while (content is not null && !ReferenceEquals(content, popup.Child))
                content = VisualTreeHelper.GetParent(content);
            if (content is null) return true;
        }
        return false;
    }

    internal static bool Absolute(string value) => value.StartsWith('/') ||
        (value.Length >= 3 && char.IsAsciiLetter(value[0]) && value[1] == ':' && value[2] is '\\' or '/') ||
        (value.StartsWith("\\\\", StringComparison.Ordinal) && value.Length > 2);

    private static Button Space(Session session, TextBox path, Form form)
    {
        var text = new TextBlock { TextWrapping = TextWrapping.Wrap };
        var check = new Button { Content = "Check space" };
        Icons.Set(check, Lucide.HardDrive);
        var panel = new StackPanel { Spacing = 8 };
        panel.Children.Add(check);
        panel.Children.Add(text);
        path.TextChanged += (_, _) =>
        {
            text.Text = string.Empty;
            check.IsEnabled = Absolute(path.Text.Trim());
        };
        check.IsEnabled = Absolute(path.Text.Trim());
        check.Click += async (_, _) => await form.Work(async () =>
        {
            var requestedPath = path.Text.Trim();
            text.Text = "Checking space…";
            Help(text, requestedPath);
            try
            {
                var space = await session.Request(new FreeSpace(requestedPath), form.Cancellation);
                if (path.Text.Trim() == requestedPath)
                    text.Text = session.Torrents.Format.Size(space.SizeBytes) + " available";
            }
            catch (Exception)
            {
                if (!form.Cancellation.IsCancellationRequested && path.Text.Trim() == requestedPath)
                    text.Text = "Free space unavailable";
            }
        });
        form.Fields.Children.Add(panel);
        return check;
    }


    private sealed record LabelFields(IReadOnlyList<string> Labels);
    private sealed record LocationFields(string DownloadDir);

    internal sealed class Form : ContentDialog
    {
        private readonly InfoBar _notice = new() { IsClosable = false };
        private readonly TextBlock _availability = new() { Visibility = Visibility.Collapsed };
        private readonly ProgressRing _progress = new() { Visibility = Visibility.Collapsed };
        private readonly ContentControl _fields = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
        private readonly CancellationTokenSource _lifetime = new();
        private WorkState _state;

        public Form(XamlRoot root, string title, string primary)
        {
            XamlRoot = root;
            Cancellation = _lifetime.Token;
            Title = title;
            PrimaryButtonText = primary;
            CloseButtonText = "Cancel";
            DefaultButton = ContentDialogButton.Primary;
            Icons.Set(this);
            var content = new StackPanel { Spacing = 12 };
            AutomationProperties.SetLiveSetting(_availability, AutomationLiveSetting.Polite);
            _fields.Content = Fields;
            content.Children.Add(_availability);
            content.Children.Add(_fields);
            content.Children.Add(_progress);
            content.Children.Add(_notice);
            Content = new ScrollViewer
            {
                Content = content,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                IsTabStop = false
            };
            Closing += (_, args) => args.Cancel = _state == WorkState.Writing;
            Closed += (_, _) =>
            {
                _lifetime.Cancel();
                _lifetime.Dispose();
            };
            PrimaryButtonClick += async (_, args) =>
            {
                var deferral = args.GetDeferral();
                args.Cancel = true;
                try
                {
                    if (Apply is not null)
                        await Work(async () => args.Cancel = !await Apply(), commit: true);
                }
                finally
                {
                    deferral.Complete();
                }
            };
        }

        public StackPanel Fields { get; } = new() { Spacing = 12 };
        public UIElement Body { set => _fields.Content = value; }
        public CancellationToken Cancellation { get; }
        public bool IsWorking => _state != WorkState.Idle;
        public Func<bool> CanApply { get; set; } = () => true;
        public Func<Task<bool>>? Apply { get; set; }
        public Action? MakeReadOnly { get; set; }
        public string UncertainMessage { get; set; } = "Could not confirm the update";

        public void Observe(Session session, IReadOnlyList<string>? hashes = null)
        {
            void Refresh()
            {
                _availability.Text = session.State is not SessionState.Live ? "Disconnected" :
                    hashes is not null && hashes.Any(hash => !session.Torrents.Rows.Any(row => row.Hash == hash)) ? "Selected torrents removed" : string.Empty;
                _availability.Visibility = _availability.Text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
                IsSecondaryButtonEnabled = _state == WorkState.Idle && session.State is SessionState.Live;
                Validate();
            }
            void StateChanged(object? sender, SessionState state) => Refresh();
            void Changed(object? sender, TorrentFields fields) => Refresh();
            session.StateChanged += StateChanged;
            session.Changed += Changed;
            Closed += (_, _) =>
            {
                session.StateChanged -= StateChanged;
                session.Changed -= Changed;
            };
            Refresh();
        }

        public void Load(Session session, Func<Task> read, Control focus)
        {
            _fields.IsEnabled = false;
            Icons.Set(this, Lucide.Save, Lucide.RefreshCw);
            async Task Read()
            {
                await Work(read);
                if (Cancellation.IsCancellationRequested) return;
                _fields.IsEnabled = Apply is not null;
                SecondaryButtonText = Apply is null ? "Retry" : string.Empty;
                IsSecondaryButtonEnabled = _state == WorkState.Idle && session.State is SessionState.Live;
                if (Apply is not null) focus.Focus(FocusState.Programmatic);
            }
            Opened += async (_, _) => await Read();
            SecondaryButtonClick += async (_, args) =>
            {
                args.Cancel = true;
                var deferral = args.GetDeferral();
                try { await Read(); }
                finally { deferral.Complete(); }
            };
        }

        public void SaveShortcut()
        {
            KeyDown += (_, args) =>
            {
                if (args.Handled || args.Key != VirtualKey.S || Modifiers != VirtualKeyModifiers.Control)
                    return;
                if (HasPopup(this)) return;
                args.Handled = true;
                InvokePrimary();
            };
        }

        public void Validate()
        {
            IsPrimaryButtonEnabled = _state == WorkState.Idle && Apply is not null && CanApply();
            if (_state != WorkState.Idle) IsSecondaryButtonEnabled = false;
        }

        public void InvokePrimary()
        {
            if (IsPrimaryButtonEnabled && GetTemplateChild("PrimaryButton") is Button button)
                (new ButtonAutomationPeer(button).GetPattern(PatternInterface.Invoke) as IInvokeProvider)?.Invoke();
        }

        public void FocusFooter()
        {
            string part = IsPrimaryButtonEnabled ? "PrimaryButton" : "CloseButton";
            if (GetTemplateChild(part) is Button { IsEnabled: true } button)
                button.Focus(FocusState.Keyboard);
        }

        public void Message(string message, InfoBarSeverity severity = InfoBarSeverity.Error, string? help = null)
        {
            _notice.Message = message;
            _notice.Severity = severity;
            ToolTipService.SetToolTip(_notice, help);
            AutomationProperties.SetHelpText(_notice, help ?? string.Empty);
            _notice.IsOpen = true;
        }

        public async Task Work(Func<Task> action, bool commit = false)
        {
            if (_state != WorkState.Idle)
                return;
            var close = CloseButtonText;
            _state = commit ? WorkState.Writing : WorkState.Reading;
            _fields.IsEnabled = false;
            CloseButtonText = commit ? string.Empty : "Cancel";
            _notice.IsOpen = false;
            _progress.Visibility = Visibility.Visible;
            _progress.IsActive = true;
            Validate();
            try
            {
                await action();
            }
            catch (Exception exception)
            {
                if (!Cancellation.IsCancellationRequested)
                {
                    if (commit && exception is (RpcTransportException or OperationCanceledException))
                    {
                        _state = WorkState.Uncertain;
                        MakeReadOnly?.Invoke();
                        CloseButtonText = "Close";
                        Message(UncertainMessage, help: "Check the torrent list before trying again.");
                    }
                    else Message(exception is OperationCanceledException
                        ? "The connection changed before the request completed."
                        : exception.Message, help: exception is OperationCanceledException ? "Check the engine before trying again." : null);
                }
            }
            finally
            {
                if (_state != WorkState.Uncertain) _state = WorkState.Idle;
                _fields.IsEnabled = true;
                if (CloseButtonText.Length == 0)
                    CloseButtonText = close;
                _progress.IsActive = false;
                _progress.Visibility = Visibility.Collapsed;
                Validate();
            }
        }

        private enum WorkState { Idle, Reading, Writing, Uncertain }
    }
}

