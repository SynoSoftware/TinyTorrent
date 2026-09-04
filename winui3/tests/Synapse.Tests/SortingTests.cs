using System.Collections;
using System.Collections.ObjectModel;
using System.Reflection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>One row with a stable key and a sort rank, so equal values can be told apart.</summary>
internal sealed class SortRow
{
    internal SortRow(string key, int rank)
    {
        Key = key;
        Rank = rank;
    }

    internal string Key { get; }

    internal int Rank { get; set; }

    public override string ToString() => Key;
}

/// <summary>
/// Section 9 and section 18's sort clauses. The two real input paths both call the strip's own
/// activation, so these tests drive that one entry point; <see cref="RealSortTests"/> drives it
/// with injected mouse and key messages.
/// </summary>
[TestClass]
public class SortingTests
{
    [TestMethod]
    public Task Section9_TheCycleIsAscendingThenDescendingThenNaturalOrder() =>
        TestHost.RunAsync(async () =>
        {
            SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2, 1, 3, 2 });

            h.Activate(0);
            CollectionAssert.AreEqual(new[] { "k1", "k3", "k2", "k5", "k0", "k4" }, h.ViewKeys());

            h.Activate(0);
            CollectionAssert.AreEqual(new[] { "k0", "k4", "k2", "k5", "k1", "k3" }, h.ViewKeys());

            h.Activate(0);
            CollectionAssert.AreEqual(
                new[] { "k0", "k1", "k2", "k3", "k4", "k5" }, h.ViewKeys(), "natural order returns");
        });

    [TestMethod]
    public Task Section9_ASecondColumnStartsItsOwnCycleAtAscending() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 }, sortableColumns: 2);

        h.Activate(0);
        h.Activate(0);
        Assert.AreEqual(TableSortDirection.Descending, h.Table.GetLayoutState().SortDirection);

        h.Activate(1);

        TableLayoutState state = h.Table.GetLayoutState();
        Assert.AreEqual("b", state.SortColumnId);
        Assert.AreEqual(TableSortDirection.Ascending, state.SortDirection);
    });

    [TestMethod]
    public Task Section9_ANonSortableHeaderHasNoSortAction() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        int events = 0;
        h.Table.LayoutChanged += (_, _) => events++;

        // Column "b" declares no sort.
        h.Activate(1);

        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys());
        Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
        Assert.AreEqual(0, events);
    });

    [TestMethod]
    public Task Section9_SortingNeverReordersItemsSource() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });

        h.Activate(0);

        CollectionAssert.AreEqual(new[] { "k1", "k2", "k0" }, h.ViewKeys());
        CollectionAssert.AreEqual(
            new[] { "k0", "k1", "k2" },
            h.Rows.Select(r => r.Key).ToArray(),
            "the source keeps its own order");
    });

    [TestMethod]
    public Task Section9_EqualValuesKeepTheCurrentBaseSequenceOrderInBothDirections() =>
        TestHost.RunAsync(async () =>
        {
            // Every rank equal: a stable sort must not move a single row, either way round.
            SortHarness h = await SortHarness.LoadAsync(new[] { 7, 7, 7, 7, 7, 7 });
            string[] natural = { "k0", "k1", "k2", "k3", "k4", "k5" };

            h.Activate(0);
            CollectionAssert.AreEqual(natural, h.ViewKeys(), "ascending is stable");

            h.Activate(0);
            CollectionAssert.AreEqual(natural, h.ViewKeys(), "descending is stable too");
        });

    [TestMethod]
    public Task Section18_OneLayoutChangedOfKindSortPerCompletedSort() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        List<TableLayoutChangedEventArgs> raised = new();
        h.Table.LayoutChanged += (_, e) => raised.Add(e);

        h.Activate(0);

        Assert.AreEqual(1, raised.Count);
        Assert.AreEqual(TableLayoutChangeKind.Sort, raised[0].Kind);
        Assert.AreEqual("a", raised[0].LayoutState.SortColumnId);
        Assert.AreEqual(TableSortDirection.Ascending, raised[0].LayoutState.SortDirection);

        h.Activate(0);
        h.Activate(0);

        Assert.AreEqual(3, raised.Count);
        Assert.IsNull(raised[2].LayoutState.SortColumnId, "the cycle ended in natural order");
    });

    // ------------------------------------------------------------------ persistence

    [TestMethod]
    public Task Section18_ApplyLayoutStateRestoresASavedSortSilently() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        int events = 0;
        h.Table.LayoutChanged += (_, _) => events++;

        h.Table.ApplyLayoutState(TestData.State(
            order: new[] { "a", "b", "c" },
            sortColumnId: "a",
            direction: TableSortDirection.Descending));

        CollectionAssert.AreEqual(new[] { "k0", "k2", "k1" }, h.ViewKeys());
        Assert.AreEqual(0, events, "restoration is silent");
        Assert.AreEqual(TableSortDirection.Descending, h.Table.GetLayoutState().SortDirection);
    });

    [TestMethod]
    public Task Section18_APreLoadSortIsResolvedAfterSchemaCapture() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(
            new[] { 3, 1, 2 },
            configure: table => table.ApplyLayoutState(TestData.State(
                order: new[] { "a", "b", "c" }, sortColumnId: "a")));

        CollectionAssert.AreEqual(new[] { "k1", "k2", "k0" }, h.ViewKeys());
        Assert.AreEqual("a", h.Table.GetLayoutState().SortColumnId);
    });

    [TestMethod]
    public Task Section18_AnUnknownSortColumnFallsBackToNaturalOrder() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        h.Activate(0);

        h.Table.ApplyLayoutState(TestData.State(order: new[] { "a" }, sortColumnId: "gone"));

        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys());
        Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
    });

    [TestMethod]
    public Task Section18_ASavedSortOnANonSortableColumnFallsBackToNaturalOrder() =>
        TestHost.RunAsync(async () =>
        {
            SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
            h.Activate(0);

            // "b" declares no sort, so the saved sort cannot be honoured.
            h.Table.ApplyLayoutState(TestData.State(order: new[] { "a" }, sortColumnId: "b"));

            CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys());
            Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
        });

    [TestMethod]
    public Task Section18_AnInvalidSavedDirectionFallsBackToNaturalOrder() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });

        h.Table.ApplyLayoutState(TestData.State(
            order: new[] { "a" }, sortColumnId: "a", direction: (TableSortDirection)7));

        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys());
        Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
    });

    [TestMethod]
    public Task Section18_GetLayoutStateReportsNoSortWhenTheViewIsInNaturalOrder() =>
        TestHost.RunAsync(async () =>
        {
            SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });

            Assert.IsNull(h.Table.GetLayoutState().SortColumnId);
        });

    // ------------------------------------------------------------------ source updates

    [TestMethod]
    public Task Section9_RefreshViewReSortsWithoutReEnumeratingTheSource() =>
        TestHost.RunAsync(async () =>
        {
            SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
            h.Activate(0);
            CollectionAssert.AreEqual(new[] { "k1", "k2", "k0" }, h.ViewKeys());

            // A batch changes the sorted value without any collection notification.
            h.Rows[0].Rank = 0;
            CollectionAssert.AreEqual(
                new[] { "k1", "k2", "k0" }, h.ViewKeys(), "a property change alone does not resort");

            h.Table.RefreshView();

            CollectionAssert.AreEqual(new[] { "k0", "k1", "k2" }, h.ViewKeys());
        });

    [TestMethod]
    public Task Section9_AnAcceptedSourceUpdateReAppliesTheActiveSort() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        h.Activate(0);

        h.Rows.Add(new SortRow("k3", 0));

        CollectionAssert.AreEqual(new[] { "k3", "k1", "k2", "k0" }, h.ViewKeys());
    });

    // ------------------------------------------------------------------ selection

    [TestMethod]
    public Task Section9_SortingKeepsTheSelectionAndTheCurrentRow() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2, 1, 3, 2 });
        int selectionEvents = 0;
        h.Table.SelectionStateChanged += (_, _) => selectionEvents++;

        h.Table.SetSelection(new object[] { h.Rows[0], h.Rows[4] }, h.Rows[4]);
        selectionEvents = 0;

        h.Activate(0);

        CollectionAssert.AreEqual(
            new[] { "k0", "k4" },
            h.Table.SelectedItems.Cast<SortRow>().Select(r => r.Key).ToArray(),
            "the packet survived, in the new visual order");
        Assert.AreEqual("k4", ((SortRow)h.Table.CurrentItem!).Key);
        Assert.AreEqual(0, selectionEvents, "only positions changed");

        // A collection reset destroys the hosted list's own selection, so this is the real check.
        CollectionAssert.AreEquivalent(
            new[] { "k0", "k4" },
            h.HostedList().SelectedItems.Cast<SortRow>().Select(r => r.Key).ToArray(),
            "the table re-applied its selection to the hosted list");
    });

    // ------------------------------------------------------------------ header state

    [TestMethod]
    public Task Section9_TheActiveHeaderShowsItsDirectionAsAGlyphAndAsItemStatus() =>
        TestHost.RunAsync(async () =>
        {
            SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });

            Assert.AreEqual(Visibility.Collapsed, h.Glyph(0).Visibility, "unsorted shows nothing");
            Assert.AreEqual(string.Empty, AutomationProperties.GetItemStatus(h.Cell(0)));

            h.Activate(0);
            h.Table.UpdateLayout();

            Assert.AreEqual(Visibility.Visible, h.Glyph(0).Visibility);
            Assert.AreEqual(Lucide.ChevronUp, h.Glyph(0).Glyph, "ChevronUp for ascending");
            Assert.AreEqual("Sorted ascending", AutomationProperties.GetItemStatus(h.Cell(0)));
            Assert.AreEqual(Visibility.Collapsed, h.Glyph(1).Visibility, "only one column sorts");

            h.Activate(0);
            h.Table.UpdateLayout();

            Assert.AreEqual(Lucide.ChevronDown, h.Glyph(0).Glyph, "ChevronDown for descending");
            Assert.AreEqual("Sorted descending", AutomationProperties.GetItemStatus(h.Cell(0)));

            h.Activate(0);
            h.Table.UpdateLayout();

            Assert.AreEqual(Visibility.Collapsed, h.Glyph(0).Visibility);
            Assert.AreEqual(string.Empty, AutomationProperties.GetItemStatus(h.Cell(0)));
        });

    [TestMethod]
    public Task Section9_TheGlyphFollowsTheColumnWhenItMoves() => TestHost.RunAsync(async () =>
    {
        SortHarness h = await SortHarness.LoadAsync(new[] { 3, 1, 2 });
        h.Activate(0);

        h.Table.ApplyLayoutState(TestData.State(
            order: new[] { "b", "c", "a" }, sortColumnId: "a"));
        h.Table.UpdateLayout();

        Assert.AreEqual(Visibility.Collapsed, h.Glyph(0).Visibility, "b is not the sorted column");
        Assert.AreEqual(Visibility.Visible, h.Glyph(2).Visibility, "a moved to the end with its glyph");
    });

    [TestMethod]
    public Task Section19_TheSortGlyphMeetsThreeToOneInLight() => GlyphContrastAsync(ElementTheme.Light);

    [TestMethod]
    public Task Section19_TheSortGlyphMeetsThreeToOneInDark() => GlyphContrastAsync(ElementTheme.Dark);

    /// <summary>
    /// Section 19: the direction glyph is table-owned non-text information, so it must reach 3:1.
    /// A resource name is not proof, so this renders the header and measures the drawn pixels
    /// inside the glyph's own bounds against the header background beside it.
    /// </summary>
    private static Task GlyphContrastAsync(ElementTheme theme) => TestHost.RunAsync(async () =>
    {
        Windows.UI.Color backdrop = theme == ElementTheme.Light
            ? Windows.UI.Color.FromArgb(255, 243, 243, 243)
            : Windows.UI.Color.FromArgb(255, 32, 32, 32);

        SortHarness h = await SortHarness.LoadAsync(
            new[] { 3, 1, 2 },
            configure: table =>
            {
                table.RequestedTheme = theme;
                table.Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(backdrop);
            });

        h.Activate(0);
        h.Table.UpdateLayout();
        await Task.Delay(250);

        FontIcon glyph = h.Glyph(0);
        Windows.Foundation.Point origin =
            glyph.TransformToVisual(h.Table).TransformPoint(new Windows.Foundation.Point(0, 0));

        RowCueContrastTests.Shot shot = await RowCueContrastTests.Shot.TakeAsync(h.Table);
        double scale = h.Table.XamlRoot.RasterizationScale;
        int PixelX(double dips) => Math.Clamp((int)Math.Round(dips * scale), 0, shot.Width - 1);

        int top = shot.Y(origin.Y);
        int bottom = shot.Y(origin.Y + glyph.ActualHeight);
        int left = PixelX(origin.X);
        int right = PixelX(origin.X + glyph.ActualWidth);

        // The header background immediately left of the glyph, on the glyph's own centre line.
        uint background = shot.At(PixelX(origin.X - 4), (top + bottom) / 2);
        double best = shot.MaxContrast(background, left, right, top, bottom);

        Assert.IsTrue(
            best >= 3.0,
            $"{theme} sort glyph: measured {best:0.00}:1 against the header background " +
            $"#{background:X6}; section 19 requires 3.0:1.");
    });

    // ------------------------------------------------------------------ schema

    [TestMethod]
    public Task Section6_1_ASortableColumnNeedsAComparer() => TestHost.RunAsync(async () =>
    {
        TableColumn column = TestData.Column("a");
        column.CanSort = true;
        TableView table = TestData.Table(column);

        Exception error = await TableHarness.LoadExpectingFailureAsync(table);

        Assert.IsInstanceOfType<InvalidOperationException>(error, error.ToString());
    });
}

/// <summary>
/// A loaded table over sortable rows, plus the strip's own sort activation. Both real input paths
/// call <c>ActivateSortFrom</c>, so exercising it here runs the same code a click and a key run.
/// </summary>
internal sealed class SortHarness
{
    private SortHarness(TableView table, ObservableCollection<SortRow> rows, TableHeaderStrip strip)
    {
        Table = table;
        Rows = rows;
        Strip = strip;
    }

    internal TableView Table { get; }

    internal ObservableCollection<SortRow> Rows { get; }

    internal TableHeaderStrip Strip { get; }

    /// <summary>Ranks in source order become rows k0..kN, with column "a" sorting on the rank.</summary>
    internal static async Task<SortHarness> LoadAsync(
        int[] ranks, int sortableColumns = 1, Action<TableView>? configure = null)
    {
        ObservableCollection<SortRow> rows = new();
        for (int i = 0; i < ranks.Length; i++)
        {
            rows.Add(new SortRow("k" + i, ranks[i]));
        }

        TableView table = TestData.Table(
            TestData.Column("a", 200), TestData.Column("b", 200), TestData.Column("c", 200));

        for (int i = 0; i < sortableColumns; i++)
        {
            table.Columns[i].CanSort = true;
            table.Columns[i].SortComparer = Ranks;
        }

        table.ItemKeySelector = item => ((SortRow)item).Key;
        table.Width = 700;
        table.Height = 300;
        table.ItemsSource = rows;
        configure?.Invoke(table);

        await TableHarness.LoadAsync(table);
        table.UpdateLayout();

        return new SortHarness(table, rows, SelectionHarness.Descendant<TableHeaderStrip>(table)!);
    }

    /// <summary>Run the header's sort cycle for the header at this visible index.</summary>
    internal void Activate(int visibleIndex)
    {
        MethodInfo method = typeof(TableHeaderStrip).GetMethod(
            "ActivateSortFrom", BindingFlags.Instance | BindingFlags.NonPublic)!;
        method.Invoke(Strip, new object?[] { Cell(visibleIndex) });
        Table.UpdateLayout();
    }

    internal ListView HostedList() =>
        SelectionHarness.Descendant<ListView>(Table)
        ?? throw new InvalidOperationException("No hosted ListView.");

    /// <summary>The private view the hosted list actually shows, in visual order.</summary>
    internal string[] ViewKeys() =>
        ((IEnumerable)HostedList().ItemsSource).Cast<SortRow>().Select(r => r.Key).ToArray();

    internal TableHeaderCell Cell(int visibleIndex) =>
        (TableHeaderCell)Panel().Children[visibleIndex];

    internal FontIcon Glyph(int visibleIndex) =>
        SelectionHarness.Descendant<FontIcon>(Cell(visibleIndex))
        ?? throw new InvalidOperationException("The header cell has no sort glyph.");

    private Panel Panel() => (Panel)typeof(TableHeaderStrip)
        .GetField("_panel", BindingFlags.Instance | BindingFlags.NonPublic)!
        .GetValue(Strip)!;

    /// <summary>Orders rows by their rank, so equal ranks decide nothing and stability shows.</summary>
    internal static IComparer<object> Ranks { get; } = new RankComparer();

    private sealed class RankComparer : IComparer<object>
    {
        public int Compare(object? x, object? y) =>
            ((SortRow)x!).Rank.CompareTo(((SortRow)y!).Rank);
    }
}
