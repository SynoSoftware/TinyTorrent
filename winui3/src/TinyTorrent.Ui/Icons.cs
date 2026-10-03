using System.Runtime.CompilerServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Markup;
using Synapse;

namespace TinyTorrent_Ui;

internal static class Icons
{
    // The table already uses 20 DIPs for Lucide's inset 24-unit glyphs.
    private const double Size = 20;
    private const double LabelSize = 16;
    private static readonly Dictionary<string, DataTemplate> Templates = [];
    private static readonly ConditionalWeakTable<Style, FooterStyle> Footers = new();
    private sealed record FooterStyle(Style? BasedOn);

    public static FontIcon Create(string glyph) => new()
    {
        FontFamily = TableView.IconFontFamily,
        Glyph = glyph,
        FontSize = Size,
        IsTextScaleFactorEnabled = true
    };

    public static void Set(ButtonBase button, string glyph) => button.ContentTemplate = Label(glyph);

    public static void Set(ContentDialog dialog, string primary = Lucide.Check,
        string secondary = Lucide.Undo2, string close = Lucide.X)
    {
        dialog.PrimaryButtonStyle = Footer(dialog.PrimaryButtonStyle, primary);
        dialog.SecondaryButtonStyle = Footer(dialog.SecondaryButtonStyle, secondary);
        dialog.CloseButtonStyle = Footer(dialog.CloseButtonStyle, close);
    }

    private static Style Footer(Style? style, string glyph)
    {
        if (style is not null && Footers.TryGetValue(style, out FooterStyle? footer))
            style = footer.BasedOn;

        Style replacement = new(typeof(Button))
        {
            BasedOn = style,
            Setters = { new Setter(Button.ContentTemplateProperty, Label(glyph)) }
        };
        Footers.Add(replacement, new FooterStyle(style));
        return replacement;
    }

    private static DataTemplate Label(string glyph)
    {
        if (Templates.TryGetValue(glyph, out DataTemplate? template))
            return template;

        // Keep Content as the native label, including the dialog footer's string
        // contract. Only its presentation changes; foreground follows native states.
        template = (DataTemplate)XamlReader.Load($$"""
            <DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
                <Grid ColumnSpacing="8">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="Auto" />
                        <ColumnDefinition Width="*" />
                    </Grid.ColumnDefinitions>
                    <FontIcon FontFamily="{{TableView.IconFontFamily.Source}}"
                              Glyph="{{glyph}}" FontSize="{{LabelSize}}"
                              IsTextScaleFactorEnabled="True" VerticalAlignment="Center"
                              AutomationProperties.AccessibilityView="Raw" />
                    <TextBlock Grid.Column="1" Text="{Binding}" VerticalAlignment="Center"
                               TextTrimming="CharacterEllipsis" />
                </Grid>
            </DataTemplate>
            """);
        Templates.Add(glyph, template);
        return template;
    }
}
