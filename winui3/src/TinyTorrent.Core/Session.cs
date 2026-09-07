using System.Net;
using Transmission;

namespace TinyTorrent;

/// <summary>
/// Where the connection stands. One field, five states, and each carries its own data, so there
/// is no state where a fault and an address disagree about which daemon failed.
/// </summary>
public abstract record SessionState
{
    private SessionState()
    {
    }

    public sealed record Idle : SessionState;

    public sealed record Connecting(Uri Address) : SessionState;

    public sealed record Live(Uri Address) : SessionState;

    /// <summary>The daemon did not answer. It may be starting; the next tick asks again.</summary>
    public sealed record Retrying(Uri Address, string Reason) : SessionState;

    /// <summary>
    /// Trying again cannot help, and each fault needs a different screen: wrong credentials asks
    /// for credentials, a refused client explains the whitelist and the lockout, an old daemon
    /// names the version it needs. Retrying the first two would also spend the daemon's own
    /// anti-brute-force budget, and a lockout cannot be cleared by logging in correctly.
    /// </summary>
    public sealed record Blocked(Uri Address, RpcFault Fault, string Reason) : SessionState;
}

/// <summary>
/// The live connection to one daemon: the state machine, the poll, the cache the poll merges
/// into, and the commands that change what the daemon is doing.
/// </summary>
/// <remarks>
/// This layer is deliberately free of XAML, which is what lets it be tested without opening a
/// window. It is not free of threading: <see cref="Connect"/> must be called from the thread that
/// owns the table, because every continuation here returns to that thread's synchronization
/// context, and that is what puts the merge where the table can be told about it.
/// </remarks>
public sealed class Session : IDisposable
{
    /// <summary>
    /// How often the relative "added" strings are re-read. The finest unit any of them prints is
    /// one minute, so a minute of ticks is the soonest one of them could have changed.
    /// </summary>
    private static readonly long RelativeTimeTicks = (long)(TimeSpan.FromSeconds(60) / Tick.Interval);

    private readonly Uri _address;
    private readonly NetworkCredential? _credential;
    private readonly HttpMessageHandler? _transport;
    private readonly TimeSpan _interval = Tick.Interval;

    /// <summary>
    /// The edits the daemon has not confirmed yet. More than one only ever stands over disjoint
    /// rows: an edit that touches a row another one is still waiting on throws both away.
    /// </summary>
    private readonly List<Optimistic> _optimism = [];

    private readonly HashSet<string> _refetch = new(StringComparer.Ordinal);

    private RpcClient? _client;
    private CancellationTokenSource? _life;

    private SessionState _state = new SessionState.Idle();
    private SessionStatistics? _last;
    private SessionStatistics? _before;

    private bool _mutated;
    private bool _sweepForced;
    private long _ticks;

    public Session(Uri address, NetworkCredential? credential = null)
    {
        _address = address ?? throw new ArgumentNullException(nameof(address));
        _credential = credential;
    }

    /// <summary>
    /// The same session over a transport the caller supplies and a poll interval it chooses, so
    /// the suite can drive the whole loop against <c>Transmission.Tests</c>'s daemon fake with no
    /// socket, and without spending two seconds of clock on each of the ticks a retirement or a
    /// reconnect takes. Handing in a client instead would not work: each connection builds its
    /// own, so the one after a reconnect would go to a real address.
    /// </summary>
    /// <remarks>
    /// <see cref="Tick.Interval"/> stays the interval everything else runs at. It is derived from
    /// the daemon's own averaging window and is not a setting; this constructor is not reachable
    /// from outside the assembly, and nothing in the product calls it.
    /// </remarks>
    internal Session(Uri address, NetworkCredential? credential, HttpMessageHandler transport, TimeSpan interval)
        : this(address, credential)
    {
        _transport = transport;
        _interval = interval;
    }

    /// <summary>Raised on every transition, and never for a transition to the state in force.</summary>
    public event EventHandler<SessionState>? StateChanged;

    /// <summary>
    /// Raised once per completed tick, with the kinds of value that moved. A tick that learned
    /// nothing about any torrent still raises it with <see cref="TorrentFields.None"/>, because
    /// the session statistics moved even when no torrent did.
    /// </summary>
    public event EventHandler<TorrentFields>? Changed;

    /// <summary>Raised when a command the user asked for did not happen.</summary>
    public event EventHandler<string>? Failed;

    public SessionState State => _state;

    public TorrentCache Torrents { get; } = new();

    /// <summary>The daemon's own totals, from the most recent tick.</summary>
    public SessionStatistics? Stats => _last;

    public void Connect()
    {
        if (_state is not SessionState.Idle)
        {
            return;
        }

        CancellationTokenSource life = new();
        _life = life;
        _ = Run(life);
    }

    public void Disconnect()
    {
        if (_life is not { } life)
        {
            return;
        }

        // Cleared before the cancel. The cancelled loop's continuation does not run until this
        // call has returned, by which time a Connect beside it may already have installed the
        // next life; comparing against this field is how each loop tells whether it is still the
        // session's, so the field has to say no before the loop is in a position to ask.
        _life = null;
        life.Cancel();
        life.Dispose();

        Move(new SessionState.Idle());
    }

    public void Dispose()
    {
        Disconnect();

        // The loop disposes the client it built, but only when its continuation runs, and Dispose
        // is synchronous. The loop it belonged to has just been cancelled and RpcClient tolerates
        // a second Dispose, so tearing down whatever is published is safe here.
        _client?.Dispose();
        _client = null;
    }

    // ------------------------------------------------------------- commands

    public Task Start(IReadOnlyList<Torrent> rows) => Mutate(
        rows,
        new TorrentStart(Ids(rows)),
        // Queued, not running: whether the daemon starts it at once depends on the queue, so
        // "Downloading" here would be a claim the very next tick has to take back.
        row => new TorrentEdit.Change(
            row,
            Status: row.Progress >= 1 ? TorrentStatus.SeedWait : TorrentStatus.DownloadWait));

    public Task StartNow(IReadOnlyList<Torrent> rows) => Mutate(
        rows,
        new TorrentStartNow(Ids(rows)),
        row => new TorrentEdit.Change(
            row,
            Status: row.Progress >= 1 ? TorrentStatus.Seed : TorrentStatus.Download));

    public Task Stop(IReadOnlyList<Torrent> rows) => Mutate(
        rows,
        new TorrentStop(Ids(rows)),
        row => new TorrentEdit.Change(row, Status: TorrentStatus.Stopped));

    public Task Verify(IReadOnlyList<Torrent> rows) => Mutate(
        rows,
        new TorrentVerify(Ids(rows)),
        row => new TorrentEdit.Change(row, Status: TorrentStatus.CheckWait));

    public Task Remove(IReadOnlyList<Torrent> rows, bool deleteData) => Mutate(
        rows,
        new TorrentRemove(Ids(rows), deleteData),
        row => new TorrentEdit.Change(row, Presence: TorrentPresence.Removing));

    /// <summary>Put the packet immediately before <paramref name="before"/>, or at the end.</summary>
    public Task Reorder(IReadOnlyList<Torrent> packet, Torrent? before) =>
        Rearrange(Queue.Arrange(Torrents.Rows, packet, before));

    /// <summary>The same move as a menu command, so the two cannot disagree about a destination.</summary>
    public Task Reorder(IReadOnlyList<Torrent> packet, QueueMove move) =>
        Rearrange(Queue.Arrange(Torrents.Rows, packet, move));

    /// <summary>Whether that command would change the queue. The menu enables on this answer.</summary>
    public bool CanReorder(IReadOnlyList<Torrent> packet, QueueMove move) =>
        packet.Count > 0 && Queue.Differs(Torrents.Rows, Queue.Arrange(Torrents.Rows, packet, move));

    // async, so that a throw from the arithmetic reaches the caller as a faulted task rather than
    // synchronously out of whatever gesture handler asked for the move.
    private async Task Rearrange(IReadOnlyList<Torrent> arranged)
    {
        if (!Queue.Differs(Torrents.Rows, arranged))
        {
            return;
        }

        List<IRpcRequest<Empty>> batch = [];
        foreach (QueueStep<Torrent> step in Queue.Steps(Torrents.Rows, arranged))
        {
            batch.Add(new TorrentSet(TorrentIds.Of(step.Item.Hash)) { QueuePosition = step.Position });
        }

        // Every row that ends up somewhere new, not only the ones we write: queue_position is a
        // move rather than a slot assignment, so the daemon shifts everything between the old and
        // the new index, and the list must show the order the user will get.
        List<TorrentEdit.Change> changes = [];
        for (int i = 0; i < arranged.Count; i++)
        {
            if (arranged[i].QueuePosition != i)
            {
                changes.Add(new TorrentEdit.Change(arranged[i], QueuePosition: i));
            }
        }

        await Send(new TorrentEdit(changes), token => _client!.Send(batch, token)).ConfigureAwait(true);
    }

    private async Task Mutate<TResult>(
        IReadOnlyList<Torrent> rows,
        IRpcRequest<TResult> request,
        Func<Torrent, TorrentEdit.Change> change)
    {
        if (rows.Count == 0)
        {
            return;
        }

        List<TorrentEdit.Change> changes = new(rows.Count);
        foreach (Torrent row in rows)
        {
            changes.Add(change(row));
        }

        await Send(new TorrentEdit(changes), token => _client!.Send(request, token)).ConfigureAwait(true);
    }

    private async Task Send(TorrentEdit edit, Func<CancellationToken, Task> send)
    {
        if (_state is not SessionState.Live || _client is null || _life is null)
        {
            Failed?.Invoke(this, "There is no connection to the daemon.");
            return;
        }

        Optimistic pending = Show(edit);
        _mutated = true;

        try
        {
            await send(_life.Token).ConfigureAwait(true);
            pending.AckedAt = _ticks;
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception error)
        {
            Undo(pending);
            Failed?.Invoke(this, error.Message);
        }
    }

    // ------------------------------------------------------------ optimism

    /// <summary>One edit standing between the user's click and the daemon agreeing to it.</summary>
    private sealed class Optimistic(TorrentEdit forward, TorrentEdit inverse)
    {
        internal TorrentEdit Forward { get; } = forward;

        internal TorrentEdit Inverse { get; } = inverse;

        /// <summary>The tick count when the daemon acknowledged it, or null while it has not.</summary>
        internal long? AckedAt { get; set; }
    }

    /// <summary>Show the edit at once, keeping the edit that undoes it.</summary>
    private Optimistic Show(TorrentEdit edit)
    {
        if (_optimism.Exists(standing => standing.Forward.Touches(edit.Rows)))
        {
            // Two edits over one row would need their inverses composed, and composing them is
            // exactly where a previous attempt grew a grace-timer state machine beside a separate
            // toggle. Throw every standing edit away and let the next tick read everything.
            _optimism.Clear();
            _sweepForced = true;
        }

        Optimistic pending = new(edit, edit.Apply(out TorrentFields shown));
        _optimism.Add(pending);
        Publish(shown);
        return pending;
    }

    private void Undo(Optimistic pending)
    {
        // An edit a later overlapping one already threw away is not ours to take back. Its inverse
        // was captured before that edit, so applying it writes a value neither the daemon nor the
        // user asked for, and the row then shows neither. Remove is what tells the two apart: an
        // edit still standing is in the list, one Show cleared is not. Show already forced the
        // sweep when it cleared, so the truth is on its way either way.
        if (!_optimism.Remove(pending))
        {
            return;
        }

        pending.Inverse.Apply(out TorrentFields undone);

        // The command failed, so what the daemon holds is not what either edit says. One sweep is
        // the shortest way back to the truth, and a failure is rare enough to pay for it.
        _sweepForced = true;
        Publish(undone);
    }

    /// <summary>
    /// Success does not retire the optimism, because a merge can land carrying state older than
    /// the change. Re-applying the edit after each merge is what stops a row flicking back to what
    /// it was for one tick.
    /// </summary>
    private TorrentFields Restate()
    {
        TorrentFields changed = TorrentFields.None;

        for (int i = _optimism.Count - 1; i >= 0; i--)
        {
            Optimistic pending = _optimism[i];

            // Two, not one: the poll that was in flight when the ack arrived was answered from
            // state that predates the change, so the tick after that one is the first whose
            // answer is certainly the daemon's own.
            if (pending.AckedAt is { } acked && _ticks >= acked + 2)
            {
                _optimism.RemoveAt(i);
                continue;
            }

            pending.Forward.Apply(out TorrentFields shown);
            changed |= shown;
        }

        return changed;
    }

    private void Publish(TorrentFields changed)
    {
        if ((changed & TorrentFields.Queue) != 0)
        {
            Torrents.Order();
        }

        Changed?.Invoke(this, changed);
    }

    // ------------------------------------------------------------ the poll

    private async Task Run(CancellationTokenSource life)
    {
        // Read once, here, where the source is certainly still alive: Disconnect disposes it, and
        // a disposed source refuses to hand out its token.
        CancellationToken token = life.Token;

        while (true)
        {
            try
            {
                await Connected(life, token).ConfigureAwait(true);
            }
            catch (OperationCanceledException)
            {
                Move(life, new SessionState.Idle());
                return;
            }
            catch (RpcException error) when (error.Fault == RpcFault.Unreachable)
            {
                Move(life, new SessionState.Retrying(_address, error.Message));
            }
            catch (RpcException error)
            {
                Move(life, new SessionState.Blocked(_address, error.Fault, error.Message));
                return;
            }
            catch (Exception error)
            {
                // A throw that reaches a dispatcher continuation tears the process down as a
                // stowed exception with no managed stack, so this reports its own failure instead.
                Move(life, new SessionState.Blocked(_address, RpcFault.Protocol, error.ToString()));
                return;
            }

            // Retry at the tick interval. There is no second number here on purpose: a refused
            // connection to a loopback daemon costs nothing, and this is what makes the interface
            // recover within one tick of the tray restarting the engine.
            try
            {
                await Task.Delay(_interval, token).ConfigureAwait(true);
            }
            catch (OperationCanceledException)
            {
                Move(life, new SessionState.Idle());
                return;
            }
        }
    }

    /// <summary>Connect, then poll until the connection fails or the session is stopped.</summary>
    private async Task Connected(CancellationTokenSource life, CancellationToken token)
    {
        Move(life, new SessionState.Connecting(_address));

        // The client belongs to this loop, not to the session. One field shared between loops is
        // disposed by whichever of them starts next, and a request in flight on it then fails as
        // an object that has gone away rather than as a cancellation - which reads as a protocol
        // fault, so the loop reports the session blocked instead of quietly stopping.
        using RpcClient client = _transport is null
            ? new RpcClient(_address, _credential)
            : new RpcClient(_address, _credential, _transport, disposeHandler: false);

        _client = client;

        try
        {
            // Reading the units is also what proves the connection: it draws the session-id
            // challenge, and the version header on that challenge is the only place the daemon
            // ever says it is new enough to speak this dialect.
            SessionFacts facts = await client.Send(new SessionGet<SessionFacts>(), token).ConfigureAwait(true);

            Torrents.Adopt(TorrentFormat.From(facts.Units));
            _last = null;
            _before = null;
            _refetch.Clear();
            _optimism.Clear();
            _sweepForced = false;

            Move(life, new SessionState.Live(_address));

            while (true)
            {
                await Once(client, token).ConfigureAwait(true);
                await Task.Delay(_interval, token).ConfigureAwait(true);
            }
        }
        finally
        {
            // Only if it is still ours. A loop that has been replaced would otherwise unpublish
            // the live loop's client, and every command after that is refused for want of one.
            if (ReferenceEquals(_client, client))
            {
                _client = null;
            }
        }
    }

    /// <summary>
    /// One poll. Ticks cannot overlap because the next one does not exist until this one has
    /// returned - the loop above is the whole of that guarantee, and it needs no flag.
    /// </summary>
    private async Task Once(RpcClient client, CancellationToken token)
    {
        TickPlan plan = Tick.Compose(
            new TickInputs(_last, _before, Torrents.Count, _mutated, _sweepForced));

        _mutated = false;

        TickChange change = new(TorrentFields.None, NeedsSweep: false, TickChange.Nothing);
        SessionStatistics stats;

        if (!plan.Torrents)
        {
            stats = await client.Send(new SessionStats(), token).ConfigureAwait(true);
        }
        else if (plan.Sweep)
        {
            (stats, TorrentGetResult<TorrentSummary> summaries, TorrentGetResult<TorrentFacts> facts) =
                await client.Send(
                    new SessionStats(),
                    new TorrentGet<TorrentSummary>(),
                    new TorrentGet<TorrentFacts>(),
                    token)
                .ConfigureAwait(true);

            change = Torrents.Sweep(summaries.Torrents, facts.Torrents);
            _sweepForced = false;
            _refetch.Clear();
        }
        else if (_refetch.Count > 0)
        {
            (stats, TorrentGetResult<TorrentSummary> summaries, TorrentGetResult<TorrentFacts> facts) =
                await client.Send(
                    new SessionStats(),
                    new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive),
                    new TorrentGet<TorrentFacts>(TorrentIds.Of([.. _refetch])),
                    token)
                .ConfigureAwait(true);

            change = Torrents.Delta(summaries.Torrents, summaries.Removed);
            change = change with { Fields = change.Fields | Torrents.Facts(facts.Torrents) };
            _refetch.Clear();
        }
        else
        {
            (stats, TorrentGetResult<TorrentSummary> summaries) = await client.Send(
                    new SessionStats(),
                    new TorrentGet<TorrentSummary>(TorrentIds.RecentlyActive),
                    token)
                .ConfigureAwait(true);

            change = Torrents.Delta(summaries.Torrents, summaries.Removed);
        }

        // Every tick, including the statistics-only one above, which merges nothing. The ring
        // holds 32 samples at one tick each, and the cell draws that as a 64-second window; a ring
        // that advanced only when a row was in a merge would stand still against a quiet daemon
        // while still being read as the same window.
        Torrents.Sample();

        _before = _last;
        _last = stats;
        _ticks++;

        _sweepForced |= change.NeedsSweep;
        foreach (string hash in change.Refetch)
        {
            _refetch.Add(hash);
        }

        TorrentFields fields = change.Fields | Restate();

        if (_ticks % RelativeTimeTicks == 0)
        {
            Torrents.InvalidateRelativeTimes();
        }

        if ((fields & TorrentFields.Queue) != 0)
        {
            Torrents.Order();
        }

        Changed?.Invoke(this, fields);
    }

    private void Move(SessionState next)
    {
        if (_state == next)
        {
            return;
        }

        _state = next;
        StateChanged?.Invoke(this, next);
    }

    /// <summary>
    /// The state one poll loop reached, taken only while that loop is still the session's.
    /// </summary>
    /// <remarks>
    /// A Disconnect followed by a Connect leaves two loops alive for as long as it takes the first
    /// one's continuation to run. Without this guard that continuation catches its own cancellation
    /// and moves the session it no longer belongs to back to <see cref="SessionState.Idle"/> - after
    /// which every command is refused, on a connection that is up.
    /// </remarks>
    private void Move(CancellationTokenSource life, SessionState next)
    {
        if (ReferenceEquals(_life, life))
        {
            Move(next);
        }
    }

    private static TorrentIds Ids(IReadOnlyList<Torrent> rows)
    {
        string[] hashes = new string[rows.Count];
        for (int i = 0; i < rows.Count; i++)
        {
            hashes[i] = rows[i].Hash;
        }

        return TorrentIds.Of(hashes);
    }
}
