<#
.SYNOPSIS
    Smart ICO Generator.
    Strategy: Instant Lookups -> Silent Everything Use -> Everything Install (Prompt) -> Tool Install (Prompt).
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

# --- Configuration ---
if (-not (Test-Path variable:PSScriptRoot)) { $PSScriptRoot = Get-Location }
if (-not (Test-Path variable:BrandingDir)) { $BrandingDir = $PSScriptRoot }
$LocalSvg = Join-Path $BrandingDir "tinyTorrent.svg"
if (-not (Test-Path variable:frontendPublicPath)) { $frontendPublicPath = $null }

# Global State
$script:EsPath = $null
$script:EverythingReady = $false
$script:EverythingAsked = $false

# --- Logging ---
function Write-Log {
    param([string]$Message, [string]$Level = 'Info')
    $c = switch ($Level) { 'Info' { 'Cyan' } 'Warn' { 'Yellow' } 'Error' { 'Red' } 'Success' { 'Green' } default { 'White' } }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')][$Level] $Message" -ForegroundColor $c
}

function Safe-TestPath {
    param([string]$Path)
    try { return Test-Path $Path -ErrorAction Stop } catch { return $false }
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

# --- STAGE 1: Instant Search Strategies ---

function Find-ViaPath {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return (Resolve-Path $cmd.Source).Path }
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

# --- STAGE 2: Everything Ecosystem ---

function Initialize-Everything-Silent {
    <# Checks if Everything is ALREADY installed and running. Does not prompt. #>
    
    # 1. Locate es.exe
    $candidates = @(
        "$env:LOCALAPPDATA\voidtools\es.exe",
        "$env:ProgramFiles\Everything\es.exe",
        "${env:ProgramFiles(x86)}\Everything\es.exe",
        "$env:ChocolateyInstall\bin\es.exe"
    )
    
    # Check PATH first
    if ($cmd = Get-Command "es.exe" -ErrorAction SilentlyContinue) { 
        $script:EsPath = (Resolve-Path $cmd.Source).Path
    }
    else {
        foreach ($c in $candidates) { if (Safe-TestPath $c) { $script:EsPath = $c; break } }
    }

    # 2. Check Engine Status
    $engine = Get-Process "Everything" -ErrorAction SilentlyContinue
    
    if (-not $engine -and $script:EsPath) {
        # es.exe exists, but engine is off. Try to wake it up silently.
        $exeCandidates = @(
            "${env:ProgramFiles}\Everything\Everything.exe",
            "${env:ProgramFiles(x86)}\Everything\Everything.exe"
        )
        foreach ($exe in $exeCandidates) {
            if (Safe-TestPath $exe) {
                Start-Process $exe -WindowStyle Hidden
                Start-Sleep -Seconds 1
                $engine = Get-Process "Everything" -ErrorAction SilentlyContinue
                break
            }
        }
    }

    $script:EverythingReady = ($script:EsPath -ne $null) -and ($engine -ne $null)
    if ($script:EverythingReady) { Write-Log "Deep Search (Everything) is available." "Info" }
}

function Install-Everything-Interactive {
    <# Downloads es.exe and installs Engine via Winget upon user request #>
    Write-Log "Initializing Everything Installation..." "Info"

    # 1. Install CLI
    if (-not $script:EsPath) {
        $installDir = Join-Path $env:LOCALAPPDATA "voidtools"
        try {
            New-Item -ItemType Directory -Path $installDir -Force | Out-Null
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest "https://www.voidtools.com/Es.zip" -OutFile "$env:TEMP\Es.zip" -UseBasicParsing
            Expand-Archive "$env:TEMP\Es.zip" -DestinationPath $installDir -Force
            $script:EsPath = Join-Path $installDir "es.exe"
            $env:Path += ";$installDir" 
        }
        catch { Write-Log "Failed to install es.exe" "Error" }
    }

    # 2. Install Engine
    if (-not (Get-Process "Everything" -ErrorAction SilentlyContinue)) {
        if (Get-Command "winget" -ErrorAction SilentlyContinue) {
            Start-Process "winget" -ArgumentList "install voidtools.everything -e --accept-package-agreements --accept-source-agreements --scope machine" -Wait
            # Try to start it
            $pf = "${env:ProgramFiles}\Everything\Everything.exe"
            if (Safe-TestPath $pf) { Start-Process $pf -WindowStyle Hidden }
            Start-Sleep -Seconds 3
        }
    }
    
    Initialize-Everything-Silent # Re-check status
}

function Find-ViaEverything {
    param([string]$Name)
    if (-not $script:EverythingReady) { return $null }
    
    # Query: Filename is $Name AND Extension is exe AND NOT in Windows folder
    $query = "$Name ext:exe !C:\Windows"
    $res = & $script:EsPath $query -n 1 -w -sort-date-modified 2>&1
    if ($res -isnot [System.Management.Automation.ErrorRecord] -and (Safe-TestPath $res)) { return $res }
    return $null
}

# --- STAGE 3: Tool Installation ---

function Install-Tool {
    param([string]$Name, [string]$Id, [string]$PackageId)
    
    $reply = Read-Host "Tool '$Id' ($Name) is missing. Install it via Winget? (Y/N)"
    if ($reply -match "^[yY]") {
        if (Get-Command "winget" -ErrorAction SilentlyContinue) {
            Start-Process "winget" -ArgumentList "install $PackageId -e --accept-package-agreements --accept-source-agreements" -Wait
            # Refresh Path
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            return $true
        }
        else {
            Write-Log "Winget not found. Please install $Id manually." "Error"
        }
    }
    return $false
}

# --- Main Logic Controller ---

function Locate-Or-Install {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$PackageId
    )

    Write-Log "Locating $Id..." "Info"

    # 1. Instant Check (Fast, No prompts)
    if ($p = Find-ViaPath $Name) { Write-Log "Found in PATH: $p" "Success"; return $p }
    if ($p = Find-ViaRegistry $Id $Name) { Write-Log "Found in Registry: $p" "Success"; return $p }
    if ($p = Find-ViaAppx $Id $Name) { Write-Log "Found in Appx: $p" "Success"; return $p }
    if ($p = Find-ViaStandardPaths $Id $Name) { Write-Log "Found in Std Paths: $p" "Success"; return $p }

    # 2. Everything Check
    
    # 2a. Try silent usage first
    if (-not $script:EverythingReady) { Initialize-Everything-Silent }

    if ($script:EverythingReady) {
        if ($p = Find-ViaEverything $Name) { Write-Log "Found via Everything: $p" "Success"; return $p }
    } 
    elseif (-not $script:EverythingAsked) {
        # 2b. If Silent failed, prompt user to install Everything (ONCE per script run)
        Write-Log "Standard search failed." "Warn"
        $script:EverythingAsked = $true
        $reply = Read-Host "Do you want to install/configure 'Everything' for a deep system scan? (Y/N)"
        if ($reply -match "^[yY]") {
            Install-Everything-Interactive
            if ($script:EverythingReady) {
                if ($p = Find-ViaEverything $Name) { Write-Log "Found via Everything: $p" "Success"; return $p }
            }
        }
    }

    # 3. Install Tool (Last Resort)
    if (Install-Tool $Name $Id $PackageId) {
        # Quick re-check via Path/Registry after install
        if ($p = Find-ViaPath $Name) { return $p }
        if ($p = Find-ViaRegistry $Id $Name) { return $p }
        # Re-check Everything if active
        if ($script:EverythingReady) {
            if ($p = Find-ViaEverything $Name) { return $p }
        }
    }

    return $null
}

# --- Execution ---

# 1. Validation
$svgFinal = if ($frontendPublicPath) { Join-Path $frontendPublicPath 'tinyTorrent.svg' } else { $null }
$svgPath = @($LocalSvg, $svgFinal) | Where-Object { $_ -and (Safe-TestPath $_) } | Select-Object -First 1
if (-not $svgPath) { Write-Log "Source SVG not found in branding or frontend." "Error"; exit 2 }
Write-Log "Using SVG: $svgPath"

# 2. Locate Tools
$inkPath = Locate-Or-Install -Name "inkscape.exe" -Id "Inkscape" -PackageId "Inkscape.Inkscape"
if (-not $inkPath) { Write-Log "Inkscape required. Exiting." "Error"; exit 3 }

$magickPath = Locate-Or-Install -Name "magick.exe" -Id "ImageMagick" -PackageId "ImageMagick.ImageMagick"
if (-not $magickPath) { Write-Log "ImageMagick required. Exiting." "Error"; exit 4 }

# 3. Process
$sizes = 16, 24, 32, 48, 256
$genFiles = @()

Push-Location $BrandingDir
try {
    foreach ($s in $sizes) {
        $out = "icon-$s.png"
        
        # Modern Syntax
        $p = Start-Process $inkPath -ArgumentList @("--export-type=png", "--export-width=$s", "--export-filename=$out", "$svgPath") -Wait -PassThru -NoNewWindow
        
        # Legacy Fallback
        if ($p.ExitCode -ne 0 -or -not (Safe-TestPath $out)) {
            Start-Process $inkPath -ArgumentList @("--export-png=$out", "--export-width=$s", "$svgPath") -Wait -NoNewWindow
        }

        if (-not (Safe-TestPath $out)) { throw "Failed to generate $out" }
        $genFiles += (Resolve-Path $out).Path
    }

    $icoPath = Join-Path $BrandingDir "TinyTorrent.ico"
    Write-Log "Packing ICO..." "Info"
    $p = Start-Process $magickPath -ArgumentList ($genFiles + @($icoPath)) -Wait -PassThru -NoNewWindow

    if ($p.ExitCode -eq 0 -and (Safe-TestPath $icoPath)) {
        Write-Log "ICO Generated: $icoPath" "Success"
        # Deploy
        $repoRoot = Resolve-Path (Join-Path $BrandingDir '..\..') -ErrorAction SilentlyContinue
        if ($repoRoot) {
            $dest = Join-Path $repoRoot 'backend\branding'
            if (-not (Safe-TestPath $dest)) { New-Item -Type Dir -Path $dest -Force | Out-Null }
            Copy-Item $icoPath $dest -Force
            Write-Log "Deployed to $dest" "Success"
        }
    }
    else { throw "Packing failed." }
}
catch {
    Write-Log $_ "Error"
    exit 1
}
finally {
    foreach ($f in $genFiles) { if (Safe-TestPath $f) { Remove-Item $f -Force } }
    Pop-Location
}
exit 0
