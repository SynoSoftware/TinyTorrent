param(
    [ValidateSet('Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'Debug',
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',
    [switch]$Clean,
    [switch]$SkipTests,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host @"
TinyTorrent Build Script (Ultimate Edition)
- ABI-Safe (Forces toolchain/CRT synchronization)
- Diagnostic (Traps all exit codes)
- Auto-Discovery (Finds Meson/Ninja via Python)

Usage: .\build.ps1 [options]
"@
    exit 0
}

# -------------------------------------------------------------------------
# 1. Robust Execution Helper
# -------------------------------------------------------------------------
function Exec-Checked {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$ErrorMessage = "Command failed."
    )

    Write-Host "[$Command] $Arguments" -ForegroundColor Gray
    
    # We use & to stream output directly.
    & $Command @Arguments
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nERROR: $ErrorMessage" -ForegroundColor Red
        Write-Host "Exit Code: $LASTEXITCODE" -ForegroundColor Red
        throw "Build halted due to external command failure."
    }
}

# -------------------------------------------------------------------------
# 2. Advanced Tool Discovery (Python/Meson/Ninja)
# -------------------------------------------------------------------------
function Resolve-Executable {
    param($overridePath, $name, $candidateEntries, $installLauncher)

    if ($overridePath) {
        if (Test-Path $overridePath) { return $overridePath }
        throw "Override path for $name not found: $overridePath"
    }

    foreach ($entry in $candidateEntries) {
        if (-not $entry.Path) { continue }
        $candidate = Join-Path $entry.Path "$name.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    
    # Fallback to PATH lookup if Python lookup fails
    $cmd = Get-Command "$name.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    throw "$name not installed; run '$installLauncher -m pip install --user $name'."
}

function Get-PythonScriptsPath {
    param(
        [string]$LauncherCommand,
        [string]$LauncherVersion
    )

    try {
        $script = @'
import os, site, sysconfig, sys
base = site.USER_BASE
versioned = f"Python{sys.version_info.major}{sys.version_info.minor}"
candidates = [
    sysconfig.get_path("scripts"),
    os.path.join(base, versioned, "Scripts"),
    os.path.join(base, "Scripts"),
    os.path.join(base, "bin"),
]
for path in candidates:
    if path:
        print(path)
'@
        if ($LauncherVersion) {
            $output = & $LauncherCommand $LauncherVersion '-c' $script 2>$null
        }
        else {
            $output = & $LauncherCommand '-c' $script 2>$null
        }
        if (-not $output) { return @() }

        $paths = $output -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $uniquePaths = [System.Collections.Generic.HashSet[string]]::new()
        $validPaths = @()
        foreach ($path in $paths) {
            if (-not $uniquePaths.Add($path)) { continue }
            if (Test-Path $path) { $validPaths += $path }
        }
        return $validPaths
    }
    catch {
        return @()
    }
}

function Resolve-VsWhere {
    param($overridePath)
    if ($overridePath) {
        if (Test-Path $overridePath) { return $overridePath }
        throw "Override path for vswhere.exe not found: $overridePath"
    }
    $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) {
        $default = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path $default) { return $default }
    }
    throw 'Could not locate vswhere.exe; install Visual Studio 2017+ or provide a path via -VsWherePath.'
}

# -------------------------------------------------------------------------
# 3. Environment Setup (MSVC)
# -------------------------------------------------------------------------
function Import-VsEnvironment {
    param($vswhere)

    Write-Host "Locating Visual Studio..." -ForegroundColor Cyan
    $vsInstallArgs = @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath')
    $vsInstallPath = (& $vswhere @vsInstallArgs) | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
    if (-not $vsInstallPath) {
        throw 'Unable to locate a Visual Studio installation that contains the MSVC toolset.'
    }

    $vcvarsPath = Join-Path $vsInstallPath 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path $vcvarsPath)) {
        throw "Could not find vcvars64.bat under $vsInstallPath."
    }

    Write-Host "Activating VS Environment..."
    $cmd = "`"$vcvarsPath`" amd64 && set"
    $envOutput = & cmd /c $cmd
    foreach ($line in ($envOutput -split "`r?`n")) {
        if (-not $line) { continue }
        $parts = $line -split ('=', 2)
        if ($parts.Count -ne 2) { continue }
        Set-Item -Path ("Env:" + $parts[0]) -Value $parts[1]
    }
    
    try {
        $clVer = & cl.exe 2>&1 | Select-String "Version" | Select-Object -First 1
        Write-Host "Active Toolset: $clVer" -ForegroundColor Green
    }
    catch {
        throw "Environment activation failed; cl.exe not found."
    }
}

# -------------------------------------------------------------------------
# Main Logic
# -------------------------------------------------------------------------

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
$buildDir = Join-Path $repoRoot 'build'

if (-not (Test-Path $vcpkgDir)) { throw 'vcpkg directory not found. Run setup.ps1 first.' }
if (-not (Test-Path $vcpkgExe)) { throw 'vcpkg.exe not found; run setup.ps1 first.' }

# Setup VS Env
$vswhereExe = Resolve-VsWhere $VsWherePath
Import-VsEnvironment $vswhereExe

# Python/Meson Discovery
$pythonLaunchers = @(
    [pscustomobject]@{ Command = 'py'; Version = '-3' },
    [pscustomobject]@{ Command = 'py'; Version = '' },
    [pscustomobject]@{ Command = 'python3'; Version = '' },
    [pscustomobject]@{ Command = 'python'; Version = '' }
)

$pythonScriptEntries = @()
foreach ($launcher in $pythonLaunchers) {
    if (Get-Command $launcher.Command -ErrorAction SilentlyContinue) {
        $candidatePaths = Get-PythonScriptsPath -LauncherCommand $launcher.Command -LauncherVersion $launcher.Version
        foreach ($path in $candidatePaths) {
            $pythonScriptEntries += [pscustomobject]@{
                LauncherCommand = $launcher.Command
                LauncherVersion = $launcher.Version
                Path            = $path
            }
        }
    }
}

if ($pythonScriptEntries.Count -eq 0) {
    # Fallback: assume user might have meson on PATH even if python discovery fails
    Write-Host "Warning: Could not discover Python scripts path via launcher. Relying on PATH." -ForegroundColor Yellow
}

$preferredLauncher = if ($pythonScriptEntries.Count -gt 0) { $pythonScriptEntries[0] } else { $null }
$installLauncher = if ($preferredLauncher) { ("{0} {1}" -f $preferredLauncher.LauncherCommand, $preferredLauncher.LauncherVersion).Trim() } else { "pip" }

$mesonExe = Resolve-Executable $MesonPath 'meson' $pythonScriptEntries $installLauncher
$ninjaExe = Resolve-Executable $NinjaPath 'ninja' $pythonScriptEntries $installLauncher

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
$mesonBuildType = ''
$configSubdir = ''
$loggingArg = 'true'
$testsArg = 'true'
$vscrt = 'md'

switch ($Configuration) {
    'Debug' {
        $mesonBuildType = 'debug'
        $configSubdir = 'debug'
    }
    'Release' {
        $mesonBuildType = 'minsize'
        $configSubdir = 'release'
        $loggingArg = 'false'
        $testsArg = 'false'
        $vscrt = 'mt'
    }
    'MinSizeRel' {
        $mesonBuildType = 'minsize'
        $configSubdir = 'minsize'
        $loggingArg = 'false'
        $testsArg = 'false'
        $vscrt = 'mt'
    }
}

if ($SkipTests) { $testsArg = 'false' }

$mesonBuildDir = Join-Path $buildDir $configSubdir

if ($Clean -and (Test-Path $mesonBuildDir)) {
    Write-Host "Cleaning build directory: $mesonBuildDir"
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

# -------------------------------------------------------------------------
# 4. VCPKG Dependencies (ABI-Safe + Checked Execution)
# -------------------------------------------------------------------------
$vcpkgTriplet = if ($Configuration -eq 'Debug') { 'x64-windows-asandebug' } else { 'x64-windows-static' }
$useStaticVcpkg = $vcpkgTriplet -eq 'x64-windows-static'
$env:VCPKG_DEFAULT_TRIPLET = $vcpkgTriplet

# Clean builddir if switching triplet types (avoids cache collisions)
if ($useStaticVcpkg -and (Test-Path $mesonBuildDir)) {
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ("Installing manifest dependencies via vcpkg ({0})..." -f $vcpkgTriplet) -ForegroundColor Cyan
Push-Location $vcpkgDir
try {
    # CRITICAL: --no-binarycaching to enforce ABI match
    # CRITICAL: Exec-Checked to catch build failures immediately
    Exec-Checked $vcpkgExe @('install', '--triplet', $vcpkgTriplet, '--recurse', '--no-binarycaching') `
        -ErrorMessage "Vcpkg installation/build failed."
}
finally {
    Pop-Location
}

# Setup CMake prefix for Meson
Set-Location $repoRoot
$vcpkgTripletRoot = Join-Path $repoRoot 'vcpkg_installed'
$vcpkgTripletRoot = Join-Path $vcpkgTripletRoot $vcpkgTriplet
$vcpkgShare = Join-Path $vcpkgTripletRoot 'share'
$prefixPaths = @()
if (Test-Path $vcpkgShare) { $prefixPaths += $vcpkgShare }
if (Test-Path $vcpkgTripletRoot) { $prefixPaths += $vcpkgTripletRoot }

if ($prefixPaths.Count -gt 0) {
    $newPrefixValue = $prefixPaths -join ';'
    $env:CMAKE_PREFIX_PATH = "$newPrefixValue;$env:CMAKE_PREFIX_PATH"
}

# -------------------------------------------------------------------------
# 5. Meson Configuration (Checked)
# -------------------------------------------------------------------------
$mesonArgs = @('setup', '--backend=ninja')
if (-not $useStaticVcpkg) {
    $mesonInfo = Join-Path $mesonBuildDir 'meson-info'
    if (Test-Path $mesonInfo) {
        $mesonArgs += '--reconfigure'
    }
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
# Enable ASAN for Debug builds to match the user's request
if ($mesonBuildType -eq 'debug') {
    $mesonArgs += "-Db_sanitize=address"
}
else {
    $mesonArgs += "-Db_sanitize=none"
}

if ($mesonBuildType -ne 'debug') {
    $mesonArgs += '-Db_lto=true'
    $mesonArgs += '-Dstrip=true'
}
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson..." -ForegroundColor Cyan
Exec-Checked $mesonExe $mesonArgs -ErrorMessage "Meson configuration failed."

# -------------------------------------------------------------------------
# 6. Build (Checked)
# -------------------------------------------------------------------------
Write-Host "Building ($Configuration)..." -ForegroundColor Cyan
Exec-Checked $ninjaExe @('-C', $mesonBuildDir) -ErrorMessage "Build failed."

# -------------------------------------------------------------------------
# 7. Detailed Test Harness
# -------------------------------------------------------------------------
$testsEnabled = ($testsArg -eq 'true') -and (-not $SkipTests)

if ($testsEnabled) {
    Write-Host "Running tests..." -ForegroundColor Cyan
    
    # Graceful PATH augmentation for DLLs
    $testBinDirs = @()
    $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
    $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
    if (Test-Path $releaseBin) { $testBinDirs += $releaseBin }
    if (Test-Path $debugBin) { $testBinDirs += $debugBin }

    $originalPath = $env:PATH
    if ($testBinDirs.Count -gt 0) {
        $env:PATH = ($testBinDirs -join ';') + ';' + $env:PATH
    }

    $testResults = @()
    $runSucceeded = $true
    try {
        $testDir = Join-Path $mesonBuildDir 'tests'
        $testExecutables = @(
            'dispatcher-test.exe',
            'rpc-endpoint-test.exe',
            'memory-leak-test.exe',
            'rpc-filesystem-test.exe',
            'serializer-test.exe'
        )

        foreach ($testExe in $testExecutables) {
            $testPath = Join-Path $testDir $testExe
            if (-not (Test-Path $testPath)) {
                Write-Host "Warning: $testExe not found (skipped)" -ForegroundColor Yellow
                continue
            }
            Write-Host "  Running $testExe"
            
            # Capture output AND check exit code
            $testOutput = & $testPath 2>&1 | Out-String
            $testExitCode = $LASTEXITCODE
            $trimmedOutput = $testOutput.Trim()
            
            $testResults += [pscustomobject]@{
                Name     = $testExe
                ExitCode = $testExitCode
                Output   = $trimmedOutput
            }
            
            if ($testExitCode -ne 0) {
                Write-Host ("    FAIL (exit code {0})" -f $testExitCode) -ForegroundColor Red
                if ($trimmedOutput) {
                    Write-Host "    -- captured output --"
                    Write-Host $trimmedOutput
                }
                $runSucceeded = $false
                # Stop on first failure
                break 
            }
            Write-Host "    PASS" -ForegroundColor Green
        }

        if (-not $runSucceeded) {
            throw "One or more tests failed; check the log."
        }
    }
    finally {
        $env:PATH = $originalPath
        
        # Log generation
        $logLines = @()
        $timestamp = Get-Date -Format o
        $logLines += "[ {0} - {1} ]" -f $timestamp, $Configuration
        foreach ($entry in $testResults) {
            $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            $statusLine = "{0} {1} exit={2}" -f $status, $entry.Name, $entry.ExitCode
            $logLines += $statusLine
            if ($entry.ExitCode -ne 0 -and $entry.Output) {
                $logLines += "  Output: $($entry.Output)"
            }
        }
        if ($logLines.Count -gt 0) {
            $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
            Add-Content -Path $testLogFile -Value $logLines
        }
    }
}
else {
    Write-Host "Tests are disabled for configuration $Configuration; skipping."
}

# -------------------------------------------------------------------------
# 8. Runtime Artifact Copying (DLLs)
# -------------------------------------------------------------------------
if (-not $useStaticVcpkg) {
    $runtimeDlls = @(
        'torrent-rasterbar.dll',
        'yyjson.dll',
        'libssl-3-x64.dll',
        'libcrypto-3-x64.dll'
    )
    $runtimeRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
    $runtimeSourceDir = if ($Configuration -eq 'Debug') {
        Join-Path $runtimeRoot 'debug\bin'
    }
    else {
        Join-Path $runtimeRoot 'bin'
    }
    
    if (Test-Path $runtimeSourceDir) {
        foreach ($dll in $runtimeDlls) {
            $source = Join-Path $runtimeSourceDir $dll
            if (Test-Path $source) {
                Copy-Item -Path $source -Destination $mesonBuildDir -Force
            }
        }
    }
}

# -------------------------------------------------------------------------
# 9. Summary
# -------------------------------------------------------------------------
$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
    $lengthKb = (Get-Item $exePath).Length / 1024.0
    Write-Host $exePath -ForegroundColor Green
    Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
}
else {
    Write-Host "Warning: Executable not found at $exePath" -ForegroundColor Yellow
}