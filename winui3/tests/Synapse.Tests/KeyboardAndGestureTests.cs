using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Section 13's keyboard set and section 7's input rules: which surface owns a key or a pointer
/// gesture, and which one keeps its own.
/// </summary>
[TestClass]
public class KeyboardAndGestureTests
{
    private const string CellXaml = """
        <DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                      xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
                      xmlns:s="using:Synapse">
            <StackPanel Orientation="Horizontal">
                <TextBlock Text="passive" />
                <Button Content="go" />
                <TextBox Width="40" />
                <Border s:TableView.SuppressRowGestures="True" Width="20" Height="10">
                    <Rectangle Width="10" Height="10" />
                </Border>
            </StackPanel>
        </DataTemplate>
        """;

    // ------------------------------------------------------------------ navigation

    [TestMethod]
    public Task ArrowKeysMoveTheCurrentRowAndReplaceTheSelection() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(8);

        Assert.IsTrue(h.MoveBy(1, extend: false));
        Assert.AreEqual("k0", h.CurrentKey(), "The first Down from nothing lands on the first row.");

        h.MoveBy(1, extend: false);
        h.MoveBy(1, extend: false);
        Assert.AreEqual("k2", h.CurrentKey());
        CollectionAssert.AreEqual(new[] { "k2" }, h.SelectedKeys());

        h.MoveBy(-1, extend: false);
        CollectionAssert.AreEqual(new[] { "k1" }, h.SelectedKeys());
    });

    [TestMethod]
    public Task ShiftArrowExtendsFromTheAnchor() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(8);

        h.Click(h[2]);
        h.MoveBy(1, extend: true);
        h.MoveBy(1, extend: true);
        CollectionAssert.AreEqual(new[] { "k2", "k3", "k4" }, h.SelectedKeys());

        // Back across the anchor: the range re-projects, it does not keep the old side.
        h.MoveBy(-1, extend: true);
        h.MoveBy(-1, extend: true);
        h.MoveBy(-1, extend: true);
        CollectionAssert.AreEqual(new[] { "k1", "k2" }, h.SelectedKeys());
    });

    [TestMethod]
    public Task HomeAndEndMoveToTheFirstAndLastRow() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(8);

        h.MoveToEdge(first: false, extend: false);
        CollectionAssert.AreEqual(new[] { "k7" }, h.SelectedKeys());

        h.MoveToEdge(first: true, extend: false);
        CollectionAssert.AreEqual(new[] { "k0" }, h.SelectedKeys());
    });

    [TestMethod]
    public Task ShiftHomeAndShiftEndExtendToTheEdges() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(8);

        h.Click(h[3]);
        h.MoveToEdge(first: true, extend: true);
        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2", "k3" }, h.SelectedKeys());

        h.MoveToEdge(first: false, extend: true);
        CollectionAssert.AreEqual(
            new[] { "k3", "k4", "k5", "k6", "k7" },
            h.SelectedKeys(),
            "Shift+End still extends from the k3 anchor.");
    });

    [TestMethod]
    public Task PageDownMovesByAViewportOfRows() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(60);

        int page = h.RowsPerPage();
        Assert.IsTrue(page > 1, $"Expected more than one row per page, measured {page}.");

        h.MoveBy(1, extend: false);
        h.MoveBy(page, extend: false);
        Assert.AreEqual("k" + page, h.CurrentKey());

        h.MoveBy(-page, extend: false);
        Assert.AreEqual("k0", h.CurrentKey());
    });

    [TestMethod]
    public Task NavigationSkipsNonInteractiveRows() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(
            6, t => t.CanInteractWithItem = item => ((Row)item).Interactive);

        h[1].Interactive = false;
        h[2].Interactive = false;
        h.Table.RefreshView();

        h.MoveBy(1, extend: false);
        Assert.AreEqual("k0", h.CurrentKey());

        h.MoveBy(1, extend: false);
        Assert.AreEqual("k3", h.CurrentKey(), "k1 and k2 are display-only.");
    });

    [TestMethod]
    public Task TheCurrentRowIsScrolledIntoView() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(200);

        ScrollViewer viewer = SelectionHarness.Descendant<ScrollViewer>(h.HostedList())!;
        Assert.AreEqual(0d, viewer.VerticalOffset, 0.5);

        h.MoveToEdge(first: false, extend: false);
        h.Table.UpdateLayout();

        Assert.IsTrue(
            viewer.VerticalOffset > 0,
            $"End did not scroll: vertical offset {viewer.VerticalOffset}.");
    });

    // ------------------------------------------------------------------ Ctrl+A and Enter

    [TestMethod]
    public Task CtrlAselectsEveryEligibleRowWhenMultipleSelectionIsEnabled() =>
        TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(
            6, t => t.CanInteractWithItem = item => ((Row)item).Interactive);

        h[4].Interactive = false;
        h.Table.RefreshView();

        Assert.IsTrue(h.SelectAll());
        CollectionAssert.AreEqual(new[] { "k0", "k1", "k2", "k3", "k5" }, h.SelectedKeys());
    });

    [TestMethod]
    public Task CtrlAdoesNothingInSingleAndNone() => TestHost.RunAsync(async () =>
    {
        SelectionHarness single = await SelectionHarness.LoadAsync(
            4, t => t.SelectionMode = ListViewSelectionMode.Single);
        Assert.IsFalse(single.SelectAll());
        Assert.AreEqual(0, single.SelectedKeys().Length);

        SelectionHarness none = await SelectionHarness.LoadAsync(
            4, t => t.SelectionMode = ListViewSelectionMode.None);
        Assert.IsFalse(none.SelectAll());
    });

    [TestMethod]
    public Task EnterInvokesTheCurrentRowWithTheSelectionThatStands() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(6);

        Assert.IsFalse(h.InvokeCurrent(), "Nothing is current yet.");

        h.Click(h[1]);
        h.Click(h[3], shift: true);
        Assert.IsTrue(h.InvokeCurrent());

        Assert.AreEqual(1, h.Invoked.Count);
        Assert.AreEqual("k3", ((Row)h.Invoked[0]).Key);
    });

    // ------------------------------------------------------------------ who owns the input

    [TestMethod]
    public Task TheTableIgnoresItsKeysWhileACellEditorHasFocus() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await LoadWithRichCellsAsync();

        ListViewItem container = RealizedContainer(h);
        Assert.IsTrue(container.Focus(FocusState.Programmatic));
        Assert.IsTrue(h.RowSurfaceHasFocus(), "A focused row container is the passive row surface.");

        TextBox editor = SelectionHarness.Descendant<TextBox>(container)!;
        Assert.IsTrue(editor.Focus(FocusState.Programmatic));
        Assert.IsFalse(
            h.RowSurfaceHasFocus(),
            "A single-line TextBox leaves the arrow keys unhandled; the table must not act on them.");
    });

    [TestMethod]
    public Task PassiveCellContentFollowsNormalRowSelectionAndInteractiveContentDoesNot() =>
        TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await LoadWithRichCellsAsync();
        ListViewItem container = RealizedContainer(h);

        TextBlock passive = SelectionHarness.Descendant<TextBlock>(container)!;
        Assert.AreEqual("Row", h.HitTest(passive));

        Button button = SelectionHarness.Descendant<Button>(container)!;
        Assert.AreEqual("Suppressed", h.HitTest(button));

        TextBox editor = SelectionHarness.Descendant<TextBox>(container)!;
        Assert.AreEqual("Suppressed", h.HitTest(editor));
    });

    [TestMethod]
    public Task SuppressRowGesturesStopsAGestureFromItsSubtree() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await LoadWithRichCellsAsync();
        ListViewItem container = RealizedContainer(h);

        Microsoft.UI.Xaml.Shapes.Rectangle inside =
            SelectionHarness.Descendant<Microsoft.UI.Xaml.Shapes.Rectangle>(
                SelectionHarness.Descendant<Border>(container)!)!;

        Assert.AreEqual("Suppressed", h.HitTest(inside));
    });

    [TestMethod]
    public Task TheRowSurfaceItselfIsEmptySpace() => TestHost.RunAsync(async () =>
    {
        SelectionHarness h = await SelectionHarness.LoadAsync(3);

        Assert.AreEqual("EmptySurface", h.HitTest(h.HostedList()));
    });

    // ------------------------------------------------------------------ helpers

    private static async Task<SelectionHarness> LoadWithRichCellsAsync()
    {
        DataTemplate cell = (DataTemplate)XamlReader.Load(CellXaml);
        SelectionHarness h = await SelectionHarness.LoadAsync(
            6, t => t.Columns[0].CellTemplate = cell);
        h.Table.UpdateLayout();

        // Container content is realized in phases, so the cell controls do not exist on the frame
        // the container does.
        await Task.Delay(200);
        h.Table.UpdateLayout();
        return h;
    }

    private static ListViewItem RealizedContainer(SelectionHarness h)
    {
        h.Table.UpdateLayout();
        return h.HostedList().ContainerFromItem(h[0]) as ListViewItem
            ?? throw new AssertFailedException("Row 0 was not realized.");
    }
}
