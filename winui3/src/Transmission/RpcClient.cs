using System.Buffers;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Transmission;

/// <summary>
/// One connection to one daemon. Owns the HTTP client, the address, the credential, the session
/// id and the deadline of every call. Transmission 4.1 or newer, JSON-RPC 2.0 only.
/// </summary>
public sealed class RpcClient : IDisposable
{
    private const string SessionIdHeader = "X-Transmission-Session-Id";
    private const string VersionHeader = "X-Transmission-Rpc-Version";
    private const string DefaultPath = "/transmission/rpc";

    private readonly HttpClient _http;
    private readonly Uri _endpoint;
    private readonly string? _credential;

    private string? _sessionId;
    private int _lastId;

    public RpcClient(Uri address, NetworkCredential? credential = null)
        : this(address, credential, Handler(address), disposeHandler: true)
    {
    }

    public RpcClient(Uri address, NetworkCredential? credential, HttpMessageHandler handler, bool disposeHandler)
    {
        ArgumentNullException.ThrowIfNull(address);
        ArgumentNullException.ThrowIfNull(handler);

        _endpoint = Endpoint(address);
        _credential = credential is null
            ? null
            : Convert.ToBase64String(Encoding.UTF8.GetBytes($"{credential.UserName}:{credential.Password}"));

        // Each call carries its own deadline on a linked token, so a second client-wide one would
        // only surface as a bare TaskCanceledException that says nothing about which call expired.
        _http = new HttpClient(handler, disposeHandler) { Timeout = System.Threading.Timeout.InfiniteTimeSpan };
    }

    public void Dispose() => _http.Dispose();

    public async Task<TResult> Send<TResult>(
        IRpcRequest<TResult> request,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var id = NextId();
        using var answer = await Exchange(() => Encode(request, id), request.Timeout, cancellation)
            .ConfigureAwait(false);

        return Decode<TResult>(answer.RootElement, request);
    }

    /// <summary>
    /// One request holding both methods. The daemon runs a whole batch under a single session
    /// lock, so the two answers are one consistent view of the daemon rather than two samples.
    /// </summary>
    public async Task<(TFirst First, TSecond Second)> Send<TFirst, TSecond>(
        IRpcRequest<TFirst> first,
        IRpcRequest<TSecond> second,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(first);
        ArgumentNullException.ThrowIfNull(second);

        IRpcRequest[] batch = [first, second];
        var answers = await Exchange(batch, cancellation).ConfigureAwait(false);

        using (answers.Document)
        {
            return (Decode<TFirst>(answers.Elements[0], first), Decode<TSecond>(answers.Elements[1], second));
        }
    }

    public async Task<(TFirst First, TSecond Second, TThird Third)> Send<TFirst, TSecond, TThird>(
        IRpcRequest<TFirst> first,
        IRpcRequest<TSecond> second,
        IRpcRequest<TThird> third,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(first);
        ArgumentNullException.ThrowIfNull(second);
        ArgumentNullException.ThrowIfNull(third);

        IRpcRequest[] batch = [first, second, third];
        var answers = await Exchange(batch, cancellation).ConfigureAwait(false);

        using (answers.Document)
        {
            return (
                Decode<TFirst>(answers.Elements[0], first),
                Decode<TSecond>(answers.Elements[1], second),
                Decode<TThird>(answers.Elements[2], third));
        }
    }

    public async Task<TResult[]> Send<TResult>(
        IReadOnlyList<IRpcRequest<TResult>> requests,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(requests);

        if (requests.Count == 0)
        {
            // tr_rpc_request_exec_batch only calls back once it has counted n_requests responses
            // (rpcimpl.cc:2934-2963), so an empty array is never answered at all and the request
            // would hang until its deadline.
            return [];
        }

        var answers = await Exchange(requests, cancellation).ConfigureAwait(false);

        using (answers.Document)
        {
            var results = new TResult[requests.Count];
            for (var i = 0; i < results.Length; i++)
            {
                results[i] = Decode<TResult>(answers.Elements[i], requests[i]);
            }

            return results;
        }
    }

    private async Task<(JsonDocument Document, JsonElement[] Elements)> Exchange(
        IReadOnlyList<IRpcRequest> batch,
        CancellationToken cancellation)
    {
        RejectAsyncDispatch(batch);

        var ids = NextIds(batch.Count);
        var document = await Exchange(() => Encode(batch, ids), Longest(batch), cancellation).ConfigureAwait(false);

        try
        {
            return (document, Correlate(document.RootElement, ids));
        }
        catch
        {
            document.Dispose();
            throw;
        }
    }

    private async Task<JsonDocument> Exchange(Func<byte[]> encode, TimeSpan timeout, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(timeout);

        // The retry bound is one, and it is derived: the session id rotates on a 3600 s timer with
        // no grace window (session-id.h:47) and no request lives longer than 300 s, so at most one
        // rotation can fall inside a call. A second consecutive 409 is not a stale id.
        for (var attempt = 0; ; attempt++)
        {
            var sessionId = Volatile.Read(ref _sessionId);

            // Encoded here rather than once outside the loop so that a replay re-serializes from
            // the request object. Replaying the bytes is the defect in Transmission's own Qt
            // client (qt/RpcClient.cc:237).
            using var message = new HttpRequestMessage(HttpMethod.Post, _endpoint)
            {
                Content = new ByteArrayContent(encode()),
            };

            message.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json") { CharSet = "utf-8" };

            if (_credential is not null)
            {
                // Sent unasked. It saves a challenge round trip, makes any 401 we do see
                // unambiguous, and stops each call spending two of the daemon's anti-brute-force
                // attempts where one would do.
                message.Headers.Authorization = new AuthenticationHeaderValue("Basic", _credential);
            }

            if (sessionId is not null)
            {
                message.Headers.TryAddWithoutValidation(SessionIdHeader, sessionId);
            }

            using var answer = await SendOnce(message, timeout, deadline.Token, cancellation).ConfigureAwait(false);

            if (answer.StatusCode == HttpStatusCode.Conflict)
            {
                if (attempt > 0)
                {
                    throw new RpcTransportException(
                        RpcFault.Protocol,
                        $"{_endpoint} rejected the session id twice running, which one rotation cannot explain.");
                }

                Adopt(answer, sessionId);
                continue;
            }

            Verify(answer);

            var body = await answer.Content.ReadAsByteArrayAsync(deadline.Token).ConfigureAwait(false);

            try
            {
                return JsonDocument.Parse(body);
            }
            catch (JsonException e)
            {
                throw new RpcTransportException(RpcFault.Protocol, $"{_endpoint} answered something that is not JSON.", e);
            }
        }
    }

    private async Task<HttpResponseMessage> SendOnce(
        HttpRequestMessage message,
        TimeSpan timeout,
        CancellationToken deadline,
        CancellationToken cancellation)
    {
        try
        {
            return await _http.SendAsync(message, deadline).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        {
            throw new RpcTransportException(
                RpcFault.Unreachable,
                $"{_endpoint} did not answer within {timeout.TotalSeconds:0} s.");
        }
        catch (HttpRequestException e)
        {
            throw new RpcTransportException(RpcFault.Unreachable, $"Could not reach {_endpoint}.", e);
        }
    }

    private void Adopt(HttpResponseMessage answer, string? previous)
    {
        // A session id is required unconditionally (rpc-server.cc:61), so a fresh client always
        // draws one 409 before anything runs - and the version header is written only in that
        // branch (rpc-server.cc:627). So this is the one moment a daemon's RPC version is
        // revealed, and its absence means the daemon predates 4.1. Never persist an id across
        // runs: reusing one skips the 409 and with it this check.
        if (!answer.Headers.Contains(VersionHeader))
        {
            throw new RpcTransportException(
                RpcFault.Protocol,
                $"{_endpoint} sent no {VersionHeader} with its session-id challenge, so it is older than " +
                "Transmission 4.1. This client speaks JSON-RPC 2.0 only, which 4.1 introduced.");
        }

        if (!answer.Headers.TryGetValues(SessionIdHeader, out var values) ||
            values.FirstOrDefault() is not { Length: > 0 } issued)
        {
            throw new RpcTransportException(
                RpcFault.Protocol,
                $"{_endpoint} rejected the session id but sent no {SessionIdHeader}.");
        }

        // Compare and swap so that the requests caught by one rotation do not race to install
        // competing ids. It does not reduce how many get a 409; batching is what does that.
        Interlocked.CompareExchange(ref _sessionId, issued, previous);
    }

    private void Verify(HttpResponseMessage answer)
    {
        switch ((int)answer.StatusCode)
        {
            case 200:
                return;

            case 401:
                throw new RpcAuthenticationException(
                    RpcFault.Unauthorized,
                    $"{_endpoint} rejected the user name or password.");

            case 403:
                // The two causes are byte-identical on the wire, so the message names both rather
                // than guessing. A lockout cannot be cleared by logging in correctly: the gate at
                // rpc-server.cc:536 runs before is_authorized at 570, so the counter reset at 585
                // is unreachable.
                throw new RpcAuthenticationException(
                    RpcFault.Refused,
                    $"{_endpoint} refused this client. Either its address is missing from the daemon's " +
                    "rpc_whitelist, or the daemon's brute-force protection has locked it out - and a correct " +
                    "password cannot clear a lockout, so the daemon must be restarted or anti_brute_force_enabled " +
                    "turned off.");

            default:
                throw new RpcTransportException(
                    RpcFault.Protocol,
                    $"{_endpoint} answered {(int)answer.StatusCode} {answer.ReasonPhrase}.");
        }
    }

    /// <summary>
    /// Matches answers to requests by id. Never by position: the daemon writes each answer into
    /// its own slot but then erases every notification's slot with remove_if before the callback
    /// runs (rpcimpl.cc:2950-2958), which compacts the array.
    /// </summary>
    private static JsonElement[] Correlate(JsonElement root, int[] ids)
    {
        if (root.ValueKind != JsonValueKind.Array)
        {
            throw new RpcTransportException(
                RpcFault.Protocol,
                "The daemon answered a batch with something other than an array.");
        }

        var found = new JsonElement[ids.Length];
        var matched = new bool[ids.Length];

        foreach (var element in root.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object ||
                !element.TryGetProperty("id", out var id) ||
                !id.TryGetInt32(out var value))
            {
                continue;
            }

            var slot = Array.IndexOf(ids, value);
            if (slot < 0)
            {
                continue;
            }

            found[slot] = element;
            matched[slot] = true;
        }

        var missing = Array.IndexOf(matched, false);
        if (missing >= 0)
        {
            throw new RpcTransportException(
                RpcFault.Protocol,
                $"The daemon's batch answer held nothing with id {ids[missing]}.");
        }

        return found;
    }

    private static TResult Decode<TResult>(JsonElement answer, IRpcRequest request)
    {
        var method = Wire.MethodOf(request.GetType());

        if (answer.ValueKind != JsonValueKind.Object)
        {
            throw new RpcTransportException(RpcFault.Protocol, $"The answer to {method} was not an object.");
        }

        if (answer.TryGetProperty("error", out var error))
        {
            throw Failure(method, error);
        }

        if (!answer.TryGetProperty("result", out var result))
        {
            throw new RpcTransportException(
                RpcFault.Protocol,
                $"The answer to {method} carried neither a result nor an error.");
        }

        try
        {
            var value = result.Deserialize<TResult>(Wire.Options);
            return value is null
                ? throw new RpcTransportException(RpcFault.Protocol, $"The daemon answered {method} with a null result.")
                : value;
        }
        catch (JsonException e)
        {
            throw new RpcTransportException(RpcFault.Protocol, $"Could not read the {method} result.", e);
        }
    }

    private static RpcException Failure(string method, JsonElement error)
    {
        if (error.ValueKind != JsonValueKind.Object ||
            !error.TryGetProperty("code", out var code) ||
            !code.TryGetInt32(out var value))
        {
            return new RpcTransportException(
                RpcFault.Protocol,
                $"The daemon failed {method} but named no error code.");
        }

        var message = error.TryGetProperty("message", out var text) ? text.GetString() : null;

        // data is absent unless the handler supplied an explanation (rpcimpl.cc:104-117), which
        // most of them do not.
        var detail = error.TryGetProperty("data", out var data) &&
                     data.ValueKind == JsonValueKind.Object &&
                     data.TryGetProperty("error_string", out var explanation)
            ? explanation.GetString()
            : null;

        return new RpcMethodException(method, (RpcError)value, Describe(method, message, detail));
    }

    private static string Describe(string method, string? message, string? detail) => (message, detail) switch
    {
        (null or "", null or "") => $"{method} failed.",
        (_, null or "") => $"{method} failed: {message}.",
        (null or "", _) => $"{method} failed: {detail}.",
        _ => $"{method} failed: {message} - {detail}.",
    };

    private static void RejectAsyncDispatch(IReadOnlyList<IRpcRequest> batch)
    {
        if (batch.Count < 2)
        {
            return;
        }

        foreach (var request in batch)
        {
            if (!request.IsAsyncDispatched)
            {
                continue;
            }

            // The whole batch answers only when its slowest element finishes, and these four
            // complete out of band - blocklist_update can take minutes. Batching one would stall
            // everything sent beside it, and the failure would show up only as a slow interface.
            throw new ArgumentException(
                $"{Wire.MethodOf(request.GetType())} is dispatched asynchronously by the daemon and cannot " +
                "share a batch. Send it on its own.",
                nameof(batch));
        }
    }

    private static TimeSpan Longest(IReadOnlyList<IRpcRequest> batch)
    {
        var longest = TimeSpan.Zero;
        foreach (var request in batch)
        {
            if (request.Timeout > longest)
            {
                longest = request.Timeout;
            }
        }

        return longest;
    }

    private static byte[] Encode(IRpcRequest request, int id)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using var writer = new Utf8JsonWriter(buffer);

        Wire.WriteRequest(writer, request, id);
        writer.Flush();

        return buffer.WrittenSpan.ToArray();
    }

    private static byte[] Encode(IReadOnlyList<IRpcRequest> batch, int[] ids)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using var writer = new Utf8JsonWriter(buffer);

        writer.WriteStartArray();
        for (var i = 0; i < batch.Count; i++)
        {
            Wire.WriteRequest(writer, batch[i], ids[i]);
        }

        writer.WriteEndArray();
        writer.Flush();

        return buffer.WrittenSpan.ToArray();
    }

    internal static SocketsHttpHandler Handler(Uri address) => new()
    {
        // The 301 points at the web client rather than another RPC endpoint, and .NET drops the
        // Authorization header across a redirect, so following one can only end in a puzzling 401.
        AllowAutoRedirect = false,

        // The daemon compresses only when asked and never enlarges, but on loopback there is no
        // wire to save and the decompression is pure cost.
        AutomaticDecompression = address.IsLoopback ? DecompressionMethods.None : DecompressionMethods.All,
    };

    /// <summary>
    /// The daemon's rpc_url is configurable, so the path is a connection setting. A caller who
    /// names no path gets the default; one who names a directory gets the daemon's "rpc" below it.
    /// </summary>
    private static Uri Endpoint(Uri address)
    {
        var path = address.AbsolutePath;

        if (path.Length == 0 || path == "/")
        {
            return new Uri(address, DefaultPath);
        }

        return path.EndsWith('/') ? new Uri(address, path + "rpc") : address;
    }

    private int NextId() => Interlocked.Increment(ref _lastId);

    private int[] NextIds(int count)
    {
        var last = Interlocked.Add(ref _lastId, count);
        var ids = new int[count];

        for (var i = 0; i < count; i++)
        {
            ids[i] = last - count + 1 + i;
        }

        return ids;
    }
}
