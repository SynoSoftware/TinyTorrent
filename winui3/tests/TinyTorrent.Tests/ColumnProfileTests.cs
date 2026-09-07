using System.Xml.Linq;

namespace TinyTorrent_Tests;

/// <summary>
/// The torrent host's column profile, read out of the page that ships it.
/// </summary>
/// <remarks>
/// Appendix A.1 is a host profile, not a <c>TableView</c> contract, so nothing in the control's own
/// test project can assert it. <c>Synapse.Tests.ColumnDefaultsTests</c> asserts what a bare
/// <c>TableColumn</c> defaults to — visible, 150 DIP wide, 48 DIP minimum — and passes whatever
/// <c>TorrentPage.xaml</c> declares; <c>Synapse.Tests.TorrentSchema</c> rebuilds A.1 by hand, so it
/// can agree with the appendix while the shipping page disagrees with both. Neither can see a
/// column whose <c>IsVisible</c> was dropped or inverted in the page. This reads the page's own
/// XAML, which is the only artefact that decides what a first run shows.
/// <para>
/// The file is a linked <c>Content</c> item, copied beside the test assembly, so editing the page
/// changes what this test reads.
/// </para>
/// </remarks>
[TestClass]
public sealed class ColumnProfileTests
{
    private const string Synapse = "using:Synapse";

    /// <summary>
    /// Appendix A.1, in declared order: id, initial width, minimum, first-run visibility. A null
    /// minimum is the appendix's "component default" — the page declares none and the control's own
    /// 48 DIP applies.
    /// </summary>
    private static readonly (string Id, double Width, double? Min, bool Visible)[] AppendixA1 =
    {
        ("name", 150, 90, true),
        ("progress", 220, 110, true),
        ("status", 110, 95, true),
        ("queue", 80, null, true),
        ("eta", 110, null, false),
        ("speed", 180, 160, true),
        ("peers", 88, null, true),
        ("size", 100, null, true),
        ("ratio", 90, null, false),
        ("added", 100, null, false),
        ("completedOn", 110, null, false),
    };

    [TestMethod]
    public void TheDeclaredColumnsAreAppendixA1()
    {
        List<XElement> declared = Columns();

        // Joined rather than compared element by element, so a failure names the columns instead of
        // an index into two lists the reader cannot see.
        Assert.AreEqual(
            string.Join(", ", AppendixA1.Select(c => c.Id)),
            string.Join(", ", declared.Select(Id)),
            "Appendix A.1 declares eleven columns in this order.");

        for (int i = 0; i < AppendixA1.Length; i++)
        {
            (string id, double width, double? min, bool visible) = AppendixA1[i];
            XElement column = declared[i];

            Assert.AreEqual(width, Number(column, "Width"), $"'{id}' initial width");
            Assert.AreEqual(min, Number(column, "MinWidth"), $"'{id}' minimum width");
            Assert.AreEqual(visible, Visible(column), $"'{id}' first-run visibility");
        }
    }

    /// <summary>
    /// The set the appendix states in words, asserted as a set. A dropped or inverted
    /// <c>IsVisible</c> shows here as the wrong column being named, which is what the per-column
    /// check above cannot say in one line.
    /// </summary>
    [TestMethod]
    public void TheFirstRunVisibleSetIsTheSevenAppendixA1Names()
    {
        Assert.AreEqual(
            "name, progress, status, queue, speed, peers, size",
            string.Join(", ", Columns().Where(Visible).Select(Id)),
            "Appendix A.1: the target first-run visible set.");
    }

    private static List<XElement> Columns() =>
        XDocument.Load(Path.Combine(AppContext.BaseDirectory, "TorrentPage.xaml"))
            .Descendants(XName.Get("TableColumn", Synapse))
            .ToList();

    private static string Id(XElement column) =>
        column.Attribute("Id")?.Value
        ?? throw new AssertFailedException("Appendix A.1 gives every column a persistence key.");

    /// <summary>An absent attribute is the control's own default, which the appendix relies on.</summary>
    private static double? Number(XElement column, string name) =>
        column.Attribute(name) is XAttribute attribute
            ? double.Parse(attribute.Value, System.Globalization.CultureInfo.InvariantCulture)
            : null;

    private static bool Visible(XElement column) =>
        column.Attribute("IsVisible") is not XAttribute attribute || bool.Parse(attribute.Value);
}
