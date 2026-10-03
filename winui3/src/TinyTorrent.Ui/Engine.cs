using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace TinyTorrent_Ui;

internal static class Engine
{
    private const uint GetServiceTimeout = 0x007C;
    private const uint AbortIfHung = 0x0002;
    // §1.1's acknowledgement budget bounds each tray query and readiness sample.
    private const uint ReadinessIntervalMs = 100;

    internal static async Task<Uri> EnsureAddress(CancellationToken token)
    {
        if (FromCommandLine() is int supplied)
        {
            return Address(supplied);
        }
        if (TrayPort() is int ready)
        {
            return Address(ready);
        }
        string tray = Path.Combine(AppContext.BaseDirectory, "TinyTorrent.exe");
        if (!File.Exists(tray))
        {
            throw new FileNotFoundException("TinyTorrent's tray is missing.", tray);
        }
        using Process? process = Process.Start(new ProcessStartInfo(tray)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        if (!SystemParametersInfo(GetServiceTimeout, 0, out uint timeout, 0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        long started = Environment.TickCount64;
        while (Environment.TickCount64 - started < timeout)
        {
            token.ThrowIfCancellationRequested();
            if (TrayPort() is int port)
            {
                return Address(port);
            }
            await Task.Delay((int)ReadinessIntervalMs, token);
        }
        throw new IOException("The local engine has not started.");
    }

    private static int? TrayPort()
    {
        nint tray = FindWindow("TinyTorrent.Tray", null);
        uint message = RegisterWindowMessage("TinyTorrent.EnginePort");
        if (tray != 0 && message != 0 && SendMessageTimeout(tray, message, 0, 0, AbortIfHung, ReadinessIntervalMs, out nuint port) != 0 &&
            port is > 0 and <= 65535)
        {
            return (int)port;
        }
        return null;
    }

    private static Uri Address(int port) => new($"http://127.0.0.1:{port}/");

    private static int? FromCommandLine()
    {
        string[] arguments = Environment.GetCommandLineArgs();
        for (int i = 1; i < arguments.Length; i++)
        {
            if (arguments[i] is "-p" or "--port")
            {
                if (i + 1 >= arguments.Length || !int.TryParse(arguments[i + 1], out int port) || port is <= 0 or > 65535)
                {
                    throw new ArgumentException("The engine port must be a number from 1 to 65535.");
                }
                return port;
            }
        }
        return null;
    }

    internal static string? AddSource(string[] arguments)
    {
        for (int i = 0; i + 1 < arguments.Length; i++)
        {
            if (arguments[i] == "--add")
            {
                return arguments[i + 1];
            }
        }
        return null;
    }

    internal static string? AddSource(string commandLine)
    {
        nint values = CommandLineToArgv(commandLine, out int count);
        if (values == 0)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        try
        {
            string[] arguments = new string[count];
            for (int i = 0; i < count; i++)
            {
                arguments[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(values, i * nint.Size))!;
            }
            return AddSource(arguments);
        }
        finally
        {
            LocalFree(values);
        }
    }

    [DllImport("user32.dll", EntryPoint = "FindWindowW", CharSet = CharSet.Unicode)]
    private static extern nint FindWindow(string className, string? windowName);

    [DllImport("user32.dll", EntryPoint = "RegisterWindowMessageW", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessage(string message);

    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW", SetLastError = true)]
    private static extern nint SendMessageTimeout(nint window, uint message, nuint wParam, nint lParam,
        uint flags, uint timeout, out nuint result);

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SystemParametersInfo(uint action, uint parameter, out uint value, uint flags);

    [DllImport("shell32.dll", EntryPoint = "CommandLineToArgvW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CommandLineToArgv(string commandLine, out int count);

    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint memory);
}
