using System.Globalization;
using Transmission;

namespace TinyTorrent;

/// <summary>
/// Display formatting for the list. Every method is called from a lazy property getter on
/// <see cref="Torrent"/>, so it only runs for a row a template is actually reading.
/// </summary>
/// <remarks>
/// The scale is the daemon's, not ours. <c>session_get</c> publishes <c>units</c>, and on the
/// daemon we target a size "k" is 1000 and a memory "k" is 1024 (<c>utils.cc:64-66</c> sets
/// <c>storage</c> to <c>Base::Kilo</c> and <c>memory</c> to <c>Base::Kibi</c>). A client that
/// hard-codes 1024 for sizes therefore disagrees with the number the daemon itself would print
/// for the same torrent. Only the GTK and Qt clients ever reassign those, so reading the value
/// costs one field and no branch.
/// </remarks>
public sealed class TorrentFormat
{
    private readonly double _sizeBase;
    private readonly string[] _sizeUnits;
    private readonly double _speedBase;
    private readonly string[] _speedUnits;

    public TorrentFormat(long sizeBase, IReadOnlyList<string> sizeUnits, long speedBase, IReadOnlyList<string> speedUnits)
    {
        _sizeBase = sizeBase;
        _sizeUnits = [.. sizeUnits];
        _speedBase = speedBase;
        _speedUnits = [.. speedUnits];
    }

    /// <summary>
    /// What the daemon we target answers, used until a connection says otherwise. It is the
    /// starting value rather than a fallback: a row cannot exist before a sweep, and a sweep
    /// cannot happen before <c>session_get</c> has been read.
    /// </summary>
    public static TorrentFormat Default { get; } = new(
        1000,
        ["B", "kB", "MB", "GB", "TB"],
        1000,
        ["B/s", "kB/s", "MB/s", "GB/s", "TB/s"]);

    public static TorrentFormat From(Units units) =>
        new(units.SizeBytes, units.SizeUnits, units.SpeedBytes, units.SpeedUnits);

    public string Size(long bytes) => Scaled(bytes, _sizeBase, _sizeUnits);

    public string Rate(double bytesPerSecond) =>
        bytesPerSecond < 1 ? "—" : Scaled(bytesPerSecond, _speedBase, _speedUnits);

    /// <summary>Estimated time remaining, or the Unknown marker when the daemon has no estimate.</summary>
    public static string Duration(TimeSpan? span)
    {
        if (span is not TimeSpan value || value < TimeSpan.Zero || value.TotalDays >= 365)
        {
            return "Unknown";
        }

        if (value.TotalHours >= 24)
        {
            return $"{(int)value.TotalDays}d {value.Hours}h";
        }

        if (value.TotalMinutes >= 60)
        {
            return $"{(int)value.TotalHours}h {value.Minutes}m";
        }

        if (value.TotalSeconds >= 60)
        {
            return $"{(int)value.TotalMinutes}m {value.Seconds}s";
        }

        return $"{(int)value.TotalSeconds}s";
    }

    public static string Relative(DateTimeOffset? when)
    {
        if (when is not DateTimeOffset value)
        {
            return "—";
        }

        TimeSpan age = DateTimeOffset.Now - value;

        if (age < TimeSpan.FromMinutes(1))
        {
            return "just now";
        }

        if (age < TimeSpan.FromHours(1))
        {
            return $"{(int)age.TotalMinutes} min ago";
        }

        if (age < TimeSpan.FromDays(1))
        {
            return $"{(int)age.TotalHours} h ago";
        }

        if (age < TimeSpan.FromDays(30))
        {
            return $"{(int)age.TotalDays} d ago";
        }

        return value.LocalDateTime.ToString("d MMM yyyy", CultureInfo.CurrentCulture);
    }

    public static string Absolute(DateTimeOffset? when) => when is DateTimeOffset value
        ? value.LocalDateTime.ToString("d MMM yyyy HH:mm", CultureInfo.CurrentCulture)
        : "—";

    private static string Scaled(double value, double scale, string[] units)
    {
        if (value <= 0)
        {
            return "0 " + units[0];
        }

        int unit = 0;
        while (value >= scale && unit < units.Length - 1)
        {
            value /= scale;
            unit++;
        }

        string format = unit == 0 ? "0" : value >= 100 ? "0" : "0.0";
        return value.ToString(format, CultureInfo.CurrentCulture) + " " + units[unit];
    }
}
