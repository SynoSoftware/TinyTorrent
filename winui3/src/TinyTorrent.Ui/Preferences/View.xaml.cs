using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace TinyTorrent_Ui;

public sealed partial class PreferencesView : UserControl
{
    public PreferencesView() => InitializeComponent();

    internal void FocusNavigation() => TorrentPage.FocusNavigation(Categories);

    internal Border Card(string title, StackPanel fields)
    {
        StackPanel content = new() { Spacing = 12 };
        content.Children.Add(new TextBlock { Text = title, Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"] });
        content.Children.Add(fields);
        return new Border { Style = (Style)Resources["CardStyle"], Child = content };
    }

    internal void Row(StackPanel panel, string label, Control field)
    {
        Grid row = new() { ColumnSpacing = 16 };
        row.ColumnDefinitions.Add(new() { Width = new(160) });
        row.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        row.RowDefinitions.Add(new() { Height = GridLength.Auto });
        row.RowDefinitions.Add(new() { Height = GridLength.Auto });
        row.Children.Add(new TextBlock { Text = label, Style = (Style)Resources["LabelStyle"] });
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(field, label);
        field.HorizontalAlignment = field is NumberBox ? HorizontalAlignment.Right : HorizontalAlignment.Stretch;
        Grid.SetColumn(field, 1);
        row.Children.Add(field);
        field.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        double minimumEditorWidth = Math.Max(field.MinWidth, field.DesiredSize.Width);
        field.MinWidth = minimumEditorWidth;
        row.SizeChanged += (_, args) =>
        {
            bool compact = args.NewSize.Width < 160 + row.ColumnSpacing + minimumEditorWidth;
            row.ColumnDefinitions[0].Width = compact ? new(1, GridUnitType.Star) : new(160);
            row.ColumnDefinitions[1].Width = compact ? new(0) : new(1, GridUnitType.Star);
            row.RowSpacing = compact ? 8 : 0;
            Grid.SetColumn(field, compact ? 0 : 1);
            Grid.SetRow(field, compact ? 1 : 0);
            if (field is NumberBox) field.HorizontalAlignment = compact ? HorizontalAlignment.Left : HorizontalAlignment.Right;
        };
        panel.Children.Add(row);
    }
}
