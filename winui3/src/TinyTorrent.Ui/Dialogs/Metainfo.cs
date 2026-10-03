using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace TinyTorrent_Ui;

internal sealed record MetainfoFile(string Name, long Length);

internal static class Metainfo
{
    public static bool HasMagnetHash(string query)
    {
        foreach (var part in query.TrimStart('?').Split('&'))
        {
            if (!part.StartsWith("xt=", StringComparison.OrdinalIgnoreCase))
                continue;
            var value = Uri.UnescapeDataString(part[3..]);
            const string prefix = "urn:btih:";
            if (!value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                continue;
            var hash = value[prefix.Length..];
            if (hash.Length == 40 && hash.All(Uri.IsHexDigit) ||
                hash.Length == 32 && hash.All(character => character is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '2' and <= '7'))
                return true;
        }
        return false;
    }

    public static IReadOnlyList<MetainfoFile> Read(byte[] bytes)
    {
        var reader = new Reader(bytes);
        var root = Dictionary(reader.Read());
        if (!reader.AtEnd || !root.TryGetValue("info", out var value))
            throw Invalid();

        var info = Dictionary(value);
        var name = Text(info, "name.utf-8", "name");
        if (!info.TryGetValue("pieces", out var pieces) || pieces is not ReadOnlyMemory<byte> hashes)
            throw new FormatException("This torrent has no v1 metadata. BitTorrent v2 is not supported by the engine.");
        if (hashes.Length % SHA1.HashSizeInBytes != 0 || Length(info, "piece length") == 0)
            throw Invalid();

        var files = new List<MetainfoFile>();
        if (info.TryGetValue("files", out var entries))
        {
            if (info.ContainsKey("length") || entries is not List<object> list || list.Count == 0)
                throw Invalid();
            foreach (var entry in list)
            {
                var file = Dictionary(entry);
                if (!file.TryGetValue("path.utf-8", out var path) && !file.TryGetValue("path", out path))
                    throw Invalid();
                if (path is not List<object> parts || parts.Count == 0)
                    throw Invalid();
                files.Add(new MetainfoFile(name + "/" + string.Join("/", parts.Select(Component)), Length(file, "length")));
            }
        }
        else
        {
            files.Add(new MetainfoFile(name, Length(info, "length")));
        }

        long total = 0;
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var file in files)
        {
            if (!names.Add(file.Name) || file.Length > long.MaxValue - total)
                throw Invalid();
            total += file.Length;
        }
        var pieceLength = Length(info, "piece length");
        var pieceCount = total / pieceLength + (total % pieceLength == 0 ? 0 : 1);
        if (pieceCount != hashes.Length / SHA1.HashSizeInBytes)
            throw Invalid();
        return files;
    }

    private static Dictionary<string, object> Dictionary(object value) =>
        value as Dictionary<string, object> ?? throw Invalid();

    private static long Length(Dictionary<string, object> values, string key) =>
        values.TryGetValue(key, out var value) && value is long number && number >= 0 ? number : throw Invalid();

    private static string Text(Dictionary<string, object> values, string preferred, string fallback)
    {
        if (!values.TryGetValue(preferred, out var value) && !values.TryGetValue(fallback, out value))
            throw Invalid();
        return Component(value);
    }

    private static string Component(object value)
    {
        if (value is not ReadOnlyMemory<byte> bytes)
            throw Invalid();
        var text = Encoding.UTF8.GetString(bytes.Span);
        if (string.IsNullOrWhiteSpace(text) || text is "." or ".." || text.IndexOfAny(['/', '\\', '\0']) >= 0)
            throw new FormatException("The torrent contains an invalid file name or path.");
        return text;
    }

    private static FormatException Invalid() => new("The .torrent file contains invalid or incomplete metadata.");

    private sealed class Reader(byte[] bytes)
    {
        // Transmission's MetainfoHandler uses MaxBencDepth = 32 (torrent-metainfo.cc).
        private const int MaxDepth = 32;
        private int _position;

        public bool AtEnd => _position == bytes.Length;

        public object Read(int depth = 0)
        {
            if (_position >= bytes.Length || depth > MaxDepth)
                throw Invalid();
            var marker = bytes[_position];
            if (marker == 'i')
            {
                _position++;
                var start = _position;
                while (_position < bytes.Length && bytes[_position] != 'e')
                    _position++;
                var digits = Encoding.ASCII.GetString(bytes, start, _position - start);
                if (_position == bytes.Length || digits.Length == 0 || digits == "-0" ||
                    (digits.Length > 1 && digits[0] == '0') ||
                    (digits.Length > 2 && digits[0] == '-' && digits[1] == '0') ||
                    !long.TryParse(digits, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number) ||
                    digits[0] == '+')
                    throw Invalid();
                _position++;
                return number;
            }
            if (marker is (byte)'d' or (byte)'l')
            {
                _position++;
                if (marker == 'l')
                {
                    var list = new List<object>();
                    while (!End())
                        list.Add(Read(depth + 1));
                    return list;
                }
                var dictionary = new Dictionary<string, object>(StringComparer.Ordinal);
                while (!End())
                {
                    var key = Encoding.UTF8.GetString(String().Span);
                    if (!dictionary.TryAdd(key, Read(depth + 1)))
                        throw Invalid();
                }
                return dictionary;
            }
            return String();
        }

        private bool End()
        {
            if (_position >= bytes.Length)
                throw Invalid();
            if (bytes[_position] != 'e')
                return false;
            _position++;
            return true;
        }

        private ReadOnlyMemory<byte> String()
        {
            var start = _position;
            while (_position < bytes.Length && bytes[_position] is >= (byte)'0' and <= (byte)'9')
                _position++;
            if (_position == start || _position == bytes.Length || bytes[_position] != ':' ||
                (_position - start > 1 && bytes[start] == '0') ||
                !int.TryParse(Encoding.ASCII.GetString(bytes, start, _position - start), NumberStyles.None,
                    CultureInfo.InvariantCulture, out var length))
                throw Invalid();
            _position++;
            if (length > bytes.Length - _position)
                throw Invalid();
            var text = bytes.AsMemory(_position, length);
            _position += length;
            return text;
        }
    }
}
