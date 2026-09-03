using System.Text;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Synapse;

namespace Synapse_Sample;

/// <summary>
/// The first-light demo: a real page that uses <see cref="TableView"/>.
/// When firstlight-diag.flag is present the page runs a measurement pass, writes
/// firstlight-results.txt, and closes the app.
/// </summary>
public sealed partial class TableDemoPage : Page
{
    private const int RowCount = 1000;

    /// <summary>Present only while an agent measures the control. A packaged launch does not
    /// inherit environment variables, so the switch is a file.</summary>
    private const string DiagnosticsFlagPath =
        "C:/SynoSoftware/TinyTorrent/winui3/firstlight-diag.flag";

    private readonly StringBuilder _log = new();
    private double _scale = 1.0;
    private bool _finished;

    public TableDemoPage()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void W(string s) => _log.AppendLine(s);

    private void Section(string s)
    {
        W("");
        W("========================================================================");
        W(s);
        W("========================================================================");
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        _scale = XamlRoot?.RasterizationScale ?? 1.0;

        List<DemoRow> rows = DemoRow.Generate(RowCount);
        Status.Text = $"{rows.Count} items";

        try
        {
            Table.ItemsSource = rows;
        }
        catch (Exception ex)
        {
            Status.Text = "ItemsSource threw: " + ex.Message;
            W("ItemsSource assignment THREW " + ex);
        }

        if (!File.Exists(DiagnosticsFlagPath))
        {
            return;
        }

        DispatcherQueueTimer watchdog = DispatcherQueue.CreateTimer();
        watchdog.Interval = TimeSpan.FromSeconds(120);
        watchdog.IsRepeating = false;
        watchdog.Tick += (_, _) => { W("\n!!! WATCHDOG FIRED !!!"); Finish(); };
        watchdog.Start();

        try
        {
            await RunDiagnosticsAsync();
        }
        catch (Exception ex)
        {
            W("\n*** DIAGNOSTICS THREW: " + ex);
        }

        watchdog.Stop();
        Finish();
    }

    private void OnDetailsClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: DemoRow row })
        {
            Status.Text = $"{RowCount} items — last button: row {row.Index}";
        }
    }

    private void Finish()
    {
        if (_finished)
        {
            return;
        }

        _finished = true;
        string text = _log.ToString();
        foreach (string path in new[]
        {
            Path.Combine(AppContext.BaseDirectory, "firstlight-results.txt"),
            @"C:\SynoSoftware\TinyTorrent\winui3\firstlight-results.txt",
        })
        {
            try { File.WriteAllText(path, text); } catch { }
        }

        Application.Current.Exit();
    }

}
