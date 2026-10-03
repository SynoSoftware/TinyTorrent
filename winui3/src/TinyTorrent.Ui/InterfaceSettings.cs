using System.Text.Json;
using Microsoft.UI.Xaml;
using Synapse;
using TinyTorrent;

namespace TinyTorrent_Ui;

internal sealed record WindowBounds(int X, int Y, int Width, int Height);

internal sealed class InterfaceSettings
{
    private static string Path => System.IO.Path.Combine(App.LocalPath, "interface.json");

    public TableLayout? Layout { get; set; }

    public WindowBounds? Bounds { get; set; }

    public bool IsMaximized { get; set; }

    public ElementTheme Theme { get; set; }

    public bool InspectorVisible { get; set; } = true;

    public InspectorTab InspectorTab { get; set; }

    public double? InspectorHeight { get; set; }

    internal static InterfaceSettings Load(out string? failure)
    {
        failure = null;
        try
        {
            return File.Exists(Path)
                ? JsonSerializer.Deserialize<InterfaceSettings>(File.ReadAllText(Path)) ?? new()
                : new();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            failure = "Saved interface settings could not be read. " + error.Message;
            return new();
        }
    }

    internal void Save()
    {
        string path = Path;
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
        string pending = path + ".tmp";
        File.WriteAllText(pending, JsonSerializer.Serialize(this));
        File.Move(pending, path, overwrite: true);
    }
}
