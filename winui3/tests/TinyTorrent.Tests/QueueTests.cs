using TinyTorrent;

namespace TinyTorrent_Tests;

/// <summary>
/// The queue arithmetic, driven over plain strings. Nothing here needs a daemon, a row or a UI
/// thread, which is the point: the drag and the four menu commands share this code, so proving it
/// once proves both.
/// </summary>
[TestClass]
public sealed class QueueTests
{
    private static readonly string[] Queue = ["a", "b", "c", "d", "e", "f"];

    [TestMethod]
    public void DropBeforeAnItemPutsThePacketImmediatelyAheadOfIt()
    {
        CollectionAssert.AreEqual(
            new[] { "a", "e", "b", "c", "d", "f" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["e"], "b")));
    }

    [TestMethod]
    public void DropOnNothingPutsThePacketAtTheEnd()
    {
        CollectionAssert.AreEqual(
            new[] { "b", "c", "d", "e", "f", "a" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["a"], (string?)null)));
    }

    [TestMethod]
    public void ANonContiguousPacketIsGatheredInQueueOrder()
    {
        // Selection order is not queue order, and the packet must land in the order the user can
        // see rather than in the order the rows happened to be clicked.
        CollectionAssert.AreEqual(
            new[] { "b", "a", "c", "e", "d", "f" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["e", "a", "c"], "d")));
    }

    [TestMethod]
    public void DroppingBeforeAMemberOfThePacketChangesNothingItCanReach()
    {
        // The target left the queue with the packet, so there is no boundary to land on and the
        // packet goes to the end. What matters is that it is a defined answer, not a throw.
        CollectionAssert.AreEqual(
            new[] { "a", "d", "e", "f", "b", "c" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["b", "c"], "c")));
    }

    [TestMethod]
    public void TopAndBottomMoveThePacketToTheEnds()
    {
        CollectionAssert.AreEqual(
            new[] { "c", "e", "a", "b", "d", "f" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["c", "e"], QueueMove.Top)));

        CollectionAssert.AreEqual(
            new[] { "a", "b", "d", "f", "c", "e" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["c", "e"], QueueMove.Bottom)));
    }

    [TestMethod]
    public void UpAndDownMoveThePacketOnePlace()
    {
        CollectionAssert.AreEqual(
            new[] { "a", "c", "d", "b", "e", "f" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["c", "d"], QueueMove.Up)));

        CollectionAssert.AreEqual(
            new[] { "a", "b", "e", "c", "d", "f" },
            Arranged(TinyTorrent.Queue.Arrange(Queue, ["c", "d"], QueueMove.Down)));
    }

    [TestMethod]
    public void AMoveOffTheEndIsClampedRatherThanRefused()
    {
        CollectionAssert.AreEqual(Queue, Arranged(TinyTorrent.Queue.Arrange(Queue, ["a"], QueueMove.Up)));
        CollectionAssert.AreEqual(Queue, Arranged(TinyTorrent.Queue.Arrange(Queue, ["f"], QueueMove.Down)));
        Assert.IsFalse(TinyTorrent.Queue.Differs(Queue, TinyTorrent.Queue.Arrange(Queue, ["a"], QueueMove.Top)));
    }

    [TestMethod]
    public void StepsWritesOnlyTheItemsThatCannotStayWhereTheyAre()
    {
        // "a" and "b" are already in the right relative order, so only "e" has to be written.
        IReadOnlyList<QueueStep<string>> steps =
            TinyTorrent.Queue.Steps(["a", "b", "e"], ["e", "a", "b"]);

        Assert.AreEqual(1, steps.Count);
        Assert.AreEqual("e", steps[0].Item);
        Assert.AreEqual(0, steps[0].Position);
    }

    [TestMethod]
    public void StepsPrefersMovingOneItemOverFixingEveryPosition()
    {
        // Walking left to right and correcting each wrong slot would write two. The longest run
        // that can stay is "b","c", so the minimum is one - move "a" to the end.
        IReadOnlyList<QueueStep<string>> steps =
            TinyTorrent.Queue.Steps(["a", "b", "c"], ["b", "c", "a"]);

        Assert.AreEqual(1, steps.Count);
        Assert.AreEqual("a", steps[0].Item);
        Assert.AreEqual(2, steps[0].Position);
    }

    [TestMethod]
    public void StepsReplayedAgainstADaemonQueueReproduceTheOrderExactly()
    {
        string[] queue = ["a", "b", "c", "d", "e", "f", "g", "h"];

        (IReadOnlyList<string> Packet, object Where)[] gestures =
        [
            (["a"], "f"),
            (["g", "h"], "b"),
            (["b", "d", "f"], "a"),
            (["c"], QueueMove.Top),
            (["a", "b"], QueueMove.Bottom),
            (["e"], QueueMove.Up),
            (["d", "e"], QueueMove.Down),
        ];

        foreach ((IReadOnlyList<string> packet, object where) in gestures)
        {
            IReadOnlyList<string> arranged = where is QueueMove move
                ? TinyTorrent.Queue.Arrange(queue, packet, move)
                : TinyTorrent.Queue.Arrange(queue, packet, (string)where);

            IReadOnlyList<QueueStep<string>> steps = TinyTorrent.Queue.Steps(queue, arranged);

            CollectionAssert.AreEqual(
                Arranged(arranged),
                Replay(queue, steps),
                $"replaying {steps.Count} steps did not reproduce the arranged order");

            queue = [.. arranged];
        }
    }

    [TestMethod]
    public void StepsReproduceAReversalOfAWholeQueue()
    {
        string[] queue = [.. Enumerable.Range(0, 40).Select(i => i.ToString())];
        string[] reversed = [.. queue.Reverse()];

        IReadOnlyList<QueueStep<string>> steps = TinyTorrent.Queue.Steps(queue, reversed);

        // Only one item can stay: any two items are now in the opposite relative order.
        Assert.AreEqual(queue.Length - 1, steps.Count);
        CollectionAssert.AreEqual(reversed, Replay(queue, steps));
    }

    [TestMethod]
    public void AnArrangementThatChangesNothingProducesNoSteps()
    {
        Assert.AreEqual(0, TinyTorrent.Queue.Steps(Queue, Queue).Count);
        Assert.IsFalse(TinyTorrent.Queue.Differs(Queue, Queue));
    }

    /// <summary>
    /// The daemon's own <c>queue_position</c> semantics: <c>tr_torrent_queue::set_pos</c> rotates
    /// the range between the item's old and new index, so the item lands at the index asked for
    /// and everything between shifts by one. Anything that treated a position as an independent
    /// slot would pass a test written the other way and fail against the daemon.
    /// </summary>
    private static string[] Replay(IReadOnlyList<string> queue, IReadOnlyList<QueueStep<string>> steps)
    {
        List<string> daemon = [.. queue];

        foreach (QueueStep<string> step in steps)
        {
            daemon.Remove(step.Item);
            daemon.Insert(Math.Min(step.Position, daemon.Count), step.Item);
        }

        return [.. daemon];
    }

    private static string[] Arranged(IReadOnlyList<string> order) => [.. order];
}
