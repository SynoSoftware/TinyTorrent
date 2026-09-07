namespace TinyTorrent;

/// <summary>Where a menu command sends a packet. The drag equivalent is a boundary, not a step.</summary>
public enum QueueMove
{
    Top,
    Up,
    Down,
    Bottom,
}

/// <summary>
/// One <c>torrent_set</c> write: put <paramref name="Item"/> at <paramref name="Position"/>.
/// </summary>
/// <remarks>
/// <c>queue_position</c> is a move, not a slot assignment. <c>tr_torrent_queue::set_pos</c>
/// (<c>torrent-queue.cc:68-104</c>) rotates the range between the item's old and new index, so
/// every other torrent between them shifts by one and the positions stay a dense 0..n-1
/// permutation. That is why these are ordered steps against a moving queue rather than a set of
/// independent assignments, and why they must be sent in this order.
/// </remarks>
public readonly record struct QueueStep<T>(T Item, int Position);

/// <summary>
/// The queue order, as arithmetic. Nothing here touches a daemon, a row, or the UI thread: one
/// function says what order the user asked for, the other says the fewest writes that reach it.
/// The drag and the four menu commands differ only in which <see cref="Arrange{T}"/> they call,
/// so they cannot come to disagree about what a legal destination is.
/// </summary>
public static class Queue
{
    /// <summary>
    /// The queue with <paramref name="packet"/> gathered immediately before
    /// <paramref name="before"/>, or at the end when that is null.
    /// </summary>
    public static IReadOnlyList<T> Arrange<T>(IReadOnlyList<T> queue, IReadOnlyList<T> packet, T? before)
        where T : class
    {
        List<T> kept = Without(queue, packet, out _);
        int at = before is null ? kept.Count : kept.IndexOf(before);

        kept.InsertRange(at < 0 ? kept.Count : at, Ordered(queue, packet));
        return kept;
    }

    /// <summary>The same move as a command, for the row menu and therefore for the keyboard.</summary>
    public static IReadOnlyList<T> Arrange<T>(IReadOnlyList<T> queue, IReadOnlyList<T> packet, QueueMove move)
        where T : class
    {
        List<T> kept = Without(queue, packet, out HashSet<T> moving);

        int at = move switch
        {
            QueueMove.Top => 0,
            QueueMove.Bottom => kept.Count,
            QueueMove.Up => Math.Max(0, KeptBefore(queue, moving, First(queue, moving)) - 1),
            _ => Math.Min(kept.Count, KeptBefore(queue, moving, Last(queue, moving)) + 1),
        };

        kept.InsertRange(at, Ordered(queue, packet));
        return kept;
    }

    /// <summary>
    /// The fewest <c>queue_position</c> writes that turn <paramref name="queue"/> into
    /// <paramref name="arranged"/>, in the order they must be sent.
    /// </summary>
    /// <remarks>
    /// Every item that can stay where it is, does. The ones that can stay are the longest
    /// subsequence of the current queue that is already in the arranged relative order, so the
    /// number of writes is the queue length minus that subsequence's length, and no shorter
    /// sequence of moves exists. The rest are moved left to right, each landing immediately after
    /// the last item already settled ahead of it.
    /// </remarks>
    public static IReadOnlyList<QueueStep<T>> Steps<T>(IReadOnlyList<T> queue, IReadOnlyList<T> arranged)
        where T : class
    {
        if (queue.Count != arranged.Count)
        {
            throw new ArgumentException("The arranged queue must hold the same items.", nameof(arranged));
        }

        Dictionary<T, int> wanted = new(arranged.Count);
        for (int i = 0; i < arranged.Count; i++)
        {
            wanted[arranged[i]] = i;
        }

        int[] order = new int[queue.Count];
        for (int i = 0; i < queue.Count; i++)
        {
            if (!wanted.TryGetValue(queue[i], out order[i]))
            {
                throw new ArgumentException("The arranged queue must hold the same items.", nameof(arranged));
            }
        }

        HashSet<int> stays = LongestRun(order);

        List<T> simulated = [.. queue];
        List<QueueStep<T>> steps = [];
        HashSet<T> settled = new(arranged.Count);

        for (int i = 0; i < arranged.Count; i++)
        {
            T item = arranged[i];

            if (stays.Contains(i))
            {
                settled.Add(item);
                continue;
            }

            simulated.Remove(item);

            int at = 0;
            for (int j = 0; j < simulated.Count; j++)
            {
                if (settled.Contains(simulated[j]) && wanted[simulated[j]] < i)
                {
                    at = j + 1;
                }
            }

            simulated.Insert(at, item);
            settled.Add(item);
            steps.Add(new QueueStep<T>(item, at));
        }

        return steps;
    }

    /// <summary>Whether that command would change the queue at all. The menu enables on this answer.</summary>
    public static bool Differs<T>(IReadOnlyList<T> queue, IReadOnlyList<T> arranged)
        where T : class
    {
        if (queue.Count != arranged.Count)
        {
            return true;
        }

        for (int i = 0; i < queue.Count; i++)
        {
            if (!ReferenceEquals(queue[i], arranged[i]))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// The indices in the arranged order whose items can stay where they are: the longest
    /// increasing run of current positions, read in arranged order.
    /// </summary>
    private static HashSet<int> LongestRun(int[] order)
    {
        // order[i] is where queue[i] wants to be. The longest increasing subsequence of that is
        // the largest set of items already in the right relative order, so everything else has to
        // move. Patience sorting, O(n log n), with a predecessor chain so the run itself can be
        // read back rather than only its length.
        int[] tailAt = new int[order.Length];
        int[] previous = new int[order.Length];
        int[] tails = new int[order.Length];
        int length = 0;

        for (int i = 0; i < order.Length; i++)
        {
            int low = 0;
            int high = length;

            while (low < high)
            {
                int middle = (low + high) / 2;
                if (tails[middle] < order[i])
                {
                    low = middle + 1;
                }
                else
                {
                    high = middle;
                }
            }

            tails[low] = order[i];
            tailAt[low] = i;
            previous[i] = low > 0 ? tailAt[low - 1] : -1;

            if (low == length)
            {
                length++;
            }
        }

        HashSet<int> stays = new(length);
        for (int i = length == 0 ? -1 : tailAt[length - 1]; i >= 0; i = previous[i])
        {
            stays.Add(order[i]);
        }

        return stays;
    }

    private static List<T> Without<T>(IReadOnlyList<T> queue, IReadOnlyList<T> packet, out HashSet<T> moving)
        where T : class
    {
        moving = new HashSet<T>(packet);
        List<T> kept = new(queue.Count);

        foreach (T item in queue)
        {
            if (!moving.Contains(item))
            {
                kept.Add(item);
            }
        }

        return kept;
    }

    /// <summary>
    /// The packet in queue order rather than in selection order, so a multi-row move keeps the
    /// relative order the user can see rather than the order the rows happened to be clicked in.
    /// </summary>
    private static List<T> Ordered<T>(IReadOnlyList<T> queue, IReadOnlyList<T> packet)
        where T : class
    {
        HashSet<T> moving = new(packet);
        List<T> ordered = new(packet.Count);

        foreach (T item in queue)
        {
            if (moving.Contains(item))
            {
                ordered.Add(item);
            }
        }

        return ordered;
    }

    private static int KeptBefore<T>(IReadOnlyList<T> queue, HashSet<T> moving, int position)
        where T : class
    {
        int count = 0;
        for (int i = 0; i < position; i++)
        {
            if (!moving.Contains(queue[i]))
            {
                count++;
            }
        }

        return count;
    }

    private static int First<T>(IReadOnlyList<T> queue, HashSet<T> moving)
        where T : class
    {
        for (int i = 0; i < queue.Count; i++)
        {
            if (moving.Contains(queue[i]))
            {
                return i;
            }
        }

        return 0;
    }

    private static int Last<T>(IReadOnlyList<T> queue, HashSet<T> moving)
        where T : class
    {
        for (int i = queue.Count - 1; i >= 0; i--)
        {
            if (moving.Contains(queue[i]))
            {
                return i;
            }
        }

        return queue.Count - 1;
    }
}
