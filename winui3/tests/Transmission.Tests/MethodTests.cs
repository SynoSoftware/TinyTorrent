using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// The method a request names is derived from its type name, so there is no table to maintain.
/// The table below exists only as the assertion that the derivation is right: it is transcribed
/// from the two dispatch maps at rpcimpl.cc:2790-2823, whose declared capacities - 20 and 4 -
/// are the daemon's own statement that there are no other methods.
/// </summary>
[TestClass]
public class MethodTests
{
    private static readonly string[] Synchronous =
    [
        "free_space",
        "group_get",
        "group_set",
        "queue_move_bottom",
        "queue_move_down",
        "queue_move_top",
        "queue_move_up",
        "session_close",
        "session_get",
        "session_set",
        "session_stats",
        "torrent_get",
        "torrent_reannounce",
        "torrent_remove",
        "torrent_set",
        "torrent_set_location",
        "torrent_start",
        "torrent_start_now",
        "torrent_stop",
        "torrent_verify",
    ];

    private static readonly string[] Asynchronous =
    [
        "blocklist_update",
        "port_test",
        "torrent_add",
        "torrent_rename_path",
    ];

    [TestMethod]
    public void Methods_AreExactlyTheOnesTheDaemonDispatches()
    {
        string[] expected = [.. Synchronous.Concat(Asynchronous).Order()];
        string[] derived = [.. All().Select(request => Wire.MethodOf(request.GetType())).Order()];

        CollectionAssert.AreEqual(expected, derived);
    }

    [TestMethod]
    public void Methods_CoverEveryRequestTypeTheLibraryShips()
    {
        var declared = typeof(RpcClient).Assembly
            .GetTypes()
            .Where(type => type is { IsInterface: false, IsAbstract: false })
            .Where(type => type.GetInterfaces().Contains(typeof(IRpcRequest)))
            .ToArray();

        Assert.AreEqual(
            Synchronous.Length + Asynchronous.Length,
            declared.Length,
            "the constructed list below must not fall behind the library");

        string[] expected = [.. Synchronous.Concat(Asynchronous).Order()];
        string[] reflected = [.. declared.Select(Wire.MethodOf).Order()];

        CollectionAssert.AreEqual(expected, reflected);
    }

    [TestMethod]
    public void AsyncDispatch_IsFlaggedOnExactlyTheFourTheDaemonDefersAndOnNothingElse()
    {
        string[] flagged =
        [
            .. All().Where(request => request.IsAsyncDispatched)
                    .Select(request => Wire.MethodOf(request.GetType()))
                    .Order(),
        ];

        CollectionAssert.AreEqual(Asynchronous.Order().ToArray(), flagged);
    }

    [TestMethod]
    public void Timeouts_AreTransmissionRemotesOwnPolicy()
    {
        foreach (var request in All())
        {
            var expected = Wire.MethodOf(request.GetType()) == "blocklist_update"
                ? TimeSpan.FromSeconds(300)
                : TimeSpan.FromSeconds(60);

            Assert.AreEqual(expected, request.Timeout, Wire.MethodOf(request.GetType()));
        }
    }

    /// <summary>One instance of every request, so the assertions above run on real objects.</summary>
    internal static IRpcRequest[] All() =>
    [
        new FreeSpace(@"C:\downloads"),
        new GroupGet(),
        new GroupSet("throttled"),
        new QueueMoveBottom(TorrentIds.All),
        new QueueMoveDown(TorrentIds.All),
        new QueueMoveTop(TorrentIds.All),
        new QueueMoveUp(TorrentIds.All),
        new SessionClose(),
        new SessionGet<Preferences>(),
        new SessionSet<Preferences>(new Preferences()),
        new SessionStats(),
        new TorrentGet<TorrentSummary>(),
        new TorrentReannounce(TorrentIds.All),
        new TorrentRemove(TorrentIds.All),
        new TorrentSet(TorrentIds.All),
        new TorrentSetLocation(TorrentIds.All, @"D:\media"),
        new TorrentStart(TorrentIds.All),
        new TorrentStartNow(TorrentIds.All),
        new TorrentStop(TorrentIds.All),
        new TorrentVerify(TorrentIds.All),
        new BlocklistUpdate(),
        new PortTest(),
        new TorrentAdd(),
        new TorrentRenamePath(TorrentIds.Of("abc"), "old", "new"),
    ];
}
