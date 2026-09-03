using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Synapse_Sample;

/// <summary>
/// The inline speed sparkline. It owns one <see cref="Path"/> and rebuilds that Path's geometry
/// itself.
/// <para>
/// A <see cref="Geometry"/> is a DependencyObject and accepts exactly one parent: assigning the
/// same instance to a second <c>Path</c> throws "Value does not fall within the expected range",
/// measured directly in this sample. Binding <c>Path.Data</c> to a view-model property therefore
/// crashes the app as soon as the list recycles a container. Keeping the geometry inside the
/// element that draws it removes that whole class of failure.
/// </para>
/// </summary>
public sealed class SparklineView : Panel
{
    public static readonly DependencyProperty SamplesProperty =
        DependencyProperty.Register(
            nameof(Samples),
            typeof(SpeedHistoryBuffer),
            typeof(SparklineView),
            new PropertyMetadata(null, OnRedrawNeeded));

    /// <summary>Bumped by the row when it records a sample; a ring's contents change in place.</summary>
    public static readonly DependencyProperty RevisionProperty =
        DependencyProperty.Register(
            nameof(Revision),
            typeof(int),
            typeof(SparklineView),
            new PropertyMetadata(0, OnRedrawNeeded));

    public static readonly DependencyProperty StrokeProperty =
        DependencyProperty.Register(
            nameof(Stroke),
            typeof(Brush),
            typeof(SparklineView),
            new PropertyMetadata(null, OnStrokeChanged));

    private readonly Microsoft.UI.Xaml.Shapes.Path _path = new()
    {
        StrokeThickness = 1,
        StrokeLineJoin = PenLineJoin.Round,
        Stretch = Stretch.None,
    };

    // One figure and one segment for the life of the view, rewritten in place: a redraw is 32
    // point writes, not a new geometry graph of three dependency objects per sample.
    private readonly PathFigure _figure = new() { IsClosed = false, IsFilled = false };
    private readonly PolyLineSegment _segment = new();

    public SparklineView()
    {
        IsHitTestVisible = false;

        _figure.Segments.Add(_segment);
        PathGeometry geometry = new();
        geometry.Figures.Add(_figure);
        _path.Data = geometry;

        Children.Add(_path);
    }

    public SpeedHistoryBuffer? Samples
    {
        get => (SpeedHistoryBuffer?)GetValue(SamplesProperty);
        set => SetValue(SamplesProperty, value);
    }

    public int Revision
    {
        get => (int)GetValue(RevisionProperty);
        set => SetValue(RevisionProperty, value);
    }

    public Brush? Stroke
    {
        get => (Brush?)GetValue(StrokeProperty);
        set => SetValue(StrokeProperty, value);
    }

    private static void OnRedrawNeeded(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((SparklineView)d).Redraw();

    private static void OnStrokeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((SparklineView)d)._path.Stroke = e.NewValue as Brush;

    protected override Size MeasureOverride(Size availableSize)
    {
        Size box = Box(availableSize);
        _path.Measure(box);
        return box;
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        _path.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    /// <summary>The drawing box: the declared size when there is one, else what is offered.</summary>
    private Size Box(Size available)
    {
        double width = double.IsFinite(Width) && Width > 0 ? Width
            : double.IsFinite(available.Width) ? available.Width : 0;
        double height = double.IsFinite(Height) && Height > 0 ? Height
            : double.IsFinite(available.Height) ? available.Height : 0;
        return new Size(width, height);
    }

    private void Redraw()
    {
        SpeedHistoryBuffer? samples = Samples;
        Size box = Box(new Size(ActualWidth, ActualHeight));
        double width = box.Width;
        double height = box.Height;

        PointCollection points = _segment.Points;
        points.Clear();

        if (samples is null || samples.Count < 2 || !double.IsFinite(width) || !double.IsFinite(height)
            || width <= 0 || height <= 0)
        {
            return;
        }

        double peak = samples.Peak;
        if (!double.IsFinite(peak) || peak <= 0)
        {
            peak = 1;
        }

        double step = width / (samples.Count - 1);

        for (int i = 0; i < samples.Count; i++)
        {
            double sample = samples[i];
            if (!double.IsFinite(sample) || sample < 0)
            {
                sample = 0;
            }

            Point point = new(i * step, height - (sample / peak * height));

            if (i == 0)
            {
                _figure.StartPoint = point;
            }
            else
            {
                points.Add(point);
            }
        }
    }
}
