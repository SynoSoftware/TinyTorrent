using System.Text.RegularExpressions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// Decoding is tested against what transmission-daemon 4.1.1 actually sent, captured once with a
/// JSON-RPC 2.0 POST and committed beside these tests. The published specification has at least
/// four known errors, so the fixture is the authority here, not the document.
/// </summary>
[TestClass]
public class DecodeTests
{
    [TestMethod]
    public async Task TorrentGet_DecodesTheDetailProjection()
    {
        var result = await Answer(
            Fixture("torrent_get.json"),
            new TorrentGet<TorrentDetail>(TorrentIds.Of("66b125d6498d4b9f1887bfa34b643bd07cc8eb8e")));

        var torrent = result.Torrents.Single();

        Assert.AreEqual(1, torrent.Id);
        Assert.AreEqual(24, torrent.PieceCount);
        Assert.AreEqual(262144L, torrent.PieceSize);
        Assert.AreEqual(1.0d, torrent.PercentComplete);
        Assert.AreEqual(6291456L, torrent.HaveValid);
        Assert.AreEqual(Priority.High, torrent.BandwidthPriority);
        Assert.AreEqual(RatioMode.Single, torrent.SeedRatioMode);
        Assert.AreEqual(IdleMode.Single, torrent.SeedIdleMode);
        Assert.AreEqual(2.5d, torrent.SeedRatioLimit);
        Assert.AreEqual(45, torrent.SeedIdleLimit);
        Assert.AreEqual(37, torrent.PeerLimit);
        Assert.IsTrue(torrent.SequentialDownload);

        var file = torrent.Files.Single();
        Assert.AreEqual("fixture-payload.bin", file.Name);
        Assert.AreEqual(6291456L, file.Length);
        Assert.AreEqual(0, file.BeginPiece);
        Assert.AreEqual(24, file.EndPiece);

        var stat = torrent.FileStats.Single();
        Assert.AreEqual(Priority.Normal, stat.Priority);
        Assert.IsTrue(stat.Wanted);

        Assert.AreEqual(0, torrent.Peers.Count);
        Assert.AreEqual(0, torrent.PeersFrom.FromTracker);
        Assert.AreEqual(24, torrent.Availability.Count);
        Assert.AreEqual(-1, torrent.Availability[0], "-1 means we already have that piece");

        Assert.AreEqual(2, torrent.Trackers.Count);
        Assert.AreEqual("example", torrent.Trackers[0].Sitename, "the sidebar's per-tracker filter needs this");

        var tracker = torrent.TrackerStats[0];
        Assert.AreEqual(TrackerState.Waiting, tracker.AnnounceState);
        Assert.AreEqual("Could not connect to tracker", tracker.LastAnnounceResult);
        Assert.AreEqual(-1, tracker.SeederCount, "-1 is the daemon's 'not scraped yet'");
        Assert.AreEqual(TrackerState.Active, torrent.TrackerStats[1].ScrapeState);
    }

    [TestMethod]
    public async Task TorrentGet_DecodesTheSummaryProjectionFromTheSameAnswer()
    {
        var result = await Answer(Fixture("torrent_get.json"), new TorrentGet<TorrentSummary>());
        var torrent = result.Torrents.Single();

        Assert.AreEqual("66b125d6498d4b9f1887bfa34b643bd07cc8eb8e", torrent.HashString);
        Assert.AreEqual("fixture-payload.bin", torrent.Name);
        Assert.AreEqual(TorrentStatus.Seed, torrent.Status);
        Assert.AreEqual(1.0d, torrent.PercentDone);
        Assert.AreEqual(TorrentError.Ok, torrent.Error);
        Assert.IsFalse(torrent.IsStalled, "taken from the wire, not derived from a peer count");
        CollectionAssert.AreEqual(new[] { "fixture", "rpc-test", "verified" }, torrent.Labels.ToArray());
    }

    [TestMethod]
    public async Task Eta_KeepsTheDaemonsSentinelsRatherThanShowingMinusTwoSeconds()
    {
        var result = await Answer(Fixture("torrent_get.json"), new TorrentGet<TorrentSummary>());

        Assert.AreEqual(Eta.Unknown, result.Torrents[0].Eta.Seconds);
        Assert.IsNull(result.Torrents[0].Eta.Value);
        Assert.AreEqual(TimeSpan.FromSeconds(2651), new Eta(2651).Value);
        Assert.IsNull(new Eta(Eta.NotAvailable).Value);
    }

    [TestMethod]
    public async Task Pieces_DecodeAsAnMsbFirstBitfield()
    {
        var result = await Answer(Fixture("torrent_get.json"), new TorrentGet<TorrentDetail>());
        var pieces = result.Torrents[0].Pieces;

        Assert.IsFalse(pieces.IsEmpty);

        for (var piece = 0; piece < 24; piece++)
        {
            Assert.IsTrue(pieces.Has(piece), $"piece {piece}");
        }

        Assert.IsFalse(pieces.Has(24), "past the end of the bitfield");
        Assert.IsFalse(pieces.Has(-1));
    }

    [TestMethod]
    public async Task Pieces_AreEmptyWhileAMagnetHasNoMetainfo()
    {
        var result = await Answer(
            """{"jsonrpc":"2.0","result":{"torrents":[{"pieces":""}]},"id":1}""",
            new TorrentGet<Bitfield>());

        Assert.IsTrue(result.Torrents[0].Pieces.IsEmpty);
        Assert.IsFalse(result.Torrents[0].Pieces.Has(0));
    }

    [TestMethod]
    public async Task Pieces_ReadTheMostSignificantBitFirst()
    {
        // gA== is 0x80: the first piece and nothing else.
        var result = await Answer(
            """{"jsonrpc":"2.0","result":{"torrents":[{"pieces":"gA=="}]},"id":1}""",
            new TorrentGet<Bitfield>());

        Assert.IsTrue(result.Torrents[0].Pieces.Has(0));
        Assert.IsFalse(result.Torrents[0].Pieces.Has(1));
        Assert.IsFalse(result.Torrents[0].Pieces.Has(7));
    }

    [TestMethod]
    public async Task Wanted_ReadsBothTheBooleanAnd0Or1()
    {
        var result = await Answer(
            """
            {"jsonrpc":"2.0","result":{"torrents":[{"file_stats":[
              {"bytes_completed":1,"priority":0,"wanted":true},
              {"bytes_completed":2,"priority":1,"wanted":0}]}]},"id":1}
            """,
            new TorrentGet<Stats>());

        var stats = result.Torrents[0].FileStats;
        Assert.IsTrue(stats[0].Wanted, "4.1 writes a boolean");
        Assert.IsFalse(stats[1].Wanted, "4.0 wrote 0 or 1");
    }

    [TestMethod]
    public async Task SessionGet_DecodesTheDaemonsSettings()
    {
        var settings = await Answer(Fixture("session_get.json"), new SessionGet<Preferences>());

        Assert.AreEqual("4.1.1 (56442e2929)", settings.Version);
        Assert.AreEqual("6.0.1", settings.RpcVersionSemver);
        Assert.AreEqual(200, settings.PeerLimitGlobal, "the one live memory knob");
        Assert.AreEqual("preferred", settings.Encryption);
        Assert.AreEqual(540, settings.AltSpeedTimeBegin, "minutes from midnight");
        Assert.AreEqual(127, settings.AltSpeedTimeDay, "Sunday = 1 through Saturday = 64");
        Assert.AreEqual(2.0d, settings.SeedRatioLimit);
    }

    [TestMethod]
    public async Task SessionGet_ReportsSpeedAndSizeInThousandsAndMemoryIn1024s()
    {
        var settings = await Answer(Fixture("session_get.json"), new SessionGet<Preferences>());
        var units = settings.Units;

        Assert.IsNotNull(units);
        Assert.AreEqual(
            1000L,
            units.SpeedBytes,
            "only the GTK and Qt clients ever reassign this, so it is asserted rather than branched on");

        Assert.AreEqual(1000L, units.SizeBytes);
        Assert.AreEqual(1024L, units.MemoryBytes);
        CollectionAssert.Contains(units.SpeedUnits.ToArray(), "kB/s");
    }

    [TestMethod]
    public async Task SessionStats_DecodesBothTheRunningAndCumulativeTotals()
    {
        var stats = await Answer(Fixture("session_stats.json"), new SessionStats());

        Assert.AreEqual(1, stats.TorrentCount, "this integer is what makes a missed removal impossible to hide");
        Assert.AreEqual(1, stats.ActiveTorrentCount);
        Assert.AreEqual(0, stats.PausedTorrentCount);
        Assert.AreEqual(0L, stats.DownloadSpeed);
        Assert.AreEqual(166L, stats.CumulativeStats.SecondsActive);
        Assert.AreEqual(1, stats.CurrentStats.SessionCount);
    }

    [TestMethod]
    public async Task FreeSpace_DecodesTheAvailableAndTotalBytes()
    {
        var space = await Answer(Fixture("free_space.json"), new FreeSpace(@"C:\downloads"));

        Assert.AreEqual(230074605568L, space.SizeBytes);
        Assert.AreEqual(510978420736L, space.TotalSize);
        StringAssert.Contains(space.Path, "downloads");
    }

    [TestMethod]
    public async Task TorrentAdd_ThatFailsIsAMethodErrorEvenThoughTheStatusIs200()
    {
        var daemon = FakeDaemon.Answering(Fixture("torrent_add_failed.json"));
        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcMethodException>(
            () => client.Send(new TorrentAdd { Filename = @"C:\nope.torrent" }));

        Assert.AreEqual(RpcError.UnrecognizedInfo, failure.Code);
        Assert.IsFalse(failure.IsProtocol);
        StringAssert.Contains(failure.Message, "unrecognized info");
    }

    [TestMethod]
    public async Task TorrentAdd_DistinguishesAnAddFromADuplicate()
    {
        const string reference = """{"id":4,"name":"debian.iso","hash_string":"abc"}""";

        var added = await Answer(
            $$"""{"jsonrpc":"2.0","result":{"torrent_added":{{reference}}},"id":1}""",
            new TorrentAdd { Filename = "magnet:?xt=urn:btih:abc" });

        Assert.IsFalse(added.IsDuplicate);
        Assert.AreEqual("abc", added.Torrent.HashString);
        Assert.AreEqual("debian.iso", added.Torrent.Name);

        var duplicate = await Answer(
            $$"""{"jsonrpc":"2.0","result":{"torrent_duplicate":{{reference}}},"id":1}""",
            new TorrentAdd { Filename = "magnet:?xt=urn:btih:abc" });

        Assert.IsTrue(duplicate.IsDuplicate, "a duplicate is a success, so it must not read as one");
        Assert.AreEqual(4, duplicate.Torrent.Id);
    }

    [TestMethod]
    public async Task Removed_RidesOnlyOnARecentlyActiveAnswer()
    {
        var withRemovals = await Answer(
            """{"jsonrpc":"2.0","result":{"torrents":[],"removed":[3,7]},"id":1}""",
            new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive));

        CollectionAssert.AreEqual(new[] { 3, 7 }, withRemovals.Removed!.ToArray());

        var sweep = await Answer(
            """{"jsonrpc":"2.0","result":{"torrents":[]},"id":1}""",
            new TorrentGet<TorrentSummary>());

        Assert.IsNull(sweep.Removed);
    }

    [TestMethod]
    public void SpeedBps_AppearsInNothingTheDaemonSends()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "Fixtures");
        var files = Directory.GetFiles(directory, "*.json");

        Assert.AreEqual(5, files.Length, "five captures: torrent_get, session_get, session_stats, free_space, a failed add");

        foreach (var file in files)
        {
            var text = File.ReadAllText(file);

            Assert.IsFalse(
                Regex.IsMatch(text, "speed[-_]?[Bb]ps", RegexOptions.IgnoreCase),
                $"{Path.GetFileName(file)} names a Bps key; quark.cc:616 marks speed_Bps as .resume only");
        }
    }

    private static async Task<TResult> Answer<TResult>(string body, IRpcRequest<TResult> request)
    {
        var daemon = FakeDaemon.Answering(body);
        using var client = daemon.Connect();

        return await client.Send(request);
    }

    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", name));

    private sealed record Bitfield(PieceBitfield Pieces);

    private sealed record Stats(IReadOnlyList<FileStat> FileStats);
}
