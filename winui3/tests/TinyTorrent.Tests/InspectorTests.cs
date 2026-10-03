using System.Net;
using System.Text.Json;
using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

[TestClass]
public sealed class InspectorTests
{
    [TestMethod]
    public void AnExplicitRetryRetainsTheBlockedInspectorTarget() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        string hash = host.Row(0).Hash;
        host.DetailJson = Files(hash);
        bool blocked = false;
        host.Session.DetailChanged += (_, detail) =>
        {
            if (detail is not null && !blocked)
            {
                blocked = true;
                host.Refused = HttpStatusCode.Forbidden;
            }
        };
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.State is SessionState.Blocked, "blocked");
        Assert.IsNull(host.Session.Detail, "blocked sessions release expensive inspector details");

        int mark = host.States.Count;
        host.Refused = null;
        host.Session.Retry();
        await host.Until(() => host.Session.State is SessionState.Live, "live after retry");
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "retained inspector detail");

        Assert.AreEqual(hash, host.Session.Detail!.Hash);
        Assert.AreEqual(InspectorTab.Files, host.Session.Detail.Tab);
        Assert.IsFalse(host.States.Skip(mark).Any(state => state is SessionState.Idle));
    });

    [TestMethod]
    public void AnAutomaticReconnectResumesTheSameInspectorSelection() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Torrent original = host.Row(0);
        host.DetailJson = Files(original.Hash);
        bool dropped = false;
        bool releasedBeforeStateNotification = false;
        host.Session.StateChanged += (_, state) =>
        {
            if (state is SessionState.Retrying)
                releasedBeforeStateNotification = host.Session.Detail is null && host.Session.DetailError is null;
        };
        host.Session.DetailChanged += (_, detail) =>
        {
            if (detail is not null && !dropped)
            {
                dropped = true;
                host.Reachable = false;
            }
        };
        host.Session.Inspect(original, InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.State is SessionState.Retrying, "retrying");
        Assert.IsTrue(releasedBeforeStateNotification, "non-Live state observers must see released details");

        int reconnect = host.Calls.Count;
        host.Reachable = true;
        await host.Until(() => host.Session.State is SessionState.Live, "live again");
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "restored inspector detail");

        Assert.AreNotSame(original, host.Row(0));
        Assert.AreEqual(original.Hash, host.Session.Detail!.Hash);
        Assert.AreEqual(InspectorTab.Files, host.Session.Detail.Tab);
        JsonElement fields = host.Calls.Skip(reconnect).Last(call => call.Root.ValueKind == JsonValueKind.Object &&
            call.Method == "torrent_get").Arguments.GetProperty("fields");
        Assert.IsTrue(fields.EnumerateArray().Any(field => field.GetString() == "files"),
            "reconnect must reload the released file metadata");
    });

    [TestMethod]
    public void FileMetadataIsCachedWhileFileStatsContinueToPoll() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.DetailJson = Files(host.Row(0).Hash);
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "file metadata");

        TorrentDetail first = host.Session.Detail!;
        IReadOnlyList<TorrentFile> names = ((TorrentFiles)first.Value).Files;
        await host.Tick();
        await host.Until(() => !ReferenceEquals(first, host.Session.Detail), "fresh file stats");

        JsonElement fields = host.Calls.Last(call => call.Root.ValueKind == JsonValueKind.Object &&
            call.Method == "torrent_get").Arguments.GetProperty("fields");
        Assert.IsTrue(fields.EnumerateArray().Any(field => field.GetString() == "file_stats"));
        Assert.IsFalse(fields.EnumerateArray().Any(field => field.GetString() == "files"));
        Assert.AreSame(names, ((TorrentFiles)host.Session.Detail!.Value).Files);

        host.Session.Inspect(host.Row(0), InspectorTab.Speed);
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "files after switching tabs");
        Assert.AreSame(names, ((TorrentFiles)host.Session.Detail!.Value).Files);
    });

    [TestMethod]
    public void AnUncertainRenameReloadsFileNamesWithoutRepeatingTheWrite() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        string hash = host.Row(0).Hash;
        host.DetailJson = Files(hash);
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "file metadata");
        IReadOnlyList<TorrentFile> original = ((TorrentFiles)host.Session.Detail!.Value).Files;
        await host.Tick();
        await host.Until(() => host.IsPolling, "parked poll");

        TaskCompletionSource<HttpStatusCode> held = host.Hold("torrent_rename_path");
        Task<RenamedPath> renaming = host.Session.Request(new TorrentRenamePath(TorrentIds.Of(hash), "example.iso", "renamed.iso"));
        held.SetResult(HttpStatusCode.InternalServerError);
        await Assert.ThrowsAsync<RpcTransportException>(() => renaming);
        int outcome = host.Calls.Count;
        host.DetailJson = Files(hash).Replace("example.iso", "renamed.iso", StringComparison.Ordinal);

        await host.Tick();
        await host.Tick();
        await host.Until(() => host.Session.Detail?.Value is TorrentFiles files && files.Files[0].Name == "renamed.iso", "reconciled file name");
        var sweep = host.Calls.Skip(outcome).FirstOrDefault(call => call.Root.ValueKind == JsonValueKind.Array && call.Elements.Count == 3);
        Assert.IsNotNull(sweep, "an uncertain rename must force the existing full refresh");
        Assert.IsFalse(sweep.Elements[1].GetProperty("params").TryGetProperty("ids", out _));
        Assert.IsFalse(sweep.Elements[2].GetProperty("params").TryGetProperty("ids", out _));
        Assert.AreNotSame(original, ((TorrentFiles)host.Session.Detail!.Value).Files, "uncertainty must invalidate cached paths");
        Assert.IsTrue(host.Calls.Skip(outcome).Any(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get" &&
            call.Arguments.GetProperty("fields").EnumerateArray().Any(field => field.GetString() == "files")), "the existing detail poll must reload file metadata");
        Assert.AreEqual(1, host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_rename_path"));
    });

    [TestMethod]
    public void ARejectedDetailNotifiesWhileNullAndRetriesOnlyOnTheNextTick() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        List<string?> failures = [];
        host.Session.DetailChanged += (_, _) => failures.Add(host.Session.DetailError);
        host.DetailError = RpcError.InvalidParams;
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        Assert.IsNull(host.Session.Detail);
        await host.Tick();
        await host.Until(() => host.Session.DetailError is not null, "detail failure");

        Assert.IsTrue(host.Session.State is SessionState.Live);
        Assert.IsNull(host.Session.Detail);
        Assert.AreEqual(1, failures.Count, "a failed initial read must notify even though details were already null");
        Assert.IsTrue(failures[0]!.Contains("unsupported detail field", StringComparison.Ordinal));
        Assert.AreEqual(0, host.Failures.Count, "detail recovery is separate from command failure feedback");
        int requests = host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get");

        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Tick();
        Assert.AreEqual(requests, host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get"));
        Assert.AreEqual(1, failures.Count);
        Assert.IsTrue(host.Session.State is SessionState.Live);

        host.DetailError = null;
        host.DetailJson = Files(host.Row(0).Hash);
        int beforeRetry = host.Calls.Count;
        host.Session.Retry();
        Assert.IsNull(host.Session.DetailError);
        Assert.IsNull(host.Session.Detail);
        Assert.AreEqual(2, failures.Count, "retry must publish the cleared failure before a new result exists");
        Assert.IsNull(failures[1]);
        Assert.AreEqual(beforeRetry, host.Calls.Count, "retry clears state without issuing an immediate RPC");
        Assert.IsTrue(host.Session.State is SessionState.Live);
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "retried detail");
        Assert.AreEqual(host.Row(0).Hash, host.Session.Detail!.Hash);
        Assert.AreEqual(InspectorTab.Files, host.Session.Detail.Tab);
        Assert.AreEqual(requests + 1, host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get"));
    });

    [TestMethod]
    public void AHiddenInspectorMakesNoDetailRequests() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        await host.Tick();

        Assert.IsFalse(host.Calls.Any(call => call.Root.ValueKind == JsonValueKind.Object &&
            call.Method == "torrent_get"));
        Assert.IsNull(host.Session.Detail);
    });

    [TestMethod]
    public void ADetailFailureClearsBeforeTheBlockedStateIsPublished() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        bool clearedBeforeStateNotification = false;
        bool unavailableNotified = false;
        bool failureNotified = false;
        host.Session.DetailChanged += (_, detail) =>
        {
            if (host.Session.State is SessionState.Live && host.Session.DetailError is not null)
            {
                failureNotified = true;
                host.Refused = HttpStatusCode.Forbidden;
            }
            if (host.Session.State is SessionState.Blocked)
                unavailableNotified = detail is null && host.Session.DetailError is null;
        };
        host.Session.StateChanged += (_, state) =>
        {
            if (state is SessionState.Blocked)
                clearedBeforeStateNotification = unavailableNotified && host.Session.Detail is null && host.Session.DetailError is null;
        };
        host.DetailError = RpcError.InvalidParams;
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.State is SessionState.Blocked, "blocked");

        Assert.IsTrue(failureNotified);
        Assert.IsTrue(clearedBeforeStateNotification, "the UI must see non-Live availability before handling the new connection state");
    });

    [TestMethod]
    public void PiecesAreRequestedOnlyForTheVisiblePiecesTab() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        string hash = host.Row(0).Hash;
        host.DetailJson = Files(hash);
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        await host.Tick();
        await host.Until(() => host.Session.Detail is { Tab: InspectorTab.Files }, "files detail");

        JsonElement fields = host.Calls.Last(call => call.Root.ValueKind == JsonValueKind.Object &&
            call.Method == "torrent_get").Root.GetProperty("params").GetProperty("fields");
        Assert.IsFalse(fields.EnumerateArray().Any(field => field.GetString() is "pieces" or "availability"));

        host.DetailJson = $$"""{"torrents":[{"id":0,"hash_string":"{{hash}}","piece_count":8,"piece_size":16384,"pieces":"gA==","availability":[-1,2,0,1,1,1,1,1]}]}""";
        host.Session.Inspect(host.Row(0), InspectorTab.Pieces);
        await host.Tick();
        await host.Until(() => host.Session.Detail is { Tab: InspectorTab.Pieces }, "pieces detail");

        TorrentPieces pieces = (TorrentPieces)host.Session.Detail!.Value;
        Assert.IsTrue(pieces.Pieces.Has(0));
        Assert.AreEqual(2, pieces.Availability[1]);
        Assert.AreEqual(hash, host.Session.Detail.Hash);

        host.Session.Inspect(null, InspectorTab.Pieces);
        int detailCalls = host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get");
        await host.Tick();
        Assert.AreEqual(detailCalls, host.Calls.Count(call => call.Root.ValueKind == JsonValueKind.Object && call.Method == "torrent_get"));
        Assert.IsNull(host.Session.Detail);
    });

    [TestMethod]
    public void APreviousSelectionCannotPublishItsLateDetail() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        host.DetailJson = Files(host.Row(0).Hash);
        host.Session.Inspect(host.Row(0), InspectorTab.Files);
        TaskCompletionSource<HttpStatusCode> held = host.Hold("torrent_get");
        await host.Tick();
        await host.Until(() => host.Calls[^1].Root.ValueKind == JsonValueKind.Object &&
            host.Calls[^1].Method == "torrent_get", "detail request");

        host.Session.Inspect(host.Row(1), InspectorTab.Files);
        held.SetResult(HttpStatusCode.OK);
        await Task.Delay(10);
        await Pump.Settle();
        Assert.IsNull(host.Session.Detail);

        host.DetailJson = Files(host.Row(1).Hash);
        await host.Tick();
        await host.Until(() => host.Session.Detail is not null, "new selection detail");
        Assert.AreEqual(host.Row(1).Hash, host.Session.Detail!.Hash);
    });

    private static string Files(string hash) =>
        $$"""{"torrents":[{"id":0,"hash_string":"{{hash}}","files":[{"name":"example.iso","length":1024,"bytes_completed":512,"begin_piece":0,"end_piece":0}],"file_stats":[{"bytes_completed":512,"priority":0,"wanted":true}]}]}""";
}
