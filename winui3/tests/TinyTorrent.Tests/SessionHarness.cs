using System.Net;
using System.Text.Json;
using TinyTorrent;
using Transmission;
using Transmission_Tests;

namespace TinyTorrent_Tests;

/// <summary>
/// One thread and one queue, so a test can put a command, a poll and a cancelled loop's
/// continuation in a known order.
/// </summary>
/// <remarks>
/// <see cref="Session"/> is affine to the thread that calls <see cref="Session.Connect"/>: every
/// continuation in it returns to that thread's synchronization context. Which order those
/// continuations run in is what the reconnect test is about, so the suite supplies a context
/// rather than letting the thread pool decide it.
/// </remarks>
internal sealed class Pump : SynchronizationContext
{
    private readonly Queue<(SendOrPostCallback Work, object? State)> _queue = new();

    public override void Post(SendOrPostCallback work, object? state) => _queue.Enqueue((work, state));

    public override void Send(SendOrPostCallback work, object? state) => work(state);

    /// <summary>Run an asynchronous body to completion on this thread, draining its continuations.</summary>
    internal static void Run(Func<Task> body)
    {
        SynchronizationContext? previous = Current;
        Pump pump = new();
        SetSynchronizationContext(pump);

        try
        {
            Task task = body();

            while (!task.IsCompleted)
            {
                if (pump._queue.Count > 0)
                {
                    (SendOrPostCallback work, object? state) = pump._queue.Dequeue();
                    work(state);
                    continue;
                }

                // Nothing queued, so what we are waiting for is a timer that has not fired. It
                // posts here when it does.
                Thread.Sleep(1);
            }

            task.GetAwaiter().GetResult();
        }
        finally
        {
            SetSynchronizationContext(previous);
        }
    }

    /// <summary>Let everything already queued run: one more post lands behind all of it.</summary>
    internal static async Task Settle()
    {
        for (int round = 0; round < 3; round++)
        {
            await Task.Yield();
        }
    }
}

/// <summary>
/// A <see cref="Session"/> driven against the daemon fake shared with <c>Transmission.Tests</c>, so
/// the poll loop, the state machine and the optimism all run whole, with no socket.
/// </summary>
/// <remarks>
/// Every poll waits here until the test asks for it. Left free-running, a test that reads what one
/// tick did is racing the next one, and the tick arithmetic - which edit retires on which tick - is
/// most of what there is to check.
/// </remarks>
internal sealed class SessionHarness : IDisposable
{
    /// <summary>
    /// The daemon's key names. The answers are built from the same projection records the session
    /// decodes into, so a field renamed on one side cannot pass on the other.
    /// </summary>
    private static readonly JsonSerializerOptions Answers = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    /// <summary>What the daemon we target publishes: a size k is 1000 and a memory k is 1024.</summary>
    private static readonly Units Scale = new(
        1024,
        ["B", "KiB", "MiB", "GiB", "TiB"],
        1000,
        ["B", "kB", "MB", "GB", "TB"],
        1000,
        ["B/s", "kB/s", "MB/s", "GB/s", "TB/s"]);

    private static readonly Totals Nothing = new(0, 0, 0, 0, 0);

    private readonly FakeDaemon _daemon;
    private readonly List<TorrentSummary> _summaries = [];
    private readonly List<TorrentFacts> _facts = [];

    private string? _heldMethod;
    private TaskCompletionSource<HttpStatusCode>? _held;
    private TaskCompletionSource? _ticked;
    private TaskCompletionSource? _polling;
    private int _permits;

    internal SessionHarness(int rows = 3)
    {
        Populate(rows);
        _daemon = new FakeDaemon(Answer);

        // Port zero, and no socket is ever opened: the handler answers everything. The address only
        // has to be one the client will parse.
        Session = new Session(
            new Uri("http://127.0.0.1:0/"),
            null,
            _daemon,
            TimeSpan.FromMilliseconds(1));

        Session.StateChanged += (_, state) => States.Add(state);
        Session.Failed += (_, message) => Failures.Add(message);
        Session.Changed += OnChanged;
    }

    internal Session Session { get; }

    internal List<SessionState> States { get; } = [];

    internal List<string> Failures { get; } = [];

    /// <summary>Completed polls, counted from the session's own <see cref="Session.Changed"/>.</summary>
    internal int Ticked { get; private set; }

    /// <summary>What the daemon reports beside the torrents, which is what decides the next tick.</summary>
    internal int Active { get; set; }

    internal int Paused { get; set; }

    internal long Down { get; set; } = 1_000_000;

    internal long Up { get; set; }

    /// <summary>While false the daemon is not listening, which is what a stopped engine looks like.</summary>
    internal bool Reachable { get; set; } = true;

    internal IReadOnlyList<Call> Calls => _daemon.Calls;

    /// <summary>
    /// The methods the most recent call carried, joined. A sweep reads
    /// <c>session_stats+torrent_get+torrent_get</c>, a delta one <c>torrent_get</c>, and a tick
    /// against a quiet daemon reads <c>session_stats</c> alone.
    /// </summary>
    internal string LastPoll => string.Join("+", Methods(_daemon.Calls[^1]));

    internal Torrent Row(int index) => Session.Torrents.Rows[index];

    /// <summary>The world the daemon answers from, replaced whole.</summary>
    internal void Populate(int count, int firstId = 0)
    {
        _summaries.Clear();
        _facts.Clear();

        for (int i = 0; i < count; i++)
        {
            _summaries.Add(Daemon.Summary(firstId + i, queuePosition: i));
            _facts.Add(Daemon.Facts(firstId + i));
        }

        Active = count;
    }

    /// <summary>A daemon with nothing running: no active torrent, and no row moving bytes.</summary>
    internal void GoQuiet()
    {
        Active = 0;
        Down = 0;
        Up = 0;

        for (int i = 0; i < _summaries.Count; i++)
        {
            _summaries[i] = _summaries[i] with { RateDownload = 0, RateUpload = 0 };
        }
    }

    /// <summary>
    /// Hold the next call to <paramref name="method"/> until the returned handle is released, so a
    /// command can be left standing between the click and the daemon's answer. Release it with
    /// <see cref="HttpStatusCode.OK"/> to succeed and anything else to fail.
    /// </summary>
    internal TaskCompletionSource<HttpStatusCode> Hold(string method)
    {
        _heldMethod = method;
        return _held = new TaskCompletionSource<HttpStatusCode>(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    /// <summary>Let one poll through, and wait for the tick it completes.</summary>
    internal async Task Tick()
    {
        _ticked = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Allow();
        await Wait(_ticked.Task, "a poll to complete").ConfigureAwait(true);
    }

    /// <summary>Wait until the session reaches a state, so a test fails rather than hanging.</summary>
    internal async Task Until(Func<bool> reached, string what)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(10);

        while (!reached())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException($"the session never reached {what}; it is {Session.State}.");
            }

            await Task.Delay(1).ConfigureAwait(true);
        }
    }

    public void Dispose()
    {
        Session.Dispose();

        // A poll parked at the gate holds a task nothing will ever complete otherwise.
        _permits = int.MaxValue;
        _polling?.TrySetResult();
        _held?.TrySetResult(HttpStatusCode.OK);

        _daemon.Dispose();
    }

    private static async Task Wait(Task waited, string what)
    {
        if (await Task.WhenAny(waited, Task.Delay(TimeSpan.FromSeconds(10))).ConfigureAwait(true) != waited)
        {
            throw new TimeoutException($"waited ten seconds for {what}.");
        }

        await waited.ConfigureAwait(true);
    }

    private static List<string> Methods(Call call)
    {
        List<string> methods = [];

        if (call.Root.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement request in call.Root.EnumerateArray())
            {
                methods.Add(request.GetProperty("method").GetString()!);
            }

            return methods;
        }

        methods.Add(call.Method);
        return methods;
    }

    /// <summary>
    /// Which of the two torrent_get projections a request asks for. The field list is derived from
    /// the projection type, and only the static one carries the hash.
    /// </summary>
    private static bool WantsFacts(JsonElement request)
    {
        foreach (JsonElement field in request.GetProperty("params").GetProperty("fields").EnumerateArray())
        {
            if (field.GetString() == "hash_string")
            {
                return true;
            }
        }

        return false;
    }

    private void OnChanged(object? sender, TorrentFields fields)
    {
        Ticked++;

        TaskCompletionSource? waiting = _ticked;
        _ticked = null;
        waiting?.TrySetResult();
    }

    private void Allow()
    {
        _permits++;

        TaskCompletionSource? parked = _polling;
        _polling = null;
        parked?.TrySetResult();
    }

    /// <summary>Wait here until the test asks for a poll, and spend the permit it granted.</summary>
    private async Task Gate(CancellationToken token)
    {
        while (_permits == 0)
        {
            _polling = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            await _polling.Task.ConfigureAwait(true);
        }

        // A poll whose session was disconnected while it waited must not spend the permit granted
        // to the session that replaced it.
        token.ThrowIfCancellationRequested();
        _permits--;
    }

    private async Task<HttpResponseMessage> Answer(Call call, int index, CancellationToken token)
    {
        if (!Reachable)
        {
            throw new HttpRequestException("nothing is listening on that port.");
        }

        if (call.Root.ValueKind == JsonValueKind.Array)
        {
            await Gate(token).ConfigureAwait(true);

            List<string> answers = [];
            foreach (JsonElement request in call.Root.EnumerateArray())
            {
                answers.Add(One(request));
            }

            return FakeDaemon.Json("[" + string.Join(",", answers) + "]");
        }

        if (call.Method == "session_stats")
        {
            // A tick against a quiet daemon is this method on its own rather than a batch, and it
            // is a poll like any other.
            await Gate(token).ConfigureAwait(true);
        }
        else if (_heldMethod == call.Method && _held is { } gate)
        {
            _heldMethod = null;
            _held = null;

            HttpStatusCode status = await gate.Task.ConfigureAwait(true);
            if (status != HttpStatusCode.OK)
            {
                return new HttpResponseMessage(status);
            }
        }

        return FakeDaemon.Json(One(call.Root));
    }

    private string One(JsonElement request)
    {
        int id = request.GetProperty("id").GetInt32();

        string result = request.GetProperty("method").GetString() switch
        {
            "session_get" => JsonSerializer.Serialize(new SessionFacts(Scale), Answers),
            "session_stats" => JsonSerializer.Serialize(
                new SessionStatistics(Active, Paused, _summaries.Count, Down, Up, Nothing, Nothing),
                Answers),
            "torrent_get" when WantsFacts(request) => JsonSerializer.Serialize(
                new TorrentGetResult<TorrentFacts>(_facts),
                Answers),
            "torrent_get" => JsonSerializer.Serialize(
                new TorrentGetResult<TorrentSummary>(_summaries),
                Answers),
            _ => "{}",
        };

        return FakeDaemon.Success(id, result);
    }
}
