using Microsoft.Windows.ApplicationModel.Resources;

namespace Synapse;

/// <summary>
/// The control's own localized strings. The library reads its own resource file rather than the
/// host application's.
/// </summary>
internal static class TableResources
{
    private static readonly ResourceLoader Loader =
        new(ResourceLoader.GetDefaultResourceFilePath(), "Synapse/Resources");

    internal static string HeaderStripAccessibleName => Get("HeaderStrip_AccessibleName");

    // Section 9: the active header's sort state, read by UI Automation.
    internal static string SortedAscending => Get("Header_SortedAscending");

    internal static string SortedDescending => Get("Header_SortedDescending");

    // Section 12: the generated menu's action labels. They are the control's own strings and are
    // not host-overridable; only the column names in it come from the host.
    internal static string HideThisColumn => Get("ColumnMenu_HideThisColumn");

    internal static string Columns => Get("ColumnMenu_Columns");

    internal static string FitThisColumn => Get("ColumnMenu_FitThisColumn");

    internal static string FitVisibleColumns => Get("ColumnMenu_FitVisibleColumns");

    internal static string MoveLeft => Get("ColumnMenu_MoveLeft");

    internal static string MoveRight => Get("ColumnMenu_MoveRight");

    // Section 16: a live row drag's destination, read by UI Automation.
    internal static string DropBeforeRow => Get("RowDrag_DropBeforeRow");

    internal static string DropAtEnd => Get("RowDrag_DropAtEnd");

    private static string Get(string name) => Loader.GetString(name);
}
