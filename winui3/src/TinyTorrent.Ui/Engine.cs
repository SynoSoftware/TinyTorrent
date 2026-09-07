using Microsoft.Win32;

namespace TinyTorrent_Ui;

/// <summary>
/// Where the engine is. The tray owns it: it launches the interface with <c>-p &lt;port&gt;</c>
/// and writes the same number to <c>HKCU\Software\TinyTorrent\Port</c>, which is how a launch
/// from the Start Menu finds it too.
/// </summary>
/// <remarks>
/// There is deliberately no fallback to 9091. That is the port the user's own Transmission is
/// most likely to be holding, and connecting to it would not fail - it would succeed against the
/// wrong daemon and present as the list showing somebody else's torrents.
/// </remarks>
internal static class Engine
{
    private const string TrayKey = @"Software\TinyTorrent";
    private const string PortValue = "Port";

    internal static Uri? Address()
    {
        int port = FromCommandLine() ?? FromRegistry() ?? 0;

        return port is > 0 and <= 65535 ? new Uri($"http://127.0.0.1:{port}/") : null;
    }

    private static int? FromCommandLine()
    {
        string[] arguments = Environment.GetCommandLineArgs();

        for (int i = 1; i < arguments.Length - 1; i++)
        {
            if (arguments[i] is "-p" or "--port" && int.TryParse(arguments[i + 1], out int port))
            {
                return port;
            }
        }

        return null;
    }

    private static int? FromRegistry()
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(TrayKey);
        return key?.GetValue(PortValue) as int?;
    }
}
