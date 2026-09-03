using System.Globalization;
using System.Reflection;
using System.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Synapse;
using Windows.Foundation;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace Synapse_Sample;

/// <summary>
/// The measurement pass that produced firstlight-results.txt. It runs only when the flag file
/// exists, so a person opening the sample never sees it.
/// </summary>
public sealed partial class TableDemoPage
{
    // ------------------------------------------------------------ diagnostics

    private async Task RunDiagnosticsAsync()
    {
        SizeWindow();
        await Settle(700);

        W($"first light {DateTime.Now:O}  RasterizationScale={_scale}");
        Section("A. Did anything render at all?");

        W($"TableView ActualWidth={Table.ActualWidth:0.##} ActualHeight={Table.ActualHeight:0.##}");

        ListView? list = FindDescendant<ListView>(Table);
        TableHeaderStrip? strip = FindDescendant<TableHeaderStrip>(Table);
        W($"header strip found = {strip is not null}");
        W($"hosted ListView found = {list is not null}");
        if (list is not null)
        {
            W($"ListView ActualWidth={list.ActualWidth:0.##} SelectionMode={list.SelectionMode} " +
              $"IsMultiSelectCheckBoxEnabled={list.IsMultiSelectCheckBoxEnabled} Items={list.Items.Count}");
        }

        List<TableHeaderCell> header = new();
        if (strip is not null)
        {
            FindAll(strip, header);
        }

        W($"header cells realized = {header.Count}");

        List<ListViewItem> containers = new();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        W($"realized ListViewItem containers = {containers.Count} of {RowCount} rows");

        ScrollViewer? sv = list is null ? null : FindDescendant<ScrollViewer>(list);
        if (sv is not null)
        {
            W($"inner ScrollViewer HorizontalScrollMode={sv.HorizontalScrollMode} " +
              $"ExtentWidth={sv.ExtentWidth:0.##} ViewportWidth={sv.ViewportWidth:0.##} " +
              $"ExtentHeight={sv.ExtentHeight:0.##} ViewportHeight={sv.ViewportHeight:0.##}");
        }

        Section("B. Content origin of a row container (checkbox gutter check)");
        ReportRowOrigin(containers);

        Section("C. Header cell boundaries vs row cell boundaries at offset 0");
        await SavePngAsync("C:/SynoSoftware/TinyTorrent/winui3/firstlight-offset0.png");
        double[] headerX = ReportBoundaries("offset 0", header, containers);

        Section("D. Move the table-owned horizontal offset");
        ScrollBar? bar = FindByName<ScrollBar>(Table, "PART_HorizontalScrollBar");
        W($"PART_HorizontalScrollBar found = {bar is not null}");
        if (bar is not null)
        {
            W($"  Minimum={bar.Minimum:0.##} Maximum={bar.Maximum:0.##} " +
              $"ViewportSize={bar.ViewportSize:0.##} Value={bar.Value:0.##} Visibility={bar.Visibility}");
        }

        // The list keeps realizing containers for several frames after load. Wait until the panel
        // measure counter stops moving, so the offset measurement is not polluted by realization.
        W("waiting for layout to go quiet: " + await WaitForQuietAsync());

        containers.Clear();
        if (list is not null)
        {
            FindAll(list, containers);
        }

        W($"realized ListViewItem containers once quiet = {containers.Count} of {RowCount} rows");

        // Idle baseline first: an untouched table must not be re-measuring on its own.
        int idleStartM = ReadPanelCounter("MeasurePasses");
        int idleStartA = ReadPanelCounter("ArrangePasses");
        await Settle(400);
        int idleEndM = ReadPanelCounter("MeasurePasses");
        int idleEndA = ReadPanelCounter("ArrangePasses");
        W($"idle 400 ms with no input: measure +{idleEndM - idleStartM} arrange +{idleEndA - idleStartA} " +
          $"(counters {Show(idleStartM)} -> {Show(idleEndM)})");

        bool setValueAccepted = false;
        if (bar is not null)
        {
            setValueAccepted = TryMoveOffsetByAutomation(bar, 300);
            await Settle(400);
            W($"automation SetValue(300) accepted={setValueAccepted}; ScrollBar.Value={bar.Value:0.##}");
        }

        int afterM = ReadPanelCounter("MeasurePasses");
        int afterA = ReadPanelCounter("ArrangePasses");

        bool moved = false;
        if (header.Count > 0)
        {
            double[] headerAfter = header.Select(c => XOf(c)).ToArray();
            moved = headerX.Length == headerAfter.Length
                && headerX.Zip(headerAfter).Any(p => Math.Abs(p.First - p.Second) > 0.5);
        }

        W($"header cells moved after the offset change = {moved}");
        W($"MeasureOverride calls caused by the offset change = {afterM - idleEndM}");
        W($"ArrangeOverride calls caused by the offset change = {afterA - idleEndA}");

        Section("E. Header cell boundaries vs row cell boundaries at the new offset");
        ReportBoundaries("offset moved", header, containers);

        Section("F. RenderTargetBitmap of the table");
        await SavePngAsync("C:/SynoSoftware/TinyTorrent/winui3/firstlight-offset300.png");
        await ReportBitmapAsync();

        Section("G. Platform spacing resources available to a header cell");
        ProbeResources();
    }

    private async Task<string> WaitForQuietAsync()
    {
        for (int round = 1; round <= 20; round++)
        {
            int before = ReadPanelCounter("MeasurePasses");
            await Settle(300);
            int after = ReadPanelCounter("MeasurePasses");
            if (after == before)
            {
                return $"quiet after {round} round(s), measure counter {after}";
            }
        }

        return $"still moving after 20 rounds, measure counter {ReadPanelCounter("MeasurePasses")}";
    }

    private void SizeWindow()
    {
        try
        {
            MainWindow? w = MainWindow.Instance;
            if (w is null)
            {
                W("MainWindow.Instance is null; window not resized");
                return;
            }

            w.AppWindow.ResizeClient(new Windows.Graphics.SizeInt32(
                (int)Math.Ceiling(1000 * _scale), (int)Math.Ceiling(680 * _scale)));
            w.Activate();
        }
        catch (Exception ex)
        {
            W("resize failed: " + ex.Message);
        }
    }

    private async Task Settle(int ms)
    {
        UpdateLayout();
        await Task.Delay(ms);
        UpdateLayout();
        await Task.Delay(60);
    }

    private void ReportRowOrigin(List<ListViewItem> containers)
    {
        if (containers.Count == 0)
        {
            W("no realized container to measure");
            return;
        }

        ListViewItem item = containers[0];
        TableCellsPanel? panel = FindDescendant<TableCellsPanel>(item);
        W($"container[0] width={item.ActualWidth:0.##} height={item.ActualHeight:0.##} " +
          $"padding={item.Padding} x-in-table={XOf(item):0.##}");
        if (panel is not null)
        {
            W($"row cells panel x-in-container={XOf(panel, item):0.##} " +
              $"width={panel.ActualWidth:0.##} children={panel.Children.Count}");
        }
    }

    private double[] ReportBoundaries(string label, List<TableHeaderCell> header, List<ListViewItem> containers)
    {
        if (header.Count == 0)
        {
            W("no header cells");
            return Array.Empty<double>();
        }

        double[] headerX = header.Select(c => XOf(c)).ToArray();
        W($"{label}: header cell left edges (DIP, relative to TableView)");
        for (int i = 0; i < header.Count; i++)
        {
            TextBlock? text = FindDescendant<TextBlock>(header[i]);
            string label2 = text is null ? "no label" : $"label x={XOf(text):0.##}";
            W($"  header[{i}] '{AutomationProperties.GetName(header[i])}' x={headerX[i]:0.##} " +
              $"w={header[i].ActualWidth:0.##} padding={header[i].Padding} {label2}");
        }

        int measured = 0;
        foreach (ListViewItem item in containers)
        {
            TableCellsPanel? panel = FindDescendant<TableCellsPanel>(item);
            if (panel is null || panel.Children.Count == 0)
            {
                continue;
            }

            List<double> deltas = new();
            for (int i = 0; i < panel.Children.Count && i < headerX.Length; i++)
            {
                if (panel.Children[i] is FrameworkElement cell)
                {
                    deltas.Add(XOf(cell) - headerX[i]);
                }
            }

            TextBlock? firstText = FindDescendant<TextBlock>(panel);
            W($"  row container {measured}: cell-vs-header delta = [" +
              string.Join(", ", deltas.Select(d => d.ToString("0.###", CultureInfo.InvariantCulture))) + "]" +
              (firstText is null ? "" : $"  first cell text x={XOf(firstText):0.##}"));

            if (++measured == 3)
            {
                break;
            }
        }

        if (measured == 0)
        {
            W("  no row cell panel found to compare");
        }

        return headerX;
    }

    private async Task SavePngAsync(string path)
    {
        try
        {
            RenderTargetBitmap rtb = new();
            await rtb.RenderAsync(Table);
            IBuffer buffer = await rtb.GetPixelsAsync();
            byte[] px = new byte[buffer.Length];
            DataReader.FromBuffer(buffer).ReadBytes(px);

            InMemoryRandomAccessStream stream = new();
            BitmapEncoder encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
            encoder.SetPixelData(
                BitmapPixelFormat.Bgra8,
                BitmapAlphaMode.Premultiplied,
                (uint)rtb.PixelWidth,
                (uint)rtb.PixelHeight,
                96 * _scale,
                96 * _scale,
                px);
            await encoder.FlushAsync();

            byte[] file = new byte[stream.Size];
            DataReader reader = new(stream.GetInputStreamAt(0));
            await reader.LoadAsync((uint)stream.Size);
            reader.ReadBytes(file);
            File.WriteAllBytes(path, file);
            W($"wrote {path} ({file.Length} bytes, {rtb.PixelWidth}x{rtb.PixelHeight})");
        }
        catch (Exception ex)
        {
            W($"png {path} failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private async Task ReportBitmapAsync()
    {
        try
        {
            RenderTargetBitmap rtb = new();
            await rtb.RenderAsync(Table);
            IBuffer buffer = await rtb.GetPixelsAsync();
            byte[] px = new byte[buffer.Length];
            DataReader.FromBuffer(buffer).ReadBytes(px);
            int w = rtb.PixelWidth;
            int h = rtb.PixelHeight;
            W($"bitmap {w}x{h} px");

            if (w == 0 || h == 0)
            {
                W("bitmap is empty");
                return;
            }

            Dictionary<uint, int> histogram = new();
            for (int i = 0; i + 3 < px.Length; i += 4)
            {
                uint key = (uint)(px[i] | (px[i + 1] << 8) | (px[i + 2] << 16));
                histogram[key] = histogram.TryGetValue(key, out int n) ? n + 1 : 1;
            }

            W($"distinct colours = {histogram.Count}");
            foreach (KeyValuePair<uint, int> entry in histogram.OrderByDescending(p => p.Value).Take(5))
            {
                W($"  #{entry.Key:X6} x{entry.Value}");
            }

            int opaque = 0;
            for (int i = 3; i < px.Length; i += 4)
            {
                if (px[i] != 0)
                {
                    opaque++;
                }
            }

            W($"pixels with alpha > 0 = {opaque} of {w * h}");

            for (int y = 8; y < h && y < (int)(200 * _scale); y += (int)(10 * _scale))
            {
                W($"  scanline y={y}: " + Runs(px, w, y));
            }
        }
        catch (Exception ex)
        {
            W("RenderTargetBitmap failed: " + ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static string Runs(byte[] px, int w, int y)
    {
        if (y < 0 || (y + 1) * w * 4 > px.Length)
        {
            return "(row out of range)";
        }

        StringBuilder sb = new();
        uint last = 0xFFFFFFFF;
        int runs = 0;
        for (int x = 0; x < w; x++)
        {
            int i = ((y * w) + x) * 4;
            uint key = (uint)(px[i] | (px[i + 1] << 8) | (px[i + 2] << 16));
            if (key != last)
            {
                if (runs < 12)
                {
                    sb.Append($"x={x}:#{key:X6} ");
                }

                runs++;
                last = key;
            }
        }

        sb.Append($"(total runs {runs})");
        return sb.ToString();
    }

    /// <summary>
    /// Enumerate every platform resource whose value is a Thickness and whose key mentions a
    /// list, item, header, or cell. This answers whether the platform already publishes a padding
    /// the header cell could adopt instead of inventing one.
    /// </summary>
    private void ProbeResources()
    {
        List<string> hits = new();
        int scanned = 0;

        void Scan(ResourceDictionary dictionary, string origin)
        {
            try
            {
                foreach (KeyValuePair<object, object> entry in dictionary)
                {
                    scanned++;
                    if (entry.Key is not string key || entry.Value is not Thickness thickness)
                    {
                        continue;
                    }

                    string lower = key.ToLowerInvariant();
                    if (lower.Contains("list") || lower.Contains("item") || lower.Contains("header")
                        || lower.Contains("cell") || lower.Contains("grid"))
                    {
                        hits.Add($"  {key,-44} = {thickness}   [{origin}]");
                    }
                }
            }
            catch (Exception ex)
            {
                W($"  scanning {origin} threw {ex.GetType().Name}");
            }

            foreach (ResourceDictionary merged in dictionary.MergedDictionaries)
            {
                Scan(merged, origin + "/merged");
            }

            foreach (KeyValuePair<object, object> theme in dictionary.ThemeDictionaries)
            {
                if (theme.Value is ResourceDictionary themed)
                {
                    Scan(themed, origin + "/" + theme.Key);
                }
            }
        }

        Scan(Application.Current.Resources, "app");
        W($"scanned {scanned} resource entries; Thickness keys mentioning list/item/header/cell/grid:");
        foreach (string hit in hits.Distinct().OrderBy(h => h, StringComparer.Ordinal))
        {
            W(hit);
        }

        if (hits.Count == 0)
        {
            W("  (none)");
        }
    }

    // ------------------------------------------------------------- utilities

    private static bool TryMoveOffsetByAutomation(ScrollBar bar, double value)
    {
        try
        {
            AutomationPeer? peer = FrameworkElementAutomationPeer.CreatePeerForElement(bar);
            if (peer?.GetPattern(PatternInterface.RangeValue) is IRangeValueProvider provider)
            {
                provider.SetValue(value);
                return true;
            }
        }
        catch
        {
            // reported by the caller through the observed ScrollBar value
        }

        return false;
    }

    private static int ReadPanelCounter(string fieldName)
    {
        FieldInfo? field = typeof(TableCellsPanel).GetField(
            fieldName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        return field?.GetValue(null) is int n ? n : -1;
    }

    private static string Show(int counter) => counter < 0 ? "(not instrumented)" : counter.ToString();

    private double XOf(FrameworkElement element) => XOf(element, Table);

    private static double XOf(FrameworkElement element, UIElement relativeTo)
    {
        try
        {
            return element.TransformToVisual(relativeTo).TransformPoint(new Point(0, 0)).X;
        }
        catch
        {
            return double.NaN;
        }
    }

    private static T? FindDescendant<T>(DependencyObject root) where T : DependencyObject
    {
        int n = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < n; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T t)
            {
                return t;
            }

            T? deeper = FindDescendant<T>(child);
            if (deeper is not null)
            {
                return deeper;
            }
        }

        return null;
    }

    private static T? FindByName<T>(DependencyObject root, string name) where T : FrameworkElement
    {
        List<T> all = new();
        FindAll(root, all);
        return all.FirstOrDefault(e => e.Name == name);
    }

    private static void FindAll<T>(DependencyObject root, List<T> into) where T : DependencyObject
    {
        int n = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < n; i++)
        {
            DependencyObject child = VisualTreeHelper.GetChild(root, i);
            if (child is T t)
            {
                into.Add(t);
            }

            FindAll(child, into);
        }
    }
}
