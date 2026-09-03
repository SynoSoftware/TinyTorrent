using Microsoft.UI.Xaml;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace Synapse_Sample;

/// <summary>
/// The application window. This hosts a Frame that displays pages. Add your
/// UI and logic to MainPage.xaml / MainPage.xaml.cs instead of here so you
/// can use Page features such as navigation events and the Loaded lifecycle.
/// </summary>
public sealed partial class MainWindow : Window
{
    /// <summary>Set for the probe harness, which needs to resize the client area.</summary>
    public static MainWindow? Instance;

    public MainWindow()
    {
        Instance = this;
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        AppWindow.SetIcon("Assets/AppIcon.ico");

        // The torrent host profile is the page the app opens on. The first-light demo stays
        // reachable for the agents whose measurement harness lives on it, selected by its flag.
        bool firstLight = File.Exists("C:/SynoSoftware/TinyTorrent/winui3/firstlight-diag.flag");
        RootFrame.Navigate(firstLight ? typeof(TableDemoPage) : typeof(TorrentPage));
    }
}
