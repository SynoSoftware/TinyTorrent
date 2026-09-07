using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using Transmission;

namespace TinyTorrent;

/// <summary>A torrent name reduced to the bytes the culture orders it by.</summary>
/// <remarks>
/// <see cref="SortKey"/> carries its comparison as a static method and implements no interface, so
/// it cannot be a sort key on its own. The table's schema takes only a key that orders itself,
/// which is what turns an unorderable key into a compile error; this is what satisfies that without
/// giving the library a second way to declare a sort.
/// </remarks>
public readonly struct NameOrder : IComparable<NameOrder>
{
    private readonly SortKey _key;

    internal NameOrder(SortKey key) => _key = key;

    public int CompareTo(NameOrder other) => SortKey.Compare(_key, other._key);
}

/// <summary>
/// Whether the daemon has confirmed this row is still there. One of the three things the list is
/// allowed to show before the daemon has agreed to it.
/// </summary>
public enum TorrentPresence
{
    Confirmed,

    /// <summary>Kept in the cache but out of the list, until the daemon drops it or gives it back.</summary>
    Removing,
}

/// <summary>
/// Which kinds of value a merge changed. The page holds two masks over this and turns a tick into
/// one of three outcomes: republish the projection, re-sort, or let the changed cells redraw.
/// </summary>
[Flags]
public enum TorrentFields
{
    None = 0,
    Membership = 1 << 0,
    Activity = 1 << 1,
    Queue = 1 << 2,
    Name = 1 << 3,
    Progress = 1 << 4,
    Speed = 1 << 5,
    Peers = 1 << 6,
    Eta = 1 << 7,
    Size = 1 << 8,
    Ratio = 1 << 9,
    Added = 1 << 10,
    CompletedOn = 1 << 11,
    Error = 1 << 12,
}

/// <summary>
/// One torrent, kept alive across daemon ticks so cells redraw instead of rebuilding.
/// <para>
/// Every display string is built in its getter and cached until the underlying value changes.
/// A tick therefore costs one field write and one <see cref="PropertyChanged"/> raise per changed
/// value; the string is only produced if a realized cell reads it. Formatting eagerly would
/// allocate a string per field per row per tick for the rows nobody can see.
/// </para>
/// </summary>
public sealed class Torrent : INotifyPropertyChanged
{
    public const int SpeedHistoryLength = 32;

    private readonly TorrentFormat _format;

    private string _name = string.Empty;
    private SortKey? _nameSortKey;
    private double _percentDone;
    private double _recheckProgress;
    private double _metadataProgress = 1;
    private long _totalSize;
    private long _sizeWhenDone;
    private long _leftUntilDone;
    private TorrentStatus _status;
    private bool _isStalled;
    private TorrentActivity _activity;
    private TorrentPresence _presence = TorrentPresence.Confirmed;
    private int _queuePosition;
    private TimeSpan? _eta;
    private double _downloadSpeed;
    private double _uploadSpeed;
    private int _peersConnected;
    private int _peersSendingToUs;
    private int _peersGettingFromUs;
    private double _ratio;
    private DateTimeOffset _added;
    private DateTimeOffset? _completedOn;
    private string _errorString = string.Empty;

    private string? _progressText;
    private string? _transferredText;
    private string? _statusLabel;
    private string? _statusGlyph;
    private string? _statusAccentKey;
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

    internal Torrent(int id, string hash, TorrentFormat format)
    {
        Id = id;
        Hash = hash;
        _format = format;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    // ------------------------------------------------------------- identity

    /// <summary>
    /// The daemon's numeric id. It identifies this torrent for the life of one connection and no
    /// longer: ids do not survive a daemon restart, which is why every mutation sends
    /// <see cref="Hash"/> and only the delta's <c>removed</c> list is read as ids.
    /// </summary>
    public int Id { get; private set; }

    /// <summary>The info hash. Stable for the life of the torrent, and the table's row key.</summary>
    public string Hash { get; }

    /// <summary>The folder the daemon is writing into, for Open folder.</summary>
    public string DownloadDir { get; private set; } = string.Empty;

    /// <summary>
    /// When the torrent was last edited, as the daemon counts it. Nothing displays it; it is the
    /// one value that tells the cache a rename or a label change happened, and therefore that
    /// this row's <see cref="TorrentFacts"/> are stale.
    /// </summary>
    internal long EditDate { get; private set; }

    // -------------------------------------------------------- domain values

    public string Name => _name;

    /// <summary>
    /// <see cref="Name"/> reduced to the bytes the culture orders it by, built on first use.
    /// </summary>
    /// <remarks>
    /// A culture-aware string comparison runs a collation every time it is asked, and a sort asks
    /// it n log n times — about 22,000 for 2,000 rows — over names that did not change, again on
    /// every re-sort. Reducing each name once and comparing the results gives the same order,
    /// because the key is that collation's own output.
    /// </remarks>
    public NameOrder NameOrder => new(_nameSortKey ??=
        CultureInfo.CurrentCulture.CompareInfo.GetSortKey(_name, CompareOptions.IgnoreCase));

    /// <summary>
    /// Completed fraction, 0 to 1. While the daemon is verifying, <c>percent_done</c> stands still
    /// and <c>recheck_progress</c> is the number that moves, so the bar follows whichever one the
    /// current activity makes true.
    /// </summary>
    public double Progress => _activity == TorrentActivity.Checking ? _recheckProgress : _percentDone;

    /// <summary>The whole torrent, wanted files or not. The Size column.</summary>
    public long TotalSize => _totalSize;

    /// <summary>What the wanted files come to, which is what the progress bar is a fraction of.</summary>
    public long SizeWhenDone => _sizeWhenDone;

    public long Transferred => _sizeWhenDone - _leftUntilDone;

    public TorrentStatus Status => _status;

    /// <summary>
    /// The daemon's own answer, which honours the user's <c>queue_stalled_minutes</c>. Deriving it
    /// here from a peer count would ignore that setting and give the daemon's concept a second
    /// owner.
    /// </summary>
    public bool IsStalled => _isStalled;

    public TorrentActivity Activity => _activity;

    public TorrentPresence Presence => _presence;

    /// <summary>Zero-based queue index. The cell shows it one-based.</summary>
    public int QueuePosition => _queuePosition;

    /// <summary>Null when the daemon has no estimate. The cell then reads "Unknown".</summary>
    public TimeSpan? Eta => _eta;

    public double DownloadSpeed => _downloadSpeed;

    public double UploadSpeed => _uploadSpeed;

    /// <summary>Recent samples of whichever speed the row is currently judged by.</summary>
    public SpeedHistoryBuffer SpeedHistory { get; } = new(SpeedHistoryLength);

    public int PeersConnected => _peersConnected;

    public double Ratio => _ratio;

    public DateTimeOffset Added => _added;

    public DateTimeOffset? CompletedOn => _completedOn;

    public string ErrorString => _errorString;

    // ----------------------------------------------------- derived for cells

    // Read from the daemon's status rather than from Activity: a stalled torrent is still going
    // in one direction or the other, and a checking one belongs to both.
    public bool IsDownloading => _status is TorrentStatus.Download or TorrentStatus.DownloadWait
        or TorrentStatus.Check or TorrentStatus.CheckWait;

    public bool IsSeeding => _status is TorrentStatus.Seed or TorrentStatus.SeedWait
        or TorrentStatus.Check or TorrentStatus.CheckWait;

    public bool IsActive => _status is TorrentStatus.Download or TorrentStatus.Seed or TorrentStatus.Check;

    /// <summary>Whether the list shows this row at all. A row being removed is not present.</summary>
    public bool IsPresent => _presence == TorrentPresence.Confirmed;

    public bool HasError => _errorString.Length > 0;

    /// <summary>
    /// What a row is still waiting for, or null when it is waiting for nothing. Derived rather
    /// than stored, so it cannot disagree with the state that produced it. A magnet has no name,
    /// size or files until its metainfo arrives, which is what this says.
    /// </summary>
    public string? GhostLabel => _metadataProgress < 1 ? "Fetching metadata…" : null;

    public bool HasGhostLabel => GhostLabel is not null;

    public double RowOpacity => GhostLabel is null ? 1.0 : 0.55;

    public string NameTooltip => HasError ? _errorString : _name;

    public double ProgressPercent => Progress * 100;

    public string ProgressText => _progressText ??= (Progress * 100).ToString("0.0") + "%";

    public string TransferredText => _transferredText ??=
        _format.Size(Transferred) + " of " + _format.Size(_sizeWhenDone);

    public string StatusLabel => _statusLabel ??= TorrentText.Label(_activity);

    public string StatusGlyph => _statusGlyph ??= TorrentText.Glyph(_activity);

    /// <summary>
    /// A theme resource key, resolved by the cell template. The row never holds a brush: one
    /// resolved on first read is the wrong colour for the rest of the session as soon as the user
    /// switches theme, and holding it is also what would tie this whole layer to XAML.
    /// </summary>
    public string StatusAccentKey => _statusAccentKey ??= TorrentText.AccentKey(_activity);

    public string QueueText => _queueText ??= (_queuePosition + 1).ToString();

    public string EtaText => _etaText ??= TorrentFormat.Duration(_eta);

    /// <summary>Whichever direction this row is judged by: download while getting, upload while giving.</summary>
    public double ActiveSpeed => _status is TorrentStatus.Seed or TorrentStatus.SeedWait
        ? _uploadSpeed
        : _downloadSpeed;

    public string SpeedText => _speedText ??= (_status is TorrentStatus.Seed or TorrentStatus.SeedWait
        ? "↑ " + _format.Rate(_uploadSpeed)
        : "↓ " + _format.Rate(_downloadSpeed));

    public string SpeedTooltip => _speedTooltip ??=
        "Down " + _format.Rate(_downloadSpeed) + "\nUp " + _format.Rate(_uploadSpeed);

    /// <summary>
    /// Bumped whenever a speed sample is recorded, so the sparkline cell knows the ring changed.
    /// The geometry itself belongs to the cell.
    /// </summary>
    public int SpeedRevision => _speedRevision;

    public string PeersText => _peersText ??= _peersConnected.ToString();

    public string PeersTooltip => _peersTooltip ??=
        $"{_peersConnected} connected\n{_peersSendingToUs} sending to us\n{_peersGettingFromUs} getting from us";

    public string SizeText => _sizeText ??= _format.Size(_totalSize);

    public string RatioText => _ratioText ??= _ratio.ToString("0.00");

    public string AddedText => _addedText ??= TorrentFormat.Relative(_added);

    public string CompletedOnText => _completedOnText ??= TorrentFormat.Absolute(_completedOn);

    /// <summary>A magnet link built from what the row already holds, so no field is fetched for it.</summary>
    public string MagnetLink => $"magnet:?xt=urn:btih:{Hash}&dn={Uri.EscapeDataString(_name)}";

    // --------------------------------------------------------------- updates

    /// <summary>
    /// Record one speed sample. It only bumps a counter, so a row nobody is looking at costs one
    /// array write and a raise with no listener.
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

    /// <summary>
    /// Announce the accent key again. The key has not changed; what the key names has, because
    /// the theme did, and only a fresh announcement makes a bound cell ask for it again.
    /// </summary>
    public void InvalidateStatusAccent() => Raise(nameof(StatusAccentKey));

    /// <summary>
    /// One tick's worth of daemon values, and which kinds of them moved. The mapping from field to
    /// kind lives here alone, so a new field cannot be added without saying what it affects.
    /// </summary>
    internal TorrentFields Apply(TorrentSummary wire)
    {
        TorrentFields changed = TorrentFields.None;
        EditDate = wire.EditDate;

        if (Set(ref _status, wire.Status, nameof(Status)) |
            Set(ref _isStalled, wire.IsStalled, nameof(IsStalled)))
        {
            // Which direction the speed cell reads, and whether the bar follows recheck progress,
            // both change with the status, so a status move is those two as well.
            changed |= TorrentFields.Activity | TorrentFields.Speed | TorrentFields.Progress;
            RefreshActivity();
        }

        if (Set(ref _queuePosition, wire.QueuePosition, nameof(QueuePosition)))
        {
            changed |= TorrentFields.Queue;
            _queueText = null;
            Raise(nameof(QueueText));
        }

        if (Set(ref _percentDone, wire.PercentDone, nameof(Progress)) |
            Set(ref _recheckProgress, wire.RecheckProgress, nameof(Progress)) |
            Set(ref _sizeWhenDone, wire.SizeWhenDone, nameof(SizeWhenDone)) |
            Set(ref _leftUntilDone, wire.LeftUntilDone, nameof(Transferred)))
        {
            changed |= TorrentFields.Progress;
            RefreshProgress();
        }

        if (Set(ref _metadataProgress, wire.MetadataPercentComplete, nameof(GhostLabel)))
        {
            Raise(nameof(HasGhostLabel));
        }

        if (Set(ref _downloadSpeed, wire.RateDownload, nameof(DownloadSpeed)) |
            Set(ref _uploadSpeed, wire.RateUpload, nameof(UploadSpeed)))
        {
            changed |= TorrentFields.Speed;
            RefreshSpeed();
        }

        if (Set(ref _peersConnected, wire.PeersConnected, nameof(PeersConnected)) |
            Set(ref _peersSendingToUs, wire.PeersSendingToUs, nameof(PeersTooltip)) |
            Set(ref _peersGettingFromUs, wire.PeersGettingFromUs, nameof(PeersTooltip)))
        {
            changed |= TorrentFields.Peers;
            _peersText = null;
            _peersTooltip = null;
            Raise(nameof(PeersText));
            Raise(nameof(PeersTooltip));
        }

        if (Set(ref _eta, wire.Eta.Value, nameof(Eta)))
        {
            changed |= TorrentFields.Eta;
            _etaText = null;
            Raise(nameof(EtaText));
        }

        if (Set(ref _ratio, wire.UploadRatio, nameof(Ratio)))
        {
            changed |= TorrentFields.Ratio;
            _ratioText = null;
            Raise(nameof(RatioText));
        }

        if (Set(ref _completedOn, Moment(wire.DoneDate), nameof(CompletedOn)))
        {
            changed |= TorrentFields.CompletedOn;
            _completedOnText = null;
            Raise(nameof(CompletedOnText));
        }

        if (Set(ref _errorString, wire.Error == TorrentError.Ok ? string.Empty : wire.ErrorString, nameof(ErrorString)))
        {
            changed |= TorrentFields.Error;
            Raise(nameof(HasError));
            Raise(nameof(NameTooltip));
        }

        return changed;
    }

    /// <summary>The values that only move when the torrent is edited.</summary>
    internal TorrentFields Apply(TorrentFacts facts)
    {
        TorrentFields changed = TorrentFields.None;

        Id = facts.Id;
        DownloadDir = facts.DownloadDir;

        if (!string.Equals(_name, facts.Name, StringComparison.Ordinal))
        {
            _name = facts.Name;
            _nameSortKey = null;
            changed |= TorrentFields.Name;
            Raise(nameof(Name));
            Raise(nameof(NameTooltip));
        }

        if (Set(ref _totalSize, facts.TotalSize, nameof(TotalSize)))
        {
            changed |= TorrentFields.Size;
            _sizeText = null;
            Raise(nameof(SizeText));
        }

        if (Set(ref _added, Moment(facts.AddedDate) ?? default, nameof(Added)))
        {
            changed |= TorrentFields.Added;
            _addedText = null;
            Raise(nameof(AddedText));
        }

        return changed;
    }

    /// <summary>
    /// A row absent from a delta has moved no data for at least 60 seconds while the daemon's rate
    /// window is 2, so its true rate is zero. Both Transmission's own clients leave the last rate
    /// on screen until their next full sweep instead.
    /// </summary>
    internal TorrentFields ZeroRates()
    {
        bool moved = Set(ref _downloadSpeed, 0d, nameof(DownloadSpeed));
        moved |= Set(ref _uploadSpeed, 0d, nameof(UploadSpeed));

        if (!moved)
        {
            return TorrentFields.None;
        }

        RefreshSpeed();
        return TorrentFields.Speed;
    }

    internal TorrentFields SetStatus(TorrentStatus status)
    {
        if (!Set(ref _status, status, nameof(Status)))
        {
            return TorrentFields.None;
        }

        RefreshActivity();
        return TorrentFields.Activity;
    }

    internal TorrentFields SetQueuePosition(int position)
    {
        if (!Set(ref _queuePosition, position, nameof(QueuePosition)))
        {
            return TorrentFields.None;
        }

        _queueText = null;
        Raise(nameof(QueueText));
        return TorrentFields.Queue;
    }

    internal TorrentFields SetPresence(TorrentPresence presence)
    {
        if (!Set(ref _presence, presence, nameof(Presence)))
        {
            return TorrentFields.None;
        }

        Raise(nameof(IsPresent));
        return TorrentFields.Membership;
    }

    private static DateTimeOffset? Moment(long unixSeconds) =>
        unixSeconds <= 0 ? null : DateTimeOffset.FromUnixTimeSeconds(unixSeconds);

    private void RefreshActivity()
    {
        _activity = TorrentText.Activity(_status, _isStalled);
        _statusLabel = null;
        _statusGlyph = null;
        _statusAccentKey = null;
        Raise(nameof(Activity));
        Raise(nameof(StatusLabel));
        Raise(nameof(StatusGlyph));
        Raise(nameof(StatusAccentKey));
        Raise(nameof(IsActive));
        RefreshProgress();
        RefreshSpeed();
    }

    private void RefreshProgress()
    {
        _progressText = null;
        _transferredText = null;
        Raise(nameof(Progress));
        Raise(nameof(ProgressPercent));
        Raise(nameof(ProgressText));
        Raise(nameof(TransferredText));
    }

    private void RefreshSpeed()
    {
        _speedText = null;
        _speedTooltip = null;
        Raise(nameof(ActiveSpeed));
        Raise(nameof(SpeedText));
        Raise(nameof(SpeedTooltip));
    }

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
