using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Synapse;

/// <summary>
/// The icons the control draws in the menu it generates and on the header's own button.
/// </summary>
/// <remarks>
/// Lucide, vendored with the library rather than taken from the host, so the generated menu looks
/// right in an application that ships no icon font. The font path and the glyph for each idea are
/// each named once here, so nothing else in the control carries a second copy of the path or a
/// second opinion about which glyph means what — including the header button, which is given its
/// icon in code for that reason rather than declaring a second copy in the template.
/// <para>
/// The path begins with the library's own folder because a WinUI class library's content is
/// packaged under one, in the same way its Themes/Generic.xaml is.
/// </para>
/// </remarks>
internal static class TableIcons
{
    private static readonly FontFamily Font =
        new("ms-appx:///Synapse/Assets/Fonts/lucide.ttf#Lucide");


    /// <summary>Fitting a column, or every visible column, to what it holds.</summary>
    internal static IconElement Fit() => Glyph(Lucide.RulerDimensionLine);

    internal static IconElement HideColumn() => Glyph(Lucide.EyeOff);

    internal static IconElement Columns() => Glyph(Lucide.Columns3);

    internal static IconElement MoveLeft() => Glyph(Lucide.ArrowLeft);

    internal static IconElement MoveRight() => Glyph(Lucide.ArrowRight);

    /// <summary>
    /// A new element per call. An icon is a <c>UIElement</c> and accepts exactly one parent, so a
    /// shared instance would throw the second time a menu was built.
    /// </summary>
    private static IconElement Glyph(string glyph) => new FontIcon
    {
        FontFamily = Font,
        Glyph = glyph,
        FontSize = 16,
    };
}
