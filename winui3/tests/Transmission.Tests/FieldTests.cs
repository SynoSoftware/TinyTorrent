using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// The fields a request asks for are the properties of the type its answer deserializes into,
/// read from that type's own JsonTypeInfo. Nothing writes a field list by hand, so a projection
/// and its request cannot drift apart.
/// </summary>
[TestClass]
public class FieldTests
{
    [TestMethod]
    public async Task Fields_AreThePropertiesOfTheProjection()
    {
        var fields = await Fields(new TorrentGet<TorrentSummary>());

        CollectionAssert.AreEquivalent(
            new[]
            {
                "id", "hash_string", "name", "status", "queue_position", "percent_done",
                "rate_download", "rate_upload", "eta", "is_stalled", "downloaded_ever",
                "uploaded_ever", "upload_ratio", "error", "error_string", "labels", "edit_date",
            },
            fields);
    }

    [TestMethod]
    public async Task Fields_FollowTheProjectionRatherThanTheRequest()
    {
        var summary = await Fields(new TorrentGet<TorrentSummary>());
        var detail = await Fields(new TorrentGet<TorrentDetail>());

        CollectionAssert.AreNotEquivalent(summary, detail, "same request type, different projection");
        CollectionAssert.Contains(detail, "availability");
        CollectionAssert.DoesNotContain(summary, "availability", "the tick must not carry the Pieces tab's cost");
    }

    [TestMethod]
    public async Task Fields_MatchTheProjectionsPropertiesExactly()
    {
        var fields = await Fields(new TorrentGet<TorrentDetail>());

        CollectionAssert.AreEquivalent(
            Wire.FieldsOf(typeof(TorrentDetail)),
            fields,
            "drift between the two is not prevented, it is unrepresentable");

        Assert.AreEqual(
            typeof(TorrentDetail).GetProperties().Length,
            fields.Length,
            "one field per property of the type, no more and no fewer");
    }

    [TestMethod]
    public async Task Fields_CannotBeLeftOffASessionGet()
    {
        var fields = await Fields(new SessionGet<Preferences>());

        Assert.IsTrue(fields.Length > 0);
        CollectionAssert.Contains(fields, "download_dir");
        CollectionAssert.DoesNotContain(
            fields,
            "download_dir_free_space",
            "with fields absent the daemon returns everything, and that key stats the filesystem");
    }

    [TestMethod]
    public async Task Fields_AreAbsentFromRequestsThatHaveNoProjection()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentStart(TorrentIds.Of("abc")));

        Assert.IsFalse(daemon.Only.Arguments.TryGetProperty("fields", out _));
    }

    // --- ids ------------------------------------------------------------------------------

    [TestMethod]
    public async Task Ids_AreOmittedForAllTorrents()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentStop(TorrentIds.All));

        Assert.IsFalse(
            daemon.Only.Arguments.TryGetProperty("ids", out _),
            "omitting ids is how the daemon spells every torrent; a present-but-empty ids means none");
    }

    [TestMethod]
    public async Task Ids_AreOmittedWhenTheArgumentIsSimplyNotGiven()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentGet<TorrentSummary>());

        Assert.IsFalse(daemon.Only.Arguments.TryGetProperty("ids", out _));
    }

    [TestMethod]
    public async Task Ids_RecentlyActiveIsTheBareString()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive));

        var ids = daemon.Only.Arguments.GetProperty("ids");
        Assert.AreEqual(JsonValueKind.String, ids.ValueKind, "wrapped in an array there is no removed key and no error");
        Assert.AreEqual("recently_active", ids.GetString());
    }

    [TestMethod]
    public async Task Ids_ListedAreSentAsHashes()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentStart(TorrentIds.Of("aaa", "bbb")));

        var ids = daemon.Only.Arguments.GetProperty("ids");
        Assert.AreEqual(JsonValueKind.Array, ids.ValueKind);
        CollectionAssert.AreEqual(new[] { "aaa", "bbb" }, ids.EnumerateArray().Select(e => e.GetString()).ToArray());
    }

    [TestMethod]
    public void Ids_RefuseAnEmptyList() =>
        Assert.ThrowsExactly<ArgumentException>(() => TorrentIds.Of());

    // --- optional arguments ---------------------------------------------------------------

    [TestMethod]
    public async Task Optional_ArgumentsAreOmittedWhenNotSet()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentSet(TorrentIds.Of("abc")));

        var arguments = daemon.Only.Arguments;
        Assert.AreEqual(1, arguments.EnumerateObject().Count(), "only ids");
    }

    [TestMethod]
    public async Task Optional_ArgumentsAreSentWhenSetEvenToTheirZeroValue()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentSet(TorrentIds.Of("abc"))
        {
            BandwidthPriority = Priority.Normal,
            DownloadLimited = false,
            QueuePosition = 0,
        });

        var arguments = daemon.Only.Arguments;
        Assert.AreEqual(0, arguments.GetProperty("bandwidth_priority").GetInt32(), "normal is 0 and must survive");
        Assert.IsFalse(arguments.GetProperty("download_limited").GetBoolean());
        Assert.AreEqual(0, arguments.GetProperty("queue_position").GetInt32());
    }

    [TestMethod]
    public async Task Optional_DeadlineAndDispatchAreNotArguments()
    {
        var daemon = FakeDaemon.Answering("""{"jsonrpc":"2.0","result":{"blocklist_size":402},"id":1}""");
        using var client = daemon.Connect();

        var blocklist = await client.Send(new BlocklistUpdate());

        Assert.AreEqual(402, blocklist.BlocklistSize);
        Assert.AreEqual(
            0,
            daemon.Only.Arguments.EnumerateObject().Count(),
            "the 300 s deadline and the async-dispatch flag are the client's business, not the daemon's");
    }

    [TestMethod]
    public async Task SessionSet_SendsTheSettingsAsTheArgumentsThemselves()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new SessionSet<Preferences>(new Preferences
        {
            SpeedLimitDown = 250,
            DownloadDir = @"D:\x",
            AltSpeedEnabled = false,
            IdleSeedingLimit = 0,
        }));

        var arguments = daemon.Only.Arguments;

        CollectionAssert.AreEquivalent(
            new[] { "speed_limit_down", "download_dir", "alt_speed_enabled", "idle_seeding_limit" },
            arguments.EnumerateObject().Select(argument => argument.Name).ToArray(),
            "the keys set and nothing else: a session_set changes every key it carries");

        Assert.AreEqual(250, arguments.GetProperty("speed_limit_down").GetInt32());
        Assert.AreEqual(@"D:\x", arguments.GetProperty("download_dir").GetString());
        Assert.IsFalse(
            arguments.GetProperty("alt_speed_enabled").GetBoolean(),
            "false is a value, not an absence; dropping it means turtle mode cannot be turned off");
        Assert.AreEqual(0, arguments.GetProperty("idle_seeding_limit").GetInt32(), "0 is a limit like any other");
    }

    private static async Task<string[]> Fields<TResult>(IRpcRequest<TResult> request)
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(request);

        return [.. daemon.Only.Arguments.GetProperty("fields").EnumerateArray().Select(field => field.GetString()!)];
    }
}
