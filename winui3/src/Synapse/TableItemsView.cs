using System.Collections.ObjectModel;

namespace Synapse;

/// <summary>
/// The private view handed to the hosted <c>ListView</c>. A source snapshot is applied in place, as
/// removals, insertions and replacements matched by section 5 identity, so a row that did not
/// change keeps its container and the list animates only what moved. Never <c>Move</c>: see
/// <see cref="MoveItem"/>. Never <c>Clear</c>: see <see cref="ClearItems"/>.
/// </summary>
internal sealed class TableItemsView : ObservableCollection<object>
{
    private readonly TableItemIdentity _identity;

    internal TableItemsView(TableItemIdentity identity) => _identity = identity;

    /// <summary>Bring the view to <paramref name="snapshot"/>.</summary>
    /// <remarks>
    /// The owner's requirement: when the view is repopulated, the rows that leave animate out and
    /// the rows that arrive animate in, and the table is never empty in between. Only per-row
    /// notifications give the list that; a reset drops every container and shows the new rows in
    /// one step. So every change comes through here as removals and insertions, a sort included.
    /// <para>
    /// A snapshot that is already the view, the same instances in the same order, costs one
    /// comparison per row and nothing else. The host re-projects after ticks that changed nothing
    /// visible, and this is what keeps that free.
    /// </para>
    /// <para>
    /// Otherwise, three passes. Rows that are leaving go first: aligning a list that still holds
    /// them pulls the survivors through positions they only pass through, which the list renders
    /// as rows jumping around. Then the rows that already stand in the snapshot's order stay where
    /// they are and every other row is taken out, so a row that moved costs one removal and one
    /// insertion wherever it went. Last, whatever the snapshot has that the view does not is
    /// inserted at its place.
    /// </para>
    /// <para>
    /// The list realizes only the rows on screen and a small cache around them, so what a change
    /// costs is what the list is told: each notification is handled once, and only the ones that
    /// touch a realized row also animate. A sort of 2,002 rows raises about 3,800 notifications,
    /// nearly all for rows off screen. The figures for that are in the torrent host's diagnostics
    /// section K; the cost that can still be cut is per notification, not their number, since any
    /// order change needs one removal and one insertion per row that leaves the longest run.
    /// </para>
    /// </remarks>
    internal void Reconcile(IReadOnlyList<object> snapshot)
    {
        if (IsAlready(snapshot))
        {
            return;
        }

        Dictionary<object, int> place = new(snapshot.Count, _identity);
        for (int i = 0; i < snapshot.Count; i++)
        {
            place[snapshot[i]] = i;
        }

        for (int i = Count - 1; i >= 0; i--)
        {
            if (!place.ContainsKey(this[i]))
            {
                RemoveAt(i);
            }
        }

        bool[] stays = RowsInOrder(place);

        for (int i = Count - 1; i >= 0; i--)
        {
            if (!stays[i])
            {
                RemoveAt(i);
            }
        }

        for (int i = 0; i < snapshot.Count; i++)
        {
            object next = snapshot[i];

            if (i < Count && _identity.Equals(this[i], next))
            {
                // Same row, new instance: the host abandoned the object this container is bound
                // to, so nothing would update that container again.
                if (!ReferenceEquals(this[i], next))
                {
                    this[i] = next;
                }
            }
            else
            {
                Insert(i, next);
            }
        }
    }

    /// <summary>The snapshot is the view as it stands: the same instances in the same order.</summary>
    private bool IsAlready(IReadOnlyList<object> snapshot)
    {
        if (snapshot.Count != Count)
        {
            return false;
        }

        for (int i = 0; i < Count; i++)
        {
            if (!ReferenceEquals(this[i], snapshot[i]))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Which rows of the view already stand in the snapshot's order: a longest run of rows whose
    /// places in the snapshot increase. Every row outside it has to move.
    /// </summary>
    private bool[] RowsInOrder(Dictionary<object, int> place)
    {
        int count = Count;
        int[] target = new int[count];
        for (int row = 0; row < count; row++)
        {
            target[row] = place[this[row]];
        }

        // Patience sorting. runEnd[k] is the row ending the increasing run of length k + 1 whose
        // last target is smallest; before[row] is the row that precedes it in its run.
        int[] runEnd = new int[count];
        int[] before = new int[count];
        int longest = 0;

        for (int row = 0; row < count; row++)
        {
            int low = 0;
            int high = longest;
            while (low < high)
            {
                int middle = (low + high) / 2;
                if (target[runEnd[middle]] < target[row])
                {
                    low = middle + 1;
                }
                else
                {
                    high = middle;
                }
            }

            before[row] = low > 0 ? runEnd[low - 1] : -1;
            runEnd[low] = row;
            if (low == longest)
            {
                longest++;
            }
        }

        bool[] stays = new bool[count];
        for (int row = longest > 0 ? runEnd[longest - 1] : -1; row >= 0; row = before[row])
        {
            stays[row] = true;
        }

        return stays;
    }

    /// <summary>
    /// Refused. A reset makes the list drop every container: the rows that leave vanish instead of
    /// animating out, and the new rows appear in one step, which the owner reads as a flash. Every
    /// change goes through <see cref="Reconcile"/>.
    /// </summary>
    protected override void ClearItems() =>
        throw new NotSupportedException(
            "Never Clear a displayed collection: the list drops every container and nothing " +
            "animates. Reconcile the snapshot in place instead.");

    /// <summary>
    /// Refused. A Move notification makes the hosted <c>ListView</c> stop its item transitions and
    /// flash the whole list, not the moved row; the owner measured it by debugging it directly,
    /// twice, in two other products. A reorder is <c>RemoveAt</c> then <c>Insert</c>, which
    /// animates only the row that moved. The base class exposes <c>Move</c> publicly, so the rule
    /// is enforced here rather than remembered.
    /// </summary>
    protected override void MoveItem(int oldIndex, int newIndex) =>
        throw new NotSupportedException(
            "Never Move a displayed row: the hosted ListView stops its transitions and flashes the " +
            "whole list. Reorder with RemoveAt then Insert.");
}
