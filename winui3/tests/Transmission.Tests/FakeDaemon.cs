using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Transmission;

namespace Transmission_Tests;

/// <summary>
/// What one request looked like on the wire.
/// </summary>
internal sealed record Call
{
    public Call(Uri uri, string body, string? sessionId, AuthenticationHeaderValue? authorization)
    {
        Uri = uri;
        Body = body;
        SessionId = sessionId;
        Authorization = authorization;

        using var document = JsonDocument.Parse(body);
        Root = document.RootElement.Clone();
    }

    public Uri Uri { get; }

    public string Body { get; }

    public string? SessionId { get; }

    public AuthenticationHeaderValue? Authorization { get; }

    public JsonElement Root { get; }

    /// <summary>The <c>params</c> of a single request.</summary>
    public JsonElement Arguments => Root.GetProperty("params");

    public string Method => Root.GetProperty("method").GetString()!;

    public IReadOnlyList<JsonElement> Elements => [.. Root.EnumerateArray()];
}

/// <summary>
/// The daemon, faked at <see cref="HttpMessageHandler"/> rather than behind a transport interface
/// of our own. An interface seam would put the header handling, the status mapping and the 409
/// replay - the parts most likely to be wrong - on the far side of the fake.
/// </summary>
internal sealed class FakeDaemon : HttpMessageHandler
{
    private readonly Func<Call, int, CancellationToken, Task<HttpResponseMessage>> _answer;

    public FakeDaemon(Func<Call, int, CancellationToken, Task<HttpResponseMessage>> answer) => _answer = answer;

    public FakeDaemon(Func<Call, int, HttpResponseMessage> answer)
        : this((call, index, _) => Task.FromResult(answer(call, index)))
    {
    }

    public List<Call> Calls { get; } = [];

    public Call Only => Calls.Count == 1
        ? Calls[0]
        : throw new InvalidOperationException($"Expected exactly one call, saw {Calls.Count}.");

    /// <summary>Answers every request with the same body.</summary>
    public static FakeDaemon Answering(string body) => new((_, _) => Json(body));

    /// <summary>Answers with <c>{"jsonrpc":"2.0","result":{},"id":n}</c>, echoing the id it was sent.</summary>
    public static FakeDaemon Succeeding() => new((call, _) => Json(Success(call)));

    public static FakeDaemon Refusing(HttpStatusCode status) => new((_, _) => new HttpResponseMessage(status));

    public static string Success(Call call) => Success(call.Root.GetProperty("id").GetInt32(), "{}");

    public static string Success(int id, string result) => $$"""{"jsonrpc":"2.0","result":{{result}},"id":{{id}}}""";

    public static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };

    /// <summary>
    /// The 409 the daemon sends when a session id is missing or stale. Pass a null version to
    /// stand in for a daemon older than 4.1, which is the only way that is detectable.
    /// </summary>
    public static HttpResponseMessage Challenge(string sessionId, string? version = "6.0.1")
    {
        var answer = new HttpResponseMessage(HttpStatusCode.Conflict)
        {
            Content = new StringContent("<p>Your request had an invalid session_id header.</p>"),
        };

        answer.Headers.TryAddWithoutValidation("X-Transmission-Session-Id", sessionId);

        if (version is not null)
        {
            answer.Headers.TryAddWithoutValidation("X-Transmission-Rpc-Version", version);
        }

        return answer;
    }

    public RpcClient Connect(string address = "http://127.0.0.1:9091", NetworkCredential? credential = null) =>
        new(new Uri(address), credential, this, disposeHandler: false);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellation)
    {
        var body = request.Content is null
            ? string.Empty
            : await request.Content.ReadAsStringAsync(cancellation).ConfigureAwait(false);

        var call = new Call(
            request.RequestUri!,
            body,
            request.Headers.TryGetValues("X-Transmission-Session-Id", out var ids) ? ids.First() : null,
            request.Headers.Authorization);

        var index = Calls.Count;
        Calls.Add(call);

        return await _answer(call, index, cancellation).ConfigureAwait(false);
    }
}
