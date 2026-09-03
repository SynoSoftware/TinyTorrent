using System.Reflection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Section 12's generated header menu. The rules it exists for are the two invariants: a command is
/// enabled exactly when it can change the layout, and no sequence of its commands can leave the
/// table with nothing visible.
/// </summary>
[TestClass]
public class ColumnMenuTests
{
    private const string Hide = "Hide this column";
    private const string ColumnsSubmenu = "Columns";
    private const string FitThis = "Fit this column";
    private const string FitVisible = "Fit visible columns";
    private const string Narrow = "Narrow this column";
    private const string Widen = "Widen this column";
    private const string MoveLeft = "Move left";
    private const string MoveRight = "Move right";

    // ------------------------------------------------------------------ what the menu contains

    [TestMethod]
    public Task TheMenuOverAHeaderCarriesEverySection12Command() => TestHost.RunAsync(async () =>
    {
        TableView table = await LoadAsync("a", "b", "c");

        CollectionAssert.AreEqual(
            new[] { Hide, ColumnsSubmenu, "-", FitThis, FitVisible, Narrow, Widen, "-", MoveLeft, MoveRight },
            Labels(Menu(table, "b")));
    });

    [TestMethod]
    public Task UnusedHeaderSpaceGetsTheSameMenuWithoutTheActiveColumnActions() =>
        TestHost.RunAsync(async () =>
        {
            TableView table = await LoadAsync("a", "b");

            CollectionAssert.AreEqual(
                new[] { ColumnsSubmenu, FitVisible },
                Labels(Menu(table, null)));
        });

    [TestMethod]
    public Task TheColumnsSubmenuNamesEveryColumnIncludingTheHiddenOnes() => TestHost.RunAsync(async () =>
    {
        TableView table = await LoadAsync("a", "b", "c");
        SetVisibility(table, "b", false);

        MenuFlyoutSubItem submenu = (MenuFlyoutSubItem)Menu(table, "a").Items[1];
        ToggleMenuFlyoutItem[] toggles = submenu.Items.Cast<ToggleMenuFlyoutItem>().ToArray();

        CollectionAssert.AreEqual(new[] { "A", "B", "C" }, toggles.Select(t => t.Text).ToArray(),
            "the host's DisplayName names each column, in the effective order");
        CollectionAssert.AreEqual(new[] { true, false, true }, toggles.Select(t => t.IsChecked).ToArray());
    });

    // ------------------------------------------------------------ enabled only when it can change

    [TestMethod]
    public Task MoveLeftAndMoveRightAreEnabledOnlyWhereThereIsSomewhereToMove() =>
        TestHost.RunAsync(async () =>
        {
            TableView table = await LoadAsync("a", "b", "c");

            Assert.IsFalse(Item(Menu(table, "a"), MoveLeft).IsEnabled, "a is already first");
            Assert.IsTrue(Item(Menu(table, "a"), MoveRight).IsEnabled);
            Assert.IsTrue(Item(Menu(table, "c"), MoveLeft).IsEnabled);
            Assert.IsFalse(Item(Menu(table, "c"), MoveRight).IsEnabled, "c is already last");
        });

    [TestMethod]
    public Task NarrowAndWidenAreEnabledOnlyWhileTheWidthCanStillChange() => TestHost.RunAsync(async () =>
    {
        TableColumn bounded = TestData.Column("a");
        bounded.MinWidth = 100;
        bounded.MaxWidth = 200;
        bounded.DefaultWidth = 100;

        TableView table = await LoadAsync(bounded, TestData.Column("b"));

        Assert.IsFalse(Item(Menu(table, "a"), Narrow).IsEnabled, "the width is already the minimum");
        Assert.IsTrue(Item(Menu(table, "a"), Widen).IsEnabled);

        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["a"] = 200 }));

        Assert.IsTrue(Item(Menu(table, "a"), Narrow).IsEnabled);
        Assert.IsFalse(Item(Menu(table, "a"), Widen).IsEnabled, "the width is already the maximum");
    });

    [TestMethod]
    public Task AColumnTheHostFixedOffersNoSizingCommand() => TestHost.RunAsync(async () =>
    {
        TableColumn fixedWidth = TestData.Column("a");
        fixedWidth.CanResize = false;

        TableView table = await LoadAsync(fixedWidth, TestData.Column("b"));
        MenuFlyout menu = Menu(table, "a");

        Assert.IsFalse(Item(menu, FitThis).IsEnabled);
        Assert.IsFalse(Item(menu, Narrow).IsEnabled);
        Assert.IsFalse(Item(menu, Widen).IsEnabled);
        Assert.IsTrue(Item(menu, FitVisible).IsEnabled, "b can still be fitted");
    });

    [TestMethod]
    public Task FitVisibleColumnsIsDisabledWhenNoVisibleColumnCanBeResized() =>
        TestHost.RunAsync(async () =>
        {
            TableColumn first = TestData.Column("a");
            TableColumn second = TestData.Column("b");
            first.CanResize = false;
            second.CanResize = false;

            TableView table = await LoadAsync(first, second);

            Assert.IsFalse(Item(Menu(table, "a"), FitVisible).IsEnabled);
        });

    [TestMethod]
    public Task AColumnTheHostRequiresCannotBeHidden() => TestHost.RunAsync(async () =>
    {
        TableColumn required = TestData.Column("a");
        required.CanHide = false;

        TableView table = await LoadAsync(required, TestData.Column("b"));

        Assert.IsFalse(Item(Menu(table, "a"), Hide).IsEnabled);
        Assert.IsFalse(Toggle(Menu(table, "a"), "A").IsEnabled);
        Assert.IsTrue(Item(Menu(table, "b"), Hide).IsEnabled);
    });

    // ------------------------------------------------------------------ the zero-column invariant

    [TestMethod]
    public Task TheLastVisibleColumnCannotBeHidden() => TestHost.RunAsync(async () =>
    {
        TableView table = await LoadAsync("a", "b");
        SetVisibility(table, "b", false);

        MenuFlyout menu = Menu(table, "a");
        Assert.IsFalse(Item(menu, Hide).IsEnabled, "hiding a would leave nothing visible");
        Assert.IsFalse(Toggle(menu, "A").IsEnabled, "and its toggle cannot be unchecked either");
        Assert.IsTrue(Toggle(menu, "B").IsEnabled, "the hidden column can still come back");

        Func<int> events = LayoutChanges(table, TableLayoutChangeKind.Visibility);
        SetVisibility(table, "a", false);

        Assert.IsTrue(TableHarness.IsVisible(table, "a"), "the operation itself refuses it too");
        Assert.AreEqual(0, events());
    });

    // ------------------------------------------------------------------ what the commands do

    [TestMethod]
    public Task ShowingAColumnAgainKeepsItsPlaceAndItsWidth() => TestHost.RunAsync(async () =>
    {
        TableView table = await LoadAsync("a", "b", "c");
        table.ApplyLayoutState(TestData.State(widths: new Dictionary<string, double> { ["b"] = 220 }));
        Func<int> events = LayoutChanges(table, TableLayoutChangeKind.Visibility);

        SetVisibility(table, "b", false);

        Assert.AreEqual(220, TableHarness.ResolvedWidth(table, "b"), "a hidden column keeps its width");
        CollectionAssert.AreEqual(new[] { "a", "c" }, VisibleIds(table));

        SetVisibility(table, "b", true);

        CollectionAssert.AreEqual(new[] { "a", "b", "c" }, VisibleIds(table));
        Assert.AreEqual(220, TableHarness.ResolvedWidth(table, "b"));
        Assert.AreEqual(2, events(), "one notification for each completed change, and none for a no-op");

        SetVisibility(table, "b", true);
        Assert.AreEqual(2, events());
    });

    [TestMethod]
    public Task NarrowAndWidenStepEightDipsAndClampToTheColumnsBounds() => TestHost.RunAsync(async () =>
    {
        TableColumn bounded = TestData.Column("a");
        bounded.MinWidth = 140;
        bounded.DefaultWidth = 150;

        TableView table = await LoadAsync(bounded, TestData.Column("b"));
        Func<int> events = LayoutChanges(table, TableLayoutChangeKind.ColumnResize);

        Nudge(table, "a", 1);
        Assert.AreEqual(158, TableHarness.ResolvedWidth(table, "a"), "one widen is 8 DIPs");

        Nudge(table, "a", -1);
        Nudge(table, "a", -1);
        Assert.AreEqual(142, TableHarness.ResolvedWidth(table, "a"));

        Nudge(table, "a", -1);
        Assert.AreEqual(140, TableHarness.ResolvedWidth(table, "a"), "the step clamps at MinWidth");
        Assert.AreEqual(4, events(), "one notification per completed change");

        Nudge(table, "a", -1);
        Assert.AreEqual(140, TableHarness.ResolvedWidth(table, "a"));
        Assert.AreEqual(4, events(), "a step that cannot move the width reports nothing");
    });

    /// <summary>
    /// The menu's move must be the drag's move, not a second implementation of it. The hidden
    /// column is what tells them apart: a move is chosen at a visible boundary and applied to the
    /// full order.
    /// </summary>
    [TestMethod]
    public Task MoveLeftFromTheMenuLandsWhereTheDragWouldLandIt() => TestHost.RunAsync(async () =>
    {
        TableView table = await LoadAsync("a", "b", "hidden", "c");
        SetVisibility(table, "hidden", false);
        table.UpdateLayout();

        await OpenMenuAsync(table, visibleIndex: 2);
        await InvokeAsync(table, MoveLeft);

        CollectionAssert.AreEqual(new[] { "a", "c", "b", "hidden" }, TableHarness.Order(table),
            "the same order the equivalent drop produces");
    });

    // ------------------------------------------------------------------ opening and closing

    /// <summary>
    /// The whole path a pointer or the Menu key takes, minus the platform event that starts it:
    /// the invoking header takes focus, the menu opens on it, invoking an item runs the operation,
    /// and the closure puts focus back on that header.
    /// </summary>
    [TestMethod]
    public Task TheMenuOpensOnTheInvokingHeaderRunsItsCommandAndGivesFocusBack() =>
        TestHost.RunAsync(async () =>
        {
            TableView table = await LoadAsync("a", "b");
            Control cell = await OpenMenuAsync(table, visibleIndex: 1);

            await InvokeAsync(table, Widen);

            Assert.AreEqual(158, TableHarness.ResolvedWidth(table, "b"), "the item ran the operation");
            Assert.AreEqual(0, OpenPopups(table).Count, "and the flyout closed behind it");
            Assert.AreSame(cell, FocusManager.GetFocusedElement(table.XamlRoot),
                "closure returns focus to the invoking header");
        });

    // ------------------------------------------------------------------ helpers

    private static Task<TableView> LoadAsync(params string[] ids) =>
        LoadAsync(ids.Select(id => TestData.Column(id)).ToArray());

    private static async Task<TableView> LoadAsync(params TableColumn[] columns)
    {
        TableView table = TestData.Table(columns);
        table.Width = 700;
        table.Height = 200;

        await TableHarness.LoadAsync(table);
        table.UpdateLayout();
        return table;
    }

    private static string[] Labels(MenuFlyout menu) => menu.Items
        .Select(item => item switch
        {
            MenuFlyoutItem command => command.Text,
            MenuFlyoutSubItem submenu => submenu.Text,
            _ => "-",
        })
        .ToArray();

    private static MenuFlyoutItem Item(MenuFlyout menu, string text) => menu.Items
        .OfType<MenuFlyoutItem>()
        .SingleOrDefault(item => item.Text == text)
        ?? throw new AssertFailedException($"The menu has no '{text}' item: {string.Join(", ", Labels(menu))}");

    private static ToggleMenuFlyoutItem Toggle(MenuFlyout menu, string displayName) => menu.Items
        .OfType<MenuFlyoutSubItem>()
        .Single()
        .Items
        .OfType<ToggleMenuFlyoutItem>()
        .Single(toggle => toggle.Text == displayName);

    private static string[] VisibleIds(TableView table) =>
        TableHarness.VisibleColumns(table).Select(column => column.Id).ToArray();

    /// <summary>Starts counting <c>LayoutChanged</c> now; call the result to read the count.</summary>
    private static Func<int> LayoutChanges(TableView table, TableLayoutChangeKind expected)
    {
        int count = 0;
        table.LayoutChanged += (_, e) =>
        {
            Assert.AreEqual(expected, e.Kind);
            count++;
        };
        return () => count;
    }

    private static TableHeaderStrip Strip(TableView table) => Descendants<TableHeaderStrip>(table).First();

    private static Control HeaderCell(TableHeaderStrip strip, int visibleIndex) =>
        (Control)((Panel)Field(strip, "_panel")!).Children[visibleIndex];

    private static IReadOnlyList<Popup> OpenPopups(TableView table) =>
        VisualTreeHelper.GetOpenPopupsForXamlRoot(table.XamlRoot);

    /// <summary>The realized item with this label inside the open flyout.</summary>
    private static MenuFlyoutItem OpenItem(TableView table, string text)
    {
        foreach (Popup popup in OpenPopups(table))
        {
            if (popup.Child is not DependencyObject child)
            {
                continue;
            }

            MenuFlyoutItem? item = Descendants<MenuFlyoutItem>(child)
                .FirstOrDefault(candidate => candidate.Text == text);
            if (item is not null)
            {
                return item;
            }
        }

        throw new AssertFailedException($"No open flyout shows a '{text}' item.");
    }

    private static IEnumerable<T> Descendants<T>(DependencyObject root)
        where T : DependencyObject
    {
        int count = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < count; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T match)
            {
                yield return match;
            }

            foreach (T deeper in Descendants<T>(child))
            {
                yield return deeper;
            }
        }
    }

    // The menu, the resolved columns it acts on and the strip's show are all internal to Synapse,
    // which grants no InternalsVisibleTo. Reflection is the only way to reach them without widening
    // the control's public surface for a test.

    private static MenuFlyout Menu(TableView table, string? activeId)
    {
        Type type = typeof(TableView).Assembly.GetType("Synapse.TableHeaderMenu")
            ?? throw new MissingMemberException("Synapse.TableHeaderMenu");

        object?[] arguments = { table, activeId is null ? null : ResolvedColumn(table, activeId) };
        return (MenuFlyout)type
            .GetMethod("Create", BindingFlags.Static | BindingFlags.NonPublic)!
            .Invoke(null, arguments)!;
    }

    /// <summary>
    /// Open the menu the way the strip opens it, on the header cell at this visible index. Only the
    /// platform's own <c>ContextRequested</c> is left out; it cannot be raised from a test.
    /// </summary>
    private static async Task<Control> OpenMenuAsync(TableView table, int visibleIndex)
    {
        TableHeaderStrip strip = Strip(table);
        Control cell = HeaderCell(strip, visibleIndex);

        strip.GetType()
            .GetMethod("ShowMenu", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(strip, new object?[] { cell, null });

        await Task.Delay(250);
        return cell;
    }

    private static async Task InvokeAsync(TableView table, string text)
    {
        MenuFlyoutItem item = OpenItem(table, text);
        Assert.IsTrue(item.IsEnabled, $"'{text}' is disabled.");

        ((IInvokeProvider)FrameworkElementAutomationPeer
            .CreatePeerForElement(item)
            .GetPattern(PatternInterface.Invoke)).Invoke();

        await Task.Delay(250);
    }

    private static void SetVisibility(TableView table, string id, bool visible) =>
        Invoke(table, "SetColumnVisibility", ResolvedColumn(table, id), visible);

    private static void Nudge(TableView table, string id, int steps) =>
        Invoke(table, "NudgeColumnWidth", ResolvedColumn(table, id), steps);

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

    private static object? Invoke(object target, string method, params object[] arguments) =>
        target.GetType()
            .GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(target, arguments);

    private static object? Field(object target, string name) =>
        target.GetType()
            .GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!
            .GetValue(target);

    private static object? Read(object target, string name)
    {
        Type type = target.GetType();
        PropertyInfo property = type.GetProperty(
            name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            ?? throw new MissingMemberException(type.Name, name);
        return property.GetValue(target);
    }
}
