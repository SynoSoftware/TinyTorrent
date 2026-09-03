using Microsoft.UI.Xaml;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Synapse;

namespace Synapse_Tests;

/// <summary>
/// Section 6: "The declared defaults are: visible, hideable, resizable, non-sortable,
/// left-aligned, a DefaultWidth of 150 DIPs, a MinWidth of 48 DIPs, and an unbounded MaxWidth."
/// </summary>
[TestClass]
public class ColumnDefaultsTests
{
    [TestMethod]
    public Task Section6_DeclaredDefaults() => TestHost.RunAsync(() =>
    {
        TableColumn column = new();

        Assert.IsTrue(column.IsVisibleByDefault, "section 6: default is visible");
        Assert.IsTrue(column.CanHide, "section 6: default is hideable");
        Assert.IsTrue(column.CanResize, "section 6: default is resizable");
        Assert.IsFalse(column.CanSort, "section 6: default is non-sortable");
        Assert.AreEqual(HorizontalAlignment.Left, column.CellHorizontalAlignment,
            "section 6: default is left-aligned");
        Assert.AreEqual(150d, column.DefaultWidth, 0d, "section 6: DefaultWidth 150 DIPs");
        Assert.AreEqual(48d, column.MinWidth, 0d, "section 6: MinWidth 48 DIPs");
        Assert.IsTrue(double.IsPositiveInfinity(column.MaxWidth), "section 6: MaxWidth unbounded");

        return Task.CompletedTask;
    });

    [TestMethod]
    public Task Section6_DefaultIdAndDisplayNameAreEmptyAndMustBeSupplied() => TestHost.RunAsync(() =>
    {
        TableColumn column = new();

        Assert.AreEqual(string.Empty, column.Id);
        Assert.AreEqual(string.Empty, column.DisplayName);
        Assert.IsNull(column.SortComparer, "section 6: no comparer by default");

        return Task.CompletedTask;
    });
}
