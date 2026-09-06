using System.Text.Json;
using System.Text.Json.Serialization;

namespace Transmission;

/// <summary>
/// Which torrents a request applies to. Always sent as info hashes: numeric ids do not survive a
/// daemon restart, and every method that takes ids accepts either.
/// </summary>
[JsonConverter(typeof(TorrentIdsConverter))]
public readonly record struct TorrentIds
{
    private readonly IReadOnlyList<string>? _hashes;
    private readonly Scope _scope;

    private TorrentIds(Scope scope, IReadOnlyList<string>? hashes)
    {
        _scope = scope;
        _hashes = hashes;
    }

    /// <summary>Every torrent. This is the default value, and the daemon spells it by omitting <c>ids</c>.</summary>
    public static TorrentIds All => default;

    /// <summary>Torrents changed within the last 60 seconds, plus a <c>removed</c> list of the ids that went away.</summary>
    public static TorrentIds RecentlyActive { get; } = new(Scope.RecentlyActive, null);

    public static TorrentIds Of(params string[] hashes) =>
        hashes.Length == 0 ? throw new ArgumentException("Name at least one torrent.", nameof(hashes))
                           : new TorrentIds(Scope.Listed, hashes);

    private enum Scope
    {
        All,
        RecentlyActive,
        Listed,
    }

    private sealed class TorrentIdsConverter : JsonConverter<TorrentIds>
    {
        public override TorrentIds Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
            throw new NotSupportedException("ids is an argument, never a result.");

        public override void Write(Utf8JsonWriter writer, TorrentIds value, JsonSerializerOptions options)
        {
            switch (value._scope)
            {
                case Scope.RecentlyActive:
                    // The bare string, never an array holding it: rpcimpl.cc:1018 reads it with
                    // value_if<string_view>, so wrapping it returns the right torrents, no
                    // "removed" key and no error - a silent loss of every removal.
                    writer.WriteStringValue("recently_active");
                    break;

                case Scope.Listed:
                    writer.WriteStartArray();
                    foreach (var hash in value._hashes!)
                    {
                        writer.WriteStringValue(hash);
                    }

                    writer.WriteEndArray();
                    break;

                default:
                    // All is spelled by omitting the argument, and the options object omits it
                    // because it is the default value. Writing it would be worse than useless:
                    // getTorrents matches nothing against a present-but-unusable ids, so the
                    // request would silently apply to no torrents instead of every one.
                    throw new JsonException("TorrentIds.All must be omitted from the request, not written.");
            }
        }
    }
}
