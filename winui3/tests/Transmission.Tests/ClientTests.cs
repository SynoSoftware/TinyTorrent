using System.Net;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// RpcClient is the riskiest file in the library: it owns the envelope, the address, the
/// credential, the session-id handshake, the status mapping and every deadline. All of it is
/// exercised here, through a fake that sits at the HTTP boundary.
/// </summary>
[TestClass]
public class ClientTests
{
    [TestMethod]
    public async Task Envelope_IsJsonRpc2WithMethodParamsAndId()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentStop(TorrentIds.Of("abc")));

        var root = daemon.Only.Root;
        Assert.AreEqual("2.0", root.GetProperty("jsonrpc").GetString(), "4.1 speaks JSON-RPC 2.0");
        Assert.AreEqual("torrent_stop", root.GetProperty("method").GetString());
        Assert.AreEqual(1, root.GetProperty("id").GetInt32(), "ids start at 1");
        Assert.IsTrue(root.TryGetProperty("params", out _), "arguments ride in params, not arguments");
        Assert.IsFalse(root.TryGetProperty("tag", out _), "tag belongs to the legacy dialect");
    }

    [TestMethod]
    public async Task Envelope_MethodDerivesFromTheRequestTypeName()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new TorrentStartNow(TorrentIds.Of("abc")));

        Assert.AreEqual("torrent_start_now", daemon.Only.Method);
    }

    [TestMethod]
    public async Task Envelope_GivesEachRequestItsOwnId()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new SessionStats());
        await client.Send(new SessionStats());

        Assert.AreEqual(1, daemon.Calls[0].Root.GetProperty("id").GetInt32());
        Assert.AreEqual(2, daemon.Calls[1].Root.GetProperty("id").GetInt32());
    }

    // --- the address ------------------------------------------------------------------------

    [TestMethod]
    [DataRow("http://127.0.0.1:9091", "/transmission/rpc")]
    [DataRow("http://127.0.0.1:9091/", "/transmission/rpc")]
    [DataRow("http://127.0.0.1:9091/tr/", "/tr/rpc")]
    [DataRow("http://127.0.0.1:9091/custom/rpc", "/custom/rpc")]
    public async Task Address_CompletesToTheEndpointTheDaemonListensOn(string address, string expected)
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect(address);

        await client.Send(new SessionStats());

        Assert.AreEqual(expected, daemon.Only.Uri.AbsolutePath);
    }

    // --- the credential ---------------------------------------------------------------------

    [TestMethod]
    public async Task Authorization_IsSentWithoutWaitingToBeAsked()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect(credential: new NetworkCredential("bob", "hunter2"));

        await client.Send(new SessionStats());

        var authorization = daemon.Only.Authorization;
        Assert.IsNotNull(authorization, "sending it unasked saves a 401 and halves the login attempts spent");
        Assert.AreEqual("Basic", authorization.Scheme);
        Assert.AreEqual(
            "bob:hunter2",
            Encoding.UTF8.GetString(Convert.FromBase64String(authorization.Parameter!)));
    }

    [TestMethod]
    public async Task Authorization_IsAbsentWhenThereIsNoCredential()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        await client.Send(new SessionStats());

        Assert.IsNull(daemon.Only.Authorization);
    }

    // --- status mapping ---------------------------------------------------------------------

    [TestMethod]
    public async Task Unauthorized_IsAnAuthenticationFailureAndIsNotRetried()
    {
        var daemon = FakeDaemon.Refusing(HttpStatusCode.Unauthorized);
        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcAuthenticationException>(() => client.Send(new SessionStats()));

        Assert.AreEqual(1, daemon.Calls.Count, "a retry loop would burn the anti-brute-force budget");
    }

    [TestMethod]
    public async Task Forbidden_NamesBothCausesBecauseTheyLookIdenticalOnTheWire()
    {
        var daemon = FakeDaemon.Refusing(HttpStatusCode.Forbidden);
        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcAuthenticationException>(
            () => client.Send(new SessionStats()));

        StringAssert.Contains(failure.Message, "rpc_whitelist");
        StringAssert.Contains(failure.Message, "brute-force");
        Assert.AreEqual(1, daemon.Calls.Count, "a lockout cannot be cleared by trying again");
    }

    [TestMethod]
    [DataRow(HttpStatusCode.MovedPermanently)]
    [DataRow(HttpStatusCode.NotFound)]
    [DataRow(HttpStatusCode.MethodNotAllowed)]
    [DataRow(HttpStatusCode.MisdirectedRequest)]
    [DataRow(HttpStatusCode.InternalServerError)]
    public async Task OtherStatuses_AreTransportFailuresNamingTheCode(HttpStatusCode status)
    {
        var daemon = FakeDaemon.Refusing(status);
        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));

        StringAssert.Contains(failure.Message, ((int)status).ToString());
    }

    [TestMethod]
    public void Handler_DoesNotFollowRedirectsAndSkipsCompressionOnLoopback()
    {
        using var loopback = RpcClient.Handler(new Uri("http://127.0.0.1:9091"));
        using var remote = RpcClient.Handler(new Uri("https://seedbox.example.com:9091"));

        Assert.IsFalse(
            loopback.AllowAutoRedirect,
            "the 301 points at the web client, and .NET drops Authorization across a redirect");
        Assert.AreEqual(DecompressionMethods.None, loopback.AutomaticDecompression, "no wire to save on loopback");
        Assert.AreNotEqual(DecompressionMethods.None, remote.AutomaticDecompression);
    }

    // --- the session id ---------------------------------------------------------------------

    [TestMethod]
    public async Task SessionId_IsNotGuessedBeforeTheDaemonIssuesOne()
    {
        var daemon = new FakeDaemon((call, index) =>
            index == 0 ? FakeDaemon.Challenge("issued-1") : FakeDaemon.Json(FakeDaemon.Success(call)));

        using var client = daemon.Connect();
        await client.Send(new SessionStats());

        Assert.IsNull(daemon.Calls[0].SessionId, "the first request must draw the 409 that reveals the version");
        Assert.AreEqual("issued-1", daemon.Calls[1].SessionId);
    }

    [TestMethod]
    public async Task Conflict_IsReplayedOnceWithTheIssuedId()
    {
        var daemon = new FakeDaemon((call, index) =>
            index == 0 ? FakeDaemon.Challenge("issued-1") : FakeDaemon.Json(FakeDaemon.Success(call)));

        using var client = daemon.Connect();
        await client.Send(new TorrentStart(TorrentIds.Of("abc")));

        Assert.AreEqual(2, daemon.Calls.Count);
        Assert.AreEqual("torrent_start", daemon.Calls[1].Method, "the 409 precedes dispatch, so a replay is safe");
    }

    [TestMethod]
    public async Task Conflict_ReusesTheIdOnLaterRequestsRatherThanDrawingAnother409()
    {
        var daemon = new FakeDaemon((call, index) =>
            index == 0 ? FakeDaemon.Challenge("issued-1") : FakeDaemon.Json(FakeDaemon.Success(call)));

        using var client = daemon.Connect();
        await client.Send(new SessionStats());
        await client.Send(new SessionStats());

        Assert.AreEqual(3, daemon.Calls.Count);
        Assert.AreEqual("issued-1", daemon.Calls[2].SessionId);
    }

    [TestMethod]
    public async Task Conflict_ReplaySerializesTheRequestAgainRatherThanResendingTheBytes()
    {
        var daemon = new FakeDaemon((call, index) =>
            index == 0 ? FakeDaemon.Challenge("issued-1") : FakeDaemon.Json(FakeDaemon.Success(call)));

        using var client = daemon.Connect();
        await client.Send(new Counting());

        Assert.AreEqual(1, Serial(daemon.Calls[0]));
        Assert.AreEqual(
            2,
            Serial(daemon.Calls[1]),
            "keeping the request as an object until the moment of send is what makes this safe; " +
            "Transmission's own Qt client replays the bytes it already encoded");

        static int Serial(Call call) => call.Arguments.GetProperty("serial").GetInt32();
    }

    [TestMethod]
    public async Task Conflict_TwiceRunningIsNotAStaleIdAndThrows()
    {
        var daemon = new FakeDaemon((_, index) => FakeDaemon.Challenge($"issued-{index}"));
        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));

        Assert.AreEqual(
            2,
            daemon.Calls.Count,
            "the id rotates hourly and a request lives at most 300 s, so one rotation is the bound");
    }

    [TestMethod]
    public async Task Conflict_WithoutAVersionHeaderMeansADaemonOlderThan41()
    {
        var daemon = new FakeDaemon((_, _) => FakeDaemon.Challenge("issued-1", version: null));
        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));

        StringAssert.Contains(failure.Message, "4.1", "the 409 is the only place the version is revealed");
        Assert.AreEqual(1, daemon.Calls.Count, "fail fast rather than half-working with wrong field names");
    }

    [TestMethod]
    public async Task Conflict_WithoutASessionIdIsATransportFailure()
    {
        var daemon = new FakeDaemon((_, _) =>
        {
            var answer = new HttpResponseMessage(HttpStatusCode.Conflict);
            answer.Headers.TryAddWithoutValidation("X-Transmission-Rpc-Version", "6.0.1");
            return answer;
        });

        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));
    }

    // --- deadlines --------------------------------------------------------------------------

    [TestMethod]
    public void Timeout_DefaultsTo60SecondsAnd300ForBlocklistUpdate()
    {
        Assert.AreEqual(TimeSpan.FromSeconds(60), ((IRpcRequest)new SessionStats()).Timeout);
        Assert.AreEqual(TimeSpan.FromSeconds(300), ((IRpcRequest)new BlocklistUpdate()).Timeout);
    }

    [TestMethod]
    public async Task Timeout_BecomesATransportFailureNamingTheEndpoint()
    {
        var daemon = new FakeDaemon(async (_, _, cancellation) =>
        {
            await Task.Delay(Timeout.Infinite, cancellation);
            return new HttpResponseMessage();
        });

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new Impatient()));

        StringAssert.Contains(failure.Message, "127.0.0.1");
    }

    [TestMethod]
    public async Task Cancellation_ByTheCallerStaysACancellation()
    {
        using var caller = new CancellationTokenSource();

        var daemon = new FakeDaemon(async (_, _, cancellation) =>
        {
            await caller.CancelAsync();
            await Task.Delay(Timeout.Infinite, cancellation);
            return new HttpResponseMessage();
        });

        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<TaskCanceledException>(
            () => client.Send(new SessionStats(), caller.Token));
    }

    [TestMethod]
    public async Task Unreachable_IsATransportFailureCarryingTheCause()
    {
        var daemon = new FakeDaemon((_, _, _) =>
            Task.FromException<HttpResponseMessage>(new HttpRequestException("connection refused")));

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));

        Assert.IsInstanceOfType<HttpRequestException>(failure.InnerException);
    }

    // --- answers ----------------------------------------------------------------------------

    [TestMethod]
    public async Task MethodError_CarriesTheDaemonsOwnCode()
    {
        var daemon = FakeDaemon.Answering(
            """{"jsonrpc":"2.0","error":{"code":4,"message":"unrecognized info"},"id":1}""");

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcMethodException>(
            () => client.Send(new TorrentAdd { Filename = "nope.torrent" }));

        Assert.AreEqual(RpcError.UnrecognizedInfo, failure.Code);
        Assert.AreEqual("torrent_add", failure.Method);
        Assert.IsFalse(failure.IsProtocol, "1 to 9 are Transmission's own codes");
        StringAssert.Contains(failure.Message, "unrecognized info");
    }

    [TestMethod]
    public async Task MethodError_NegativeCodesAreProtocolErrors()
    {
        var daemon = FakeDaemon.Answering(
            """{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":1}""");

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcMethodException>(() => client.Send(new SessionStats()));

        Assert.AreEqual(RpcError.MethodNotFound, failure.Code);
        Assert.IsTrue(failure.IsProtocol);
    }

    [TestMethod]
    public async Task MethodError_IncludesTheExplanationWhenTheDaemonSuppliesOne()
    {
        var daemon = FakeDaemon.Answering(
            """
            {"jsonrpc":"2.0","error":{"code":-32602,"message":"Invalid params",
             "data":{"error_string":"no fields specified"}},"id":1}
            """);

        using var client = daemon.Connect();

        var failure = await Assert.ThrowsExactlyAsync<RpcMethodException>(() => client.Send(new SessionStats()));

        StringAssert.Contains(failure.Message, "no fields specified");
    }

    [TestMethod]
    public async Task Answer_ThatIsNotJsonIsATransportFailure()
    {
        var daemon = FakeDaemon.Answering("<html>not json</html>");
        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));
    }

    [TestMethod]
    public async Task Answer_WithNeitherResultNorErrorIsATransportFailure()
    {
        var daemon = FakeDaemon.Answering("""{"jsonrpc":"2.0","id":1}""");
        using var client = daemon.Connect();

        await Assert.ThrowsExactlyAsync<RpcTransportException>(() => client.Send(new SessionStats()));
    }

    [TestMethod]
    public async Task Answer_OfAnEmptyObjectDecodesForCommandsThatReturnNothing()
    {
        var daemon = FakeDaemon.Succeeding();
        using var client = daemon.Connect();

        var result = await client.Send(new TorrentVerify(TorrentIds.Of("abc")));

        Assert.AreEqual(default, result);
    }

    /// <summary>A request whose serialization changes each time it is written.</summary>
    private sealed record Counting : IRpcRequest<Empty>
    {
        private int _serial;

        public int Serial => Interlocked.Increment(ref _serial);
    }

    private sealed record Impatient : IRpcRequest<Empty>
    {
        TimeSpan IRpcRequest.Timeout => TimeSpan.FromMilliseconds(50);
    }
}
