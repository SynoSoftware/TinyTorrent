using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Controls.Primitives;

namespace TinyTorrent_Ui;

[TemplatePart(Name = "PART_Thumb", Type = typeof(Thumb))]
public sealed class DetailsSplitter : RangeBase
{
    private Thumb? _thumb;
    public event EventHandler<DragDeltaEventArgs>? DragDelta;
    internal Action<double>? SetHeight { get; set; }

    public DetailsSplitter()
    {
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeNorthSouth);
        ValueChanged += OnValueChanged;
    }

    protected override void OnApplyTemplate()
    {
        base.OnApplyTemplate();
        if (_thumb is not null)
        {
            _thumb.DragDelta -= OnDragDelta;
        }
        _thumb = GetTemplateChild("PART_Thumb") as Thumb;
        if (_thumb is not null)
        {
            _thumb.DragDelta += OnDragDelta;
        }
    }

    private void OnDragDelta(object sender, DragDeltaEventArgs args) => DragDelta?.Invoke(this, args);

    private void OnValueChanged(object sender, RangeBaseValueChangedEventArgs args) => SetHeight?.Invoke(args.NewValue);

    internal void SetRange(double minimum, double maximum, double value, double step)
    {
        ValueChanged -= OnValueChanged;
        Minimum = Math.Min(Minimum, minimum);
        Maximum = maximum;
        Minimum = minimum;
        Value = value;
        SmallChange = step;
        LargeChange = step;
        ValueChanged += OnValueChanged;
    }

    protected override AutomationPeer OnCreateAutomationPeer() => new SplitterPeer(this);

    private sealed class SplitterPeer(DetailsSplitter owner) : RangeBaseAutomationPeer(owner)
    {
        protected override string GetClassNameCore() => nameof(DetailsSplitter);
        protected override AutomationControlType GetAutomationControlTypeCore() => AutomationControlType.Separator;
    }
}
