using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using TinyTorrent;
using Windows.Foundation;
using Windows.System;

namespace TinyTorrent_Ui;

public sealed class SpeedView : UserControl
{
    public static readonly DependencyProperty StrokeProperty = DependencyProperty.Register(
        nameof(Stroke), typeof(Brush), typeof(SpeedView), new PropertyMetadata(null, (owner, _) => ((SpeedView)owner).Draw()));
    public Brush? Stroke
    {
        get => (Brush?)GetValue(StrokeProperty);
        set => SetValue(StrokeProperty, value);
    }
    private readonly Microsoft.UI.Xaml.Shapes.Path _download = new() { StrokeThickness = 1, Stretch = Stretch.None };
    private readonly Microsoft.UI.Xaml.Shapes.Path _upload = new() { StrokeThickness = 1, Stretch = Stretch.None, StrokeDashArray = [4, 2] };
    private readonly TextBlock _maximum = Label();
    private readonly TextBlock _zero = Label();
    private readonly TextBlock _start = Label();
    private readonly TextBlock _end = Label();
    private readonly PlotPanel _panel;
    private readonly Microsoft.UI.Xaml.Shapes.Path _cursor = new() { StrokeThickness = 1, IsHitTestVisible = false };
    private readonly ToolTip _tooltip = new();
    private TimeSpan? _selected;
    private IReadOnlyList<SpeedSample>? _samples;
    private Rect _plot;
    private double Peak => _samples is { Count: > 0 } samples ? samples.Max(sample => Math.Max(sample.Download, sample.Upload)) : 0;
    private double Span => _samples is { Count: > 0 } samples ? (samples[^1].Time - samples[0].Time).TotalSeconds : 0;

    private static TextBlock Label() => new() { Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"], TextTrimming = TextTrimming.CharacterEllipsis };

    public SpeedView()
    {
        _panel = new(this);
        Content = _panel;
        HorizontalContentAlignment = HorizontalAlignment.Stretch;
        VerticalContentAlignment = VerticalAlignment.Stretch;
        IsTabStop = true;
        UseSystemFocusVisuals = true;
        AutomationProperties.SetName(this, "Speed graph");
        AutomationProperties.SetAutomationId(this, "SpeedChart");
        AutomationProperties.SetHelpText(this, "Inspect samples with Left, Right, Home or End. Copy with Ctrl+C.");
        ToolTipService.SetToolTip(this, _tooltip);
        foreach (UIElement child in new UIElement[] { _download, _upload, _cursor, _maximum, _zero, _start, _end }) _panel.Children.Add(child);
        _panel.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        PointerMoved += Hover;
        PointerPressed += (_, args) => { if (Dialogs.HasPopup(this) || !args.GetCurrentPoint(this).Properties.IsLeftButtonPressed) return; Focus(FocusState.Pointer); Hover(this, args); };
        PointerExited += (_, _) => { if (FocusState != FocusState.Keyboard) _tooltip.IsOpen = false; };
        GotFocus += (_, _) => { if (_selected is null && _samples is { Count: > 0 } samples) _selected = samples[^1].Time; Inspect(false); if (FocusState == FocusState.Keyboard && SelectedIndex >= 0 && !Dialogs.HasPopup(this)) _tooltip.IsOpen = true; };
        LostFocus += (_, _) => _tooltip.IsOpen = false;
        KeyDown += Navigate;
        RegisterPropertyChangedCallback(ForegroundProperty, (_, _) => DrawCursor());
    }
    internal Action<string>? CopyText { get; set; }
    public void Update(IReadOnlyList<SpeedSample>? samples)
    {
        bool acquired = _selected is null && samples is { Count: > 0 } && FocusState != FocusState.Unfocused;
        if (samples is not { Count: > 0 }) { _selected = null; _tooltip.IsOpen = false; _download.Data = _upload.Data = null; }
        else if (_selected is { } selected && !samples.Any(sample => sample.Time == selected)) _selected = samples[0].Time;
        else if (_selected is null && FocusState != FocusState.Unfocused) _selected = samples[^1].Time;
        _samples = samples;
        bool hasSamples = samples is { Count: > 0 };
        _maximum.Text = hasSamples ? Peak > 0 ? TorrentFormat.Default.Rate(Peak) : "0 B/s" : "";
        _zero.Text = hasSamples ? "0" : "";
        _start.Text = Span > 0 ? $"−{Span:0} s" : "";
        _end.Text = hasSamples ? "0 s" : "";
        _panel.InvalidateMeasure();
        Inspect(false);
        if (acquired && FocusState == FocusState.Keyboard && !Dialogs.HasPopup(this)) _tooltip.IsOpen = true;
    }
    private Size MeasurePlot(Size availableSize)
    {
        Size size = new(double.IsFinite(availableSize.Width) ? availableSize.Width : 0, double.IsFinite(availableSize.Height) ? availableSize.Height : 0);
        foreach (UIElement child in _panel.Children) child.Measure(size);
        return size;
    }
    private Size ArrangePlot(Size finalSize)
    {
        bool showTime = finalSize.Height >= _end.DesiredSize.Height + 8 && finalSize.Width >= _end.DesiredSize.Width;
        bool showPeak = finalSize.Height >= _maximum.DesiredSize.Height + _end.DesiredSize.Height + 16 && finalSize.Width > _maximum.DesiredSize.Width + 8;
        bool showZero = showPeak && finalSize.Height >= _maximum.DesiredSize.Height + _zero.DesiredSize.Height + _end.DesiredSize.Height + 16;
        double left = showPeak ? Math.Max(_maximum.DesiredSize.Width, _zero.DesiredSize.Width) + 8 : 0;
        double top = showPeak ? _maximum.DesiredSize.Height / 2 : 0;
        double bottom = Math.Max(top, finalSize.Height - (showTime ? _end.DesiredSize.Height + 8 : 0));
        _plot = new Rect(left, top, Math.Max(0, finalSize.Width - left), Math.Max(0, bottom - top));
        _download.Arrange(_plot);
        _upload.Arrange(_plot);
        _cursor.Arrange(_plot);
        _cursor.Clip = new RectangleGeometry { Rect = new(0, 0, _plot.Width, _plot.Height) };
        Place(_maximum, showPeak, 0, 0);
        Place(_zero, showZero, 0, bottom - _zero.DesiredSize.Height / 2);
        Place(_start, showTime && _plot.Width >= _start.DesiredSize.Width + _end.DesiredSize.Width + 8, left, bottom + 8);
        Place(_end, showTime, Math.Max(left, finalSize.Width - _end.DesiredSize.Width), bottom + 8);
        Draw();
        return finalSize;

        void Place(TextBlock label, bool visible, double x, double y)
        {
            double width = Math.Min(label.DesiredSize.Width, finalSize.Width);
            double height = Math.Min(label.DesiredSize.Height, finalSize.Height);
            label.Arrange(visible ? new Rect(Math.Clamp(x, 0, finalSize.Width - width), Math.Clamp(y, 0, finalSize.Height - height), width, height) : new Rect());
        }
    }
    private int SelectedIndex
    {
        get
        {
            if (_samples is null || _selected is null) return -1;
            for (int index = 0; index < _samples.Count; index++) if (_samples[index].Time == _selected) return index;
            return -1;
        }
    }
    private string Facts
    {
        get
        {
            int index = SelectedIndex;
            if (_samples is not { Count: > 0 } samples) return "No speed samples";
            if (index < 0) return "No sample selected";
            SpeedSample sample = samples[index];
            return $"{(samples[^1].Time - sample.Time).TotalSeconds:0.0} s before latest sample\nDownload {TorrentFormat.Default.Rate(sample.Download)}\nUpload {TorrentFormat.Default.Rate(sample.Upload)}";
        }
    }
    private void Hover(object sender, PointerRoutedEventArgs args)
    {
        if (Dialogs.HasPopup(this) || _samples is not { Count: > 0 } samples || _plot.Width <= 0) return;
        Point point = args.GetCurrentPoint(_panel).Position;
        if (!_plot.Contains(point)) return;
        double time = samples[0].Time.TotalSeconds + (point.X - _plot.X) / _plot.Width * Span;
        int nearest = 0;
        for (int index = 1; index < samples.Count; index++)
            if (Math.Abs(samples[index].Time.TotalSeconds - time) < Math.Abs(samples[nearest].Time.TotalSeconds - time)) nearest = index;
        _selected = samples[nearest].Time;
        Inspect(false);
        _tooltip.IsOpen = true;
    }
    private void Navigate(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || Dialogs.HasPopup(this)) return;
        VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        if (args.Key == VirtualKey.Escape && modifiers == VirtualKeyModifiers.None && _tooltip.IsOpen)
        { _tooltip.IsOpen = false; args.Handled = true; return; }
        if (args.Key == VirtualKey.C && modifiers == VirtualKeyModifiers.Control)
        { if (SelectedIndex >= 0) CopyText?.Invoke(Facts); args.Handled = true; return; }
        if (modifiers != VirtualKeyModifiers.None || args.Key is not (VirtualKey.Left or VirtualKey.Right or VirtualKey.Home or VirtualKey.End)) return;
        args.Handled = true;
        if (_samples is not { Count: > 0 } samples) return;
        int index = SelectedIndex;
        if (index < 0) index = samples.Count - 1;
        index = args.Key switch
        {
            VirtualKey.Left => Math.Max(0, index - 1),
            VirtualKey.Right => Math.Min(samples.Count - 1, index + 1),
            VirtualKey.Home => 0,
            _ => samples.Count - 1,
        };
        _selected = samples[index].Time;
        Inspect(true);
        _tooltip.IsOpen = true;
    }
    private void Inspect(bool announce)
    {
        string previous = _tooltip.Content as string ?? "";
        _tooltip.Content = Facts;
        DrawCursor();
        if (announce && previous != Facts && FrameworkElementAutomationPeer.FromElement(this) is SpeedPeer peer)
            peer.RaisePropertyChangedEvent(ValuePatternIdentifiers.ValueProperty, previous, Facts);
    }
    private void DrawCursor()
    {
        _cursor.Stroke = Foreground;
        _cursor.Data = null;
        int index = SelectedIndex;
        if (_samples is not { Count: > 0 } samples || index < 0 || _plot.Width <= 0 || _plot.Height <= 0) return;
        SpeedSample sample = samples[index];
        double x = Span > 0 ? (sample.Time - samples[0].Time).TotalSeconds / Span * _plot.Width : _plot.Width;
        double peak = Peak;
        GeometryGroup geometry = new();
        geometry.Children.Add(new LineGeometry { StartPoint = new(x, 0), EndPoint = new(x, _plot.Height) });
        double radius = _cursor.StrokeThickness * 2;
        double downloadY = _plot.Height * (1 - (peak > 0 ? sample.Download / peak : 0));
        double uploadY = _plot.Height * (1 - (peak > 0 ? sample.Upload / peak : 0));
        geometry.Children.Add(new EllipseGeometry { Center = new(x, downloadY), RadiusX = radius, RadiusY = radius });
        geometry.Children.Add(new RectangleGeometry { Rect = new(x - radius, uploadY - radius, radius * 2, radius * 2) });
        _cursor.Data = geometry;
    }
    protected override AutomationPeer OnCreateAutomationPeer() => new SpeedPeer(this);
    private sealed class SpeedPeer(SpeedView owner) : FrameworkElementAutomationPeer(owner), IValueProvider
    {
        protected override string GetClassNameCore() => nameof(SpeedView);
        protected override AutomationControlType GetAutomationControlTypeCore() => AutomationControlType.Group;
        protected override IList<AutomationPeer> GetChildrenCore() => [];
        protected override object GetPatternCore(PatternInterface pattern) => pattern == PatternInterface.Value ? this : base.GetPatternCore(pattern);
        public bool IsReadOnly => true;
        public string Value => ((SpeedView)Owner).Facts;
        public void SetValue(string value) => throw new InvalidOperationException();
    }
    private sealed class PlotPanel(SpeedView owner) : Panel
    {
        protected override Size MeasureOverride(Size availableSize) => owner.MeasurePlot(availableSize);
        protected override Size ArrangeOverride(Size finalSize) => owner.ArrangePlot(finalSize);
    }
    private void Draw()
    {
        _download.Stroke = _upload.Stroke = Stroke;
        _download.Data = _upload.Data = null;
        DrawCursor();
        if (_samples is not { Count: > 1 } samples || _plot.Width <= 0 || _plot.Height <= 0) return;
        double span = Span;
        if (span <= 0) return;
        double peak = Peak;
        _download.Data = Trace(sample => sample.Download);
        _upload.Data = Trace(sample => sample.Upload);

        PathGeometry Trace(Func<SpeedSample, double> value)
        {
            PathGeometry geometry = new();
            PathFigure? figure = null;
            PolyLineSegment? line = null;
            foreach (SpeedSample sample in samples)
            {
                Point point = new((sample.Time - samples[0].Time).TotalSeconds / span * _plot.Width, _plot.Height * (1 - (peak > 0 ? value(sample) / peak : 0)));
                if (figure is null || sample.StartsSegment)
                {
                    figure = new() { StartPoint = point, IsClosed = false, IsFilled = false };
                    line = new();
                    figure.Segments.Add(line);
                    geometry.Figures.Add(figure);
                }
                else line!.Points.Add(point);
            }
            return geometry;
        }
    }
}
