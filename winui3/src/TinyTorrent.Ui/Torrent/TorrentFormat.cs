using System.Globalization;

namespace TinyTorrent_Ui;

/// <summary>
/// Display formatting for the torrent host. Every method is called from a lazy property getter on
/// <see cref="TorrentRowViewModel"/>, so it only runs for a row a template is actually reading.
/// </summary>
public static class TorrentFormat
{
    private static readonly string[] ByteUnits = { "B", "KB", "MB", "GB", "TB" };

    public static string Bytes(long bytes)
    {
        if (bytes <= 0)
        {
            return "0 B";
        }

        double value = bytes;
        int unit = 0;
        while (value >= 1024 && unit < ByteUnits.Length - 1)
        {
            value /= 1024;
            unit++;
        }

        string format = unit == 0 ? "0" : value >= 100 ? "0" : "0.0";
        return value.ToString(format, CultureInfo.CurrentCulture) + " " + ByteUnits[unit];
    }

    public static string Rate(double bytesPerSecond) =>
        bytesPerSecond < 1 ? "—" : Bytes((long)bytesPerSecond) + "/s";

    /// <summary>Estimated time remaining, or the Unknown marker when the host has no estimate.</summary>
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
}
