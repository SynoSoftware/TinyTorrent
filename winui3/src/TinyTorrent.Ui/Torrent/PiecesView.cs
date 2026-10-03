using System.Diagnostics;
using System.Runtime.InteropServices.WindowsRuntime;
using Microsoft.UI.System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using TinyTorrent;
using Windows.UI;
using Windows.System;
using Windows.UI.ViewManagement;

namespace TinyTorrent_Ui;

public sealed class PiecesView : UserControl
{
    public static readonly DependencyProperty VerifiedBrushProperty = DependencyProperty.Register(nameof(VerifiedBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));
    public static readonly DependencyProperty ForegroundBrushProperty = DependencyProperty.Register(nameof(ForegroundBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));
    public static readonly DependencyProperty CommonBrushProperty = DependencyProperty.Register(nameof(CommonBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));
    public static readonly DependencyProperty RareBrushProperty = DependencyProperty.Register(nameof(RareBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));
    public static readonly DependencyProperty DeadBrushProperty = DependencyProperty.Register(nameof(DeadBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));
    public static readonly DependencyProperty CompletionBrushProperty = DependencyProperty.Register(nameof(CompletionBrush), typeof(Brush), typeof(PiecesView), new PropertyMetadata(null, BrushChanged));

    public Brush VerifiedBrush { get => (Brush)GetValue(VerifiedBrushProperty); set => SetValue(VerifiedBrushProperty, value); }
    public Brush ForegroundBrush { get => (Brush)GetValue(ForegroundBrushProperty); set => SetValue(ForegroundBrushProperty, value); }
    public Brush CommonBrush { get => (Brush)GetValue(CommonBrushProperty); set => SetValue(CommonBrushProperty, value); }
    public Brush RareBrush { get => (Brush)GetValue(RareBrushProperty); set => SetValue(RareBrushProperty, value); }
    public Brush DeadBrush { get => (Brush)GetValue(DeadBrushProperty); set => SetValue(DeadBrushProperty, value); }
    public Brush CompletionBrush { get => (Brush)GetValue(CompletionBrushProperty); set => SetValue(CompletionBrushProperty, value); }

    // Geometry and rarity are contracts of docs/tinytorrent-plan.md's Pieces map.
    private const int BlockSize = 16;
    private const int Gap = 4;
    private const int BandSize = 8;
    private const int Gutter = 6;
    private static readonly TimeSpan FlashDuration = TimeSpan.FromMilliseconds(1000);
    private readonly Image _map = new() { Stretch = Stretch.None, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Top };
    private readonly Image _overlay = new() { Stretch = Stretch.None, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Top, IsHitTestVisible = false };
    private readonly ToolTip _tooltip = new();
    private TorrentPieces? _detail;
    private Layout? _layout;
    private WriteableBitmap? _overlayBitmap;
    private byte[]? _overlayPixels;
    private readonly List<Flash> _flashes = [];
    private readonly List<(SolidColorBrush Brush, long Token)> _brushes = [];
    private ThemeSettings? _themeSettings;
    private int _revision;
    private bool _animating;
    private int _selectedBlock;
    private sealed record FileRange(string Hash, string Name, int Begin, int End);
    private FileRange? _file;
    private Color _foreground;
    private Color _flashColor;

    public PiecesView()
    {
        Grid images = new();
        images.Children.Add(_map);
        images.Children.Add(_overlay);
        Content = images;
        HorizontalContentAlignment = HorizontalAlignment.Stretch;
        VerticalContentAlignment = VerticalAlignment.Stretch;
        IsTabStop = true;
        UseSystemFocusVisuals = true;
        AutomationProperties.SetName(this, "Pieces map");
        ToolTipService.SetToolTip(this, _tooltip);
        SizeChanged += (_, _) => Draw(null);
        Loaded += (_, _) => Draw(null);
        ActualThemeChanged += (_, _) => QueueDraw();
        Unloaded += (_, _) => Release();
        _map.PointerMoved += Hover;
        _map.PointerExited += (_, _) =>
        {
            if (FocusState == FocusState.Unfocused) _tooltip.IsOpen = false;
            FlashFrame(this, EventArgs.Empty);
        };
        KeyDown += Navigate;
        GotFocus += (_, _) => Select(_selectedBlock, false);
        LostFocus += (_, _) => _tooltip.IsOpen = false;
    }

    public string Summary { get; private set; } = "";
    internal Action<string>? CopyText { get; set; }
    public event EventHandler? SummaryChanged;

    public void Update(TorrentPieces detail)
    {
        TorrentPieces? previous = _detail;
        if (_file is { } file && (file.Hash != detail.HashString || file.Begin < 0 || file.Begin >= file.End || file.End > detail.PieceCount)) _file = null;
        _detail = detail;
        Draw(previous);
    }

    internal void ShowFile(string hash, string name, int begin, int end)
    {
        _file = new(hash, name, begin, end);
        _selectedBlock = 0;
        if (_detail is { } detail && detail.HashString == hash) Draw(null);
    }

    public void Release()
    {
        _revision++;
        StopWatchingBrushes();
        if (_themeSettings is { } themeSettings) themeSettings.Changed -= ContrastChanged;
        _themeSettings = null;
        _detail = null;
        _file = null;
        _layout = null;
        _selectedBlock = 0;
        _map.Source = _overlay.Source = null;
        _overlayBitmap = null;
        _overlayPixels = null;
        _tooltip.IsOpen = false;
        _tooltip.Content = null;
        AutomationProperties.SetHelpText(this, "Map unavailable");
        Summary = "";
        SummaryChanged?.Invoke(this, EventArgs.Empty);
        StopFlash();
    }

    private static void BrushChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args)
    {
        PiecesView view = (PiecesView)sender;
        if (view._themeSettings is null) return;
        view.WatchBrushes();
        view.QueueDraw();
    }

    private void WatchBrushes()
    {
        StopWatchingBrushes();
        foreach (Brush value in new[] { VerifiedBrush, ForegroundBrush, CommonBrush, RareBrush, DeadBrush, CompletionBrush })
        {
            SolidColorBrush brush = (SolidColorBrush)value;
            long token = brush.RegisterPropertyChangedCallback(SolidColorBrush.ColorProperty, (_, _) => QueueDraw());
            _brushes.Add((brush, token));
        }
    }

    private void StopWatchingBrushes()
    {
        foreach ((SolidColorBrush brush, long token) in _brushes)
            brush.UnregisterPropertyChangedCallback(SolidColorBrush.ColorProperty, token);
        _brushes.Clear();
    }

    private void ContrastChanged(ThemeSettings sender, object args)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            if (ReferenceEquals(sender, _themeSettings)) QueueDraw();
        });
    }

    private void QueueDraw()
    {
        if (_detail is null) return;
        int revision = ++_revision;
        DispatcherQueue.TryEnqueue(() =>
        {
            if (revision == _revision && _detail is not null) Draw(null);
        });
    }

    private async void Draw(TorrentPieces? previous)
    {
        int revision = ++_revision;
        if (_detail is not null && _themeSettings is null && IsLoaded &&
            XamlRoot?.ContentIslandEnvironment is { } environment && environment.AppWindowId.Value != 0)
        {
            _themeSettings = ThemeSettings.CreateForWindowId(environment.AppWindowId);
            _themeSettings.Changed += ContrastChanged;
            WatchBrushes();
        }
        if (_themeSettings is null || _detail is not { PieceCount: > 0 } detail || ActualWidth < AxisSize(BandSize) || ActualHeight < BlockSize)
        {
            StopFlash();
            _map.Source = _overlay.Source = null;
            _layout = null;
            _overlayBitmap = null;
            _overlayPixels = null;
            _selectedBlock = 0;
            _tooltip.IsOpen = false;
            _tooltip.Content = null;
            AutomationProperties.SetHelpText(this, "Map unavailable");
            Summary = _detail is { PieceCount: > 0 } known
                ? $"{known.PieceCount:N0} pieces · Piece size {TorrentFormat.Default.Size(known.PieceSize)}"
                : _detail is null ? "" : "Metadata unavailable";
            SummaryChanged?.Invoke(this, EventArgs.Empty);
            return;
        }
        int width = (int)ActualWidth;
        int height = (int)ActualHeight;
        Color[] palette =
        [
            BrushColor(VerifiedBrush),
            BrushColor(ForegroundBrush),
            BrushColor(CommonBrush),
            BrushColor(RareBrush),
            BrushColor(DeadBrush),
        ];
        Color foreground = palette[1];
        _foreground = foreground;
        _flashColor = BrushColor(CompletionBrush);
        bool highContrast = _themeSettings.HighContrast;
        Layout layout = await Task.Run(() => Raster(detail, previous, width, height, palette, foreground, highContrast));
        if (_detail != detail || revision != _revision)
        {
            return;
        }
        bool sameRanges = _layout is { } old && old.Columns == layout.Columns && old.PiecesPerBlock == layout.PiecesPerBlock;
        StopFlash();
        _layout = layout with { Pixels = [] };
        _selectedBlock = _file is { } file ? file.Begin / layout.PiecesPerBlock : Math.Clamp(_selectedBlock, 0, layout.Blocks.Count - 1);
        Summary = $"Have {layout.Counts[0]:N0} · missing {detail.PieceCount - layout.Counts[0]:N0} · {(double)layout.Counts[0] / detail.PieceCount:P1}";
        Summary += $" · no current peer {(detail.Availability.Count == 0 ? "Unknown" : layout.Counts[4].ToString("N0"))}";
        Summary += $" · rare {(detail.Availability.Count == 0 ? "Unknown" : layout.Counts[3].ToString("N0"))}";
        Summary += $" · {detail.PieceCount:N0} pieces · Piece size {TorrentFormat.Default.Size(detail.PieceSize)}";
        if (_file is { } selected) Summary += $"\n{selected.Name} · Pieces {selected.Begin + 1:N0}–{selected.End:N0}";
        SummaryChanged?.Invoke(this, EventArgs.Empty);
        WriteableBitmap bitmap = _map.Source is WriteableBitmap existing && existing.PixelWidth == layout.Width && existing.PixelHeight == layout.Height
            ? existing : new(layout.Width, layout.Height);
        using (Stream stream = bitmap.PixelBuffer.AsStream()) stream.Write(layout.Pixels);
        bitmap.Invalidate();
        _map.Source = bitmap;
        _map.Width = _overlay.Width = layout.Width;
        _map.Height = _overlay.Height = layout.Height;
        if (_overlayBitmap is null || _overlayBitmap.PixelWidth != layout.Width || _overlayBitmap.PixelHeight != layout.Height)
        {
            _overlayBitmap = new(layout.Width, layout.Height);
            _overlayPixels = new byte[layout.Pixels.Length];
        }
        else
        {
            Array.Clear(_overlayPixels!);
            using Stream overlayStream = _overlayBitmap.PixelBuffer.AsStream();
            overlayStream.Write(_overlayPixels!);
            _overlayBitmap.Invalidate();
        }
        _overlay.Source = _overlayBitmap;
        if (new UISettings().AnimationsEnabled && sameRanges && previous is { Pieces.IsEmpty: false } && !detail.Pieces.IsEmpty)
        {
            long started = Stopwatch.GetTimestamp();
            for (int block = 0; block < layout.Blocks.Count; block++)
            {
                Block range = layout.Blocks[block];
                if (range.Completed > 0) _flashes.Add(new(block, started, Math.Min(0.68, 0.48 + (range.Completed - 1) * 0.08)));
            }
            if (_flashes.Count > 0)
            {
                _animating = true;
                CompositionTarget.Rendering += FlashFrame;
            }
        }
        Select(_selectedBlock, false);
    }

    private static Layout Raster(TorrentPieces detail, TorrentPieces? previous, int width, int height, Color[] palette, Color foreground, bool highContrast)
    {
        int maxColumns = BandSize;
        while (AxisSize(maxColumns + BandSize) <= width) maxColumns += BandSize;
        int maxRows = 1;
        while (AxisSize(maxRows + 1) <= height) maxRows++;
        int piecesPerBlock = Math.Max(1, (int)Math.Ceiling((double)detail.PieceCount / (maxColumns * maxRows)));
        int blockCount = (int)Math.Ceiling((double)detail.PieceCount / piecesPerBlock);
        int columns = Math.Min(maxColumns, Math.Max(BandSize, ((blockCount + BandSize - 1) / BandSize) * BandSize));
        int rows = (blockCount + columns - 1) / columns;
        int mapWidth = AxisSize(columns);
        int mapHeight = AxisSize(rows);
        byte[] pixels = new byte[mapWidth * mapHeight * 4];
        int maximum = detail.Availability.Count == 0 ? 0 : detail.Availability.Max();
        int rareThreshold = Math.Max(1, (int)Math.Ceiling(maximum * 0.15));
        int[] totals = new int[5];
        List<Block> blocks = new(blockCount);
        for (int block = 0; block < blockCount; block++)
        {
            int start = block * piecesPerBlock;
            int end = Math.Min(detail.PieceCount, start + piecesPerBlock);
            int[] counts = new int[5];
            int completed = 0;
            for (int piece = start; piece < end; piece++)
            {
                int tone = Tone(detail, piece, rareThreshold);
                counts[tone]++;
                totals[tone]++;
                if (previous is { Pieces.IsEmpty: false } && detail.Pieces.Has(piece) && !previous.Pieces.Has(piece)) completed++;
            }
            int dominant = 0;
            for (int tone = 1; tone < counts.Length; tone++)
                if (counts[tone] >= counts[dominant]) dominant = tone;
            int x = AxisStart(block % columns);
            int y = AxisStart(block / columns);
            bool mixed = counts.Count(count => count > 0) > 1;
            Color fill = dominant switch
            {
                0 => palette[0], 1 => Alpha(foreground, 0.18), 2 => Alpha(palette[2], 0.35),
                3 => Alpha(palette[3], 0.75), _ => Alpha(foreground, 0.12),
            };
            if (highContrast) fill = dominant == 0 ? palette[0] : Alpha(foreground, 0);
            for (int py = 0; py < BlockSize; py++)
                for (int px = 0; px < BlockSize; px++)
                {
                    Color color = fill;
                    if (highContrast && dominant == 2 && (px == 0 || py == 0 || px == BlockSize - 1 || py == BlockSize - 1 || py == BlockSize / 2)) color = palette[2];
                    if (highContrast && dominant == 1 && px == py) color = foreground;
                    if (dominant == 4 && (px == 0 || py == 0 || px == BlockSize - 1 || py == BlockSize - 1)) color = palette[4];
                    else if (dominant == 3 && (px + py) % 6 == 0) color = highContrast ? palette[3] : Alpha(foreground, 0.22);
                    if (mixed && px >= BlockSize - 4 && py < px - (BlockSize - 4)) color = foreground;
                    Pixel(pixels, mapWidth, x + px, y + py, color);
                }
            blocks.Add(new(start, end, x, y, counts, completed));
        }
        return new(mapWidth, mapHeight, columns, piecesPerBlock, pixels, blocks, totals);
    }

    private void Hover(object sender, PointerRoutedEventArgs e)
    {
        if (_layout is not { } layout || _detail is not { } detail) return;
        Windows.Foundation.Point point = e.GetCurrentPoint(_map).Position;
        Block? block = layout.Blocks.FirstOrDefault(block => point.X >= block.X && point.X < block.X + BlockSize && point.Y >= block.Y && point.Y < block.Y + BlockSize);
        if (block is null) { _tooltip.IsOpen = false; return; }
        Select(layout.Blocks.IndexOf(block), true);
    }

    private void FlashFrame(object? sender, object e)
    {
        if (_layout is not { } layout || _overlayBitmap is not { } bitmap || _overlayPixels is not { } pixels)
        {
            StopFlash();
            return;
        }
        Array.Clear(pixels);
        long now = Stopwatch.GetTimestamp();
        foreach (Flash flash in _flashes)
        {
            double elapsed = Stopwatch.GetElapsedTime(flash.Started, now) / FlashDuration;
            if (elapsed >= 1) continue;
            Block block = layout.Blocks[flash.Block];
            Color color = Alpha(_flashColor, flash.Alpha * (1 - elapsed) * (1 - elapsed));
            for (int y = 0; y < BlockSize; y++)
                for (int x = 0; x < BlockSize; x++) Pixel(pixels, layout.Width, block.X + x, block.Y + y, color);
        }
        if (_file is { } file)
            foreach (Block block in layout.Blocks)
                if (block.Start < file.End && block.End > file.Begin)
                    for (int x = 2; x < BlockSize - 2; x++)
                        Pixel(pixels, layout.Width, block.X + x, block.Y + BlockSize - 3, _foreground);
        if (layout.Blocks.Count > _selectedBlock && layout.Blocks[_selectedBlock] is { } hover)
            for (int edge = 0; edge < BlockSize; edge++)
            {
                Pixel(pixels, layout.Width, hover.X + edge, hover.Y, _foreground);
                Pixel(pixels, layout.Width, hover.X + edge, hover.Y + BlockSize - 1, _foreground);
                Pixel(pixels, layout.Width, hover.X, hover.Y + edge, _foreground);
                Pixel(pixels, layout.Width, hover.X + BlockSize - 1, hover.Y + edge, _foreground);
            }
        using (Stream stream = bitmap.PixelBuffer.AsStream()) stream.Write(pixels);
        bitmap.Invalidate();
        if (_flashes.All(flash => Stopwatch.GetElapsedTime(flash.Started, now) >= FlashDuration)) StopFlash();
    }

    private void StopFlash()
    {
        if (_animating) CompositionTarget.Rendering -= FlashFrame;
        _animating = false;
        _flashes.Clear();
    }

    public string SelectedFacts => _layout is { } layout && layout.Blocks.Count > _selectedBlock
        ? (_file is { } file ? $"{file.Name} · File pieces {file.Begin + 1:N0}–{file.End:N0}\nUnderlined blocks may include neighboring pieces.\n" : "") + Facts(layout.Blocks[_selectedBlock]) : "Map unavailable";

    private static string Facts(Block block) =>
        $"Block pieces {block.Start + 1:N0}–{block.End:N0}\nHave {block.Counts[0]:N0} · Unknown {block.Counts[1]:N0} · Common {block.Counts[2]:N0} · Rare {block.Counts[3]:N0} · No current peer {block.Counts[4]:N0}";

    private void ClearFile()
    {
        if (_file is null) return;
        _file = null;
        int line = Summary.IndexOf('\n');
        if (line >= 0) Summary = Summary[..line];
        SummaryChanged?.Invoke(this, EventArgs.Empty);
    }

    private void Select(int index, bool announce)
    {
        if (_layout is not { } layout || layout.Blocks.Count == 0) return;
        string previous = SelectedFacts;
        if (announce) ClearFile();
        _selectedBlock = Math.Clamp(index, 0, layout.Blocks.Count - 1);
        _tooltip.Content = SelectedFacts;
        if (FocusState != FocusState.Unfocused) _tooltip.IsOpen = true;
        AutomationProperties.SetHelpText(this, SelectedFacts);
        FlashFrame(this, EventArgs.Empty);
        if (announce && previous != SelectedFacts && FrameworkElementAutomationPeer.FromElement(this) is PiecesPeer peer)
            peer.RaisePropertyChangedEvent(Microsoft.UI.Xaml.Automation.ValuePatternIdentifiers.ValueProperty, previous, SelectedFacts);
    }
    private void Navigate(object sender, KeyRoutedEventArgs args)
    {
        if (args.Handled || Dialogs.HasPopup(this) || _layout is not { } layout) return;
        VirtualKeyModifiers modifiers = Dialogs.Modifiers;
        int next = args.Key switch {
            VirtualKey.Left => _selectedBlock - 1, VirtualKey.Right => _selectedBlock + 1,
            VirtualKey.Up => _selectedBlock - layout.Columns, VirtualKey.Down => _selectedBlock + layout.Columns,
            VirtualKey.Home => 0, VirtualKey.End => layout.Blocks.Count - 1, _ => _selectedBlock };
        if (modifiers == VirtualKeyModifiers.None && args.Key is (VirtualKey.Left or VirtualKey.Right or VirtualKey.Up or VirtualKey.Down or VirtualKey.Home or VirtualKey.End))
        { Select(next, true); args.Handled = true; }
        else if (args.Key == VirtualKey.C && modifiers == VirtualKeyModifiers.Control)
        { CopyText?.Invoke(SelectedFacts); args.Handled = true; }
    }
    protected override AutomationPeer OnCreateAutomationPeer() => new PiecesPeer(this);
    private sealed class PiecesPeer(PiecesView owner) : FrameworkElementAutomationPeer(owner), IValueProvider
    {
        private PiecesView Map => (PiecesView)Owner;
        protected override string GetClassNameCore() => nameof(PiecesView);
        protected override AutomationControlType GetAutomationControlTypeCore() => AutomationControlType.Group;
        protected override IList<AutomationPeer> GetChildrenCore() => [];
        protected override object GetPatternCore(PatternInterface pattern) => pattern == PatternInterface.Value ? this : base.GetPatternCore(pattern);
        public bool IsReadOnly => true;
        public string Value => Map.SelectedFacts;
        public void SetValue(string value) => throw new InvalidOperationException();
    }

    private static int Tone(TorrentPieces detail, int piece, int rareThreshold)
    {
        if (detail.Pieces.Has(piece) || (piece < detail.Availability.Count && detail.Availability[piece] < 0)) return 0;
        if (piece >= detail.Availability.Count) return 1;
        int peers = detail.Availability[piece];
        if (peers == 0) return 4;
        return peers <= rareThreshold ? 3 : 2;
    }
    private static int AxisStart(int index) => index * (BlockSize + Gap) + index / BandSize * Gutter;
    private static int AxisSize(int count) => AxisStart(count - 1) + BlockSize;
    private static Color BrushColor(Brush brush) => ((SolidColorBrush)brush).Color;
    private static Color Alpha(Color color, double opacity) => Color.FromArgb((byte)(color.A * opacity), color.R, color.G, color.B);
    private static void Pixel(byte[] pixels, int width, int x, int y, Color color)
    {
        int offset = (y * width + x) * 4;
        pixels[offset] = (byte)(color.B * color.A / 255);
        pixels[offset + 1] = (byte)(color.G * color.A / 255);
        pixels[offset + 2] = (byte)(color.R * color.A / 255);
        pixels[offset + 3] = color.A;
    }
    private sealed record Block(int Start, int End, int X, int Y, int[] Counts, int Completed);
    private sealed record Layout(int Width, int Height, int Columns, int PiecesPerBlock, byte[] Pixels, List<Block> Blocks, int[] Counts);
    private sealed record Flash(int Block, long Started, double Alpha);
}
