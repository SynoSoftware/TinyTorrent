using System.ComponentModel;
using System.Diagnostics;
using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

[TestClass]
public sealed class MergeTests
{
    [TestMethod]
    public void ASweepBuildsTheListInQueueOrder()
    {
        TorrentCache cache = Populated(5);

        Assert.AreEqual(5, cache.Count);
        CollectionAssert.AreEqual(
            new[] { 0, 1, 2, 3, 4 },
            cache.Rows.Select(row => row.QueuePosition).ToArray());
    }

    [TestMethod]
    public void ASecondSweepKeepsTheSameRowObjects()
    {
        TorrentCache cache = Populated(5);
        Torrent[] first = [.. cache.Rows];

        (List<TorrentSummary> summaries, List<TorrentFacts> facts) = Daemon.Population(5);
        cache.Sweep(summaries, facts);

        // The table reconciles selection across a source update by key, but a cell only redraws
        // instead of rebuilding when the row object itself survives.
        CollectionAssert.AreEqual(first, cache.Rows.ToArray());
    }

    [TestMethod]
    public void ADeltaMovesOnlyTheRowsItCarries()
    {
        TorrentCache cache = Populated(5);
        Torrent third = cache.Rows[2];

        TickChange change = cache.Delta([Daemon.Summary(2, rateDownload: 9_000_000)], null);

        Assert.AreEqual(9_000_000d, third.DownloadSpeed);
        Assert.AreEqual(TorrentFields.Speed, change.Fields & TorrentFields.Speed);
        Assert.AreEqual(TorrentFields.None, change.Fields & TorrentFields.Membership);
    }

    [TestMethod]
    public void ARowAbsentFromADeltaHasItsRatesZeroed()
    {
        TorrentCache cache = Populated(5);
        Torrent quiet = cache.Rows[4];

        Assert.AreNotEqual(0d, quiet.DownloadSpeed);

        cache.Delta([Daemon.Summary(0)], null);

        // Any byte moved bumps date_changed, so a torrent missing from a delta has moved nothing
        // for at least 60 seconds while the daemon's rate window is 2. Its true rate is zero.
        Assert.AreEqual(0d, quiet.DownloadSpeed);
        Assert.AreEqual(0d, quiet.UploadSpeed);
    }

    [TestMethod]
    public void RemovedIdsLeaveTheList()
    {
        TorrentCache cache = Populated(5);

        TickChange change = cache.Delta([], [1, 3]);

        Assert.AreEqual(3, cache.Count);
        CollectionAssert.AreEqual(new[] { 0, 2, 4 }, cache.Rows.Select(row => row.Id).ToArray());
        Assert.AreEqual(TorrentFields.Membership, change.Fields & TorrentFields.Membership);
    }

    [TestMethod]
    public void AnIdWeHaveNeverSeenAsksForASweep()
    {
        TorrentCache cache = Populated(5);

        TickChange change = cache.Delta([Daemon.Summary(99)], null);

        Assert.IsTrue(change.NeedsSweep, "the static fields can only be asked for by hash, which a delta does not carry");
        Assert.AreEqual(5, cache.Count);
    }

    [TestMethod]
    public void AnEditDateThatMovedAsksForTheStaticFieldsAgain()
    {
        TorrentCache cache = Populated(5);

        TickChange change = cache.Delta([Daemon.Summary(2, editDate: 1_700_000_500)], null);

        CollectionAssert.AreEqual(new[] { Daemon.Hash(2) }, change.Refetch.ToArray());
    }

    [TestMethod]
    public void RefetchedFactsRenameTheRow()
    {
        TorrentCache cache = Populated(5);

        TorrentFields changed = cache.Facts([Daemon.Facts(2, "renamed.iso")]);

        Assert.AreEqual("renamed.iso", cache.Rows[2].Name);
        Assert.AreEqual(TorrentFields.Name, changed & TorrentFields.Name);
    }

    [TestMethod]
    public void AQueueChangePutsTheListBackInOrder()
    {
        TorrentCache cache = Populated(5);

        TickChange change = cache.Delta(
            [
                Daemon.Summary(4, queuePosition: 0),
                Daemon.Summary(0, queuePosition: 1),
                Daemon.Summary(1, queuePosition: 2),
                Daemon.Summary(2, queuePosition: 3),
                Daemon.Summary(3, queuePosition: 4),
            ],
            null);

        Assert.AreEqual(TorrentFields.Queue, change.Fields & TorrentFields.Queue);
        CollectionAssert.AreEqual(new[] { 4, 0, 1, 2, 3 }, cache.Rows.Select(row => row.Id).ToArray());
    }

    [TestMethod]
    public void StalledComesFromTheDaemonAndNotFromAPeerCount()
    {
        TorrentCache cache = Populated(1);
        Torrent row = cache.Rows[0];

        cache.Delta([Daemon.Summary(0, peers: 0, stalled: false)], null);
        Assert.AreEqual(TorrentActivity.Downloading, row.Activity, "no peers is not the daemon's definition of stalled");

        cache.Delta([Daemon.Summary(0, peers: 40, stalled: true)], null);
        Assert.AreEqual(TorrentActivity.Stalled, row.Activity);
        Assert.AreEqual("Stalled", row.StatusLabel);
        Assert.AreEqual("SystemFillColorCautionBrush", row.StatusAccentKey);
    }

    [TestMethod]
    public void TheAccentIsAKeyAndNotAResolvedColour()
    {
        TorrentCache cache = Populated(1);

        cache.Delta([Daemon.Summary(0, status: TorrentStatus.Seed)], null);

        // A key can be resolved again after a theme change. A brush cached on the row cannot,
        // and holding one is also what would tie this layer to XAML.
        Assert.AreEqual("SystemFillColorSuccessBrush", cache.Rows[0].StatusAccentKey);
        Assert.AreEqual(TorrentActivity.Seeding, cache.Rows[0].Activity);
    }

    /// <summary>
    /// Stage 4 is built on the assumption that a whole sweep merges inside one frame. Measured
    /// here rather than there, because if it does not fit the fix is architectural.
    /// </summary>
    [TestMethod]
    public void ATwoThousandRowSweepMergesInsideOneFrame()
    {
        const int Rows = 2000;
        const int Realized = 40;

        TorrentCache cache = Populated(Rows);

        // A realized cell subscribes to the row it is bound to. Only the rows on screen have a
        // listener, so only they pay for the raise; the rest cost a null check.
        int raises = 0;
        PropertyChangedEventHandler count = (_, _) => raises++;
        for (int i = 0; i < Realized; i++)
        {
            cache.Rows[i].PropertyChanged += count;
        }

        (List<TorrentSummary> summaries, List<TorrentFacts> facts) = Moved(Rows);

        // Warm the paths the first merge would otherwise pay for on their own.
        cache.Sweep(summaries, facts);

        double[] runs = new double[10];
        for (int run = 0; run < runs.Length; run++)
        {
            (summaries, facts) = Moved(Rows, run + 1);

            GC.Collect();
            long started = Stopwatch.GetTimestamp();
            cache.Sweep(summaries, facts);
            runs[run] = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        }

        Array.Sort(runs);
        double median = runs[runs.Length / 2];

        Console.WriteLine(
            $"2,000-row sweep merge: median {median:0.00} ms, best {runs[0]:0.00} ms, " +
            $"worst {runs[^1]:0.00} ms over {runs.Length} runs, {raises} property raises to " +
            $"{Realized} listening rows");

        Assert.AreEqual(Rows, cache.Count);

        // One 60 Hz frame. The assertion is deliberately the frame and not the measurement: a
        // number that drifts up to 15 ms is still a working list, and one that crosses it is the
        // architectural problem this test exists to find.
        Assert.IsTrue(
            median < 16.7,
            $"a 2,000-row sweep merged in {median:0.00} ms, which does not fit in one frame");
    }

    private static TorrentCache Populated(int count)
    {
        TorrentCache cache = new();
        (List<TorrentSummary> summaries, List<TorrentFacts> facts) = Daemon.Population(count);
        cache.Sweep(summaries, facts);
        return cache;
    }

    /// <summary>Every row moved, which is the most expensive shape a sweep can have.</summary>
    private static (List<TorrentSummary>, List<TorrentFacts>) Moved(int count, int nudge = 0)
    {
        List<TorrentSummary> summaries = new(count);
        List<TorrentFacts> facts = new(count);

        for (int i = 0; i < count; i++)
        {
            summaries.Add(Daemon.Summary(
                i,
                queuePosition: (i + nudge) % count,
                percentDone: ((i + nudge) % 100) / 100d,
                rateDownload: 1000 + (i * 7) + nudge,
                rateUpload: 500 + (i * 3) + nudge,
                peers: (i + nudge) % 60));

            facts.Add(Daemon.Facts(i));
        }

        return (summaries, facts);
    }
}
