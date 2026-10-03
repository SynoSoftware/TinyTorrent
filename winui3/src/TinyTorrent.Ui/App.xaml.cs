using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Windows.ApplicationModel.Activation;

namespace TinyTorrent_Ui;

public partial class App : Application
{
    internal static string LocalPath =>
        Microsoft.Windows.Storage.ApplicationData.GetForUnpackaged("TinyTorrent", "TinyTorrent").LocalPath;

    private MainWindow? _window;
    private AppInstance? _instance;

    public App() => InitializeComponent();

    protected override async void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _instance = AppInstance.FindOrRegisterForKey("TinyTorrent.Ui");
        if (!_instance.IsCurrent)
        {
            await _instance.RedirectActivationToAsync(AppInstance.GetCurrent().GetActivatedEventArgs());
            Exit();
            return;
        }
        DispatcherQueue dispatcher = DispatcherQueue.GetForCurrentThread();
        _instance.Activated += (_, activation) => dispatcher.TryEnqueue(() =>
        {
            _window?.BringToFront();
            if (activation.Data is ILaunchActivatedEventArgs launch && Engine.AddSource(launch.Arguments) is string source)
            {
                _window?.Page.AddSource(source);
            }
        });
        _window = new MainWindow();
        if (Engine.AddSource(Environment.GetCommandLineArgs()) is string source)
        {
            _window.Page.AddSource(source);
        }
        _window.Closed += (_, _) => _instance.UnregisterKey();
        _window.Activate();
    }
}
