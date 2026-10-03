using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Graphics;

namespace TinyTorrent_Ui;

public sealed partial class MainWindow : Window
{
    private enum ClosingPhase { Open, Checking, Approved }
    private ClosingPhase _closing;
    internal InterfaceSettings Settings { get; }
    internal nint Handle => WinRT.Interop.WindowNative.GetWindowHandle(this);
    internal TorrentPage Page => (TorrentPage)RootFrame.Content;
    internal bool IsClosing => _closing != ClosingPhase.Open;

    public MainWindow()
    {
        Settings = InterfaceSettings.Load(out string? failure);
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        Root.RequestedTheme = Settings.Theme;
        RootFrame.Navigate(typeof(TorrentPage));
        Page.Window = this;
        Page.Loaded += (_, _) =>
        {
            if (failure is not null)
            {
                Page.ShowFailure(failure);
            }
        };
        RestoreBounds();
        AppWindow.Changed += (_, args) =>
        {
            if (AppWindow.Presenter is OverlappedPresenter presenter)
            {
                if ((args.DidPositionChange || args.DidSizeChange) && presenter.State == OverlappedPresenterState.Restored)
                {
                    Settings.Bounds = new(AppWindow.Position.X, AppWindow.Position.Y, AppWindow.Size.Width, AppWindow.Size.Height);
                }
                if (presenter.State != OverlappedPresenterState.Minimized)
                {
                    Settings.IsMaximized = presenter.State == OverlappedPresenterState.Maximized;
                }
            }
        };
        AppWindow.Closing += OnClosing;
        Closed += (_, _) => Page.Close();
    }

    private async void OnClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_closing == ClosingPhase.Approved)
        {
            return;
        }
        args.Cancel = true;
        if (_closing == ClosingPhase.Checking)
        {
            return;
        }
        _closing = ClosingPhase.Checking;
        try
        {
            if (!await Page.CanClose())
            {
                _closing = ClosingPhase.Open;
                Page.ResumeAdds();
                return;
            }
            Page.Close();
            try
            {
                Settings.Save();
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                Trace.TraceError("Could not save interface settings: " + error.Message);
            }
            _closing = ClosingPhase.Approved;
            Close();
        }
        catch (Exception error)
        {
            _closing = ClosingPhase.Open;
            Page.ShowFailure(error.Message);
            Page.ResumeAdds();
        }
    }

    internal void SetTheme(ElementTheme theme)
    {
        Root.RequestedTheme = theme;
        Settings.Theme = theme;
    }

    internal void BringToFront()
    {
        if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
        {
            presenter.Restore();
        }
        Activate();
    }

    private void RestoreBounds()
    {
        if (Settings.Bounds is not { Width: > 0, Height: > 0 } bounds)
        {
            RectInt32 workArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
            double scale = GetDpiForWindow(Handle) / 96.0;
            int chrome = AppWindow.Size.Width - AppWindow.ClientSize.Width;
            int clientWidth = Math.Min((int)Math.Ceiling(Page.InitialWidth * scale), workArea.Width - chrome);
            int verticalChrome = AppWindow.Size.Height - AppWindow.ClientSize.Height;
            int clientHeight = Math.Min(AppWindow.ClientSize.Height, workArea.Height - verticalChrome);
            AppWindow.ResizeClient(new SizeInt32(clientWidth, clientHeight));
            AppWindow.Move(new PointInt32(
                Math.Clamp(AppWindow.Position.X, workArea.X, workArea.X + workArea.Width - AppWindow.Size.Width),
                Math.Clamp(AppWindow.Position.Y, workArea.Y, workArea.Y + workArea.Height - AppWindow.Size.Height)));
            Settings.Bounds = new(AppWindow.Position.X, AppWindow.Position.Y, AppWindow.Size.Width, AppWindow.Size.Height);
            return;
        }
        RectInt32 requested = new(bounds.X, bounds.Y, bounds.Width, bounds.Height);
        RectInt32 area = DisplayArea.GetFromRect(requested, DisplayAreaFallback.Nearest).WorkArea;
        int width = Math.Min(bounds.Width, area.Width);
        int height = Math.Min(bounds.Height, area.Height);
        AppWindow.MoveAndResize(new RectInt32(
            Math.Clamp(bounds.X, area.X, area.X + area.Width - width),
            Math.Clamp(bounds.Y, area.Y, area.Y + area.Height - height),
            width,
            height));
        if (Settings.IsMaximized && AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.Maximize();
        }
    }

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint window);
}
