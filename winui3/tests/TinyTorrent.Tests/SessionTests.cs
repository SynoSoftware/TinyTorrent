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
