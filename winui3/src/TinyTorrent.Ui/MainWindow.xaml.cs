using Microsoft.UI.Xaml;

namespace TinyTorrent_Ui;

/// <summary>
/// The application window. This hosts a Frame that displays pages, starting on the torrent
/// list — the only page this project has today.
/// </summary>
public sealed partial class MainWindow : Window
{
    /// <summary>
    /// So the torrent page can stop its poll when the window closes. Closing does not always
    /// unload the page first, and a tick that lands mid-teardown throws from whichever object has
    /// gone already.
    /// </summary>
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
