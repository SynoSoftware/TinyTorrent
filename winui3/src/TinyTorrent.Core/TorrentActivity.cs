using Transmission;

namespace TinyTorrent;

/// <summary>
/// What a torrent is doing, as the list shows it. One value derived from the daemon's
/// <c>status</c> and its <c>is_stalled</c>, so the label, the glyph and the accent cannot
/// disagree about which of the two decided the answer.
/// </summary>
public enum TorrentActivity
{
    Stopped,
    CheckQueued,
    Checking,
    DownloadQueued,
    Downloading,

    /// <summary>
    /// The daemon has seen no traffic for <c>queue_stalled_minutes</c>. It reports this for a
    /// downloading and for a seeding torrent alike, so this covers both.
    /// </summary>
    Stalled,

    SeedQueued,
    Seeding,
}

/// <summary>
/// The list's display strings. English literals: the interface is one product for one audience,
/// and only the reusable control earns resource lookup.
/// </summary>
public static class TorrentText
{
    /// <summary>
    /// <paramref name="stalled"/> is the daemon's own <c>is_stalled</c>, which honours the user's
    /// <c>queue_stalled_minutes</c>. Deriving it here from a peer count instead would give the
    /// same concept a second owner that ignores that setting.
    /// </summary>
    public static TorrentActivity Activity(TorrentStatus status, bool stalled) => status switch
    {
        TorrentStatus.Stopped => TorrentActivity.Stopped,
        TorrentStatus.CheckWait => TorrentActivity.CheckQueued,
        TorrentStatus.Check => TorrentActivity.Checking,
        TorrentStatus.DownloadWait => TorrentActivity.DownloadQueued,
        TorrentStatus.Download => stalled ? TorrentActivity.Stalled : TorrentActivity.Downloading,
        TorrentStatus.SeedWait => TorrentActivity.SeedQueued,
        TorrentStatus.Seed => stalled ? TorrentActivity.Stalled : TorrentActivity.Seeding,
        _ => TorrentActivity.Stopped,
    };

    public static string Label(TorrentActivity activity) => activity switch
    {
        TorrentActivity.Stopped => "Paused",
        TorrentActivity.CheckQueued => "Queued to check",
        TorrentActivity.Checking => "Checking",
        TorrentActivity.DownloadQueued => "Queued",
        TorrentActivity.Downloading => "Downloading",
        TorrentActivity.Stalled => "Stalled",
        TorrentActivity.SeedQueued => "Queued to seed",
        TorrentActivity.Seeding => "Seeding",
        _ => string.Empty,
    };

    /// <summary>Segoe Fluent Icons glyph for the status pill.</summary>
    public static string Glyph(TorrentActivity activity) => activity switch
    {
        TorrentActivity.Stopped => "",
        TorrentActivity.CheckQueued => "",
        TorrentActivity.Checking => "",
        TorrentActivity.DownloadQueued => "",
        TorrentActivity.Downloading => "",
        TorrentActivity.Stalled => "",
        TorrentActivity.SeedQueued => "",
        TorrentActivity.Seeding => "",
        _ => "",
    };

    /// <summary>
    /// The theme resource key for the pill foreground, never a brush. A brush resolved once and
    /// kept is the wrong colour for the rest of the session as soon as the user changes theme;
    /// the cell template resolves this key each time it binds.
    /// </summary>
    public static string AccentKey(TorrentActivity activity) => activity switch
    {
        TorrentActivity.Downloading or TorrentActivity.Checking => "AccentTextFillColorPrimaryBrush",
        TorrentActivity.Seeding => "SystemFillColorSuccessBrush",
        TorrentActivity.Stalled => "SystemFillColorCautionBrush",
        _ => "TextFillColorSecondaryBrush",
    };
}
