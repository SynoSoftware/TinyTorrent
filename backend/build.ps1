param(
    [ValidateSet('Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'Debug',
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',
    [switch]$Clean,
    [switch]$SkipTests, # Added simple skip switch
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host @"
TinyTorrent Build Script

Usage: .\build.ps1 [options]

Options:
  -Configuration <Debug|Release|MinSizeRel>  Build configuration (default: Debug)
  -Clean                                     Remove the build directory before configuring
  -SkipTests                                 Build only, do not run tests
  -MesonPath <path>                          Override meson.exe location
  -NinjaPath <path>                          Override ninja.exe location
  -VsWherePath <path>                        Override vswhere.exe location
  -Help                                      Show this help message
"@
    exit 0
}

function Get-UserScriptsPath {
    try {
        $pythonVersioned = & python -c "import os, site, sys; base = site.USER_BASE; ver = 'Python{}{}'.format(sys.version_info.major, sys.version_info.minor); print(os.path.join(base, ver, 'Scripts'))"
        $pythonBase = & python -c "import os, site; print(os.path.join(site.USER_BASE, 'Scripts'))"
        $paths = @()
        if ($pythonVersioned) { $paths += $pythonVersioned.Trim() }
        if ($pythonBase -and $pythonBase.Trim() -ne $pythonVersioned.Trim()) { $paths += $pythonBase.Trim() }
        return $paths
    }
    catch {
        throw 'Unable to determine the Python user scripts path; ensure Python 3.9+ is on PATH.'
    }
}

function Resolve-Executable {
    param($overridePath, $name, $candidateDirs)

    if ($overridePath) {
        if (Test-Path $overridePath) { return $overridePath }
        throw "Override path for $name not found: $overridePath"
    }

    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    foreach ($dir in $candidateDirs) {
        if (-not $dir) { continue }
        $candidate = Join-Path $dir "$name.exe"
        if (Test-Path $candidate) { return $candidate }
    }

    throw "Could not locate $name; install it with `python -m pip install --user $name` or pass -${name}Path."
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

function Import-VsEnvironment {
    param($vswhere)

    $vsInstallArgs = @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath')
    $vsInstallPath = (& $vswhere @vsInstallArgs) | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
    if (-not $vsInstallPath) {
        throw 'Unable to locate a Visual Studio installation that contains the MSVC toolset.'
    }

    $vcvarsPath = Join-Path $vsInstallPath 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path $vcvarsPath)) {
        throw "Could not find vcvars64.bat under $vsInstallPath."
    }

    $cmd = "`"$vcvarsPath`" amd64 && set"
    $envOutput = & cmd /c $cmd
    foreach ($line in ($envOutput -split "`r?`n")) {
        if (-not $line) { continue }
        $parts = $line -split ('=', 2)
        if ($parts.Count -ne 2) { continue }
        Set-Item -Path ("Env:" + $parts[0]) -Value $parts[1]
    }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
$buildDir = Join-Path $repoRoot 'build'

if (-not (Test-Path $vcpkgDir)) {
    throw 'vcpkg directory not found. Run setup.ps1 first.'
}
if (-not (Test-Path $vcpkgExe)) {
    throw 'vcpkg.exe not found; run setup.ps1 first.'
}

$vswhereExe = Resolve-VsWhere $VsWherePath
Import-VsEnvironment $vswhereExe

$userScriptDirs = Get-UserScriptsPath
$mesonExe = Resolve-Executable $MesonPath 'meson' $userScriptDirs
$ninjaExe = Resolve-Executable $NinjaPath 'ninja' $userScriptDirs

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

if ($SkipTests) {
    $testsArg = 'false'
}

$mesonBuildDir = Join-Path $buildDir $configSubdir

if ($Clean -and (Test-Path $mesonBuildDir)) {
    Write-Host "Cleaning build directory: $mesonBuildDir"
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

$vcpkgTriplet = if ($Configuration -eq 'Debug') { 'x64-windows' } else { 'x64-windows-static' }
$useStaticVcpkg = $vcpkgTriplet -eq 'x64-windows-static'
$env:VCPKG_DEFAULT_TRIPLET = $vcpkgTriplet

Write-Host ("Installing manifest dependencies via vcpkg ({0})..." -f $vcpkgTriplet)
Push-Location $vcpkgDir
try {
    & $vcpkgExe install --triplet $vcpkgTriplet
}
finally {
    Pop-Location
}

Set-Location $repoRoot

$vcpkgTripletRoot = Join-Path $repoRoot 'vcpkg_installed'
$vcpkgTripletRoot = Join-Path $vcpkgTripletRoot $vcpkgTriplet
$vcpkgShare = Join-Path $vcpkgTripletRoot 'share'
$vcpkgRoot = $vcpkgTripletRoot
$prefixPaths = @()
if (Test-Path $vcpkgShare) { $prefixPaths += $vcpkgShare }
if (Test-Path $vcpkgRoot) { $prefixPaths += $vcpkgRoot }
if ($prefixPaths.Count -gt 0) {
    $newPrefixValue = $prefixPaths -join ';'
    if ($env:CMAKE_PREFIX_PATH) {
        $env:CMAKE_PREFIX_PATH = "$newPrefixValue;$env:CMAKE_PREFIX_PATH"
    }
    else {
        $env:CMAKE_PREFIX_PATH = $newPrefixValue
    }
}

if ($useStaticVcpkg -and (Test-Path $mesonBuildDir)) {
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

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
if ($mesonBuildType -ne 'debug') {
    $mesonArgs += '-Db_lto=true'
    $mesonArgs += '-Dstrip=true'
}
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson/Ninja..."
& $mesonExe @mesonArgs

Write-Host "Building ($Configuration)..."
& $ninjaExe -C $mesonBuildDir
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -ne 0) {
    Write-Host "Build failed with exit code $buildExitCode" -ForegroundColor Red
    exit $buildExitCode
}

$testsEnabled = ($testsArg -eq 'true') -and (-not $SkipTests)

if ($testsEnabled) {
    Write-Host "Running tests..."
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
                # Some configurations might not build all tests, warn but don't fail immediately
                Write-Host "Warning: $testExe not found (skipped)" -ForegroundColor Yellow
                continue
            }
            Write-Host "  Running $testExe"
            
            # Simple run, output capture
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
                # Stop on first failure for quick feedback
                break 
            }
            Write-Host "    PASS"
        }

        if (-not $runSucceeded) {
            throw "One or more tests failed; check the log."
        }
    }
    finally {
        $env:PATH = $originalPath
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
    else {
        Write-Host "Warning: runtime dependency directory missing: $runtimeSourceDir"
    }
    
    # Just list files, don't spam
    # Write-Host "Runtime DLLs copied."
}
else {
    Write-Host "Static vcpkg triplet in use; runtime DLLs are linked statically."
}

$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
    $lengthKb = (Get-Item $exePath).Length / 1024.0
    Write-Host $exePath
    Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
}
else {
    Write-Host ('Executable not found: {0}' -f $exePath)
}