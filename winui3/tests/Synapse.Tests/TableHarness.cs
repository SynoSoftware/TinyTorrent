using System.Reflection;
using Microsoft.UI.Xaml;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Attaches a <see cref="TableView"/> to the live test window and reads the control's internal
/// resolved geometry.
/// </summary>
/// <remarks>
/// <see cref="TableView.Layout"/> and <c>ResolvedLayout</c> are internal to Synapse and the control
/// assembly grants no <c>InternalsVisibleTo</c>. Reflection is the only way to observe the resolved
/// geometry without changing the control, which this task must not do.
/// </remarks>
internal static class TableHarness
{
    private static readonly PropertyInfo LayoutProperty =
        typeof(TableView).GetProperty("Layout", BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new MissingMemberException("TableView.Layout");

    /// <summary>Put the table in the live tree and wait for its first <c>Loaded</c>.</summary>
    internal static async Task LoadAsync(TableView table)
    {
        TaskCompletionSource loaded = new();
        void OnLoaded(object sender, RoutedEventArgs e) => loaded.TrySetResult();

        table.Loaded += OnLoaded;
        TestHost.RootPanel.Children.Add(table);

        try
        {
            await loaded.Task.WaitAsync(TimeSpan.FromSeconds(10));
        }
        finally
        {
            table.Loaded -= OnLoaded;
        }
    }

    /// <summary>
    /// Put the table in the live tree and return the exception its schema capture throws.
    /// The control validates inside its <c>Loaded</c> handler, so the throw reaches the
    /// application's unhandled-exception hook rather than the caller.
    /// </summary>
    internal static async Task<Exception> LoadExpectingFailureAsync(TableView table)
    {
        Task<Exception> trapped = TestHost.TrapAsync();

        TaskCompletionSource loaded = new();
        void OnLoaded(object sender, RoutedEventArgs e) => loaded.TrySetResult();
        table.Loaded += OnLoaded;
        TestHost.RootPanel.Children.Add(table);

        Task completed = await Task.WhenAny(trapped, loaded.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        table.Loaded -= OnLoaded;
        TestHost.DisarmTrap();

        // The control's own Loaded handler runs before this one, so a throw and a completed Loaded
        // can both be observed. The throw is the answer.
        if (trapped.IsCompleted)
        {
            return await trapped;
        }

        throw new AssertFailedException(
            completed == loaded.Task
                ? "Schema capture accepted the column set; an exception was expected."
                : "Neither Loaded nor an exception was observed within 10 s.");
    }

    // ------------------------------------------------------------ resolved geometry

    private static object Layout(TableView table) =>
        LayoutProperty.GetValue(table) ?? throw new InvalidOperationException("Layout was null.");

    internal static double TotalWidth(TableView table) =>
        (double)Read(Layout(table), "TotalWidth")!;

    /// <summary>Ids of the resolved order, hidden columns included.</summary>
    internal static string[] Order(TableView table) =>
        ((System.Collections.IEnumerable)Read(Layout(table), "Order")!)
        .Cast<object>()
        .Select(c => (string)Read(c, "Id")!)
        .ToArray();

    /// <summary>Resolved width of one column by id, whether it is visible or not.</summary>
    internal static double ResolvedWidth(TableView table, string id) =>
        ((System.Collections.IEnumerable)Read(Layout(table), "Order")!)
        .Cast<object>()
        .Where(c => (string)Read(c, "Id")! == id)
        .Select(c => (double)Read(c, "Width")!)
        .Single();

    internal static bool IsVisible(TableView table, string id) =>
        ((System.Collections.IEnumerable)Read(Layout(table), "Order")!)
        .Cast<object>()
        .Where(c => (string)Read(c, "Id")! == id)
        .Select(c => (bool)Read(c, "IsVisible")!)
        .Single();

    /// <summary>Visible columns as (id, cumulative left edge, width), in effective order.</summary>
    internal static (string Id, double Offset, double Width)[] VisibleColumns(TableView table) =>
        ((System.Collections.IEnumerable)Read(Layout(table), "VisibleColumns")!)
        .Cast<object>()
        .Select(v => (
            Id: (string)Read(Read(v, "Column")!, "Id")!,
            Offset: (double)Read(v, "Offset")!,
            Width: (double)Read(v, "Width")!))
        .ToArray();

    private static object? Read(object target, string name)
    {
        Type type = target.GetType();
        PropertyInfo property = type.GetProperty(
            name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            ?? throw new MissingMemberException(type.Name, name);
        return property.GetValue(target);
    }
}
