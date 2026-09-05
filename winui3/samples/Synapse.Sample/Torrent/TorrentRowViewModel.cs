using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;

namespace Synapse_Sample;

/// <summary>
/// One torrent, kept alive across daemon snapshots so cells redraw instead of rebuilding.
/// <para>
/// Every display string is built in its getter and cached until the underlying value changes.
/// A tick therefore costs one field write and one <see cref="PropertyChanged"/> raise per changed
/// value; the string is only produced if a realized cell reads it. Formatting eagerly would
/// allocate a string per field per row per second for the 1,970 rows nobody can see.
/// </para>
/// </summary>
public sealed class TorrentRowViewModel : INotifyPropertyChanged
{
    public const int SpeedHistoryLength = 32;

    private string _name = string.Empty;
    private SortKey? _nameSortKey;
    private double _progress;
    private long _totalSize;
    private long _transferred;
    private TorrentStatus _status;
    private int _queuePosition;
    private TimeSpan? _eta;
    private double _downloadSpeed;
    private double _uploadSpeed;
    private int _peersConnected;
    private int _peersTotal;
    private double _ratio;
    private DateTimeOffset _added;
    private DateTimeOffset? _completedOn;
    private bool _isGhost;
    private string? _ghostLabel;
    private string? _errorString;

    private string? _progressText;
    private string? _transferredText;
    private string? _statusLabel;
    private string? _statusGlyph;
    private Brush? _statusAccent;
    private string? _queueText;
    private string? _etaText;
    private string? _speedText;
    private string? _speedTooltip;
    private string? _peersText;
    private string? _peersTooltip;
    private string? _sizeText;
    private string? _ratioText;
    private string? _addedText;
    private string? _completedOnText;
    private int _speedRevision;

    public TorrentRowViewModel(string id) => Id = id;

    public event PropertyChangedEventHandler? PropertyChanged;

    // ------------------------------------------------------------- identity

    /// <summary>The daemon info hash. Stable for the life of the torrent; never reformatted.</summary>
    public string Id { get; }

    // -------------------------------------------------------- domain values

    public string Name
    {
        get => _name;
        set
        {
            _nameSortKey = null;
            if (Set(ref _name, value))
            {
                Raise(nameof(NameTooltip));
            }
        }
    }

    /// <summary>
    /// <see cref="Name"/> reduced to the bytes the culture orders it by, built on first use.
    /// </summary>
    /// <remarks>
    /// A culture-aware string comparison runs a collation every time it is asked, and a sort asks
    /// it n log n times — about 22,000 for the 2,002 rows the torrent host holds — over names that
    /// did not change, again on every re-sort. Reducing each name once and comparing the results
    /// gives the same order, because the key is that collation's own output.
    /// <para>
    /// Bound to the culture that was current when it was built. Nothing here changes culture after
    /// start; a host that did would have to clear these, and would have the same problem with a
    /// <c>StringComparer.CurrentCultureIgnoreCase</c> captured in a static.
    /// </para>
    /// </remarks>
    internal SortKey NameSortKey => _nameSortKey ??=
        CultureInfo.CurrentCulture.CompareInfo.GetSortKey(_name, CompareOptions.IgnoreCase);

    /// <summary>Completed fraction, 0 to 1.</summary>
    public double Progress
    {
        get => _progress;
        set
        {
            if (Set(ref _progress, value))
            {
                _progressText = null;
                Raise(nameof(ProgressPercent));
                Raise(nameof(ProgressText));
            }
        }
    }

    public long TotalSize
    {
        get => _totalSize;
        set
        {
            if (Set(ref _totalSize, value))
            {
                _sizeText = null;
                _transferredText = null;
                Raise(nameof(SizeText));
                Raise(nameof(TransferredText));
            }
        }
    }

    public long Transferred
    {
        get => _transferred;
        set
        {
            if (Set(ref _transferred, value))
            {
                _transferredText = null;
                Raise(nameof(TransferredText));
            }
        }
    }

    public TorrentStatus Status
    {
        get => _status;
        set
        {
            if (Set(ref _status, value))
            {
                InvalidateStatusDisplay();
                Raise(nameof(IsActive));
            }
        }
    }

    /// <summary>Zero-based queue index. The cell shows it one-based.</summary>
    public int QueuePosition
    {
        get => _queuePosition;
        set
        {
            if (Set(ref _queuePosition, value))
            {
                _queueText = null;
                Raise(nameof(QueueText));
            }
        }
    }

    /// <summary>Null when the host has no estimate. The cell then reads "Unknown".</summary>
    public TimeSpan? Eta
    {
        get => _eta;
        set
        {
            if (Set(ref _eta, value))
            {
                _etaText = null;
                Raise(nameof(EtaText));
            }
        }
    }

    public double DownloadSpeed
    {
        get => _downloadSpeed;
        set => SetSpeeds(value, _uploadSpeed);
    }

    public double UploadSpeed
    {
        get => _uploadSpeed;
        set => SetSpeeds(_downloadSpeed, value);
    }

    /// <summary>Both directions of one tick, with the speed display invalidated once.</summary>
    public void SetSpeeds(double download, double upload)
    {
        bool changed = Set(ref _downloadSpeed, download, nameof(DownloadSpeed));
        changed |= Set(ref _uploadSpeed, upload, nameof(UploadSpeed));

        if (changed)
        {
            InvalidateSpeedDisplay();
        }
    }

    /// <summary>Recent samples of whichever speed the row is currently judged by.</summary>
    public SpeedHistoryBuffer SpeedHistory { get; } = new(SpeedHistoryLength);

    public int PeersConnected
    {
        get => _peersConnected;
        set
        {
            bool wasStalled = IsStalled;
            if (Set(ref _peersConnected, value))
            {
                _peersText = null;
                _peersTooltip = null;
                Raise(nameof(PeersText));
                Raise(nameof(PeersTooltip));

                // Stalled is derived from peers, so the pill follows when that flips.
                if (IsStalled != wasStalled)
                {
                    InvalidateStatusDisplay();
                }
            }
        }
    }

    public int PeersTotal
    {
        get => _peersTotal;
        set
        {
            if (Set(ref _peersTotal, value))
            {
                _peersTooltip = null;
                Raise(nameof(PeersTooltip));
            }
        }
    }

    public double Ratio
    {
        get => _ratio;
        set
        {
            if (Set(ref _ratio, value))
            {
                _ratioText = null;
                Raise(nameof(RatioText));
            }
        }
    }

    public DateTimeOffset Added
    {
        get => _added;
        set
        {
            if (Set(ref _added, value))
            {
                _addedText = null;
                Raise(nameof(AddedText));
            }
        }
    }

    public DateTimeOffset? CompletedOn
    {
        get => _completedOn;
        set
        {
            if (Set(ref _completedOn, value))
            {
                _completedOnText = null;
                Raise(nameof(CompletedOnText));
            }
        }
    }

    /// <summary>A pending row the daemon has not confirmed. Display only.</summary>
    public bool IsGhost
    {
        get => _isGhost;
        set
        {
            if (Set(ref _isGhost, value))
            {
                Raise(nameof(RowOpacity));
            }
        }
    }

    public string? GhostLabel
    {
        get => _ghostLabel;
        set
        {
            if (Set(ref _ghostLabel, value))
            {
                Raise(nameof(HasGhostLabel));
            }
        }
    }

    public string? ErrorString
    {
        get => _errorString;
        set
        {
            if (Set(ref _errorString, value))
            {
                Raise(nameof(HasError));
                Raise(nameof(NameTooltip));
            }
        }
    }

    // ----------------------------------------------------- derived for cells

    /// <summary>True when the daemon says downloading but nothing is coming in.</summary>
    public bool IsStalled => _status == TorrentStatus.Downloading && _peersConnected == 0;

    public bool IsDownloading => _status is TorrentStatus.Downloading
        or TorrentStatus.DownloadQueued or TorrentStatus.Checking or TorrentStatus.CheckQueued;

    public bool IsSeeding => _status is TorrentStatus.Seeding
        or TorrentStatus.SeedQueued or TorrentStatus.Checking or TorrentStatus.CheckQueued;

    public bool IsActive => _status is TorrentStatus.Downloading or TorrentStatus.Seeding
        or TorrentStatus.Checking;

    public bool HasError => !string.IsNullOrEmpty(_errorString);

    public bool HasGhostLabel => !string.IsNullOrEmpty(_ghostLabel);

    public double RowOpacity => _isGhost ? 0.55 : 1.0;

    public string NameTooltip => HasError ? _errorString! : _name;

    public double ProgressPercent => _progress * 100;

    public string ProgressText => _progressText ??= (_progress * 100).ToString("0.0") + "%";

    public string TransferredText => _transferredText ??=
        TorrentFormat.Bytes(_transferred) + " of " + TorrentFormat.Bytes(_totalSize);

    public string StatusLabel => _statusLabel ??=
        IsStalled ? TorrentStrings.Stalled : TorrentStrings.Status(_status);

    public string StatusGlyph => _statusGlyph ??= TorrentStrings.Glyph(_status, IsStalled);

    /// <summary>
    /// Looked up by key in the application resources on first read, so the view model holds a
    /// resource name rather than a colour. It is not re-resolved if the theme changes later.
    /// </summary>
    public Brush StatusAccent => _statusAccent ??= Resource(TorrentStrings.AccentKey(_status, IsStalled));

    public string QueueText => _queueText ??= (_queuePosition + 1).ToString();

    public string EtaText => _etaText ??= TorrentFormat.Duration(_eta);

    /// <summary>Whichever direction this row is judged by: download while getting, upload while giving.</summary>
    public double ActiveSpeed => _status is TorrentStatus.Seeding or TorrentStatus.SeedQueued
        ? _uploadSpeed
        : _downloadSpeed;

    public string SpeedText => _speedText ??= (_status is TorrentStatus.Seeding or TorrentStatus.SeedQueued
        ? "↑ " + TorrentFormat.Rate(_uploadSpeed)
        : "↓ " + TorrentFormat.Rate(_downloadSpeed));

    public string SpeedTooltip => _speedTooltip ??=
        "Down " + TorrentFormat.Rate(_downloadSpeed) + "\nUp " + TorrentFormat.Rate(_uploadSpeed);

    /// <summary>
    /// Bumped whenever a speed sample is recorded, so the sparkline cell knows the ring changed.
    /// The geometry itself belongs to the cell: see <see cref="SparklineView"/>.
    /// </summary>
    public int SpeedRevision => _speedRevision;

    public string PeersText => _peersText ??= _peersConnected.ToString();

    public string PeersTooltip => _peersTooltip ??=
        $"{_peersConnected} connected\n{_peersTotal} known in the swarm";

    public string SizeText => _sizeText ??= TorrentFormat.Bytes(_totalSize);

    public string RatioText => _ratioText ??= _ratio.ToString("0.00");

    public string AddedText => _addedText ??= TorrentFormat.Relative(_added);

    public string CompletedOnText => _completedOnText ??= TorrentFormat.Absolute(_completedOn);

    // --------------------------------------------------------------- updates

    /// <summary>
    /// Record one speed sample. Called once a second for active rows. It only bumps a counter, so
    /// a row nobody is looking at costs one increment and a raise with no listener.
    /// </summary>
    public void PushSpeedSample(double bytesPerSecond)
    {
        SpeedHistory.Push(bytesPerSecond);
        _speedRevision++;
        Raise(nameof(SpeedRevision));
    }

    /// <summary>Re-read the relative "added" string. Only the visible rows pay for it.</summary>
    public void InvalidateRelativeTimes()
    {
        _addedText = null;
        Raise(nameof(AddedText));
    }

    private void InvalidateStatusDisplay()
    {
        _statusLabel = null;
        _statusGlyph = null;
        _statusAccent = null;
        Raise(nameof(StatusLabel));
        Raise(nameof(StatusGlyph));
        Raise(nameof(StatusAccent));
        Raise(nameof(IsStalled));
    }

    private void InvalidateSpeedDisplay()
    {
        _speedText = null;
        _speedTooltip = null;
        Raise(nameof(ActiveSpeed));
        Raise(nameof(SpeedText));
        Raise(nameof(SpeedTooltip));
    }

    private static Brush Resource(string key) =>
        Application.Current.Resources[key] as Brush ?? new SolidColorBrush();

    private bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        Raise(name);
        return true;
    }

    private void Raise(string? name) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
