using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.Windows.Storage.Pickers;
using Synapse;
using TinyTorrent;
using Transmission;
using Windows.ApplicationModel.DataTransfer;
using Windows.Globalization.NumberFormatting;
using Windows.System;

namespace TinyTorrent_Ui;

internal static class PreferencesDialog
{
    private enum Activity { Editing, Picking, Saving }

    internal static async Task Show(Session session, XamlRoot root, nint hwnd, string engineName, bool isLocal)
    {
        using CancellationTokenSource lifetime = new();
        StackPanel loading = new() { Spacing = 12 };
        loading.Children.Add(new ProgressRing { IsActive = true });
        loading.Children.Add(new TextBlock { Text = "Reading preferences…" });
        ContentDialog dialog = new()
        {
            XamlRoot = root, Title = "Preferences", CloseButtonText = "Cancel", Content = loading,
        };
        dialog.Resources["ContentDialogMaxWidth"] = 800d;
        Icons.Set(dialog, primary: Lucide.Save);
        Activity activity = Activity.Editing;
        dialog.Closing += (_, args) => args.Cancel = activity == Activity.Saving;
        dialog.CloseButtonClick += (_, args) => args.Cancel = activity == Activity.Saving;
        dialog.Closed += (_, _) => lifetime.Cancel();
        var showing = dialog.ShowAsync();
        Settings? loaded = null;
        while (loaded is null && !lifetime.IsCancellationRequested)
        {
            try { loaded = await session.Request(new SessionGet<Settings>(), lifetime.Token); }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                TaskCompletionSource retry = new();
                using var canceled = lifetime.Token.Register(() => retry.TrySetCanceled());
                Button retryButton = new() { Content = "Retry", AccessKey = "R" };
                Icons.Set(retryButton, Lucide.RefreshCw);
                retryButton.Click += (_, _) => retry.TrySetResult();
                StackPanel failure = new() { Spacing = 12 };
                failure.Children.Add(new InfoBar { IsOpen = true, Severity = InfoBarSeverity.Error, Message = error.Message });
                failure.Children.Add(retryButton);
                dialog.Content = new ScrollViewer
                {
                    Content = failure,
                    VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                    HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                    IsTabStop = false
                };
                dialog.CloseButtonText = "Close";
                retryButton.Focus(FocusState.Programmatic);
                try { await retry.Task; }
                catch (OperationCanceledException) { break; }
                dialog.Content = loading;
                dialog.CloseButtonText = "Cancel";
            }
        }
        if (loaded is null || lifetime.IsCancellationRequested) { await showing; return; }
        Settings current = loaded;

        Settings edits = new();
        List<Action> read = [];
        List<Action> confirmEngine = [];
        List<Func<(string Key, int Value, Action Confirm)?>> readTray = [];
        Dictionary<Control, Func<bool>> dirty = [];
        Dictionary<Control, Control> focusTargets = [];
        List<Action> refreshCommands = [];
        PreferencesView view = new() { MaxWidth = 800, HorizontalAlignment = HorizontalAlignment.Stretch };
        void FitWidth()
        {
            for (DependencyObject? parent = VisualTreeHelper.GetParent(view); parent is not null; parent = VisualTreeHelper.GetParent(parent))
            {
                if (parent is not ScrollViewer viewport || viewport.ActualWidth <= 0) continue;
                double chrome = Math.Max(0, dialog.ActualWidth - viewport.ActualWidth);
                dialog.Resources["ContentDialogMaxWidth"] = 800d + chrome;
                break;
            }
        }
        view.Loaded += (_, _) => FitWidth();
        view.SizeChanged += (_, _) => FitWidth();
        view.Scope.Text = $"Connected engine: {engineName}";
        InfoBar status = view.Feedback;
        NavigationView navigation = view.Categories;
        dialog.Content = new ScrollViewer
        {
            Content = view,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            IsTabStop = false,
        };
        dialog.PrimaryButtonText = "Save";
        dialog.DefaultButton = ContentDialogButton.Primary;
        dialog.IsPrimaryButtonEnabled = true;

        StackPanel Group(string name)
        {
            StackPanel panel = new() { Spacing = 16 };
            NavigationViewItem item = new() { Content = name, Tag = panel };
            panel.Tag = item;
            navigation.MenuItems.Add(item);
            return panel;
        }

        StackPanel Section(StackPanel panel, string title)
        {
            StackPanel fields = new() { Spacing = 12, Tag = panel.Tag };
            panel.Children.Add(view.Card(title, fields));
            return fields;
        }

        void Reveal(StackPanel panel, Control field)
        {
            navigation.SelectedItem = panel.Tag as NavigationViewItem;
            if (focusTargets.TryGetValue(field, out Control? target)) field = target;
            field.DispatcherQueue.TryEnqueue(() => field.Focus(FocusState.Programmatic));
        }

        void Key(Control? field, string? key)
        {
            if (field is null || key is null) return;
            field.AccessKey = key;
            field.AccessKeyInvoked += (_, args) => { field.Focus(FocusState.Programmatic); args.Handled = true; };
        }

        void RefreshCommands() { foreach (Action refresh in refreshCommands) refresh(); }

        CheckBox? Boolean(StackPanel panel, string label, bool? value, Action<bool> set, string? key = null)
        {
            if (!value.HasValue) return null;
            CheckBox field = new() { Content = label, IsChecked = value.Value, AccessKey = key ?? string.Empty };
            panel.Children.Add(field);
            dirty[field] = () => field.IsChecked != value;
            field.Checked += (_, _) => RefreshCommands();
            field.Unchecked += (_, _) => RefreshCommands();
            read.Add(() =>
            {
                bool changed = field.IsChecked == true;
                if (changed == value) return;
                set(changed);
                confirmEngine.Add(() => value = changed);
            });
            return field;
        }

        TextBox? Text(StackPanel panel, string label, string? value, Action<string> set, Func<bool>? required = null, string? key = null)
        {
            if (value is null) return null;
            TextBox field = new() { Header = label, Text = value };
            Key(field, key);
            panel.Children.Add(field);
            dirty[field] = () => field.Text != value;
            field.TextChanged += (_, _) => RefreshCommands();
            read.Add(() =>
            {
                if (field.ReadLocalValue(Control.IsEnabledProperty) is false) return;
                if (required?.Invoke() == true && string.IsNullOrWhiteSpace(field.Text))
                {
                    Reveal(panel, field);
                    throw new InvalidOperationException($"{label} cannot be empty.");
                }
                if (field.Text == value) return;
                string changed = field.Text;
                set(changed);
                confirmEngine.Add(() => value = changed);
            });
            return field;
        }

        NumberBox? Number(StackPanel panel, string label, double? value, Action<double> set, double minimum = 0, double maximum = int.MaxValue, bool integer = true, string? key = null)
        {
            if (!value.HasValue) return null;
            DecimalFormatter formatter = new() { FractionDigits = 0 };
            NumberBox field = new() { NumberFormatter = formatter, Value = value.Value, Minimum = minimum, Maximum = maximum, ValidationMode = NumberBoxValidationMode.Disabled, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
            Key(field, key);
            view.Row(panel, label, field);
            dirty[field] = () => formatter.ParseDouble(field.Text.Trim()) != value;
            field.ValueChanged += (_, _) => RefreshCommands();
            field.RegisterPropertyChangedCallback(NumberBox.TextProperty, (_, _) => RefreshCommands());
            read.Add(() =>
            {
                if (field.ReadLocalValue(Control.IsEnabledProperty) is false) return;
                double? parsed = formatter.ParseDouble(field.Text.Trim());
                if (!parsed.HasValue || !double.IsFinite(parsed.Value) || parsed.Value < minimum || parsed.Value > maximum || (integer && parsed.Value != Math.Truncate(parsed.Value)))
                {
                    Reveal(panel, field);
                    throw new InvalidOperationException($"{label} must be a {(integer ? "whole number" : "number")} from {minimum:N0} to {maximum:N0}.");
                }
                double changed = parsed.Value;
                field.Value = changed;
                if (changed == value) return;
                set(changed);
                confirmEngine.Add(() => value = changed);
            });
            return field;
        }

        TimePicker? Time(StackPanel panel, string label, int? value, Action<int> set, string? key = null)
        {
            if (!value.HasValue) return null;
            TimePicker field = new() { Time = TimeSpan.FromMinutes(value.Value) };
            Key(field, key);
            view.Row(panel, label, field);
            read.Add(() =>
            {
                if (field.ReadLocalValue(Control.IsEnabledProperty) is false) return;
                int minutes = (int)field.Time.TotalMinutes;
                if (minutes == value) return;
                set(minutes);
                confirmEngine.Add(() => value = minutes);
            });
            return field;
        }

        void Link(CheckBox? toggle, params Control?[] fields)
        {
            if (toggle is null) return;
            void Refresh() { foreach (Control? field in fields) if (field is not null) field.IsEnabled = toggle.IsChecked == true; }
            toggle.Checked += (_, _) => Refresh();
            toggle.Unchecked += (_, _) => Refresh();
            Refresh();
        }

        Button Action(StackPanel panel, string label, string glyph, Func<Task<string>> execute, string? key = null, Func<bool>? changed = null, string? hint = null, bool engine = true)
        {
            Button button = new() { Content = label, AccessKey = key ?? "", HorizontalAlignment = HorizontalAlignment.Right };
            Icons.Set(button, glyph);
            panel.Children.Add(button);
            bool running = false;
            void Refresh()
            {
                bool unsaved = changed?.Invoke() == true;
                button.IsEnabled = !running && !unsaved && (!engine || session.State is SessionState.Live);
                ToolTipService.SetToolTip(button, unsaved ? "Save changes before testing/updating" : hint);
            }
            refreshCommands.Add(Refresh);
            Refresh();
            button.Click += async (_, _) =>
            {
                if (engine && session.State is not SessionState.Live) return;
                running = true;
                Refresh();
                status.IsOpen = true;
                status.Severity = InfoBarSeverity.Informational;
                status.Message = $"{label}…";
                try { status.Message = await execute(); status.Severity = InfoBarSeverity.Success; }
                catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
                catch (Exception error) { status.Message = error.Message; status.Severity = InfoBarSeverity.Error; }
                finally { running = false; Refresh(); }
            };
            return button;
        }

        StackPanel generalGroup = Group("General");
        StackPanel general = Section(generalGroup, "Download folders");
        TextBox? downloadFolder = Text(general, "Download folder", current.DownloadDir, v => edits.DownloadDir = v, () => true, "D");
        Button? PickFolder(TextBox? field, string name, string key)
        {
            if (!isLocal || field is null) return null;
            field.IsReadOnly = true;
            field.IsTabStop = false;
            field.AccessKey = "";
            ToolTipService.SetToolTip(field, field.Text);
            field.TextChanged += (_, _) => ToolTipService.SetToolTip(field, field.Text);
            Button change = new() { Content = "Change", AccessKey = key, HorizontalAlignment = HorizontalAlignment.Right };
            focusTargets[field] = change;
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(change, $"Change {name}");
            ToolTipService.SetToolTip(change, $"Choose the {name}. Ctrl+C copies its path; Shift+F10 opens Copy.");
            Icons.Set(change, Lucide.FolderOpen);
            void CopyPath()
            {
                try
                {
                    DataPackage data = new();
                    data.SetText(field.Text);
                    Clipboard.SetContent(data);
                }
                catch (Exception error) { status.IsOpen = true; status.Severity = InfoBarSeverity.Error; status.Message = error.Message; }
            }
            MenuFlyoutItem copy = new() { Text = "Copy", AccessKey = "C", Icon = Icons.Create(Lucide.Copy), KeyboardAcceleratorTextOverride = "Ctrl+C" };
            copy.Click += (_, _) => CopyPath();
            MenuFlyout menu = new();
            menu.Items.Add(copy);
            change.ContextFlyout = menu;
            change.KeyDown += (_, args) =>
            {
                if (args.Handled || args.Key != VirtualKey.C || Dialogs.Modifiers != VirtualKeyModifiers.Control || Dialogs.HasPopup(dialog)) return;
                CopyPath();
                args.Handled = true;
            };
            general.Children.Add(change);
            change.Click += async (_, _) =>
            {
                if (activity != Activity.Editing) return;
                activity = Activity.Picking;
                change.IsEnabled = false;
                dialog.IsPrimaryButtonEnabled = false;
                try
                {
                    var folder = await new FolderPicker(Win32Interop.GetWindowIdFromWindow(hwnd)).PickSingleFolderAsync();
                    if (folder is not null && !lifetime.IsCancellationRequested) field.Text = folder.Path;
                }
                catch (Exception error)
                {
                    if (!lifetime.IsCancellationRequested) { status.IsOpen = true; status.Severity = InfoBarSeverity.Error; status.Message = error.Message; }
                }
                finally
                {
                    activity = Activity.Editing;
                    change.IsEnabled = field.IsEnabled;
                    dialog.IsPrimaryButtonEnabled = session.State is SessionState.Live;
                    if (!lifetime.IsCancellationRequested) change.Focus(FocusState.Programmatic);
                }
            };
            return change;
        }
        PickFolder(downloadFolder, "download folder", "D");
        ToolTipService.SetToolTip(general, isLocal ? "Folders on this computer" : $"Folders on {engineName}");
        CheckBox? incompleteEnabled = Boolean(general, "Keep incomplete downloads in another folder", current.IncompleteDirEnabled, v => edits.IncompleteDirEnabled = v, "I");
        TextBox? incompleteFolder = Text(general, "Incomplete folder", current.IncompleteDir, v => edits.IncompleteDir = v, () => incompleteEnabled?.IsChecked != false, "F");
        Link(incompleteEnabled, incompleteFolder, PickFolder(incompleteFolder, "incomplete folder", "F"));
        Boolean(general, "Add .part to incomplete files", current.RenamePartialFiles, v => edits.RenamePartialFiles = v, "P");
        if (downloadFolder is not null) Action(general, "Check space", Lucide.HardDrive, async () =>
        {
            string path = downloadFolder.Text;
            if (string.IsNullOrWhiteSpace(path)) { Reveal(general, downloadFolder); throw new InvalidOperationException("Download folder cannot be empty."); }
            DiskSpace space = await session.Request(new FreeSpace(path), lifetime.Token);
            return $"{session.Torrents.Format.Size(space.SizeBytes)} available in {space.Path}.";
        }, "C");
        StackPanel adding = Section(generalGroup, "Adding torrents");
        Boolean(adding, "Start newly added torrents", current.StartAddedTorrents, v => edits.StartAddedTorrents = v, "S");
        Boolean(adding, "Trash original torrent files", current.TrashOriginalTorrentFiles, v => edits.TrashOriginalTorrentFiles = v, "T");
        if (current.SequentialDownload.HasValue)
            Boolean(adding, "Download sequentially by default", current.SequentialDownload, v => edits.SequentialDownload = v, "Q");
        StackPanel tray = Section(generalGroup, "This computer");
        const string trayPath = @"HKEY_CURRENT_USER\Software\TinyTorrent";
        void TrayBoolean(string label, string key, bool defaultValue, string? accessKey = null)
        {
            bool original = Convert.ToInt32(Microsoft.Win32.Registry.GetValue(trayPath, key, defaultValue ? 1 : 0)) != 0;
            CheckBox field = new() { Content = label, IsChecked = original };
            field.AccessKey = accessKey ?? string.Empty;
            tray.Children.Add(field);
            readTray.Add(() =>
            {
                bool value = field.IsChecked == true;
                return value != original ? (key, value ? 1 : 0, () => original = value) : null;
            });
        }
        TrayBoolean("Add torrents silently from the tray", "SilentAdd", true, "A");
        TrayBoolean("Show a balloon after adding a torrent", "AddBalloon", false);
        int exitValue = Convert.ToInt32(Microsoft.Win32.Registry.GetValue(trayPath, "ExitBehavior", Microsoft.Win32.Registry.GetValue(trayPath, "ExitStopsEngine", 0)));
        ComboBox exit = new() { ItemsSource = new[] { "Leave the local engine running", "Stop the local engine", "Ask me" }, SelectedIndex = exitValue is >= 0 and <= 2 ? exitValue : 0 };
        Key(exit, "E");
        view.Row(tray, "When the tray exits", exit);
        readTray.Add(() =>
        {
            int changed = exit.SelectedIndex;
            return changed != exitValue ? ("ExitBehavior", changed, () => exitValue = changed) : null;
        });
        Action(tray, "Open", Lucide.FolderOpen, async () =>
        {
            string path = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TinyTorrent");
            Directory.CreateDirectory(path);
            Windows.Storage.StorageFolder folder = await Windows.Storage.StorageFolder.GetFolderFromPathAsync(path);
            if (!await Windows.System.Launcher.LaunchFolderAsync(folder)) throw new InvalidOperationException("Windows could not open the log folder.");
            return "Opened the TinyTorrent log folder.";
        }, "O", hint: "Open the TinyTorrent log folder", engine: false);

        StackPanel connectionGroup = Group("Connection");
        StackPanel connection = Section(connectionGroup, "Incoming connections");
        NumberBox? peerPort = Number(connection, "Incoming peer port", current.PeerPort, v => edits.PeerPort = (int)v, 1, 65535, key: "P");
        CheckBox? randomPort = Boolean(connection, "Choose a random port at startup", current.PeerPortRandomOnStart, v => edits.PeerPortRandomOnStart = v, "R");
        CheckBox? forwarding = Boolean(connection, "Forward the port with UPnP / NAT-PMP", current.PortForwardingEnabled, v => edits.PortForwardingEnabled = v, "F");
        ComboBox encryption = new() { ItemsSource = new[] { "tolerated", "preferred", "required" }, SelectedItem = current.Encryption };
        string? confirmedEncryption = current.Encryption;
        if (confirmedEncryption is not null) { Key(encryption, "E"); view.Row(connection, "Peer encryption", encryption); }
        read.Add(() =>
        {
            if (encryption.SelectedItem is not string value || value == confirmedEncryption) return;
            edits.Encryption = value;
            confirmEngine.Add(() => confirmedEncryption = value);
        });
        bool Changed(params Control?[] fields) => fields.Any(field => field is not null && dirty[field]());
        foreach (string protocol in new[] { "ipv4", "ipv6" })
            Action(connection, protocol == "ipv4" ? "Test IPv4" : "Test IPv6", Lucide.Network, async () =>
            {
                int testedPort = (int)(peerPort?.Value ?? 0);
                PortStatus port = await session.Request(new PortTest(protocol), lifetime.Token);
                return $"{protocol.ToUpperInvariant()} port {testedPort} is {(port.PortIsOpen ? "open" : "closed")}.";
            }, protocol == "ipv4" ? "T" : null, () => Changed(peerPort, randomPort, forwarding));
        StackPanel discovery = Section(connectionGroup, "Peer discovery");
        Boolean(discovery, "Peer exchange (PEX)", current.PexEnabled, v => edits.PexEnabled = v, "X");
        Boolean(discovery, "Distributed hash table (DHT)", current.DhtEnabled, v => edits.DhtEnabled = v, "D");
        Boolean(discovery, "Local peer discovery", current.LpdEnabled, v => edits.LpdEnabled = v, "L");
        StackPanel peers = Section(connectionGroup, "Peer limits");
        Number(peers, "Global peer limit", current.PeerLimitGlobal, v => edits.PeerLimitGlobal = (int)v, 1, key: "G");
        Number(peers, "Peer limit per torrent", current.PeerLimitPerTorrent, v => edits.PeerLimitPerTorrent = (int)v, 1, key: "B");

        StackPanel bandwidth = Group("Bandwidth");
        StackPanel limits = Section(bandwidth, "Speed limits");
        Link(Boolean(limits, "Limit download speed", current.SpeedLimitDownEnabled, v => edits.SpeedLimitDownEnabled = v, "D"),
            Number(limits, "Download limit (kB/s)", current.SpeedLimitDown, v => edits.SpeedLimitDown = (int)v, key: "L"));
        Link(Boolean(limits, "Limit upload speed", current.SpeedLimitUpEnabled, v => edits.SpeedLimitUpEnabled = v, "U"),
            Number(limits, "Upload limit (kB/s)", current.SpeedLimitUp, v => edits.SpeedLimitUp = (int)v, key: "V"));
        StackPanel alternative = Section(bandwidth, "Alternative limits");
        Boolean(alternative, "Use alternative speed limits", current.AltSpeedEnabled, v => edits.AltSpeedEnabled = v, "A");
        Number(alternative, "Download limit (kB/s)", current.AltSpeedDown, v => edits.AltSpeedDown = (int)v, key: "B");
        Number(alternative, "Upload limit (kB/s)", current.AltSpeedUp, v => edits.AltSpeedUp = (int)v, key: "C");
        StackPanel schedule = Section(bandwidth, "Schedule");
        CheckBox? scheduleToggle = Boolean(schedule, "Schedule alternative limits", current.AltSpeedTimeEnabled, v => edits.AltSpeedTimeEnabled = v, "S");
        ToolTipService.SetToolTip(schedule, $"Times use the local time on {engineName}.");
        Link(scheduleToggle, Time(schedule, "Start (engine time)", current.AltSpeedTimeBegin, v => edits.AltSpeedTimeBegin = v, "F"),
            Time(schedule, "End (engine time)", current.AltSpeedTimeEnd, v => edits.AltSpeedTimeEnd = v, "T"));
        string[] days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        CheckBox[] dayFields = new CheckBox[days.Length];
        VariableSizedWrapGrid dayRow = new() { Orientation = Orientation.Horizontal };
        int? confirmedDays = current.AltSpeedTimeDay;
        for (int i = 0; current.AltSpeedTimeDay.HasValue && i < days.Length; i++)
        {
            int index = i;
            dayFields[i] = new() { Content = days[i][..3], Margin = new Thickness(0, 0, 12, 0), IsTabStop = i == 0, IsChecked = (current.AltSpeedTimeDay.GetValueOrDefault() & (1 << i)) != 0 };
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(dayFields[i], days[i]);
            dayRow.Children.Add(dayFields[i]);
            dayFields[i].GotFocus += (_, _) =>
            {
                for (int day = 0; day < dayFields.Length; day++) dayFields[day].IsTabStop = day == index;
            };
            dayFields[i].KeyDown += (_, args) =>
            {
                if (args.Handled || Dialogs.Modifiers != VirtualKeyModifiers.None || args.Key is not (VirtualKey.Left or VirtualKey.Right) || Dialogs.HasPopup(dialog)) return;
                int next = (index + (args.Key == VirtualKey.Right ? 1 : days.Length - 1)) % days.Length;
                dayFields[next].Focus(FocusState.Keyboard);
                args.Handled = true;
            };
        }
        if (current.AltSpeedTimeDay.HasValue) { Key(dayFields[0], "W"); schedule.Children.Add(dayRow); }
        Link(scheduleToggle, dayFields);
        read.Add(() =>
        {
            if (!current.AltSpeedTimeDay.HasValue || scheduleToggle?.IsChecked == false) return;
            int mask = 0;
            for (int i = 0; i < dayFields.Length; i++) if (dayFields[i].IsChecked == true) mask |= 1 << i;
            if (mask == confirmedDays) return;
            edits.AltSpeedTimeDay = mask;
            confirmEngine.Add(() => confirmedDays = mask);
        });

        StackPanel queueGroup = Group("Queueing");
        StackPanel queue = Section(queueGroup, "Active torrents");
        Link(Boolean(queue, "Limit active downloads", current.DownloadQueueEnabled, v => edits.DownloadQueueEnabled = v, "D"),
            Number(queue, "Active downloads", current.DownloadQueueSize, v => edits.DownloadQueueSize = (int)v, key: "L"));
        Link(Boolean(queue, "Limit active seeds", current.SeedQueueEnabled, v => edits.SeedQueueEnabled = v, "S"),
            Number(queue, "Active seeds", current.SeedQueueSize, v => edits.SeedQueueSize = (int)v, key: "N"));
        Link(Boolean(queue, "Exclude stalled torrents from queue limits", current.QueueStalledEnabled, v => edits.QueueStalledEnabled = v, "E"),
            Number(queue, "Stalled after (minutes)", current.QueueStalledMinutes, v => edits.QueueStalledMinutes = (int)v, key: "T"));
        queue = Section(queueGroup, "Seeding limits");
        Link(Boolean(queue, "Stop seeding at a ratio", current.SeedRatioLimited, v => edits.SeedRatioLimited = v, "R"),
            Number(queue, "Seed ratio", current.SeedRatioLimit, v => edits.SeedRatioLimit = v, integer: false, key: "V"));
        Link(Boolean(queue, "Stop idle seeds", current.IdleSeedingLimitEnabled, v => edits.IdleSeedingLimitEnabled = v, "I"),
            Number(queue, "Idle seeding limit (minutes)", current.IdleSeedingLimit, v => edits.IdleSeedingLimit = (int)v, key: "M"));

        StackPanel advancedGroup = Group("Advanced");
        StackPanel advanced = Section(advancedGroup, "Blocklist");
        CheckBox? blocklistEnabled = Boolean(advanced, "Enable blocklist", current.BlocklistEnabled, v => edits.BlocklistEnabled = v, "B");
        TextBox? blocklistUrl = Text(advanced, "Blocklist URL", current.BlocklistUrl, v => edits.BlocklistUrl = v, key: "U");
        Link(blocklistEnabled, blocklistUrl);
        TextBlock blocklistSize = new() { Text = "Checking blocklist size…", TextWrapping = TextWrapping.Wrap };
        advanced.Children.Add(blocklistSize);
        async Task ReadBlocklist()
        {
            try { BlocklistFacts facts = await session.Request(new SessionGet<BlocklistFacts>(), lifetime.Token); blocklistSize.Text = $"{facts.BlocklistSize:N0} blocked addresses."; }
            catch (OperationCanceledException) { }
            catch (Exception error) { blocklistSize.Text = $"Blocklist size unavailable: {error.Message}"; }
        }
        Task blocklistRead = ReadBlocklist();
        Action(advanced, "Update", Lucide.RefreshCw, async () =>
        {
            await blocklistRead;
            Blocklist result = await session.Request(new BlocklistUpdate(), lifetime.Token);
            blocklistSize.Text = $"{result.BlocklistSize:N0} blocked addresses.";
            return "Blocklist updated.";
        }, "P", () => Changed(blocklistEnabled, blocklistUrl));

        navigation.SelectionChanged += (_, _) =>
        {
            if ((navigation.SelectedItem as NavigationViewItem)?.Tag is not StackPanel panel) return;
            view.CategoryHost.Content = panel;
        };
        navigation.SelectedItem = navigation.MenuItems[0];
        Style? closeStyle = dialog.CloseButtonStyle;
        Style disabledClose = new(typeof(Button)) { BasedOn = closeStyle };
        disabledClose.Setters.Add(new Setter(Control.IsEnabledProperty, false));
        async Task<bool> Save()
        {
            if (activity != Activity.Editing || session.State is not SessionState.Live) return false;
            Control? previousFocus = FocusManager.GetFocusedElement(root) as Control;
            activity = Activity.Saving;
            dialog.IsPrimaryButtonEnabled = false;
            dialog.CloseButtonStyle = disabledClose;
            view.IsEnabled = false;
            bool engineSaved = false;
            int localSaved = 0;
            bool writingEngine = false;
            bool writingLocal = false;
            bool successful = false;
            try
            {
                edits = new();
                confirmEngine.Clear();
                foreach (Action field in read) field();
                List<(string Key, int Value, Action Confirm)> trayChanges = [];
                foreach (var field in readTray)
                    if (field() is { } change) trayChanges.Add(change);
                status.Severity = InfoBarSeverity.Informational;
                status.Message = "Saving preferences…";
                status.IsOpen = true;
                if (confirmEngine.Count != 0)
                {
                    writingEngine = true;
                    await session.Request(new SessionSet<Settings>(edits), lifetime.Token);
                    writingEngine = false;
                    engineSaved = true;
                    foreach (Action confirm in confirmEngine) confirm();
                }
                foreach (var change in trayChanges)
                {
                    writingLocal = true;
                    Microsoft.Win32.Registry.SetValue(trayPath, change.Key, change.Value, Microsoft.Win32.RegistryValueKind.DWord);
                    change.Confirm();
                    localSaved++;
                }
                successful = true;
                return true;
            }
            catch (Exception error)
            {
                string scope = engineSaved ? "Connected engine saved. This computer could not save all changes. "
                    : localSaved != 0 ? "Some changes on this computer saved. Remaining changes could not be saved. "
                    : writingEngine ? $"Could not confirm preferences saved on {engineName}. "
                    : writingLocal ? "This computer could not save changes. " : "";
                status.Severity = InfoBarSeverity.Error;
                status.Message = scope + error.Message;
                status.IsOpen = true;
                return false;
            }
            finally
            {
                activity = Activity.Editing;
                dialog.IsPrimaryButtonEnabled = session.State is SessionState.Live;
                dialog.CloseButtonStyle = closeStyle;
                view.IsEnabled = true;
                RefreshCommands();
                if (!successful) previousFocus?.Focus(FocusState.Programmatic);
            }
        }
        dialog.PrimaryButtonClick += async (_, args) =>
        {
            args.Cancel = true;
            var deferral = args.GetDeferral();
            try { args.Cancel = !await Save(); }
            finally { deferral.Complete(); }
        };

        void Shortcut(VirtualKey key, VirtualKeyModifiers modifiers, Action invoke)
        {
            KeyboardAccelerator accelerator = new() { Key = key, Modifiers = modifiers };
            accelerator.Invoked += (_, args) =>
            {
                if (args.Handled || Dialogs.Modifiers != modifiers || Dialogs.HasPopup(dialog)) return;
                args.Handled = true;
                if (activity == Activity.Editing) invoke();
            };
            dialog.KeyboardAccelerators.Add(accelerator);
        }
        Shortcut(VirtualKey.S, VirtualKeyModifiers.Control, async () => { if (await Save()) dialog.Hide(); });
        for (int i = 0; i < navigation.MenuItems.Count; i++)
        {
            int index = i;
            Shortcut((VirtualKey)((int)VirtualKey.Number1 + i), VirtualKeyModifiers.Menu, () =>
            {
                navigation.SelectedItem = navigation.MenuItems[index];
                view.DispatcherQueue.TryEnqueue(() => (FocusManager.FindFirstFocusableElement(view.CategoryHost) as Control)?.Focus(FocusState.Keyboard));
            });
        }
        bool Within(DependencyObject? focused, DependencyObject region)
        {
            for (DependencyObject? element = focused; element is not null; element = VisualTreeHelper.GetParent(element))
                if (element == region) return true;
            return false;
        }
        void Cycle(bool backwards)
        {
            DependencyObject? focused = FocusManager.GetFocusedElement(root) as DependencyObject;
            int region = Within(focused, navigation) ? 0 : Within(focused, view.CategoryHost) ? 1 : 2;
            int next = (region + (backwards ? 2 : 1)) % 3;
            if (next == 0) { view.FocusNavigation(); return; }
            Control? destination = next == 1 ? FocusManager.FindFirstFocusableElement(view.CategoryHost) as Control
                : FocusManager.FindLastFocusableElement(dialog) as Control;
            destination?.Focus(FocusState.Keyboard);
        }
        Shortcut(VirtualKey.F6, VirtualKeyModifiers.None, () => Cycle(false));
        Shortcut(VirtualKey.F6, VirtualKeyModifiers.Shift, () => Cycle(true));
        void ConnectionChanged(object? sender, SessionState state)
        {
            bool connected = state is SessionState.Live;
            view.Scope.Text = $"{(connected ? "Connected" : "Disconnected")} engine: {engineName}";
            view.ConnectionState.Visibility = connected ? Visibility.Collapsed : Visibility.Visible;
            dialog.IsPrimaryButtonEnabled = connected && activity == Activity.Editing;
            RefreshCommands();
        }
        session.StateChanged += ConnectionChanged;
        ConnectionChanged(session, session.State);
        try { await showing; }
        finally { session.StateChanged -= ConnectionChanged; }
    }
}
