using System.Text.Json;
using System.Text.Json.Serialization;

namespace Transmission;

public interface IRpcRequest
{
    /// <summary>
    /// transmission-remote's own policy: 60 s for everything but blocklist_update, which gets
    /// 300 s (utils/remote.cc:2436-2444). A batch takes the longest of its members'.
    /// </summary>
    TimeSpan Timeout => TimeSpan.FromSeconds(60);

    /// <summary>
    /// True for the four methods the daemon dispatches asynchronously (rpcimpl.cc:2818-2823).
    /// They finish out of band and a batch does not answer until its slowest element does, so
    /// they may not share a batch with anything else.
    /// </summary>
    bool IsAsyncDispatched => false;
}

public interface IRpcRequest<TResult> : IRpcRequest;

/// <summary>
/// Marks a request whose <c>fields</c> argument is the property list of <typeparamref name="TProjection"/>.
/// Nothing implements the fields list by hand; see <c>Wire.AddFields</c>.
/// </summary>
public interface IFieldRequest<TProjection>;

// --- torrents, read -------------------------------------------------------------------------

public sealed record TorrentGet<TTorrent>(TorrentIds Ids = default)
    : IRpcRequest<TorrentGetResult<TTorrent>>, IFieldRequest<TTorrent>;

// --- torrents, commands ---------------------------------------------------------------------

public sealed record TorrentStart(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record TorrentStartNow(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record TorrentStop(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record TorrentVerify(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record TorrentReannounce(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record TorrentRemove(TorrentIds Ids, bool DeleteLocalData = false) : IRpcRequest<Empty>;

public sealed record TorrentSetLocation(TorrentIds Ids, string Location, bool Move = false) : IRpcRequest<Empty>;

public sealed record TorrentAdd : IRpcRequest<TorrentAdded>
{
    bool IRpcRequest.IsAsyncDispatched => true;

    /// <summary>A local path or a magnet URI. One of this and <see cref="Metainfo"/> is required.</summary>
    public string? Filename { get; init; }

    /// <summary>A base64 .torrent file.</summary>
    public string? Metainfo { get; init; }

    /// <summary>Sent with the request for <see cref="Filename"/>; what makes a private tracker's URL work.</summary>
    public string? Cookies { get; init; }

    public string? DownloadDir { get; init; }

    public bool? Paused { get; init; }

    public int? PeerLimit { get; init; }

    public Priority? BandwidthPriority { get; init; }

    public IReadOnlyList<string>? Labels { get; init; }

    public IReadOnlyList<int>? FilesWanted { get; init; }

    public IReadOnlyList<int>? FilesUnwanted { get; init; }

    public IReadOnlyList<int>? PriorityHigh { get; init; }

    public IReadOnlyList<int>? PriorityNormal { get; init; }

    public IReadOnlyList<int>? PriorityLow { get; init; }

    public bool? SequentialDownload { get; init; }

    public int? SequentialDownloadFromPiece { get; init; }
}

public sealed record TorrentSet(TorrentIds Ids) : IRpcRequest<Empty>
{
    public Priority? BandwidthPriority { get; init; }

    /// <summary>kB/s, and the k is 1000 (utils.cc:65). Rates read back are bytes per second.</summary>
    public int? DownloadLimit { get; init; }

    public bool? DownloadLimited { get; init; }

    /// <summary>kB/s, as <see cref="DownloadLimit"/>.</summary>
    public int? UploadLimit { get; init; }

    public bool? UploadLimited { get; init; }

    public bool? HonorsSessionLimits { get; init; }

    public IReadOnlyList<string>? Labels { get; init; }

    public IReadOnlyList<int>? FilesWanted { get; init; }

    public IReadOnlyList<int>? FilesUnwanted { get; init; }

    public IReadOnlyList<int>? PriorityHigh { get; init; }

    public IReadOnlyList<int>? PriorityNormal { get; init; }

    public IReadOnlyList<int>? PriorityLow { get; init; }

    public int? PeerLimit { get; init; }

    public int? QueuePosition { get; init; }

    /// <summary>Minutes.</summary>
    public int? SeedIdleLimit { get; init; }

    public IdleMode? SeedIdleMode { get; init; }

    public double? SeedRatioLimit { get; init; }

    public RatioMode? SeedRatioMode { get; init; }

    public bool? SequentialDownload { get; init; }

    public int? SequentialDownloadFromPiece { get; init; }

    /// <summary>The whole announce list, newline separated, blank line between tiers.</summary>
    public string? TrackerList { get; init; }
}

public sealed record TorrentRenamePath(TorrentIds Ids, string Path, string Name) : IRpcRequest<RenamedPath>
{
    bool IRpcRequest.IsAsyncDispatched => true;
}

// --- queue ----------------------------------------------------------------------------------

public sealed record QueueMoveTop(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record QueueMoveUp(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record QueueMoveDown(TorrentIds Ids) : IRpcRequest<Empty>;

public sealed record QueueMoveBottom(TorrentIds Ids) : IRpcRequest<Empty>;

// --- session --------------------------------------------------------------------------------

public sealed record SessionGet<TSettings> : IRpcRequest<TSettings>, IFieldRequest<TSettings>;

/// <summary>
/// The settings object is the argument list, so the same type serves session_get and session_set
/// and a key cannot be added to one without the other. Leave a property null to leave it alone.
/// </summary>
/// <remarks>
/// Which makes every property of a settings projection nullable, value types included, and leaves
/// them without an initialiser. Null is the one value that is omitted from the request; anything
/// else is a key the daemon is asked to set. A plain <c>bool</c> would send nothing for false, so
/// turtle mode could be turned on and never off, and a <c>string</c> initialised to "" would push
/// an empty download directory on every unrelated call.
/// </remarks>
[JsonConverter(typeof(SessionSetConverter))]
public sealed record SessionSet<TSettings>(TSettings Settings) : IRpcRequest<Empty>;

public sealed record SessionStats : IRpcRequest<SessionStatistics>;

public sealed record SessionClose : IRpcRequest<Empty>;

// --- session-wide actions -------------------------------------------------------------------

public sealed record FreeSpace(string Path) : IRpcRequest<DiskSpace>;

public sealed record PortTest(string? IpProtocol = null) : IRpcRequest<PortStatus>
{
    bool IRpcRequest.IsAsyncDispatched => true;
}

public sealed record BlocklistUpdate : IRpcRequest<Blocklist>
{
    TimeSpan IRpcRequest.Timeout => TimeSpan.FromSeconds(300);

    bool IRpcRequest.IsAsyncDispatched => true;
}

// --- bandwidth groups -----------------------------------------------------------------------
// Complete for the sake of the surface; the product exposes no group UI.

/// <summary>The filter key is <c>name</c>; the published specification wrongly calls it <c>group</c>.</summary>
public sealed record GroupGet(IReadOnlyList<string>? Name = null) : IRpcRequest<GroupGetResult>;

public sealed record GroupSet(string Name) : IRpcRequest<Empty>
{
    public bool? HonorsSessionLimits { get; init; }

    /// <summary>kB/s, k = 1000.</summary>
    public int? SpeedLimitDown { get; init; }

    public bool? SpeedLimitDownEnabled { get; init; }

    /// <summary>kB/s, k = 1000.</summary>
    public int? SpeedLimitUp { get; init; }

    public bool? SpeedLimitUpEnabled { get; init; }
}

internal sealed class SessionSetConverter : JsonConverterFactory
{
    public override bool CanConvert(Type type) =>
        type.IsGenericType && type.GetGenericTypeDefinition() == typeof(SessionSet<>);

    public override JsonConverter CreateConverter(Type type, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(
            typeof(Inner<>).MakeGenericType(type.GetGenericArguments()))!;

    private sealed class Inner<TSettings> : JsonConverter<SessionSet<TSettings>>
    {
        public override SessionSet<TSettings> Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
            throw new NotSupportedException("session_set is an argument, never a result.");

        public override void Write(Utf8JsonWriter writer, SessionSet<TSettings> value, JsonSerializerOptions options) =>
            JsonSerializer.Serialize(writer, value.Settings, options);
    }
}
