Set-StrictMode -Version 3

$script:EverythingReady = $false
$script:EverythingAsked = $false
$script:EverythingCliPath = $null

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'Info'
    )
    $color = switch ($Level) {
        'Info' { 'Cyan' }
        'Warn' { 'Yellow' }
        'Error' { 'Red' }
        'Success' { 'Green' }
        default { 'White' }
    }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')][$Level] $Message" -ForegroundColor $color
}

function Safe-TestPath {
    param([string]$Path)
    try { return Test-Path $Path -ErrorAction Stop } catch { return $false }
}

function Refresh-EnvironmentPath {
    $knownSegments = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    if ($env:Path) {
        foreach ($segment in $env:Path -split ';') {
            $segment = $segment.Trim()
            if ($segment) { $null = $knownSegments.Add($segment) }
        }
    }
    foreach ($scope in @('Machine', 'User')) {
        $value = [System.Environment]::GetEnvironmentVariable('Path', $scope)
        if (-not $value) { continue }
        foreach ($segment in ($value -split ';')) {
            $segment = $segment.Trim()
            if (-not $segment) { continue }
            if ($knownSegments.Contains($segment)) { continue }
            if ($env:Path) { $env:Path += ';' + $segment }
            else { $env:Path = $segment }
            $null = $knownSegments.Add($segment)
        }
    }
}

function Find-ViaPath {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return (Resolve-Path $cmd.Source).Path }
    return $null
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory)][psobject]$Object,
        [Parameter(Mandatory)][string]$Property
    )
    if (-not $Object) { return $null }
    $prop = $Object.PSObject.Properties[$Property]
    if ($prop) { return $prop.Value }
    return $null
}

function Find-ViaRegistry {
    param([string]$Id, [string]$Name)
    $hives = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')
    foreach ($h in $hives) {
        if (-not (Safe-TestPath $h)) { continue }
        $keys = Get-ChildItem $h -ErrorAction SilentlyContinue
        foreach ($k in $keys) {
            $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
            if (-not $p) { continue }
            $displayName = Get-PropertyValue -Object $p -Property 'DisplayName'
            $installLocation = Get-PropertyValue -Object $p -Property 'InstallLocation'
            if ($displayName -and $installLocation -and $displayName -like "*$Id*") {
                $base = $installLocation
                $try = Join-Path $base $Name; if (Safe-TestPath $try) { return $try }
                $try = Join-Path $base "bin\$Name"; if (Safe-TestPath $try) { return $try }
            }
        }
    }
    return $null
}

function Find-ViaAppx {
    param([string]$Id, [string]$Name)
    try {
        $pkg = Get-AppxPackage -Name "*$Id*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pkg -and $pkg.InstallLocation) {
            $loc = $pkg.InstallLocation
            $paths = @("$loc\$Name", "$loc\bin\$Name", "$loc\VFS\ProgramFilesX64\$Id\bin\$Name", "$loc\VFS\ProgramFilesX64\$Id\$Name")
            foreach ($p in $paths) { if (Safe-TestPath $p) { return $p } }
        }
    }
    catch {}
    return $null
}

function Find-ViaStandardPaths {
    param([string]$Id, [string]$Name)
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
    foreach ($r in $roots) {
        if (-not (Safe-TestPath $r)) { continue }
        $dirs = Get-ChildItem $r -Directory -Filter "$Id*" -ErrorAction SilentlyContinue
        foreach ($d in $dirs) {
            $try = Join-Path $d.FullName $Name; if (Safe-TestPath $try) { return $try }
            $try = Join-Path $d.FullName "bin\$Name"; if (Safe-TestPath $try) { return $try }
        }
    }
    return $null
}

function Ensure-Everything {
    param([switch]$Prompt = $true)

    if ($script:EverythingReady) { return $true }

    Initialize-Everything
    if ($script:EverythingReady) {
        Write-Log "Everything search engine ready at $script:EverythingCliPath" "Success"
        return $true
    }

    if ($Prompt -and -not $script:EverythingAsked) {
        $script:EverythingAsked = $true
        $reply = Read-Host "Everything search not found. Install/configure via Winget? (Y/N)"
        if ($reply -match '^[yY]') {
            if (Install-Everything-Interactive) {
                Write-Log "Everything is now ready at $script:EverythingCliPath" "Success"
                return $true
            }
        }
    }

    Write-Log "Everything unavailable; deep scans will fall back to PATH-only lookups." "Warn"
    return $false
}

function Initialize-Everything {
    $cliCandidates = @()
    if ($env:LOCALAPPDATA) { $cliCandidates += Join-Path $env:LOCALAPPDATA 'voidtools\es.exe' }
    if ($env:ProgramFiles) { $cliCandidates += Join-Path $env:ProgramFiles 'Everything\es.exe' }
    if (${env:ProgramFiles(x86)}) { $cliCandidates += Join-Path ${env:ProgramFiles(x86)} 'Everything\es.exe' }
    $cliCandidates += Find-ViaPath 'es.exe'

    foreach ($candidate in $cliCandidates) {
        if ($candidate -and (Safe-TestPath $candidate)) {
            $script:EverythingCliPath = $candidate
            break
        }
    }

    if (-not $script:EverythingCliPath) {
        $script:EverythingReady = $false
        return
    }

    $engine = Get-Process -Name 'Everything' -ErrorAction SilentlyContinue
    if (-not $engine) {
        $exeCandidates = @()
        if ($env:ProgramFiles) { $exeCandidates += Join-Path $env:ProgramFiles 'Everything\Everything.exe' }
        if (${env:ProgramFiles(x86)}) { $exeCandidates += Join-Path ${env:ProgramFiles(x86)} 'Everything\Everything.exe' }
        foreach ($exe in $exeCandidates) {
            if (Safe-TestPath $exe) {
                Start-Process -FilePath $exe -WindowStyle Hidden -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
                break
            }
        }
    }

    $script:EverythingReady = $false
    if (Safe-TestPath $script:EverythingCliPath) {
        $script:EverythingReady = [bool](Get-Process -Name 'Everything' -ErrorAction SilentlyContinue)
    }
}

function Install-Everything-Interactive {
    if (-not (Get-Command 'winget' -ErrorAction SilentlyContinue)) {
        Write-Log "Winget not found. Please install Everything manually." "Error"
        return $false
    }
    Write-Log "Installing Everything via Winget..." "Info"
    Start-Process -FilePath 'winget' -ArgumentList 'install', 'voidtools.everything', '-e', '--accept-package-agreements', '--accept-source-agreements', '--scope', 'machine' -Wait -NoNewWindow
    Start-Sleep -Seconds 3
    Refresh-EnvironmentPath
    Initialize-Everything
    return $script:EverythingReady
}

function Find-ViaEverything {
    param([string]$Name)
    if (-not $script:EverythingCliPath) { return $null }
    $args = @('-n', '5', '-sort-date-modified', $Name, 'ext:exe')
    try {
        $result = & $script:EverythingCliPath @args 2>$null
    }
    catch {
        return $null
    }

    $candidates = $result | Where-Object { $_ -and $_.Trim() }
    foreach ($line in $candidates) {
        $path = $line.Trim()
        if (-not $path) { continue }
        if ([System.IO.Path]::GetExtension($path).ToLowerInvariant() -ne '.exe') { continue }
        if (Safe-TestPath $path) { return $path }
    }

    return $null
}

function Locate-Or-Install {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$PackageId
    )

    Write-Log "Locating $Id..." "Info"

    if ($path = Find-ViaPath $Name) {
        Write-Log "Found in PATH: $path" "Success"
        return $path
    }

    if ($path = Find-ViaRegistry $Id $Name) {
        Write-Log "Found in Registry: $path" "Success"
        return $path
    }

    if ($path = Find-ViaAppx $Id $Name) {
        Write-Log "Found in Appx: $path" "Success"
        return $path
    }

    if ($path = Find-ViaStandardPaths $Id $Name) {
        Write-Log "Found in Standard Paths: $path" "Success"
        return $path
    }

    if (Ensure-Everything -Prompt:$false) {
        if ($path = Find-ViaEverything $Name) {
            Write-Log "Found via Everything: $path" "Success"
            return $path
        }
    }

    if (-not $PackageId) { return $null }
    if (-not (Get-Command 'winget' -ErrorAction SilentlyContinue)) {
        Write-Log "Winget not available; cannot install $Id automatically." "Warn"
        return $null
    }

    $confirm = Read-Host "Tool '$Id' ($Name) is missing. Install via Winget? (y/n)"
    if ($confirm -notmatch '^[yY]') { return $null }

    Write-Log "Installing $PackageId via Winget..." "Info"
    Start-Process -FilePath 'winget' -ArgumentList 'install', $PackageId, '-e', '--accept-package-agreements', '--accept-source-agreements' -Wait -NoNewWindow
    Refresh-EnvironmentPath

    if ($path = Find-ViaPath $Name) {
        Write-Log "Found after install (PATH): $path" "Success"
        return $path
    }

    if ($script:EverythingReady -or (Ensure-Everything -Prompt:$false)) {
        if ($path = Find-ViaEverything $Name) {
            Write-Log "Found after install (Everything): $path" "Success"
            return $path
        }
    }

    Write-Log "Unable to locate $Id after installation." "Warn"
    return $null
}

function Find-Executable {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$OverridePath,
        [string]$Id,
        [string]$PackageId
    )

    if ($OverridePath) {
        $resolved = Resolve-Path -LiteralPath $OverridePath -ErrorAction SilentlyContinue
        if ($resolved -and (Test-Path $resolved.Path)) { return $resolved.Path }
        throw "Override path for $Name not found: $OverridePath"
    }

    # If Locate-Or-Install is available (it should be, as it's in this file), use it.
    if (Get-Command Locate-Or-Install -ErrorAction SilentlyContinue) {
        $finalId = if ($Id) { $Id } else { $Name }
        return Locate-Or-Install -Name $Name -Id $finalId -PackageId $PackageId
    }

    # Fallback for when dot-sourced but somehow Locate-Or-Install is missing
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return (Resolve-Path $cmd.Source).Path }

    return $null
}
