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

# --- Tool Discovery & Polyfill ---
$repoRoot = if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..\..') -ErrorAction SilentlyContinue).Path } else { $null }
$helper = if ($repoRoot) { Join-Path $repoRoot 'scripts\everything.ps1' } else { $null }
if ($helper -and (Test-Path $helper)) { . $helper; if (Get-Command Ensure-Everything -ErrorAction SilentlyContinue) { [void](Ensure-Everything) } }
if (-not (Get-Command Find-Executable -ErrorAction SilentlyContinue)) {
    function Find-Executable {
        param($Name, $OverridePath, $Id, $PackageId)
        if ($OverridePath -and (Test-Path $OverridePath)) { return (Resolve-Path $OverridePath).Path }
        $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
        return if ($cmd) { (Resolve-Path $cmd.Source).Path } else { $null }
    }
}
# --- End Tool Discovery ---

# Everything helper provides shared routines.

# --- Execution ---

# 1. Validation
$svgFinal = if ($frontendPublicPath) { Join-Path $frontendPublicPath 'tinyTorrent.svg' } else { $null }
$svgPath = @($LocalSvg, $svgFinal) | Where-Object { $_ -and (Safe-TestPath $_) } | Select-Object -First 1
if (-not $svgPath) { Write-Log "Source SVG not found in branding or frontend." "Error"; exit 2 }
Write-Log "Using SVG: $svgPath"

# 2. Locate Tools
$inkPath = Find-Executable -Name "inkscape.exe" -Id "Inkscape" -PackageId "Inkscape.Inkscape"
if (-not $inkPath) { Write-Log "Inkscape required. Exiting." "Error"; exit 3 }

$magickPath = Find-Executable -Name "magick.exe" -Id "ImageMagick" -PackageId "ImageMagick.ImageMagick"
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
