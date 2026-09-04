using System.Collections.ObjectModel;
using System.Reflection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Synapse;

namespace Synapse_Tests;

/// <summary>One row item with a stable key, so identity reconciliation has something to reconcile.</summary>
internal sealed class Row
{
    internal Row(string key) => Key = key;

    internal string Key { get; }

    internal bool Interactive { get; set; } = true;

    public override string ToString() => Key;
}

/// <summary>
/// Builds a loaded table over a live row collection and reaches the table's private input entry
/// points. The control grants no <c>InternalsVisibleTo</c>, so reflection is the only way to
/// exercise handlers that a real pointer or key message would otherwise reach.
/// </summary>
internal sealed class SelectionHarness
{
    internal SelectionHarness(TableView table, ObservableCollection<Row> rows)
    {
        Table = table;
        Rows = rows;
        table.SelectionStateChanged += (_, e) =>
        {
            Events++;
            LastSelected = e.SelectedItems;
            LastCurrent = e.CurrentItem;
        };
        table.ItemInvoked += (_, e) => Invoked.Add(e.Item);
    }

    internal TableView Table { get; }

    internal ObservableCollection<Row> Rows { get; }

    internal int Events { get; set; }

    internal IReadOnlyList<object>? LastSelected { get; private set; }

    internal object? LastCurrent { get; private set; }

    internal List<object> Invoked { get; } = new();

    internal static async Task<SelectionHarness> LoadAsync(
        int rowCount,
        Action<TableView>? configure = null,
        double height = 220)
    {
        ObservableCollection<Row> rows = new();
        for (int i = 0; i < rowCount; i++)
        {
            rows.Add(new Row("k" + i));
        }

        TableView table = TestData.Table(TestData.Column("a", 120), TestData.Column("b", 120));
        table.ItemKeySelector = item => ((Row)item).Key;
        table.Width = 320;
        table.Height = height;
        configure?.Invoke(table);
        table.ItemsSource = rows;

        await TableHarness.LoadAsync(table);
        table.UpdateLayout();

        return new SelectionHarness(table, rows);
    }

    internal string[] SelectedKeys() => Table.SelectedItems.Cast<Row>().Select(r => r.Key).ToArray();

    internal string? CurrentKey() => (Table.CurrentItem as Row)?.Key;

    internal Row this[int index] => Rows[index];

    /// <summary>The selection the hosted list actually shows, which the table must own.</summary>
    internal string[] ContainerSelectedKeys()
    {
        ListView list = HostedList();
        return list.SelectedItems.Cast<Row>().Select(r => r.Key).OrderBy(k => k, StringComparer.Ordinal).ToArray();
    }

    internal ListView HostedList() =>
        Descendant<ListView>(Table) ?? throw new InvalidOperationException("No hosted ListView.");

    // ------------------------------------------------------------------ private entry points

    /// <summary>What the pointer arbiter calls once it has resolved a row and its modifiers.</summary>
    internal void Click(Row row, bool ctrl = false, bool shift = false) =>
        Invoke("ApplyPointerSelection", row, ctrl, shift);

    internal bool MoveBy(int delta, bool extend) => (bool)Invoke("MoveCurrentBy", delta, extend)!;

    internal bool MoveToEdge(bool first, bool extend) =>
        (bool)Invoke("MoveCurrentToEdge", first, extend)!;

    internal bool SelectAll() => (bool)Invoke("SelectAllFromKeyboard")!;

    internal bool InvokeCurrent() => (bool)Invoke("InvokeCurrentItem")!;

    // The table captures how the rows hold focus, not merely that they do, so that a reconcile can
    // restore the same state. This asks the same question the old bool did.
    internal bool RowSurfaceHasFocus() =>
        (FocusState)Invoke("RowSurfaceFocusState")! != FocusState.Unfocused;

    internal int RowsPerPage() => (int)Invoke("RowsPerPage")!;

    /// <summary>Runs the table's real hit test over a real element in a realized row.</summary>
    internal string HitTest(DependencyObject source)
    {
        MethodInfo method = typeof(TableView).GetMethod(
            "HitTest", BindingFlags.Instance | BindingFlags.NonPublic)!;
        object?[] args = { source, null };
        object result = method.Invoke(Table, args)!;
        return result.ToString()!;
    }

    private object? Invoke(string name, params object?[] args)
    {
        MethodInfo method = typeof(TableView).GetMethod(
            name, BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingMethodException("TableView", name);
        return method.Invoke(Table, args);
    }

    internal static T? Descendant<T>(DependencyObject root)
        where T : DependencyObject
    {
        int count = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                return match;
            }

            if (Descendant<T>(child) is T deeper)
            {
                return deeper;
            }
        }

        return null;
    }
}
