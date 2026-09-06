namespace TinyTorrent_Ui;

/// <summary>
/// The seven daemon states a torrent can report. "Stalled" is not here: it is derived by the
/// host from a downloading torrent that has no connected peers, so it is display only.
/// </summary>
public enum TorrentStatus
{
    Stopped,
    CheckQueued,
    Checking,
    DownloadQueued,
    Downloading,
    SeedQueued,
    Seeding,
}

/// <summary>
/// The host's localized display strings. A shipping host would read these from a resource file;
/// this is the seam where that swap happens.
/// </summary>
public static class TorrentStrings
{
    public const string Stalled = "Stalled";

    public static string Status(TorrentStatus status) => status switch
    {
        TorrentStatus.Stopped => "Paused",
        TorrentStatus.CheckQueued => "Queued to check",
        TorrentStatus.Checking => "Checking",
        TorrentStatus.DownloadQueued => "Queued",
        TorrentStatus.Downloading => "Downloading",
        TorrentStatus.SeedQueued => "Queued to seed",
        TorrentStatus.Seeding => "Seeding",
        _ => string.Empty,
    };

    /// <summary>Segoe Fluent Icons glyph for the status pill.</summary>
    public static string Glyph(TorrentStatus status, bool stalled) => stalled
        ? ""
        : status switch
        {
            TorrentStatus.Stopped => "",
            TorrentStatus.CheckQueued => "",
            TorrentStatus.Checking => "",
            TorrentStatus.DownloadQueued => "",
            TorrentStatus.Downloading => "",
            TorrentStatus.SeedQueued => "",
            TorrentStatus.Seeding => "",
            _ => "",
        };

    /// <summary>Theme resource key for the pill foreground. Resolved per read, so it follows the theme.</summary>
    public static string AccentKey(TorrentStatus status, bool stalled) => stalled
        ? "SystemFillColorCautionBrush"
        : status switch
        {
            TorrentStatus.Downloading => "AccentTextFillColorPrimaryBrush",
            TorrentStatus.Checking => "AccentTextFillColorPrimaryBrush",
            TorrentStatus.Seeding => "SystemFillColorSuccessBrush",
            _ => "TextFillColorSecondaryBrush",
        };
}
