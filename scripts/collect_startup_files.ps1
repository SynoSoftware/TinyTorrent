param(
    [string]$Destination = "C:\temp\tinytorrent_startup_files.txt"
)

$files = @(
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\main.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\meson.build",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\scripts\modules\meson-config.ps1",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\tray\entry_winmain.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Server.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Server.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Dispatcher.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Dispatcher.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Serializer.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\Serializer.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\UiPreferences.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\rpc\UiPreferences.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\utils\Log.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\utils\StateStore.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\src\utils\StateStore.hpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\tests\UiServingTest.cpp",
    "C:\Users\user\source\repos\SynoSoftware\TinyTorrent\backend\tests\SerializerTest.cpp"
)

# Note: UiServingTest.hpp does not exist; skip it to avoid false missing entries.

$directory = Split-Path -Parent $Destination
if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$sb = New-Object System.Text.StringBuilder

foreach ($file in $files) {
    $item = Get-Item -LiteralPath $file -ErrorAction SilentlyContinue
    $displayPath = if ($item) { $item.FullName } else { $file }

    [void]$sb.AppendLine("================================================================================")
    [void]$sb.AppendLine("FILE: $displayPath")
    [void]$sb.AppendLine("================================================================================")

    if ($item) {
        [void]$sb.AppendLine((Get-Content -LiteralPath $item.FullName -Raw))
    }
    else {
        [void]$sb.AppendLine("[MISSING FILE]")
    }
}

Set-Content -LiteralPath $Destination -Value $sb.ToString()
