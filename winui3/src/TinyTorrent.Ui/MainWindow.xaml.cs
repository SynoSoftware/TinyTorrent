using Microsoft.UI.Xaml;

namespace TinyTorrent_Ui;

/// <summary>
/// The application window. This hosts a Frame that displays pages, starting on the torrent
/// list — the only page this project has today.
/// </summary>
public sealed partial class MainWindow : Window
{
    /// <summary>Set for TorrentPage's diagnostics harness, which needs to resize the client area.</summary>
    public static MainWindow? Instance;

    public MainWindow()
    {
        Instance = this;
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        RootFrame.Navigate(typeof(TorrentPage));
    }
}
