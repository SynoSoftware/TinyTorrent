using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

[TestClass]
public sealed class SpeedTests
{
    [TestMethod]
    public void DirectionHistoryKeepsItsMeaningWhenATorrentStartsSeeding()
    {
        Torrent row = Row();
        Assert.AreEqual(0, row.SpeedHistory.Count);
        Assert.IsNull(row.SpeedHistory.Transfers);

        row.SampleSpeed(TimeSpan.Zero, observe: true);
        row.Apply(Daemon.Summary(0, TorrentStatus.Seed, rateDownload: 400, rateUpload: 900));
        row.SampleSpeed(TimeSpan.FromSeconds(2), observe: true);

        IReadOnlyList<SpeedSample> samples = row.SpeedHistory.Transfers!;
        Assert.AreEqual(1_000_000d, samples[0].Download);
        Assert.AreEqual(100_000d, samples[0].Upload);
        Assert.AreEqual(400d, samples[1].Download);
        Assert.AreEqual(900d, samples[1].Upload);
        Assert.AreEqual(1_000_000d, row.SpeedHistory[0]);
        Assert.AreEqual(900d, row.SpeedHistory[1]);
        Assert.AreEqual(2, row.SpeedHistory.ToArray().Length);
    }

    [TestMethod]
    public void MissingObservationsStartANewChartSegment()
    {
        Torrent row = Row();
        row.SampleSpeed(TimeSpan.Zero, observe: true);
        row.SampleSpeed(TimeSpan.FromSeconds(2), observe: true);
        row.SampleSpeed(TimeSpan.FromSeconds(8), observe: true);

        IReadOnlyList<SpeedSample> samples = row.SpeedHistory.Transfers!;
        Assert.IsTrue(samples[0].StartsSegment);
        Assert.IsFalse(samples[1].StartsSegment);
        Assert.IsTrue(samples[2].StartsSegment);
        Assert.AreEqual(TimeSpan.FromSeconds(8), samples[2].Time);
    }

    [TestMethod]
    public void HiddenDirectionHistoryIsReleasedWithoutInventingLaterSamples()
    {
        Torrent row = Row();
        row.SampleSpeed(TimeSpan.Zero, observe: true);
        IReadOnlyList<SpeedSample> observed = row.SpeedHistory.Transfers!;
        row.SampleSpeed(TimeSpan.FromSeconds(2), observe: false);

        Assert.IsNull(row.SpeedHistory.Transfers);
        Assert.AreEqual(0, observed.Count);
        Assert.AreEqual(2, row.SpeedHistory.Count);

        row.SampleSpeed(TimeSpan.FromSeconds(4), observe: true);
        Assert.AreEqual(1, row.SpeedHistory.Transfers!.Count);
        Assert.IsTrue(row.SpeedHistory.Transfers[0].StartsSegment);
        Assert.AreEqual(TimeSpan.FromSeconds(4), row.SpeedHistory.Transfers[0].Time);
    }

    [TestMethod]
    public void DirectionHistoryRemainsBounded()
    {
        Torrent row = Row();
        for (int tick = 0; tick < 100; tick++)
        {
            row.SampleSpeed(TimeSpan.FromSeconds(tick * 2), observe: true);
        }

        IReadOnlyList<SpeedSample> samples = row.SpeedHistory.Transfers!;
        Assert.AreEqual(Torrent.SpeedHistoryLength, samples.Count);
        Assert.AreEqual(TimeSpan.FromSeconds(198), samples[^1].Time);
        Assert.IsTrue(samples[0].Time > TimeSpan.Zero);
    }

    [TestMethod]
    public void TheSessionTickSamplesBothDirectionsOnlyWhileSpeedIsVisible() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.Session.Inspect(host.Row(0), InspectorTab.Speed);
        Assert.IsNull(host.Session.SpeedHistory);
        await host.Tick();

        IReadOnlyList<SpeedSample> samples = host.Session.SpeedHistory!;
        Assert.AreEqual(1, samples.Count);
        Assert.AreEqual(host.Row(0).DownloadSpeed, samples[0].Download);
        Assert.AreEqual(host.Row(0).UploadSpeed, samples[0].Upload);
        Assert.IsNull(host.Row(1).SpeedHistory.Transfers);

        host.GoQuiet();
        await host.Tick();
        Assert.AreEqual(0d, samples[^1].Download);
        Assert.AreEqual(0d, samples[^1].Upload);
        Assert.IsTrue(samples[^1].Time >= samples[0].Time);

        host.Session.Inspect(null, InspectorTab.Speed);
        Assert.IsNull(host.Session.SpeedHistory);
        Assert.AreEqual(0, samples.Count);
    });

    [TestMethod]
    public void AnAutomaticReconnectStartsFreshDirectionHistory() => Pump.Run(async () =>
    {
        using SessionHarness host = new();
        host.Session.Connect();
        await host.Until(() => host.Session.State is SessionState.Live, "live");
        await host.Tick();
        host.Session.Inspect(host.Row(0), InspectorTab.Speed);
        IReadOnlyList<SpeedSample>? original = null;
        host.Session.Changed += (_, _) =>
        {
            if (original is null && host.Session.SpeedHistory is { Count: > 0 } history)
            {
                original = history;
                host.Reachable = false;
            }
        };
        await host.Tick();
        await host.Until(() => host.Session.State is SessionState.Retrying, "retrying");
        Assert.IsNull(host.Session.SpeedHistory);
        Assert.AreEqual(0, original!.Count, "a disconnected inspector releases its observations immediately");

        host.Reachable = true;
        await host.Until(() => host.Session.State is SessionState.Live, "live again");
        Assert.IsNull(host.Session.SpeedHistory);
        await host.Tick();

        Assert.AreEqual(0, original!.Count);
        Assert.AreNotSame(original, host.Session.SpeedHistory);
        Assert.AreEqual(1, host.Session.SpeedHistory!.Count);
        Assert.IsTrue(host.Session.SpeedHistory[0].StartsSegment);
    });

    private static Torrent Row()
    {
        (List<TorrentSummary> summaries, List<TorrentFacts> facts) = Daemon.Population(1);
        TorrentCache cache = new();
        cache.Sweep(summaries, facts);
        return cache.Rows[0];
    }
}
