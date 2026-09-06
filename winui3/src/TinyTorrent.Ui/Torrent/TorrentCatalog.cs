using Microsoft.UI.Dispatching;

namespace TinyTorrent_Ui;

/// <summary>Where a queue command sends a packet. The drag equivalent is a boundary, not a step.</summary>
public enum QueueMove
{
    Top,
    Up,
    Down,
    Bottom,
}

/// <summary>
/// Stands in for the daemon. It generates a plausible torrent list once and then advances the
/// active rows on a one second tick, exactly as a real snapshot loop would.
/// </summary>
public sealed class TorrentCatalog
{
    private readonly Random _random = new(20260903);
    private readonly List<TorrentRowViewModel> _rows;
    private readonly DispatcherQueueTimer _ticker;

    private int _tickCount;

    public TorrentCatalog(DispatcherQueue dispatcher, int count)
    {
        _rows = Build(count);

        _ticker = dispatcher.CreateTimer();
        _ticker.Interval = TimeSpan.FromSeconds(1);
        _ticker.IsRepeating = true;
        // A throw inside a DispatcherQueueTimer callback tears the process down as a stowed
        // exception with no managed stack, so the tick reports its own failure instead.
        _ticker.Tick += (_, _) =>
        {
            try
            {
                Tick();
            }
            catch (Exception ex)
            {
                _ticker.Stop();
                TickFailed?.Invoke(this, ex);
            }
        };
    }

    /// <summary>Raised when a tick changed something the host's ordering or filtering depends on.</summary>
    public event EventHandler? ViewAffectingChange;

    /// <summary>Raised when a tick threw. The ticker is already stopped when this arrives.</summary>
    public event EventHandler<Exception>? TickFailed;

    /// <summary>All rows in queue-ascending semantic order. The host filters this, never the table.</summary>
    public IReadOnlyList<TorrentRowViewModel> Rows => _rows;

    public void Start() => _ticker.Start();

    public void Stop() => _ticker.Stop();

    // ---------------------------------------------------------------- queue order

    /// <summary>
    /// Put the packet immediately before <paramref name="before"/>, or at the end of the queue when
    /// it is null. This is the domain half of a reorder request: <c>TableView</c> reports where the
    /// user dropped, and the queue decides what that means.
    /// </summary>
    public bool MoveBefore(IReadOnlyList<TorrentRowViewModel> packet, TorrentRowViewModel? before)
    {
        List<TorrentRowViewModel> kept = Without(packet);
        int index = before is null ? -1 : kept.IndexOf(before);
        kept.InsertRange(index < 0 ? kept.Count : index, packet);
        return Apply(kept);
    }

    /// <summary>The same move as a command, for the row menu and therefore for the keyboard.</summary>
    public bool Move(IReadOnlyList<TorrentRowViewModel> packet, QueueMove move) =>
        Apply(Arranged(packet, move));

    /// <summary>Whether that command would change the queue. The menu enables on this answer.</summary>
    public bool CanMove(IReadOnlyList<TorrentRowViewModel> packet, QueueMove move) =>
        Differs(Arranged(packet, move));

    /// <summary>The queue as that command would leave it, with the packet gathered at one place.</summary>
    private List<TorrentRowViewModel> Arranged(
        IReadOnlyList<TorrentRowViewModel> packet, QueueMove move)
    {
        HashSet<TorrentRowViewModel> moving = new(packet);
        List<TorrentRowViewModel> kept = Without(packet);

        int at = move switch
        {
            QueueMove.Top => 0,
            QueueMove.Bottom => kept.Count,
            QueueMove.Up => Math.Max(0, KeptBefore(moving, FirstPosition(moving)) - 1),
            _ => Math.Min(kept.Count, KeptBefore(moving, LastPosition(moving)) + 1),
        };

        kept.InsertRange(at, packet);
        return kept;
    }

    private List<TorrentRowViewModel> Without(IReadOnlyList<TorrentRowViewModel> packet)
    {
        HashSet<TorrentRowViewModel> moving = new(packet);
        return _rows.FindAll(row => !moving.Contains(row));
    }

    /// <summary>How many rows before that queue position stay where they are.</summary>
    private int KeptBefore(HashSet<TorrentRowViewModel> moving, int position)
    {
        int count = 0;
        for (int i = 0; i < position; i++)
        {
            if (!moving.Contains(_rows[i]))
            {
                count++;
            }
        }

        return count;
    }

    private int FirstPosition(HashSet<TorrentRowViewModel> moving)
    {
        for (int i = 0; i < _rows.Count; i++)
        {
            if (moving.Contains(_rows[i]))
            {
                return i;
            }
        }

        return 0;
    }

    private int LastPosition(HashSet<TorrentRowViewModel> moving)
    {
        for (int i = _rows.Count - 1; i >= 0; i--)
        {
            if (moving.Contains(_rows[i]))
            {
                return i;
            }
        }

        return _rows.Count - 1;
    }

    private bool Differs(List<TorrentRowViewModel> candidate)
    {
        if (candidate.Count != _rows.Count)
        {
            return false;
        }

        for (int i = 0; i < candidate.Count; i++)
        {
            if (!ReferenceEquals(candidate[i], _rows[i]))
            {
                return true;
            }
        }

        return false;
    }

    private bool Apply(List<TorrentRowViewModel> candidate)
    {
        if (!Differs(candidate))
        {
            return false;
        }

        _rows.Clear();
        _rows.AddRange(candidate);
        for (int i = 0; i < _rows.Count; i++)
        {
            _rows[i].QueuePosition = i;
        }

        return true;
    }

    /// <summary>One simulated daemon snapshot.</summary>
    public void Tick()
    {
        _tickCount++;
        bool viewAffecting = false;

        foreach (TorrentRowViewModel row in _rows)
        {
            if (row.IsGhost)
            {
                continue;
            }

            switch (row.Status)
            {
                case TorrentStatus.Downloading:
                    viewAffecting |= AdvanceDownload(row);
                    break;

                case TorrentStatus.Seeding:
                    AdvanceSeed(row);
                    break;

                case TorrentStatus.Checking:
                    AdvanceCheck(row);
                    break;
            }
        }

        // Relative "added" strings only need a nudge occasionally; every second would be noise.
        if (_tickCount % 60 == 0)
        {
            foreach (TorrentRowViewModel row in _rows)
            {
                row.InvalidateRelativeTimes();
            }
        }

        if (viewAffecting)
        {
            ViewAffectingChange?.Invoke(this, EventArgs.Empty);
        }
    }

    private bool AdvanceDownload(TorrentRowViewModel row)
    {
        // Peers drift, and a row that loses every peer becomes the derived "stalled" state.
        int peers = Math.Clamp(row.PeersConnected + _random.Next(-2, 3), 0, row.PeersTotal);
        row.PeersConnected = peers;

        double speed = peers == 0
            ? 0
            : Math.Max(0, row.DownloadSpeed + ((_random.NextDouble() - 0.45) * 400_000));
        speed = Math.Clamp(speed, 0, 24_000_000);
        if (peers > 0 && speed < 40_000)
        {
            speed = 40_000 + (_random.NextDouble() * 900_000);
        }

        row.SetSpeeds(speed, speed * 0.12);
        row.PushSpeedSample(speed);

        long transferred = Math.Min(row.TotalSize, row.Transferred + (long)speed);
        row.Transferred = transferred;
        row.Progress = row.TotalSize == 0 ? 0 : (double)transferred / row.TotalSize;

        long remaining = row.TotalSize - transferred;
        row.Eta = speed < 1000 ? null : TimeSpan.FromSeconds(remaining / speed);

        if (remaining <= 0)
        {
            // A completed download changes status and therefore filter membership.
            row.Status = TorrentStatus.Seeding;
            row.CompletedOn = DateTimeOffset.Now;
            row.Eta = null;
            row.DownloadSpeed = 0;
            return true;
        }

        return false;
    }

    private void AdvanceSeed(TorrentRowViewModel row)
    {
        int peers = Math.Clamp(row.PeersConnected + _random.Next(-1, 2), 0, row.PeersTotal);
        row.PeersConnected = peers;

        double speed = peers == 0 ? 0 : Math.Clamp(
            row.UploadSpeed + ((_random.NextDouble() - 0.5) * 200_000), 0, 6_000_000);
        row.SetSpeeds(0, speed);
        row.PushSpeedSample(speed);

        if (row.TotalSize > 0)
        {
            row.Ratio = row.Ratio + (speed / row.TotalSize);
        }
    }

    private void AdvanceCheck(TorrentRowViewModel row)
    {
        double progress = Math.Min(1, row.Progress + 0.02 + (_random.NextDouble() * 0.02));
        row.Progress = progress;
        row.Transferred = (long)(row.TotalSize * progress);
    }

    // ------------------------------------------------------------- generation

    private List<TorrentRowViewModel> Build(int count)
    {
        string[] projects =
        {
            "ubuntu", "debian", "fedora", "arch", "alpine", "gentoo", "manjaro", "linuxmint",
            "slackware", "void", "nixos", "kali", "rocky", "almalinux", "opensuse", "freebsd",
            "openbsd", "haiku", "reactos", "tails", "qubes", "elementary", "popos", "endeavour",
        };
        string[] editions = { "desktop", "server", "netinst", "live", "minimal", "workstation", "cinnamon" };
        string[] archs = { "amd64", "arm64", "i386", "riscv64" };
        string[] errors =
        {
            "Tracker returned HTTP 404 for the announce URL.",
            "Permission denied writing to D:\\Downloads\\incomplete.",
            "No space left on device.",
        };

        List<TorrentRowViewModel> rows = new(count);

        for (int i = 0; i < count; i++)
        {
            TorrentStatus status = PickStatus(i);
            long size = (long)((0.2 + (_random.NextDouble() * 18)) * 1024 * 1024 * 1024);
            double progress = status switch
            {
                TorrentStatus.Seeding or TorrentStatus.SeedQueued => 1.0,
                TorrentStatus.Stopped => _random.NextDouble(),
                TorrentStatus.Checking => _random.NextDouble() * 0.4,
                _ => _random.NextDouble() * 0.98,
            };

            int peersTotal = _random.Next(4, 320);
            int peersConnected = status is TorrentStatus.Downloading or TorrentStatus.Seeding
                ? _random.Next(0, Math.Min(60, peersTotal))
                : 0;

            DateTimeOffset added = DateTimeOffset.Now - TimeSpan.FromMinutes(_random.Next(1, 400_000));

            TorrentRowViewModel row = new(NewHash())
            {
                Name = $"{projects[i % projects.Length]}-{20 + (i % 8)}.{i % 10:00}-" +
                       $"{editions[i % editions.Length]}-{archs[i % archs.Length]}.iso",
                QueuePosition = i,
                TotalSize = size,
                Progress = progress,
                Transferred = (long)(size * progress),
                Status = status,
                PeersTotal = peersTotal,
                PeersConnected = peersConnected,
                Ratio = status is TorrentStatus.Seeding or TorrentStatus.SeedQueued
                    ? Math.Round(_random.NextDouble() * 6, 2)
                    : Math.Round(_random.NextDouble() * 0.6, 2),
                Added = added,
                CompletedOn = progress >= 1 ? added + TimeSpan.FromHours(_random.Next(1, 300)) : null,
            };

            if (status == TorrentStatus.Downloading)
            {
                double speed = peersConnected == 0 ? 0 : 60_000 + (_random.NextDouble() * 6_000_000);
                row.DownloadSpeed = speed;
                row.UploadSpeed = speed * 0.1;
                row.Eta = speed < 1000
                    ? null
                    : TimeSpan.FromSeconds((size - row.Transferred) / speed);
                Seed(row, speed);
            }
            else if (status == TorrentStatus.Seeding)
            {
                double speed = peersConnected == 0 ? 0 : _random.NextDouble() * 2_000_000;
                row.UploadSpeed = speed;
                Seed(row, speed);
            }

            // A handful of rows carry a daemon error, which the name cell must show.
            if (i % 173 == 5)
            {
                row.ErrorString = errors[(i / 173) % errors.Length];
            }

            rows.Add(row);
        }

        // Two pending rows the daemon has not confirmed. They are display only.
        for (int g = 0; g < 2; g++)
        {
            TorrentRowViewModel ghost = new(NewHash())
            {
                Name = g == 0 ? "openbsd-7.6-installer-arm64.iso" : "magnet link being resolved",
                GhostLabel = g == 0 ? "Adding\u2026" : "Fetching metadata\u2026",
                IsGhost = true,
                Status = TorrentStatus.DownloadQueued,
                QueuePosition = rows.Count + g,
                TotalSize = 0,
                Added = DateTimeOffset.Now,
            };

            rows.Add(ghost);
        }

        return rows;
    }

    private void Seed(TorrentRowViewModel row, double speed)
    {
        for (int i = 0; i < TorrentRowViewModel.SpeedHistoryLength; i++)
        {
            row.SpeedHistory.Push(Math.Max(0, speed * (0.5 + (_random.NextDouble() * 0.9))));
        }
    }

    private TorrentStatus PickStatus(int index)
    {
        int roll = index % 20;
        return roll switch
        {
            < 7 => TorrentStatus.Downloading,
            < 13 => TorrentStatus.Seeding,
            < 15 => TorrentStatus.Stopped,
            15 => TorrentStatus.DownloadQueued,
            16 => TorrentStatus.SeedQueued,
            17 => TorrentStatus.Checking,
            18 => TorrentStatus.CheckQueued,
            _ => TorrentStatus.Downloading,
        };
    }

    private string NewHash()
    {
        Span<char> hash = stackalloc char[40];
        const string Digits = "0123456789abcdef";
        for (int i = 0; i < hash.Length; i++)
        {
            hash[i] = Digits[_random.Next(16)];
        }

        return new string(hash);
    }
}
