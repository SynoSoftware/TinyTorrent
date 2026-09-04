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

        rows.DispatcherQueue.TryEnqueue(
            Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,
            () => Walk(rows, view, note));
    }

    private static void Walk(ListView rows, IReadOnlyList<object> view, string note)
    {
        if (rows.ItemsPanelRoot is not ItemsStackPanel panel)
        {
            return;
        }

        List<string> bad = new();
        int nulls = 0;
        int stale = 0;
        int orphan = 0;

        foreach (UIElement child in panel.Children)
        {
            if (child is not ListViewItem item)
            {
                continue;
            }

            int index = rows.IndexFromContainer(child);
            object? context = item.DataContext;
            object? content = item.Content;

            if (index < 0)
            {
                orphan++;
                bad.Add($"  orphan container ctx={(context is null ? "NULL" : "set")} " +
                        $"vis={item.Visibility} h={item.ActualHeight:F0}");
                continue;
            }

            if (context is null || content is null)
            {
                nulls++;
                bad.Add($"  index {index}: DataContext={(context is null ? "NULL" : "set")} " +
                        $"Content={(content is null ? "NULL" : "set")} vis={item.Visibility} " +
                        $"h={item.ActualHeight:F0}");
            }
            else if (index < view.Count && !ReferenceEquals(context, view[index]))
            {
                stale++;
                bad.Add($"  index {index}: shows a row the view has elsewhere");
            }
        }

        _pass++;
        System.IO.File.AppendAllText(
            Path,
            $"[{_pass:D3}] {note} view={view.Count} children={panel.Children.Count} " +
            $"cache={panel.FirstCacheIndex}..{panel.LastCacheIndex} " +
            $"vis={panel.FirstVisibleIndex}..{panel.LastVisibleIndex} " +
            $"nulls={nulls} stale={stale} orphan={orphan}\n" +
            string.Join("\n", bad.Take(12)) + (bad.Count > 0 ? "\n" : string.Empty));
    }
}
