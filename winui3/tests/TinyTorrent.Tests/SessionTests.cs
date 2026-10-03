using System.Net;
using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

/// <summary>
/// The session driven whole - the state machine, the poll, the optimism and the arithmetic that
/// retires it - against the daemon fake, with no socket and no window.
/// </summary>
[TestClass]
public sealed class SessionTests
{
    [TestMethod]
    public void ADisconnectDuringOptimisticPublicationDoesNotSendOrReportFailure() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        Torrent row = host.Row(0);
        host.Session.Changed += (_, _) =>
        {
            if (row.Status == TorrentStatus.Stopped)
            {
                host.Session.Disconnect();
            }
        };

        await host.Session.Stop([row]);

        Assert.IsTrue(host.Session.State is SessionState.Idle);
        Assert.AreEqual(0, host.Failures.Count);
        Assert.IsFalse(host.Calls.Any(call => call.Root.ValueKind == System.Text.Json.JsonValueKind.Object &&
            call.Method == "torrent_stop"));
    });

    [TestMethod]
    public void AFailedRemovalAfterAnOverlappingReorderReturnsToTheList() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        Torrent row = host.Row(1);
        TaskCompletionSource<HttpStatusCode> held = host.Hold("torrent_remove");
        Task removing = host.Session.Remove([row], deleteData: false);
        Assert.IsFalse(row.IsPresent);

        await host.Session.Reorder([row], QueueMove.Top);
        held.SetResult(HttpStatusCode.InternalServerError);
        await removing;
        await host.Tick();

        Assert.IsTrue(row.IsPresent);
        Assert.AreEqual(1, host.Failures.Count);
    });

    [TestMethod]
    public void EmptyCommandsDoNotSendRequests() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        await host.Session.Start([]);
        await host.Session.StartNow([]);
        await host.Session.Stop([]);
        await host.Session.Verify([]);
        await host.Session.Remove([], deleteData: false);

        Assert.AreEqual(0, host.Calls.Count);
        Assert.AreEqual(0, host.Failures.Count);
    });

    [TestMethod]
    public void PendingFactsAreRefetchedAfterTheDaemonGoesQuiet() => Pump.Run(async () =>
    {
        using SessionHarness host = new(rows: 1);
        host.GoQuiet();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        await host.Tick();

        host.Edit(0, Daemon.Summary(0) with { EditDate = 1, RateDownload = 0, RateUpload = 0 },
            Daemon.Facts(0, "renamed.iso"));
        await host.Tick();
        Assert.AreEqual("session_stats", host.LastPoll);
        await host.Tick();
        Assert.AreEqual("session_stats+torrent_get", host.LastPoll);
        await host.Tick();

        Assert.AreEqual("session_stats+torrent_get+torrent_get", host.LastPoll);
        Assert.AreEqual("renamed.iso", host.Row(0).Name);
        await host.Tick();
        Assert.AreEqual("session_stats", host.LastPoll);
    });

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public void QuietExternalChangesConvergeWithoutCounterChanges(bool replace) => Pump.Run(async () =>
    {
        using SessionHarness host = new(rows: 1);
        host.GoQuiet();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        await host.Tick();
        Torrent original = host.Row(0);

        if (replace)
        {
            host.Populate(1, firstId: 1);
            host.GoQuiet();
        }
        else
        {
            int paused = host.Paused;
            host.Edit(0, Daemon.Summary(0) with { EditDate = 1, RateDownload = 0, RateUpload = 0 },
                Daemon.Facts(0, "external.iso"));
            host.Paused = paused;
        }

        while (host.Ticked < 30)
        {
            await host.Tick();
            Assert.AreEqual("session_stats", host.LastPoll);
            Assert.AreSame(original, host.Row(0));
            Assert.AreNotEqual("external.iso", host.Row(0).Name);
        }
        await host.Tick();

        Assert.AreEqual("session_stats+torrent_get+torrent_get", host.LastPoll);
        Assert.AreEqual(1, host.Session.Torrents.Count);
        if (replace)
        {
            Assert.AreNotSame(original, host.Row(0));
            Assert.AreEqual(Daemon.Facts(1).HashString, host.Row(0).Hash);
        }
        else
        {
            Assert.AreSame(original, host.Row(0));
            Assert.AreEqual("external.iso", host.Row(0).Name);
        }
    });

    [TestMethod]
    public void GlobalSeedingRulesReflectTheConnectedEngine() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.SeedRatioLimited = true;
        host.SeedRatioLimit = 3;
        host.IdleSeedingLimitEnabled = true;
        host.IdleSeedingLimit = 45;
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        Assert.IsNull(host.Session.SeedingLimits);
        await host.Tick();

        Assert.AreEqual(new SeedingLimits(true, 3, true, 45), host.Session.SeedingLimits);
        host.SeedRatioLimited = false;
        host.IdleSeedingLimitEnabled = false;
        await host.Tick();
        Assert.AreEqual(new SeedingLimits(false, 3, false, 45), host.Session.SeedingLimits);
    });

    [TestMethod]
    public void AnUncertainAdditionReconcilesBeforeAnotherAttempt() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.GoQuiet();
        await host.Tick();
        await host.Tick();
        await host.Until(() => host.IsPolling, "a poll already in flight");
        var parkedPoll = host.Calls[^1];
        Assert.AreEqual("session_stats", parkedPoll.Method);
        TaskCompletionSource<HttpStatusCode> held = host.Hold("torrent_add");
        Task<TorrentAdded> adding = host.Session.Request(new TorrentAdd { Filename = "magnet:?xt=urn:btih:example" });
        held.SetResult(HttpStatusCode.InternalServerError);
        await Assert.ThrowsAsync<RpcTransportException>(() => adding);
        int afterOutcome = host.Calls.Count;

        await host.Tick();
        await host.Tick();
        var sweep = host.Calls.Skip(afterOutcome).FirstOrDefault(call =>
            call.Root.ValueKind == System.Text.Json.JsonValueKind.Array && call.Elements.Count == 3);
        Assert.IsNotNull(sweep, "a new full reconciliation must start after the uncertain outcome");
        CollectionAssert.AreEqual(new[] { "session_stats", "torrent_get", "torrent_get" },
            sweep.Elements.Select(request => request.GetProperty("method").GetString()!).ToArray());
        Assert.IsFalse(sweep.Elements[1].GetProperty("params").TryGetProperty("ids", out _));
        Assert.IsFalse(sweep.Elements[2].GetProperty("params").TryGetProperty("ids", out _));
        Assert.AreEqual(1, host.Calls.Count(call => call.Root.ValueKind == System.Text.Json.JsonValueKind.Object &&
            call.Method == "torrent_add"));
    });

    [TestMethod]
    [DataRow("torrent_set")]
    [DataRow("torrent_set_location")]
    public void AnUncertainTorrentEditReconcilesWithoutRepeatingTheWrite(string method) => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.GoQuiet();
        await host.Tick();
        await host.Tick();
        await host.Until(() => host.IsPolling, "a poll already in flight");

        TorrentIds ids = TorrentIds.Of(host.Row(0).Hash);
        IRpcRequest<Empty> request = method == "torrent_set"
            ? new TorrentSet(ids) { Labels = ["Work"] }
            : new TorrentSetLocation(ids, @"D:\Moved", Move: true);
        TaskCompletionSource<HttpStatusCode> held = host.Hold(method);
        Task<Empty> editing = host.Session.Request(request);
        held.SetResult(HttpStatusCode.InternalServerError);
        await Assert.ThrowsAsync<RpcTransportException>(() => editing);
        int afterOutcome = host.Calls.Count;

        await host.Tick();
        await host.Tick();
        var sweep = host.Calls.Skip(afterOutcome).FirstOrDefault(call =>
            call.Root.ValueKind == System.Text.Json.JsonValueKind.Array && call.Elements.Count == 3);
        Assert.IsNotNull(sweep, "the uncertain edit must schedule a new full reconciliation");
        CollectionAssert.AreEqual(new[] { "session_stats", "torrent_get", "torrent_get" },
            sweep.Elements.Select(item => item.GetProperty("method").GetString()!).ToArray());
        Assert.IsFalse(sweep.Elements[1].GetProperty("params").TryGetProperty("ids", out _));
        Assert.IsFalse(sweep.Elements[2].GetProperty("params").TryGetProperty("ids", out _));
        Assert.AreEqual(1, host.Calls.Count(call => call.Root.ValueKind == System.Text.Json.JsonValueKind.Object &&
            call.Method == method));
    });

    [TestMethod]
    public void TheExistingTickUpdatesAlternativeSpeedAndCurrentDiskSpace() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        Assert.AreEqual(false, host.Session.AltSpeedEnabled);
        Assert.AreEqual(host.DownloadDir, host.Session.Space!.Path);
        Assert.AreEqual(host.FreeBytes, host.Session.Space.SizeBytes);

        host.AltSpeedEnabled = true;
        host.FreeBytes = 5_000_000_000;
        await host.Tick();
        Assert.AreEqual(true, host.Session.AltSpeedEnabled);
        Assert.AreEqual(host.FreeBytes, host.Session.Space!.SizeBytes);

        host.DownloadDir = @"E:\Downloads";
        await host.Tick();
        Assert.AreEqual(host.DownloadDir, host.Session.DownloadDir);
        Assert.IsNull(host.Session.Space, "space from the prior directory must not appear beside the new one");
        await host.Tick();
        Assert.AreEqual(host.DownloadDir, host.Session.Space!.Path);
    });

    [TestMethod]
    public void ARequestWithoutAConnectionReturnsAReadableFailure() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        InvalidOperationException error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => host.Session.Request(new TorrentStop(TorrentIds.Of("hash"))));

        Assert.AreEqual("There is no connection to the daemon.", error.Message);
        Assert.AreEqual(0, host.Failures.Count);
    });

    [TestMethod]
    public void ASuccessfulRequestForcesTheNextPollToReconcile() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.GoQuiet();
        await host.Tick();
        await host.Tick();
        Assert.AreEqual("session_stats", host.LastPoll);

        await host.Session.Request(new TorrentSet(TorrentIds.Of(host.Row(0).Hash)) { Labels = ["Work"] });
        await host.Tick();

        Assert.AreEqual("session_stats+torrent_get+torrent_get", host.LastPoll);
    });

    [TestMethod]
    public void ADisconnectCancelsARequestAndItsLateAnswer() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        TaskCompletionSource<HttpStatusCode> held = host.Hold("torrent_set");
        Task<Empty> request = host.Session.Request(new TorrentSet(TorrentIds.Of(host.Row(0).Hash)));
        host.Session.Disconnect();
        held.SetResult(HttpStatusCode.OK);

        await Assert.ThrowsAsync<OperationCanceledException>(() => request);
        Assert.IsTrue(host.Session.State is SessionState.Idle);
    });

    [TestMethod]
    public void AConnectAfterADisconnectLeavesOneSessionAndItIsTheNewOne() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        host.Session.Disconnect();
        Assert.IsTrue(host.Session.State is SessionState.Idle);

        // Everything from here belongs to the second session. The first one's loop is still alive:
        // its continuation cannot run until this method yields.
        int mark = host.States.Count;
        host.Session.Connect();

        await host.Until(() => host.Session.State is SessionState.Live, "live again");
        await host.Tick();

        // The cancelled loop unwinds through a real cancellation, so give it the time that takes.
        await Task.Delay(100).ConfigureAwait(true);
        await Pump.Settle();

        for (int i = mark; i < host.States.Count; i++)
        {
            Assert.IsFalse(
                host.States[i] is SessionState.Idle,
                "the loop the disconnect cancelled reported its own ending over the session that replaced it");
        }

        Assert.IsTrue(host.Session.State is SessionState.Live);

        // And that is what the state costs: a session reading Idle refuses every command, and a
        // client torn down by the older loop fails the command it is refused with.
        await host.Session.Stop([host.Row(0)]);

        Assert.AreEqual(0, host.Failures.Count, string.Join("; ", host.Failures));
        Assert.AreEqual("torrent_stop", host.LastPoll);
    });

    [TestMethod]
    public void ADisconnectStopsTheSessionAndItsCommands() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Torrent row = host.Row(0);
        host.Session.Disconnect();

        Assert.IsTrue(host.Session.State is SessionState.Idle);

        await host.Session.Stop([row]);

        Assert.AreEqual(1, host.Failures.Count);
        Assert.AreEqual("There is no connection to the daemon.", host.Failures[0]);
    });

    [TestMethod]
    public void ATickAgainstAQuietDaemonStillAdvancesEverySparkline() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");

        await host.Tick();
        Assert.AreEqual("session_stats+torrent_get+torrent_get", host.LastPoll, "the first tick reads everything");

        // A daemon with nothing running answers with statistics alone, but only once it has two
        // ticks to compare its paused count across.
        host.GoQuiet();
        await host.Tick();
        Assert.AreEqual("session_stats+torrent_get", host.LastPoll);

        Torrent row = host.Row(0);
        int revision = row.SpeedRevision;

        await host.Tick();

        Assert.AreEqual("session_stats", host.LastPoll, "a quiet daemon is asked for statistics and nothing else");
        Assert.AreEqual(
            revision + 1,
            row.SpeedRevision,
            "the ring is a 64-second window of ticks, so a tick that merged nothing still advances it");
        Assert.AreEqual(0d, row.SpeedHistory[row.SpeedHistory.Count - 1]);
    });

    [TestMethod]
    public void AnEditTheDaemonHasNotAcknowledgedIsNeverRetired() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Torrent row = host.Row(0);
        TaskCompletionSource<HttpStatusCode> pause = host.Hold("torrent_stop");
        Task stopping = host.Session.Stop([row]);

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);

        // The daemon goes on reporting the torrent as running, and never answers the command.
        for (int tick = 0; tick < 4; tick++)
        {
            await host.Tick();

            Assert.AreEqual(
                TorrentStatus.Stopped,
                row.Status,
                $"after {tick + 1} unanswered ticks the edit has no acknowledgement to retire against");
        }

        pause.SetResult(HttpStatusCode.OK);
        await stopping;
    });

    [TestMethod]
    public void AnAcknowledgedEditStandsUntilTwoTicksAfterTheAcknowledgement() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Torrent row = host.Row(0);

        // Held and released between polls, so the tick the acknowledgement lands on is known.
        TaskCompletionSource<HttpStatusCode> pause = host.Hold("torrent_stop");
        Task stopping = host.Session.Stop([row]);
        pause.SetResult(HttpStatusCode.OK);
        await stopping;

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);

        await host.Tick();
        Assert.AreEqual(
            TorrentStatus.Stopped,
            row.Status,
            "the poll in flight when the acknowledgement arrived was answered from state that predates it");

        await host.Tick();
        Assert.AreEqual(
            TorrentStatus.Download,
            row.Status,
            "two ticks after the acknowledgement the daemon's own answer is the one that stands");
    });

    [TestMethod]
    public void ASecondEditOverTheSameRowThrowsTheFirstAwayAndReadsEverything() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        await host.Tick();

        Assert.AreEqual("session_stats+torrent_get", host.LastPoll, "a settled tick reads the delta");

        Torrent row = host.Row(0);
        TaskCompletionSource<HttpStatusCode> pause = host.Hold("torrent_stop");
        Task stopping = host.Session.Stop([row]);

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);

        await host.Session.Start([row]);

        Assert.AreEqual(TorrentStatus.DownloadWait, row.Status, "the second edit is the one the list shows");

        await host.Tick();

        Assert.AreEqual(
            "session_stats+torrent_get+torrent_get",
            host.LastPoll,
            "two edits over one row are both thrown away, and the next tick reads everything");

        pause.SetResult(HttpStatusCode.OK);
        await stopping;
    });

    [TestMethod]
    public void AFailedEditThatWasAlreadySupersededIsNotUndone() => Pump.Run(async () =>
    {
        using SessionHarness host = new();

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Torrent row = host.Row(0);
        TaskCompletionSource<HttpStatusCode> pause = host.Hold("torrent_stop");
        Task stopping = host.Session.Stop([row]);

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);

        await host.Session.Start([row]);
        Assert.AreEqual(TorrentStatus.DownloadWait, row.Status);

        // The pause now fails. Its inverse was captured before the resume, so applying it would
        // write Download - neither what the daemon holds nor what the user last asked for.
        pause.SetResult(HttpStatusCode.InternalServerError);
        await stopping;

        Assert.AreEqual(
            TorrentStatus.DownloadWait,
            row.Status,
            "an edit a later one already discarded has no inverse worth applying");
        Assert.AreEqual(1, host.Failures.Count, "the user is still told the command failed");
    });

    [TestMethod]
    public void AReconnectStartsFromNothing() => Pump.Run(async () =>
    {
        using SessionHarness host = new(rows: 3);

        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();

        Assert.AreEqual(3, host.Session.Torrents.Count);
        Torrent first = host.Row(0);

        host.Reachable = false;
        await host.Until(() => host.Session.State is SessionState.Retrying, "retrying");

        // A daemon that was restarted: different torrents, and ids that mean nothing to the rows
        // the last connection built.
        host.Populate(2, firstId: 10);
        host.Reachable = true;

        await host.Until(() => host.Session.State is SessionState.Live, "live again");
        await host.Tick();

        Assert.AreEqual(2, host.Session.Torrents.Count);
        Assert.IsFalse(
            host.Session.Torrents.Rows.Contains(first),
            "the numeric ids the rows were keyed by do not survive a daemon restart");
        Assert.AreEqual("session_stats+torrent_get+torrent_get", host.LastPoll, "a new connection reads everything");
    });
}
