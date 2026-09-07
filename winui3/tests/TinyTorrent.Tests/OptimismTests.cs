using TinyTorrent;
using Transmission;

namespace TinyTorrent_Tests;

/// <summary>
/// The three things the list may show before the daemon has confirmed them, and the rule that
/// applying an edit hands back the one that undoes it.
/// </summary>
[TestClass]
public sealed class OptimismTests
{
    [TestMethod]
    public void ApplyingAStatusEditHandsBackTheOneThatUndoesIt()
    {
        Torrent row = Row(TorrentStatus.Download);

        TorrentEdit edit = new([new TorrentEdit.Change(row, Status: TorrentStatus.Stopped)]);
        TorrentEdit inverse = edit.Apply(out TorrentFields changed);

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);
        Assert.AreEqual(TorrentActivity.Stopped, row.Activity);
        Assert.AreEqual(TorrentFields.Activity, changed);

        inverse.Apply(out _);

        Assert.AreEqual(TorrentStatus.Download, row.Status);
        Assert.AreEqual(TorrentActivity.Downloading, row.Activity);
    }

    [TestMethod]
    public void TheThreeKindsRoundTripTogether()
    {
        Torrent row = Row(TorrentStatus.Seed, queuePosition: 7);

        TorrentEdit edit = new([
            new TorrentEdit.Change(
                row,
                Status: TorrentStatus.Stopped,
                QueuePosition: 0,
                Presence: TorrentPresence.Removing),
        ]);

        TorrentEdit inverse = edit.Apply(out TorrentFields changed);

        Assert.AreEqual(TorrentStatus.Stopped, row.Status);
        Assert.AreEqual(0, row.QueuePosition);
        Assert.IsFalse(row.IsPresent);
        Assert.AreEqual(
            TorrentFields.Activity | TorrentFields.Queue | TorrentFields.Membership,
            changed);

        inverse.Apply(out _);

        Assert.AreEqual(TorrentStatus.Seed, row.Status);
        Assert.AreEqual(7, row.QueuePosition);
        Assert.IsTrue(row.IsPresent);
    }

    [TestMethod]
    public void AnEditLeavesEveryValueItDidNotName()
    {
        Torrent row = Row(TorrentStatus.Download, queuePosition: 4);

        TorrentEdit edit = new([new TorrentEdit.Change(row, Status: TorrentStatus.Stopped)]);
        TorrentEdit inverse = edit.Apply(out _);

        Assert.AreEqual(4, row.QueuePosition);
        Assert.IsTrue(row.IsPresent);

        inverse.Apply(out _);
        Assert.AreEqual(4, row.QueuePosition);
    }

    [TestMethod]
    public void ReapplyingAStandingEditIsIdempotent()
    {
        // The poll that was in flight when the daemon acknowledged the change was answered from
        // state that predates it, so the session re-applies the edit after each merge. Doing that
        // twice must not report a change the second time.
        Torrent row = Row(TorrentStatus.Download);
        TorrentEdit edit = new([new TorrentEdit.Change(row, Status: TorrentStatus.Stopped)]);

        edit.Apply(out TorrentFields first);
        edit.Apply(out TorrentFields second);

        Assert.AreEqual(TorrentFields.Activity, first);
        Assert.AreEqual(TorrentFields.None, second);
    }

    [TestMethod]
    public void AnEditKnowsWhetherItTouchesTheRowsAnotherOneWants()
    {
        Torrent first = Row(TorrentStatus.Download);
        Torrent second = Row(TorrentStatus.Download);

        TorrentEdit standing = new([new TorrentEdit.Change(first, Status: TorrentStatus.Stopped)]);

        Assert.IsTrue(standing.Touches([first]));
        Assert.IsTrue(standing.Touches([second, first]));
        Assert.IsFalse(standing.Touches([second]));
    }

    private static Torrent Row(TorrentStatus status, int queuePosition = 0)
    {
        TorrentCache cache = new();

        cache.Sweep(
            [Daemon.Summary(0, status: status, queuePosition: queuePosition)],
            [Daemon.Facts(0)]);

        return cache.Rows[0];
    }
}
