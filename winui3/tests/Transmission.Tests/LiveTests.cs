using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

[TestClass]
public class LiveTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    [TestCategory("Live")]
    public async Task AllRequests_UseAnIsolatedDaemon()
    {
        if (Environment.GetEnvironmentVariable("TINYTORRENT_LIVE_TESTS") != "1")
        {
            Assert.Inconclusive("Set TINYTORRENT_LIVE_TESTS=1 to start an isolated Transmission daemon.");
        }

        const string executable = @"C:\Program Files\Transmission\transmission-daemon.exe";
        Assert.IsTrue(File.Exists(executable), $"Missing {executable}.");

        var temp = Path.GetFullPath(Path.GetTempPath());
        var root = Path.Combine(temp, $"TinyTorrent-Rpc-{Guid.NewGuid():N}");
        var config = Path.Combine(root, "config");
        var downloads = Path.Combine(root, "downloads");
        var relocated = Path.Combine(root, "relocated");
        Directory.CreateDirectory(config);
        Directory.CreateDirectory(downloads);
        Directory.CreateDirectory(relocated);

        using var rpcPort = new TcpListener(IPAddress.Loopback, 0);
        using var peerPort = new TcpListener(IPAddress.Loopback, 0);
        rpcPort.Start();
        peerPort.Start();
        var rpc = ((IPEndPoint)rpcPort.LocalEndpoint).Port;
        var peer = ((IPEndPoint)peerPort.LocalEndpoint).Port;
        Assert.AreNotEqual(9091, rpc);
        Assert.AreNotEqual(9091, peer);
        Assert.AreNotEqual(rpc, peer);

        await File.WriteAllTextAsync(Path.Combine(config, "settings.json"), JsonSerializer.Serialize(
            new Dictionary<string, object>
            {
                ["rpc-enabled"] = true,
                ["rpc-port"] = rpc,
                ["rpc-bind-address"] = "127.0.0.1",
                ["rpc-authentication-required"] = false,
                ["rpc-whitelist"] = "127.0.0.1",
                ["rpc-whitelist-enabled"] = true,
                ["bind-address-ipv4"] = "127.0.0.1",
                ["bind-address-ipv6"] = "::1",
                ["peer-port"] = peer,
                ["peer-port-random-on-start"] = false,
                ["port-forwarding-enabled"] = false,
                ["dht-enabled"] = false,
                ["pex-enabled"] = false,
                ["lpd-enabled"] = false,
                ["download-dir"] = downloads,
                ["incomplete-dir-enabled"] = false,
                ["rename-partial-files"] = false,
                ["start-added-torrents"] = false,
            }));

        using var client = new RpcClient(new Uri($"http://127.0.0.1:{rpc}/"));
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        var cancellation = deadline.Token;
        using var daemon = new Process
        {
            StartInfo = new ProcessStartInfo(executable)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = config,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                ArgumentList = { "-f", "-g", config, "-p", rpc.ToString() },
            },
        };

        var started = false;
        var owned = false;
        Task<string>? output = null;
        Task<string>? error = null;

        try
        {
            rpcPort.Stop();
            peerPort.Stop();
            Assert.IsTrue(daemon.Start());
            started = true;
            output = daemon.StandardOutput.ReadToEndAsync();
            error = daemon.StandardError.ReadToEndAsync();

            Preferences? settings = null;
            await WaitFor(async () =>
            {
                Assert.IsFalse(daemon.HasExited, "The isolated daemon exited during startup.");
                try
                {
                    settings = await client.Send(new SessionGet<Preferences>(), cancellation);
                    return true;
                }
                catch (RpcTransportException failure) when (failure.Fault == RpcFault.Unreachable)
                {
                    return false;
                }
            }, cancellation);

            Assert.IsNotNull(settings);
            Assert.IsNotNull(settings.ConfigDir);
            Assert.IsTrue(string.Equals(Path.GetFullPath(settings.ConfigDir), config,
                StringComparison.OrdinalIgnoreCase), "Refusing to mutate a daemon with another config_dir.");
            owned = true;
            Assert.IsFalse(daemon.HasExited);
            StringAssert.StartsWith(settings.Version!, "4.1.1");
            Assert.AreEqual(peer, settings.PeerPort);
            Assert.AreEqual(false, settings.PortForwardingEnabled);
            TestContext.WriteLine($"Daemon {settings.Version}; config_dir {config}; RPC {rpc}; peer {peer}.");

            await client.Send(new SessionSet<Preferences>(new Preferences
            {
                SpeedLimitDown = 19,
                SpeedLimitDownEnabled = true,
                AltSpeedEnabled = false,
                DownloadQueueSize = 0,
                DownloadQueueEnabled = false,
                SeedQueueEnabled = false,
            }), cancellation);
            settings = await client.Send(new SessionGet<Preferences>(), cancellation);
            Assert.AreEqual(19, settings.SpeedLimitDown);
            Assert.AreEqual(true, settings.SpeedLimitDownEnabled);
            Assert.AreEqual(false, settings.AltSpeedEnabled);
            Assert.AreEqual(0, settings.DownloadQueueSize);

            var space = await client.Send(new FreeSpace(downloads), cancellation);
            Assert.IsTrue(space.SizeBytes > 0);
            Assert.IsTrue(space.TotalSize >= space.SizeBytes);

            var firstAdd = new TorrentAdd
            {
                Metainfo = CreateTorrent(downloads, "first.txt"),
                DownloadDir = downloads,
                Paused = true,
                Labels = ["live"],
            };
            var firstAdded = await client.Send(firstAdd, cancellation);
            Assert.IsFalse(firstAdded.IsDuplicate);
            var duplicate = await client.Send(firstAdd, cancellation);
            Assert.IsTrue(duplicate.IsDuplicate);
            Assert.AreEqual(firstAdded.Torrent, duplicate.Torrent);
            var secondAdded = await client.Send(new TorrentAdd
            {
                Metainfo = CreateTorrent(downloads, "second.txt"),
                DownloadDir = downloads,
                Paused = true,
            }, cancellation);
            Assert.IsFalse(secondAdded.IsDuplicate);
            var first = TorrentIds.Of(firstAdded.Torrent.HashString);
            var second = TorrentIds.Of(secondAdded.Torrent.HashString);

            var summaries = await client.Send(new TorrentGet<TorrentSummary>(), cancellation);
            Assert.AreEqual(2, summaries.Torrents.Count);
            CollectionAssert.AreEqual(new[] { "live" }, summaries.Torrents.Single(
                row => row.HashString == firstAdded.Torrent.HashString).Labels.ToArray());
            var stats = await client.Send(new SessionStats(), cancellation);
            Assert.AreEqual(2, stats.TorrentCount);

            await client.Send(new TorrentSet(first)
            {
                BandwidthPriority = Priority.High,
                DownloadLimit = 17,
                DownloadLimited = true,
                UploadLimit = 13,
                UploadLimited = true,
                HonorsSessionLimits = false,
                PeerLimit = 8,
                SeedRatioMode = RatioMode.Unlimited,
                SeedIdleMode = IdleMode.Unlimited,
                FilesWanted = [0],
                PriorityHigh = [0],
                Labels = ["changed"],
            }, cancellation);
            var detail = (await client.Send(new TorrentGet<TorrentDetail>(first), cancellation)).Torrents.Single();
            Assert.AreEqual(Priority.High, detail.BandwidthPriority);
            Assert.AreEqual(17, detail.DownloadLimit);
            Assert.IsTrue(detail.DownloadLimited);
            Assert.AreEqual(13, detail.UploadLimit);
            Assert.IsTrue(detail.UploadLimited);
            Assert.IsFalse(detail.HonorsSessionLimits);
            Assert.AreEqual(8, detail.PeerLimit);
            Assert.AreEqual(RatioMode.Unlimited, detail.SeedRatioMode);
            Assert.AreEqual(IdleMode.Unlimited, detail.SeedIdleMode);
            Assert.IsTrue(detail.FileStats.Single().Wanted);
            Assert.AreEqual(Priority.High, detail.FileStats.Single().Priority);
            Assert.AreEqual("first.txt", detail.Files.Single().Name);

            await client.Send(new QueueMoveTop(second), cancellation);
            await AssertQueue(client, second, 0, cancellation);
            await client.Send(new QueueMoveDown(second), cancellation);
            await AssertQueue(client, second, 1, cancellation);
            await client.Send(new QueueMoveUp(second), cancellation);
            await AssertQueue(client, second, 0, cancellation);
            await client.Send(new QueueMoveBottom(second), cancellation);
            await AssertQueue(client, second, 1, cancellation);

            await client.Send(new TorrentVerify(first), cancellation);
            await WaitFor(async () =>
            {
                var row = (await client.Send(new TorrentGet<TorrentSummary>(first), cancellation)).Torrents.Single();
                return row.Status == TorrentStatus.Stopped && row.PercentDone == 1;
            }, cancellation);
            detail = (await client.Send(new TorrentGet<TorrentDetail>(first), cancellation)).Torrents.Single();
            Assert.AreEqual(detail.Files.Single().Length, detail.HaveValid);
            Assert.IsTrue(detail.Pieces.Has(0));

            await client.Send(new TorrentStart(first), cancellation);
            await AssertStatus(client, first, TorrentStatus.Seed, cancellation);
            await client.Send(new TorrentReannounce(first), cancellation);
            TestContext.WriteLine("torrent_reannounce accepted for the generated trackerless torrent; no tracker exchange asserted.");
            await client.Send(new TorrentStop(first), cancellation);
            await AssertStatus(client, first, TorrentStatus.Stopped, cancellation);
            await client.Send(new TorrentStartNow(first), cancellation);
            await AssertStatus(client, first, TorrentStatus.Seed, cancellation);
            await client.Send(new TorrentStop(first), cancellation);
            await AssertStatus(client, first, TorrentStatus.Stopped, cancellation);

            var renamed = await client.Send(new TorrentRenamePath(first, "first.txt", "renamed.txt"), cancellation);
            Assert.AreEqual(firstAdded.Torrent.Id, renamed.Id);
            Assert.AreEqual("first.txt", renamed.Path);
            Assert.AreEqual("renamed.txt", renamed.Name);
            Assert.IsTrue(File.Exists(Path.Combine(downloads, "renamed.txt")));
            detail = (await client.Send(new TorrentGet<TorrentDetail>(first), cancellation)).Torrents.Single();
            Assert.AreEqual("renamed.txt", detail.Files.Single().Name);

            await client.Send(new TorrentSetLocation(first, relocated, Move: true), cancellation);
            await WaitFor(() => Task.FromResult(File.Exists(Path.Combine(relocated, "renamed.txt"))), cancellation);
            var paths = (await client.Send(new TorrentGet<Paths>(first), cancellation)).Torrents.Single();
            Assert.AreEqual(relocated, paths.DownloadDir);
            Assert.IsFalse(File.Exists(Path.Combine(downloads, "renamed.txt")));

            await client.Send(new GroupSet("live")
            {
                HonorsSessionLimits = false,
                SpeedLimitDown = 23,
                SpeedLimitDownEnabled = true,
                SpeedLimitUp = 29,
                SpeedLimitUpEnabled = true,
            }, cancellation);
            var group = (await client.Send(new GroupGet(["live"]), cancellation)).Group.Single();
            Assert.AreEqual("live", group.Name);
            Assert.IsFalse(group.HonorsSessionLimits);
            Assert.AreEqual(23, group.SpeedLimitDown);
            Assert.IsTrue(group.SpeedLimitDownEnabled);
            Assert.AreEqual(29, group.SpeedLimitUp);
            Assert.IsTrue(group.SpeedLimitUpEnabled);

            using (var blocklistServer = new TcpListener(IPAddress.Loopback, 0))
            {
                blocklistServer.Start();
                var port = ((IPEndPoint)blocklistServer.LocalEndpoint).Port;
                var serving = ServeBlocklist(blocklistServer, cancellation);
                await client.Send(new SessionSet<Preferences>(new Preferences
                {
                    BlocklistEnabled = true,
                    BlocklistUrl = $"http://127.0.0.1:{port}/blocklist.txt",
                }), cancellation);
                var blocklist = await client.Send(new BlocklistUpdate(), cancellation);
                await serving;
                Assert.AreEqual(1, blocklist.BlocklistSize);
                settings = await client.Send(new SessionGet<Preferences>(), cancellation);
                Assert.AreEqual(1, settings.BlocklistSize);
            }

            using (var portDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
            {
                portDeadline.CancelAfter(TimeSpan.FromSeconds(10));
                try
                {
                    var port = await client.Send(new PortTest("ipv4"), portDeadline.Token);
                    Assert.AreEqual("ipv4", port.IpProtocol);
                    TestContext.WriteLine($"port_test decoded: port_is_open={port.PortIsOpen}; external openness is not required.");
                }
                catch (RpcMethodException failure) when (failure.Code == RpcError.HttpError && failure.Method == "port_test")
                {
                    TestContext.WriteLine($"port_test decoded external-service failure: {failure.Code}: {failure.Message}");
                }
                catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
                {
                    TestContext.WriteLine("port_test sent, but the external service did not answer in 10 s; response decoding unverified.");
                }
            }

            await client.Send(new TorrentRemove(first, DeleteLocalData: true), cancellation);
            await WaitFor(() => Task.FromResult(!File.Exists(Path.Combine(relocated, "renamed.txt"))), cancellation);
            await client.Send(new TorrentRemove(second), cancellation);
            Assert.IsTrue(File.Exists(Path.Combine(downloads, "second.txt")), "Removing without deletion must preserve data.");
            var recent = await client.Send(new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive), cancellation);
            Assert.AreEqual(0, recent.Torrents.Count);
            Assert.IsNotNull(recent.Removed);
            CollectionAssert.Contains(recent.Removed.ToArray(), firstAdded.Torrent.Id);
            CollectionAssert.Contains(recent.Removed.ToArray(), secondAdded.Torrent.Id);
            Assert.AreEqual(0, (await client.Send(new SessionStats(), cancellation)).TorrentCount);

            await client.Send(new SessionClose(), cancellation);
            using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await daemon.WaitForExitAsync(shutdown.Token);
            Assert.AreEqual(0, daemon.ExitCode);
            Assert.IsTrue(File.Exists(Path.Combine(config, "settings.json")));
        }
        finally
        {
            if (started && !daemon.HasExited)
            {
                try
                {
                    using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                    if (owned)
                    {
                        await client.Send(new SessionClose(), shutdown.Token);
                        await daemon.WaitForExitAsync(shutdown.Token);
                    }
                }
                catch (Exception failure)
                {
                    TestContext.WriteLine($"Graceful cleanup failed: {failure.Message}");
                }
                finally
                {
                    if (!daemon.HasExited)
                    {
                        daemon.Kill();
                        await daemon.WaitForExitAsync();
                    }
                }
            }

            if (output is not null) TestContext.WriteLine(await output);
            if (error is not null) TestContext.WriteLine(await error);
            Assert.IsTrue(string.Equals(Path.GetDirectoryName(Path.GetFullPath(root)),
                Path.TrimEndingDirectorySeparator(temp), StringComparison.OrdinalIgnoreCase));
            Assert.IsTrue(Path.GetFileName(root).StartsWith("TinyTorrent-Rpc-", StringComparison.Ordinal));
            Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateTorrent(string downloads, string name)
    {
        var payload = Encoding.ASCII.GetBytes("TinyTorrent live RPC verification.\n");
        File.WriteAllBytes(Path.Combine(downloads, name), payload);
        using var metainfo = new MemoryStream();
        metainfo.Write(Encoding.ASCII.GetBytes(
            $"d4:infod6:lengthi{payload.Length}e4:name{name.Length}:{name}12:piece lengthi16384e6:pieces20:"));
        metainfo.Write(SHA1.HashData(payload));
        metainfo.Write("7:privatei1eee"u8);
        return Convert.ToBase64String(metainfo.ToArray());
    }

    private static async Task AssertQueue(RpcClient client, TorrentIds ids, int position, CancellationToken cancellation)
    {
        var row = (await client.Send(new TorrentGet<TorrentSummary>(ids), cancellation)).Torrents.Single();
        Assert.AreEqual(position, row.QueuePosition);
    }

    private static Task AssertStatus(RpcClient client, TorrentIds ids, TorrentStatus status, CancellationToken cancellation) =>
        WaitFor(async () =>
            (await client.Send(new TorrentGet<TorrentSummary>(ids), cancellation)).Torrents.Single().Status == status,
            cancellation);

    private static async Task WaitFor(Func<Task<bool>> condition, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        while (!await condition())
        {
            await Task.Delay(100, deadline.Token);
        }
    }

    private static async Task ServeBlocklist(TcpListener listener, CancellationToken cancellation)
    {
        using var connection = await listener.AcceptTcpClientAsync(cancellation);
        await using var stream = connection.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
        var request = await reader.ReadLineAsync(cancellation);
        Assert.IsNotNull(request);
        StringAssert.StartsWith(request, "GET /blocklist.txt HTTP/");
        while (await reader.ReadLineAsync(cancellation) is { Length: > 0 }) { }
        const string body = "test:192.0.2.1-192.0.2.1\n";
        var response = Encoding.ASCII.GetBytes(
            $"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n{body}");
        await stream.WriteAsync(response, cancellation);
    }

    private sealed record Paths(int Id, string DownloadDir);
}
