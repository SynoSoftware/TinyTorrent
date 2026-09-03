using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Section 18, layout persistence. Every test names the rule it holds the control to.
/// </summary>
[TestClass]
public class LayoutStateTests
{
    // ------------------------------------------------------------ round trip

    [TestMethod]
    public Task Section18_RoundTripLeavesTheLayoutUnchanged() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(
            TestData.Column("a", 100), TestData.Column("b", 200), TestData.Column("c", 150));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(
            order: new[] { "c", "a", "b" },
            visibility: new Dictionary<string, bool> { ["b"] = false },
            widths: new Dictionary<string, double> { ["a"] = 220 }));

        TableLayoutState first = table.GetLayoutState();
        table.ApplyLayoutState(first);
        TableLayoutState second = table.GetLayoutState();

        CollectionAssert.AreEqual(first.ColumnOrder.ToArray(), second.ColumnOrder.ToArray());
        CollectionAssert.AreEquivalent(
            first.ColumnVisibility.ToArray(), second.ColumnVisibility.ToArray());
        CollectionAssert.AreEquivalent(first.ColumnWidths.ToArray(), second.ColumnWidths.ToArray());
        Assert.AreEqual(first.SortColumnId, second.SortColumnId);
        Assert.AreEqual(first.SortDirection, second.SortDirection);
    });

    // --------------------------------------------------------- sparse output

    [TestMethod]
    public Task Section18_GetLayoutStateEmitsSparseMaps() => TestHost.RunAsync(async () =>
    {
        // "ColumnVisibility and ColumnWidths are intentionally sparse: they contain only values
        // that override declared visibility and width baselines."
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        TableLayoutState state = table.GetLayoutState();

        CollectionAssert.AreEqual(new[] { "a", "b" }, state.ColumnOrder.ToArray());
        Assert.AreEqual(0, state.ColumnVisibility.Count, "a column at its baseline must not appear");
        Assert.AreEqual(0, state.ColumnWidths.Count, "a column at its baseline must not appear");
    });

    [TestMethod]
    public Task Section18_GetLayoutStateEmitsOnlyTheOverriddenColumns() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(
            widths: new Dictionary<string, double> { ["a"] = 200 },
            visibility: new Dictionary<string, bool> { ["b"] = false }));

        TableLayoutState state = table.GetLayoutState();

        CollectionAssert.AreEqual(new[] { "a" }, state.ColumnWidths.Keys.ToArray());
        Assert.AreEqual(200d, state.ColumnWidths["a"], 0d);
        CollectionAssert.AreEqual(new[] { "b" }, state.ColumnVisibility.Keys.ToArray());
        Assert.IsFalse(state.ColumnVisibility["b"]);
    });

    // ----------------------------------------------------- defensive restore

    [TestMethod]
    public Task Section18_UnknownColumnIdsAreIgnored() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(
            order: new[] { "ghost", "b", "a" },
            visibility: new Dictionary<string, bool> { ["ghost"] = false },
            widths: new Dictionary<string, double> { ["ghost"] = 400 }));

        CollectionAssert.AreEqual(new[] { "b", "a" }, TableHarness.Order(table));
    });

    [TestMethod]
    public Task Section18_DuplicateIdsAreIgnoredAfterTheFirstOccurrence() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(order: new[] { "b", "b", "a" }));

        CollectionAssert.AreEqual(new[] { "b", "a" }, TableHarness.Order(table));
    });

    [TestMethod]
    public Task Section18_NewColumnsAreAppendedInDefinitionOrder() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(
            TestData.Column("a"), TestData.Column("b"), TestData.Column("c"));
        await TableHarness.LoadAsync(table);

        // The saved state predates columns a and b.
        table.ApplyLayoutState(TestData.State(order: new[] { "c" }));

        CollectionAssert.AreEqual(new[] { "c", "a", "b" }, TableHarness.Order(table));
    });

    [TestMethod]
    public Task Section18_AnOmittedWidthClearsAnEarlierOverride() => TestHost.RunAsync(async () =>
    {
        // "treat ColumnVisibility and ColumnWidths as complete override maps: omitted values use
        // their column baseline and clear any earlier override".
        TableView table = TestData.Table(TestData.Column("a", 150));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["a"] = 300 }));
        Assert.AreEqual(300d, TableHarness.ResolvedWidth(table, "a"), 0d);

        table.ApplyLayoutState(TestData.State());

        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "a"), 0d);
    });

    [TestMethod]
    public Task Section18_AnOmittedVisibilityClearsAnEarlierOverride() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(
            visibility: new Dictionary<string, bool> { ["b"] = false }));
        Assert.IsFalse(TableHarness.IsVisible(table, "b"));

        table.ApplyLayoutState(TestData.State());

        Assert.IsTrue(TableHarness.IsVisible(table, "b"));
    });

    [TestMethod]
    public Task Section18_NonFiniteWidthsAreIgnored() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a", 150), TestData.Column("b", 150));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double>
        {
            ["a"] = double.NaN,
            ["b"] = double.PositiveInfinity,
        }));

        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "a"), 0d);
        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "b"), 0d);
    });

    [TestMethod]
    public Task Section18_NonPositiveWidthsAreIgnored() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a", 150), TestData.Column("b", 150));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double>
        {
            ["a"] = 0,
            ["b"] = -40,
        }));

        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "a"), 0d);
        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "b"), 0d);
    });

    [TestMethod]
    public Task Section18_AWidthForANonResizableColumnIsIgnored() => TestHost.RunAsync(async () =>
    {
        TableColumn fixedWidth = TestData.Column("a", 150);
        fixedWidth.CanResize = false;
        TableView table = TestData.Table(fixedWidth);
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["a"] = 300 }));

        Assert.AreEqual(150d, TableHarness.ResolvedWidth(table, "a"), 0d);
    });

    [TestMethod]
    public Task Section18_ValidWidthsAreClampedToTheColumnBounds() => TestHost.RunAsync(async () =>
    {
        TableColumn bounded = TestData.Column("a", 150);
        bounded.MinWidth = 100;
        bounded.MaxWidth = 200;
        TableView table = TestData.Table(bounded);
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["a"] = 500 }));
        Assert.AreEqual(200d, TableHarness.ResolvedWidth(table, "a"), 0d, "clamped to MaxWidth");

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["a"] = 10 }));
        Assert.AreEqual(100d, TableHarness.ResolvedWidth(table, "a"), 0d, "clamped to MinWidth");
    });

    [TestMethod]
    public Task Section18_ARequiredColumnSavedAsHiddenIsRestored() => TestHost.RunAsync(async () =>
    {
        TableColumn required = TestData.Column("a");
        required.CanHide = false;
        TableView table = TestData.Table(required, TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(
            visibility: new Dictionary<string, bool> { ["a"] = false }));

        Assert.IsTrue(TableHarness.IsVisible(table, "a"), "CanHide == false prevents hiding");
    });

    [TestMethod]
    public Task Section18_AtLeastOneColumnStaysVisible() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        await TableHarness.LoadAsync(table);

        table.ApplyLayoutState(TestData.State(visibility: new Dictionary<string, bool>
        {
            ["a"] = false,
            ["b"] = false,
        }));

        Assert.AreEqual(1, TableHarness.VisibleColumns(table).Length,
            "guarantee at least one visible column");
    });

    // ------------------------------------------------------------ event rule

    [TestMethod]
    public Task Section18_ApplyLayoutStateRaisesNoLayoutChanged() => TestHost.RunAsync(async () =>
    {
        // "It is not raised by initial setup or ApplyLayoutState; this prevents
        // restore-and-persist loops."
        TableView table = TestData.Table(TestData.Column("a"), TestData.Column("b"));
        int raised = 0;
        table.LayoutChanged += (_, _) => raised++;

        await TableHarness.LoadAsync(table);
        table.ApplyLayoutState(TestData.State(
            order: new[] { "b", "a" },
            widths: new Dictionary<string, double> { ["a"] = 200 },
            visibility: new Dictionary<string, bool> { ["b"] = false }));

        Assert.AreEqual(0, raised);
    });

    // ----------------------------------------------------- restore before load

    [TestMethod]
    public Task Section18_StateAppliedBeforeTheFirstLoadedIsHeldThenResolved() =>
        TestHost.RunAsync(async () =>
        {
            TableView table = TestData.Table(
                TestData.Column("a", 150), TestData.Column("b", 150), TestData.Column("c", 150));

            table.ApplyLayoutState(TestData.State(
                order: new[] { "c", "b", "a" },
                widths: new Dictionary<string, double> { ["b"] = 260 }));

            await TableHarness.LoadAsync(table);

            CollectionAssert.AreEqual(new[] { "c", "b", "a" }, TableHarness.Order(table));
            Assert.AreEqual(260d, TableHarness.ResolvedWidth(table, "b"), 0d);
        });

    [TestMethod]
    public Task Section18_ApplyLayoutStateRejectsNull() => TestHost.RunAsync(async () =>
    {
        TableView table = TestData.Table(TestData.Column("a"));
        await TableHarness.LoadAsync(table);

        Expect.Throws<ArgumentNullException>(() => table.ApplyLayoutState(null!));
    });
}
