using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// A batch is one HTTP request holding an array of JSON-RPC requests, and the daemon runs the
/// whole array under one session lock, so a tick's answers are one consistent view. Two things
/// the published specification does not say are the reason these tests exist: the answer array
/// is compacted before it is sent, and a batch waits for its slowest element.
/// </summary>
[TestClass]
public class BatchTests
{
    [TestMethod]
    public async Task Batch_IsOneRequestHoldingAnArrayWithDistinctIds()
    {
        var daemon = new FakeDaemon((call, _) => Answer(call));
        using var client = daemon.Connect();

        await client.Send(new SessionStats(), new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive));

        Assert.AreEqual(1, daemon.Calls.Count, "one round trip, which is also what keeps a rotation herd to one");

        var elements = daemon.Only.Elements;
        Assert.AreEqual(2, elements.Count);
        Assert.AreEqual("session_stats", elements[0].GetProperty("method").GetString());
        Assert.AreEqual("torrent_get", elements[1].GetProperty("method").GetString());
        Assert.AreNotEqual(elements[0].GetProperty("id").GetInt32(), elements[1].GetProperty("id").GetInt32());

        foreach (var element in elements)
        {
            Assert.AreEqual("2.0", element.GetProperty("jsonrpc").GetString(), "batching requires it on every element");
        }
    }

    [TestMethod]
    public async Task Batch_MatchesAnswersByIdRatherThanByPosition()
    {
        var daemon = new FakeDaemon((call, _) => Answer(call, reversed: true));
        using var client = daemon.Connect();

        var (stats, torrents) = await client.Send(
            new SessionStats(),
            new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive));

        Assert.AreEqual(7, stats.TorrentCount, "position would have handed this the torrent_get answer");
        Assert.AreEqual(1, torrents.Torrents.Count);
        CollectionAssert.AreEqual(new[] { 9 }, torrents.Removed!.ToArray());
    }

    [TestMethod]
    public async Task Batch_IsUnmovedByAnAnswerArrayThatDoesNotLineUp()
    {
        // Every notification's slot is erased with remove_if before the callback runs
        // (rpcimpl.cc:2950-2958), so an answer array can be shorter than the request array and
        // every element after the gap has shifted. Nothing here may depend on position or length.
        var daemon = new FakeDaemon((call, _) =>
        {
            var answers = call.Elements
                .Select(element => FakeDaemon.Success(element.GetProperty("id").GetInt32(), Result(element)))
                .Reverse()
                .Prepend(FakeDaemon.Success(9999, "{}"))
                .ToArray();

            return FakeDaemon.Json($"[{string.Join(",", answers)}]");
        });

        using var client = daemon.Connect();

        var results = await client.Send<TorrentGetResult<TorrentSummary>>(
        [
            new TorrentGet<TorrentSummary>(TorrentIds.Of("a")),
            new TorrentGet<TorrentSummary>(TorrentIds.Of("b")),
            new TorrentGet<TorrentSummary>(TorrentIds.Of("c")),
        ]);

        CollectionAssert.AreEqual(
            new[] { "a", "b", "c" },
            results.Select(result => result.Torrents[0].HashString).ToArray(),
            "each answer must reach the request that asked for it");
    }

    [TestMethod]
    public async Task Batch_ReportsAnAnswerThatLeavesARequestUnmatched()
    {
        var daemon = new FakeDaemon((call, _) =>
            FakeDaemon.Json($"[{FakeDaemon.Success(call.Elements[1].GetProperty("id").GetInt32(), "{}")}]"));

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcTransportException>(
            () => client.Send(new TorrentStart(TorrentIds.Of("a")), new TorrentStop(TorrentIds.Of("b"))));

        StringAssert.Contains(failure.Message, "id");
    }

    [TestMethod]
    public async Task Batch_AnsweredWithASingleObjectIsATransportFailure()
    {
        var daemon = new FakeDaemon((call, _) =>
            FakeDaemon.Json(FakeDaemon.Success(call.Elements[0].GetProperty("id").GetInt32(), "{}")));

        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcTransportException>(
            () => client.Send(new TorrentStart(TorrentIds.Of("a")), new TorrentStop(TorrentIds.Of("b"))));
    }

    [TestMethod]
    public async Task Batch_OfNothingMakesNoRequestAtAll()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        var results = await client.Send<Empty>([]);

        Assert.AreEqual(0, results.Length);
        Assert.AreEqual(
            0,
            daemon.Calls.Count,
            "the daemon counts answers up to n_requests before calling back, so an empty array is never answered");
    }

    [TestMethod]
    [DataRow("torrent_add")]
    [DataRow("port_test")]
    [DataRow("blocklist_update")]
    [DataRow("torrent_rename_path")]
    public async Task Batch_RefusesEveryMethodTheDaemonDispatchesAsynchronously(string method)
    {
        var request = MethodTests.All().Single(candidate => Wire.MethodOf(candidate.GetType()) == method);

        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        var refusal = await Assert.ThrowsExactlyAsync<ArgumentException>(() => Batch(client, request));

        StringAssert.Contains(refusal.Message, method);
        Assert.AreEqual(0, daemon.Calls.Count, "a poll batch behind a blocklist fetch would stall for minutes");
    }

    [TestMethod]
    public async Task Batch_TakesTheLongestDeadlineOfItsMembers()
    {
        var daemon = new FakeDaemon(async (call, _, cancellation) =>
        {
            await Task.Delay(TimeSpan.FromMilliseconds(200), cancellation);
            return Answer(call);
        });

        using var client = daemon.Connect();

        await client.Send(new Patient(TimeSpan.FromMilliseconds(20)), new Patient(TimeSpan.FromSeconds(30)));

        Assert.AreEqual(1, daemon.Calls.Count, "the shorter deadline would have expired at 20 ms");
    }

    private static Task Batch(RpcClient client, IRpcRequest request) => request switch
    {
        TorrentAdd add => client.Send(new SessionStats(), add),
        PortTest test => client.Send(new SessionStats(), test),
        BlocklistUpdate update => client.Send(new SessionStats(), update),
        TorrentRenamePath rename => client.Send(new SessionStats(), rename),
        _ => throw new ArgumentOutOfRangeException(nameof(request)),
    };

    private static HttpResponseMessage Answer(Call call, bool reversed = false)
    {
        var answers = call.Elements
            .Select(element => FakeDaemon.Success(element.GetProperty("id").GetInt32(), Result(element)))
            .ToList();

        if (reversed)
        {
            answers.Reverse();
        }

        return FakeDaemon.Json($"[{string.Join(",", answers)}]");
    }

    /// <summary>Answers each element with something that identifies the request that asked for it.</summary>
    private static string Result(JsonElement element) =>
        element.GetProperty("method").GetString() switch
        {
            "session_stats" => """
                {"active_torrent_count":2,"paused_torrent_count":5,"torrent_count":7,
                 "download_speed":100,"upload_speed":200,
                 "cumulative_stats":{"downloaded_bytes":1,"uploaded_bytes":2,"files_added":3,"session_count":4,"seconds_active":5},
                 "current_stats":{"downloaded_bytes":6,"uploaded_bytes":7,"files_added":8,"session_count":9,"seconds_active":10}}
                """,

            "torrent_get" => $$"""
                {"torrents":[{"id":1,"hash_string":{{Asked(element)}},"name":"one"}],"removed":[9]}
                """,

            _ => "{}",
        };

    private static string Asked(JsonElement element)
    {
        var ids = element.GetProperty("params").TryGetProperty("ids", out var given)
            ? given
            : default;

        return ids.ValueKind == JsonValueKind.Array
            ? $"\"{ids[0].GetString()}\""
            : "\"aaa\"";
    }

    private sealed record Patient(TimeSpan Deadline) : IRpcRequest<Empty>
    {
        TimeSpan IRpcRequest.Timeout => Deadline;
    }
}
