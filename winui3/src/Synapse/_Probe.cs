// TEMPORARY DIAGNOSTIC. Delete with the one call site in TableView.Selection.cs.
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Synapse;

internal static class _Probe
{
    private const string Path = @"C:\SynoSoftware\TinyTorrent\winui3\probe.txt";
    private static int _pass;

    internal static void AfterReconcile(ListView? rows, IReadOnlyList<object> view, string note)
    {
        if (rows is null)
        {
            return;
        }

        // After the layout the reconcile caused, not inside it: the question is what the panel
        // ended up showing, not what it was told.
        rows.DispatcherQueue.TryEnqueue(
            Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,
            () =>
            {
                try
                {
                    Walk(rows, view, note);
                }
                catch (Exception ex)
                {
                    System.IO.File.AppendAllText(Path, $"probe threw: {ex.Message}\n");
                }
            });
    }

    /// <summary>
    /// Every position the viewport covers, and the three ways one of them can come out blank: no
    /// container at all, a container holding no row, or a container whose cells are all empty.
    /// </summary>
    private static void Walk(ListView rows, IReadOnlyList<object> view, string note)
    {
        _pass++;

        if (rows.ItemsPanelRoot is not ItemsStackPanel panel || panel.FirstVisibleIndex < 0)
        {
            return;
        }

        List<string> bad = Recheck(rows, view);

        if (bad.Count == 0)
        {
            return;
        }

        // A scroll that is still settling shows the same shape: containers the panel has not
        // finished re-binding read as disagreeing with the view for a frame or two. Only a
        // disagreement that is still there after the list has had time to finish is the owner's
        // blank band, so nothing is reported until a second look agrees with the first.
        string first = $"[{_pass:D4}] {note} view={view.Count} vis={panel.FirstVisibleIndex}.." +
            $"{panel.LastVisibleIndex} {string.Join(" ", bad.Take(30))}";

        Microsoft.UI.Dispatching.DispatcherQueueTimer again = rows.DispatcherQueue.CreateTimer();
        again.IsRepeating = false;
        again.Interval = TimeSpan.FromMilliseconds(700);
        again.Tick += (_, _) =>
        {
            again.Stop();

            List<string> still = Recheck(rows, view);
            if (still.Count > 0)
            {
                System.IO.File.AppendAllText(
                    Path,
                    $"PERSISTS {first}\n         still wrong 700ms later: {string.Join(" ", still.Take(30))}\n");
            }
        };
        again.Start();
    }

    /// <summary>
    /// Every position the viewport covers, and the ways one can come out blank: no container at
    /// all, a container holding no row, a container holding a row the view has elsewhere, or a
    /// container whose cells are all empty.
    /// </summary>
    private static List<string> Recheck(ListView rows, IReadOnlyList<object> view)
    {
        List<string> bad = new();

        if (rows.ItemsPanelRoot is not ItemsStackPanel panel || panel.FirstVisibleIndex < 0)
        {
            return bad;
        }

        for (int i = panel.FirstVisibleIndex; i <= panel.LastVisibleIndex && i < view.Count; i++)
        {
            if (rows.ContainerFromIndex(i) is not ListViewItem container)
            {
                bad.Add($"{i}:noContainer");
                continue;
            }

            if (container.Content is null)
            {
                bad.Add($"{i}:noRow");
                continue;
            }

            if (!ReferenceEquals(container.Content, view[i]))
            {
                bad.Add($"{i}:showsAnotherRow");
                continue;
            }

            TableCellsPanel? cells = Cells(container);
            if (cells is null)
            {
                bad.Add($"{i}:noCellsPanel");
                continue;
            }

            int filled = 0;
            foreach (UIElement child in cells.Children)
            {
                if (child is ContentPresenter { Content: not null })
                {
                    filled++;
                }
            }

            if (filled == 0)
            {
                bad.Add($"{i}:{cells.Children.Count}cells/0filled");
            }
        }

        return bad;
    }

    private static TableCellsPanel? Cells(DependencyObject node)
    {
        int count = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChildrenCount(node);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChild(node, i);
            if (child is TableCellsPanel found)
            {
                return found;
            }

            if (Cells(child) is TableCellsPanel deeper)
            {
                return deeper;
            }
        }

        return null;
    }
}
