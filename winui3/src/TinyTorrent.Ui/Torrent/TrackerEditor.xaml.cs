using System.Collections.ObjectModel;
using System.ComponentModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Synapse;
using Windows.System;

namespace TinyTorrent_Ui;

public sealed partial class TrackerEditor : UserControl
{
    private ObservableCollection<TrackerEntry>? _entries;
    private bool _projecting;

    public TrackerEditor()
    {
        InitializeComponent();
        Icons.Set(AddButton, Lucide.Plus);
        Icons.Set(RemoveButton, Lucide.Trash2);
    }

    internal event EventHandler? Changed;
    internal string? SelectedUrl => (Entries.SelectedItem as TrackerEntry)?.Url;
    internal double MinimumHeight => Fields.ActualHeight + Commands.ActualHeight + Layout.RowSpacing * 2
        + (EmptyText.Visibility == Visibility.Visible ? EmptyText.ActualHeight
            : TorrentPage.VisualHeight(Entries, element => element is ListViewItem));

    internal void Begin(string trackerList, int? selectedTier, string? selectedUrl)
    {
        _entries = [];
        int tier = 0;
        bool separator = false;
        foreach (string line in trackerList.Split('\n'))
        {
            string url = line.Trim();
            if (url.Length == 0)
            {
                separator = _entries.Count > 0;
                continue;
            }
            if (separator) tier++;
            separator = false;
            _entries.Add(new TrackerEntry(tier, url));
        }
        Entries.ItemsSource = _entries;
        TrackerEntry[] matches = _entries.Where(entry => entry.Tier == selectedTier && entry.Url == selectedUrl).ToArray();
        Entries.SelectedItem = matches.Length == 1 ? matches[0] : null;
        ProjectSelection();
    }

    internal string Serialize() => _entries is null ? "" : string.Join("\n\n",
        _entries.GroupBy(entry => entry.Tier).Select(group => string.Join('\n', group.Select(entry => entry.Url.Trim()))));

    internal string? Validate()
    {
        if (_entries is null) return null;
        foreach (TrackerEntry entry in _entries)
        {
            if (Uri.TryCreate(entry.Url.Trim(), UriKind.Absolute, out Uri? uri) && uri.Scheme is "http" or "https" or "udp") continue;
            Entries.SelectedItem = entry;
            FocusUrl();
            return "Announce URL must use HTTP, HTTPS or UDP.";
        }
        return null;
    }

    internal void Release()
    {
        Entries.ItemsSource = null;
        _entries = null;
        ProjectSelection();
    }

    internal void FocusUrl()
    {
        if (Entries.SelectedItem is TrackerEntry && UrlField.IsEnabled)
            UrlField.Focus(FocusState.Programmatic);
        else Entries.Focus(FocusState.Programmatic);
    }

    private void SelectionChanged(object sender, SelectionChangedEventArgs args) => ProjectSelection();

    private void ProjectSelection()
    {
        _projecting = true;
        TrackerEntry? selected = Entries.SelectedItem as TrackerEntry;
        UrlField.Text = selected?.Url ?? "";
        int tiers = _entries?.Select(entry => entry.Tier).Distinct().Count() ?? 0;
        TierField.ItemsSource = Enumerable.Range(1, tiers).Select(tier => $"Tier {tier}").Append("New tier").ToArray();
        TierField.SelectedIndex = selected?.Tier ?? -1;
        UrlField.IsEnabled = TierField.IsEnabled = RemoveButton.IsEnabled = selected is not null;
        EmptyText.Visibility = _entries is { Count: 0 } ? Visibility.Visible : Visibility.Collapsed;
        _projecting = false;
    }

    private void UrlChanged(object sender, TextChangedEventArgs args)
    {
        if (_projecting || Entries.SelectedItem is not TrackerEntry entry || entry.Url == UrlField.Text) return;
        entry.Url = UrlField.Text;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void TierChanged(object sender, SelectionChangedEventArgs args)
    {
        if (_projecting || _entries is null || Entries.SelectedItem is not TrackerEntry entry || TierField.SelectedIndex < 0) return;
        int tier = TierField.SelectedIndex;
        if (entry.Tier == tier) return;
        _projecting = true;
        _entries.Remove(entry);
        entry.Tier = tier;
        int index = 0;
        while (index < _entries.Count && _entries[index].Tier <= tier) index++;
        _entries.Insert(index, entry);
        NormalizeTiers();
        Entries.SelectedItem = entry;
        ProjectSelection();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void NormalizeTiers()
    {
        if (_entries is null) return;
        int tier = -1;
        int previous = -1;
        foreach (TrackerEntry entry in _entries)
        {
            int original = entry.Tier;
            if (original != previous) tier++;
            previous = original;
            entry.Tier = tier;
        }
    }

    private void AddTracker(object sender, RoutedEventArgs args)
    {
        if (_entries is null) return;
        int tier = (Entries.SelectedItem as TrackerEntry)?.Tier ?? _entries.LastOrDefault()?.Tier ?? 0;
        TrackerEntry entry = new(tier, "");
        int index = 0;
        while (index < _entries.Count && _entries[index].Tier <= tier) index++;
        _entries.Insert(index, entry);
        Entries.SelectedItem = entry;
        ProjectSelection();
        FocusUrl();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void RemoveTracker(object sender, RoutedEventArgs args)
    {
        if (_entries is null || Entries.SelectedItem is not TrackerEntry entry) return;
        int index = _entries.IndexOf(entry);
        _entries.RemoveAt(index);
        NormalizeTiers();
        Entries.SelectedItem = _entries.Count == 0 ? null : _entries[Math.Min(index, _entries.Count - 1)];
        ProjectSelection();
        Entries.Focus(FocusState.Programmatic);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void ListKeyDown(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || args.Key != VirtualKey.Delete || Dialogs.Modifiers != VirtualKeyModifiers.None || Dialogs.HasPopup(this)) return;
        if (Entries.SelectedItem is not TrackerEntry) return;
        RemoveTracker(RemoveButton, new());
        args.Handled = true;
    }

    private void FieldsSizeChanged(object sender, SizeChangedEventArgs args)
    {
        TierField.Measure(new(double.PositiveInfinity, double.PositiveInfinity));
        bool stacked = Fields.ActualWidth < UrlField.MinWidth + TierField.DesiredSize.Width + Fields.ColumnSpacing;
        Grid.SetColumn(TierField, stacked ? 0 : 1);
        Grid.SetRow(TierField, stacked ? 1 : 0);
        Fields.RowSpacing = stacked ? Layout.RowSpacing : 0;
    }
}

public sealed class TrackerEntry(int tier, string url) : INotifyPropertyChanged
{
    private int _tier = tier;
    private string _url = url;
    public event PropertyChangedEventHandler? PropertyChanged;
    public int Tier
    {
        get => _tier;
        set
        {
            if (_tier == value) return;
            _tier = value;
            PropertyChanged?.Invoke(this, new(nameof(Tier)));
            PropertyChanged?.Invoke(this, new(nameof(Caption)));
        }
    }
    public string Url
    {
        get => _url;
        set
        {
            if (_url == value) return;
            _url = value;
            PropertyChanged?.Invoke(this, new(nameof(Url)));
            PropertyChanged?.Invoke(this, new(nameof(Caption)));
        }
    }
    public string Caption => $"Tier {Tier + 1} · {Url}";
}
