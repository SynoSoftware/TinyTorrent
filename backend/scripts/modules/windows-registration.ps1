Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')

function Get-TinyTorrentExecutableAliases {
    return @(
        'tinytorrent.exe',
        'tt-engine.exe',
        'tt.exe',
        'tt-dispatcher.exe'
    )
}

function Test-TinyTorrentCommandValue {
    param(
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    $lower = $Value.ToLowerInvariant()
    if ($lower.Contains('tinytorrent')) {
        return $true
    }

    foreach ($name in Get-TinyTorrentExecutableAliases) {
        if ($lower.Contains($name)) {
            return $true
        }
    }

    return $false
}

function Get-RegistryDefaultValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return (Get-ItemProperty -LiteralPath $Path).'(default)'
    }
    catch {
        return $null
    }
}

function Remove-RegistryKeyIfTinyTorrent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$CommandSubkey = ''
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    $remove = $false
    if ($CommandSubkey) {
        $commandPath = Join-Path $Path $CommandSubkey
        $commandValue = Get-RegistryDefaultValue -Path $commandPath
        if ($commandValue -and (Test-TinyTorrentCommandValue -Value $commandValue)) {
            $remove = $true
        }
    }
    else {
        $defaultValue = Get-RegistryDefaultValue -Path $Path
        if ($defaultValue -is [string] -and $defaultValue -eq 'TinyTorrent.torrent') {
            $remove = $true
        }
    }

    if (-not $remove) {
        return $false
    }

    Remove-Item -LiteralPath $Path -Recurse -Force
    Log-Info "Removed registry key $Path"
    return $true
}

function Remove-RegistryValueIfPresent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    try {
        $value = (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name
    }
    catch {
        return $false
    }

    Remove-ItemProperty -LiteralPath $Path -Name $Name -Force
    Log-Info "Removed registry value $Path\\$Name"
    return $true
}

function Get-TinyTorrentShortcutRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    foreach ($folder in @(
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('Startup'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('CommonPrograms'),
        [Environment]::GetFolderPath('CommonStartup')
    )) {
        if (-not [string]::IsNullOrWhiteSpace($folder) -and
            -not $roots.Contains($folder)) {
            $roots.Add($folder)
        }
    }
    return $roots
}

function Get-TinyTorrentShortcutSnapshot {
    $shortcuts = New-Object System.Collections.Generic.List[object]
    foreach ($root in Get-TinyTorrentShortcutRoots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Force -ErrorAction SilentlyContinue |
        ForEach-Object {
            $name = $_.Name.ToLowerInvariant()
            if ($name.Contains('tinytorrent') -or $name -eq 'tt.lnk' -or $name -eq 'tt-dispatcher.lnk') {
                $shortcuts.Add([pscustomobject]@{
                    Kind = 'shortcut'
                    Path = $_.FullName
                    Value = $_.Name
                    Present = $true
                })
            }
        }
    }
    return $shortcuts
}

function Get-TinyTorrentRegistrationSnapshot {
    $entries = New-Object System.Collections.Generic.List[object]

    $checks = @(
        @{ Kind = 'autorun-value'; Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Name = 'TinyTorrent'; Match = 'value' },
        @{ Kind = 'autorun-value'; Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; Name = 'TinyTorrent'; Match = 'value' },
        @{ Kind = 'handler-key'; Path = 'HKCU:\Software\Classes\magnet'; CommandSubkey = 'shell\open\command'; Match = 'command' },
        @{ Kind = 'handler-key'; Path = 'HKLM:\Software\Classes\magnet'; CommandSubkey = 'shell\open\command'; Match = 'command' },
        @{ Kind = 'association-key'; Path = 'HKCU:\Software\Classes\.torrent'; Match = 'torrent-assoc' },
        @{ Kind = 'association-key'; Path = 'HKLM:\Software\Classes\.torrent'; Match = 'torrent-assoc' },
        @{ Kind = 'handler-key'; Path = 'HKCU:\Software\Classes\TinyTorrent.torrent'; CommandSubkey = 'shell\open\command'; Match = 'command' },
        @{ Kind = 'handler-key'; Path = 'HKLM:\Software\Classes\TinyTorrent.torrent'; CommandSubkey = 'shell\open\command'; Match = 'command' }
    )

    foreach ($check in $checks) {
        $present = $false
        $value = $null

        switch ($check.Match) {
            'value' {
                if (Test-Path -LiteralPath $check.Path) {
                    try {
                        $value = (Get-ItemProperty -LiteralPath $check.Path -Name $check.Name -ErrorAction Stop).$($check.Name)
                        $present = $true
                    }
                    catch {
                    }
                }
            }
            'command' {
                $commandPath = Join-Path $check.Path $check.CommandSubkey
                $value = Get-RegistryDefaultValue -Path $commandPath
                $present = ($value -is [string]) -and (Test-TinyTorrentCommandValue -Value $value)
            }
            'torrent-assoc' {
                $value = Get-RegistryDefaultValue -Path $check.Path
                $present = ($value -is [string]) -and ($value -eq 'TinyTorrent.torrent')
            }
        }

        $entries.Add([pscustomobject]@{
            Kind = $check.Kind
            Path = $check.Path
            Value = $value
            Present = $present
        })
    }

    foreach ($shortcut in Get-TinyTorrentShortcutSnapshot) {
        $entries.Add($shortcut)
    }

    return $entries
}

function Write-TinyTorrentRegistrationSnapshot {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][object[]]$Snapshot
    )

    Log-Section -Title ("TinyTorrent Registration {0}" -f $Label) -Subtitle 'Windows integration audit'

    if (-not $Snapshot -or $Snapshot.Count -eq 0) {
        Log-Info 'No tracked TinyTorrent registration locations found.'
        return
    }

    foreach ($entry in $Snapshot) {
        $state = if ($entry.Present) { 'PRESENT' } else { 'ABSENT ' }
        $line = "{0} {1}" -f $state, $entry.Path
        if ($entry.Present -and -not [string]::IsNullOrWhiteSpace([string]$entry.Value)) {
            $line += " -> $($entry.Value)"
        }
        Write-Host $line
    }
}

function Remove-TinyTorrentShortcuts {
    $removed = 0
    foreach ($root in Get-TinyTorrentShortcutRoots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        Get-ChildItem -LiteralPath $root -Filter 'TinyTorrent*.lnk' -File -Force -ErrorAction SilentlyContinue |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            Log-Info "Removed shortcut $($_.FullName)"
            $removed++
        }
    }
    return $removed
}

function Invoke-TinyTorrentUnregisterAll {
    if ($env:OS -ne 'Windows_NT') {
        throw 'TinyTorrent unregister is only supported on Windows.'
    }

    $errors = New-Object System.Collections.Generic.List[string]
    $removedRegistryItems = 0
    $removedShortcuts = 0
    $before = @(Get-TinyTorrentRegistrationSnapshot)

    Write-TinyTorrentRegistrationSnapshot -Label 'Before' -Snapshot $before

    try {
        if (Remove-RegistryValueIfPresent -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'TinyTorrent') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryValueIfPresent -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'TinyTorrent') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKCU:\Software\Classes\magnet' -CommandSubkey 'shell\open\command') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKLM:\Software\Classes\magnet' -CommandSubkey 'shell\open\command') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKCU:\Software\Classes\.torrent') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKLM:\Software\Classes\.torrent') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKCU:\Software\Classes\TinyTorrent.torrent' -CommandSubkey 'shell\open\command') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }
    try {
        if (Remove-RegistryKeyIfTinyTorrent -Path 'HKLM:\Software\Classes\TinyTorrent.torrent' -CommandSubkey 'shell\open\command') { $removedRegistryItems++ }
    }
    catch {
        $errors.Add($_.Exception.Message)
    }

    try {
        $removedShortcuts = Remove-TinyTorrentShortcuts
    }
    catch {
        $errors.Add($_.Exception.Message)
    }

    try {
        $signature = @'
using System;
using System.Runtime.InteropServices;
public static class TinyTorrentShellRefresh {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
        Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue | Out-Null
        [TinyTorrentShellRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    catch {
        $errors.Add($_.Exception.Message)
    }

    $after = @(Get-TinyTorrentRegistrationSnapshot)

    Write-TinyTorrentRegistrationSnapshot -Label 'After' -Snapshot $after

    if ($errors.Count -gt 0) {
        throw ("TinyTorrent unregister completed with errors: " + ($errors -join '; '))
    }

    if ($removedRegistryItems -eq 0 -and $removedShortcuts -eq 0) {
        Log-Info 'No TinyTorrent Windows registrations were found.'
        return
    }

    Log-Success ("Removed {0} registry item(s) and {1} shortcut(s)." -f $removedRegistryItems, $removedShortcuts)
}
