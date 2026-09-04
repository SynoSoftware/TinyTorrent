using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Section 5 and section 10's reset, and the claim every column operation has to keep: a column
/// operation changes column layout and nothing else. Selection, the current row and the private
/// view belong to the rows, and no width, visibility, order or reset may touch them.
/// </summary>
[TestClass]
public class ColumnResetTests
{
    // ------------------------------------------------------------------ what a reset discards

    [TestMethod]
    public Task AResetDiscardsWidthOverridesAndRestoresTheBaseline() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 1, 2, 3 });
        SetColumnWidth(h.Table, "a", 320);
        SetColumnWidth(h.Table, "b", 192);

        h.Table.ResetColumnLayout();

        Assert.AreEqual(200d, TableHarness.ResolvedWidth(h.Table, "a"));
        Assert.AreEqual(200d, TableHarness.ResolvedWidth(h.Table, "b"));
        Assert.AreEqual(0, h.Table.GetLayoutState().ColumnWidths.Count, "no override is left");
    });

    [TestMethod]
    public Task AResetRestoresTheDeclaredOrderAndVisibility() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 1, 2, 3 });
        MoveColumnTo(h.Table, "a", 2);
        SetColumnVisibility(h.Table, "b", false);

        CollectionAssert.AreEqual(new[] { "b", "c", "a" }, TableHarness.Order(h.Table));
        Assert.IsFalse(TableHarness.IsVisible(h.Table, "b"));

        h.Table.ResetColumnLayout();

        CollectionAssert.AreEqual(new[] { "a", "b", "c" }, TableHarness.Order(h.Table));
        Assert.IsTrue(TableHarness.IsVisible(h.Table, "b"));
        Assert.AreEqual(0, h.Table.GetLayoutState().ColumnVisibility.Count, "no override is left");
    });

    /// <summary>Section 5: the captured baseline has no sort criterion, so a reset clears it.</summary>
    [TestMethod]
    public Task AResetClearsTheSortAndReturnsToNaturalOrder() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        h.Activate(0);
        CollectionAssert.AreEqual(new[] { "k1", "k2", "k0" }, h.ViewKeys());

        h.Table.ResetColumnLayout();
        h.Table.UpdateLayout();

        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys(), "natural order returns");
        Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
        Assert.AreEqual(
            Microsoft.UI.Xaml.Visibility.Collapsed, h.Glyph(0).Visibility, "and the glyph is gone");
    });

    /// <summary>Section 10: a reset restores the baseline width; it does not fit the data.</summary>
    [TestMethod]
    public Task AResetRestoresTheBaselineWidthRatherThanFittingTheData() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 1, 2, 3 });
        h.Table.AutoFitColumn("a");
        Assert.AreNotEqual(200d, TableHarness.ResolvedWidth(h.Table, "a"), "the fit moved the width");

        h.Table.ResetColumnLayout();

        Assert.AreEqual(200d, TableHarness.ResolvedWidth(h.Table, "a"));
    });

    // ------------------------------------------------------------------ what a reset reports

    [TestMethod]
    public Task AResetReportsTheWholeOperationOnce() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        SetColumnWidth(h.Table, "a", 320);
        SetColumnVisibility(h.Table, "b", false);
        MoveColumnTo(h.Table, "c", 0);
        h.Activate(0);

        int events = 0;
        TableLayoutChangeKind kind = TableLayoutChangeKind.Sort;
        h.Table.LayoutChanged += (_, e) =>
        {
            kind = e.Kind;
            events++;
        };

        h.Table.ResetColumnLayout();

        Assert.AreEqual(1, events, "four overrides went, one notification came back");
        Assert.AreEqual(TableLayoutChangeKind.Reset, kind);
    });

    [TestMethod]
    public Task AResetOfAnUntouchedLayoutReportsNothing() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 1, 2, 3 });
        int events = 0;
        h.Table.LayoutChanged += (_, _) => events++;

        h.Table.ResetColumnLayout();

        Assert.AreEqual(0, events, "there was nothing to discard");
    });

    // ------------------------------------------------------------ rows are not a column concern

    /// <summary>
    /// Every section 10, 11 and 12 operation in turn against a live selection. A column operation
    /// republishes geometry only; it must not disturb the table-owned selection, the current row,
    /// or the private view, and the hosted list must still carry the same rows afterwards.
    /// </summary>
    [TestMethod]
    public Task SelectionSurvivesEveryColumnOperation() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 1, 2, 3, 4, 5 });
        h.Table.SetSelection(new object[] { h.Rows[1], h.Rows[3] }, h.Rows[3]);
        h.Table.UpdateLayout();

        int selectionEvents = 0;
        h.Table.SelectionStateChanged += (_, _) => selectionEvents++;

        (string Name, Action Run)[] operations =
        {
            ("resize", () => SetColumnWidth(h.Table, "a", 320)),
            ("fit", () => h.Table.AutoFitColumn("b")),
            ("fit visible", h.Table.AutoFitVisibleColumns),
            ("hide", () => SetColumnVisibility(h.Table, "b", false)),
            ("show", () => SetColumnVisibility(h.Table, "b", true)),
            ("move", () => MoveColumnTo(h.Table, "a", 2)),
            ("reset", h.Table.ResetColumnLayout),
        };

        foreach ((string name, Action run) in operations)
        {
            run();
            h.Table.UpdateLayout();

            CollectionAssert.AreEqual(
                new object[] { h.Rows[1], h.Rows[3] },
                h.Table.SelectedItems.ToArray(),
                $"after {name}: the selected packet");
            Assert.AreSame(h.Rows[3], h.Table.CurrentItem, $"after {name}: the current row");
            Assert.AreEqual(5, h.ViewKeys().Length, $"after {name}: the view still has every row");
            Assert.AreEqual(
                2, h.HostedList().SelectedItems.Count, $"after {name}: the hosted list agrees");
        }

        Assert.AreEqual(0, selectionEvents, "no column operation reported a selection change");
    });

    // ------------------------------------------------------------------ helpers

    // The resolved columns and the operations that act on them are internal to Synapse, which
    // grants no InternalsVisibleTo. Reflection reaches them without widening the public surface.

    private static object ResolvedColumn(TableView table, string id)
    {
        object layout = Read(table, "Layout")!;
        foreach (object column in (System.Collections.IEnumerable)Read(layout, "Order")!)
        {
            if ((string)Read(column, "Id")! == id)
            {
                return column;
            }
        }

        throw new AssertFailedException($"No resolved column '{id}'.");
    }

    private static void SetColumnWidth(TableView table, string id, double width) =>
        Invoke(table, "SetColumnWidth", ResolvedColumn(table, id), width);


    private static void SetColumnVisibility(TableView table, string id, bool visible) =>
        Invoke(table, "SetColumnVisibility", ResolvedColumn(table, id), visible);

    private static void MoveColumnTo(TableView table, string id, int boundary) =>
        Invoke(table, "MoveColumnTo", ResolvedColumn(table, id), boundary, null!);

    private static object? Invoke(object target, string method, params object[] arguments) =>
        target.GetType()
            .GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(target, arguments);

    private static object? Read(object target, string name)
    {
        Type type = target.GetType();
        PropertyInfo property = type.GetProperty(
            name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            ?? throw new MissingMemberException(type.Name, name);
        return property.GetValue(target);
    }
}
