using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

/// <summary>
/// What one poll is made of. The interval never varies, so this is the whole of the decision the
/// session makes every two seconds.
/// </summary>
[TestClass]
public sealed class TickTests
{
    [TestMethod]
    public void TheFirstTickReadsEverything()
    {
        TickPlan plan = Tick.Compose(new TickInputs(null, null, 0, false, false));

        Assert.IsTrue(plan.Sweep);
        Assert.IsTrue(plan.Torrents);
    }

    [TestMethod]
    public void WithEverythingStoppedTheTickIsStatisticsAlone()
    {
        SessionStatistics quiet = Stats(torrents: 12, active: 0, paused: 12, down: 0, up: 0);

        TickPlan plan = Tick.Compose(new TickInputs(quiet, quiet, 12, false, false));

        Assert.IsFalse(plan.Torrents);
        Assert.IsFalse(plan.Sweep);
    }

    [TestMethod]
    public void AnActiveTorrentBringsBackTheDelta()
    {
        SessionStatistics busy = Stats(torrents: 12, active: 1, paused: 11, down: 0, up: 0);

        Assert.IsTrue(Tick.Compose(new TickInputs(busy, busy, 12, false, false)).Torrents);
    }

    [TestMethod]
    public void ARateWithoutAnActiveCountStillBringsBackTheDelta()
    {
        SessionStatistics seeding = Stats(torrents: 12, active: 0, paused: 12, down: 0, up: 4096);

        Assert.IsTrue(Tick.Compose(new TickInputs(seeding, seeding, 12, false, false)).Torrents);
    }

    [TestMethod]
    public void ACountThatDisagreesWithTheCachePromotesTheTickToASweep()
    {
        SessionStatistics quiet = Stats(torrents: 13, active: 0, paused: 13, down: 0, up: 0);

        TickPlan plan = Tick.Compose(new TickInputs(quiet, quiet, 12, false, false));

        Assert.IsTrue(plan.Sweep, "one integer disagreeing is what catches a removal we missed");
        Assert.IsTrue(plan.Torrents);
    }

    [TestMethod]
    public void ThePausedCountMovingBringsBackTheDelta()
    {
        SessionStatistics before = Stats(torrents: 12, active: 0, paused: 12, down: 0, up: 0);
        SessionStatistics after = Stats(torrents: 12, active: 0, paused: 11, down: 0, up: 0);

        Assert.IsTrue(Tick.Compose(new TickInputs(after, before, 12, false, false)).Torrents);
    }

    [TestMethod]
    public void AMutationBringsBackTheDeltaEvenWithNothingRunning()
    {
        SessionStatistics quiet = Stats(torrents: 12, active: 0, paused: 12, down: 0, up: 0);

        Assert.IsTrue(Tick.Compose(new TickInputs(quiet, quiet, 12, true, false)).Torrents);
    }

    [TestMethod]
    public void AForcedSweepOutranksAQuietDaemon()
    {
        SessionStatistics quiet = Stats(torrents: 12, active: 0, paused: 12, down: 0, up: 0);

        TickPlan plan = Tick.Compose(new TickInputs(quiet, quiet, 12, false, true));

        Assert.IsTrue(plan.Sweep);
        Assert.IsTrue(plan.Torrents);
    }

    [TestMethod]
    public void TheIntervalIsTwoSeconds() =>
        Assert.AreEqual(TimeSpan.FromSeconds(2), Tick.Interval);

    private static SessionStatistics Stats(int torrents, int active, int paused, long down, long up) =>
        new(active, paused, torrents, down, up, Nothing, Nothing);

    private static Totals Nothing => new(0, 0, 0, 0, 0);
}
