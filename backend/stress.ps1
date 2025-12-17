param(
    # Kept for backwards compatibility.
    # Note: build.ps1 maps Release -> MinSizeRel and outputs to build\release.
    [ValidateSet('debug', 'release', 'minsize', 'Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'debug',
    [string]$TestExe = 'memory-leak-test.exe',
    [int]$Instances = 0,
    [int]$Runs = 0,
    [string]$TestArguments = '',
    [switch]$UseProcDump,
    [string]$ProcDumpPath = 'procdump.exe',
    [string]$DumpRoot = '',
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Write-Section {
    param([string]$Title)
    Write-Host "`n=== $Title ===" -ForegroundColor DarkCyan
}

function Format-TimeSpan {
    param([TimeSpan]$Span)
    if ($Span.TotalMilliseconds -lt 1000) { return "${([int]($Span.TotalMilliseconds))}ms" }
    if ($Span.TotalMinutes -lt 1) { return "${($Span.TotalSeconds):F2}s" }
    return "${($Span.TotalMinutes):F2}m ${($Span.Seconds):D2}s"
}

function Write-Detail {
    param([string]$Label, [string]$Value)
    Write-Host ("  {0}:`t{1}" -f $Label, $Value)
}

$scriptStartTime = Get-Date

if ($Help) {
    Write-Host @"
TinyTorrent Stress Helper

Usage: .\stress.ps1 [options]

Options:
  -Configuration <debug|release|minsize>   Build configuration (default: debug)
  -TestExe <name>                          Test executable (default: memory-leak-test.exe)
  -Instances <N>                           Number of parallel instances (default: CPU count)
  -Runs <N>                                Total batches to run (0 for infinite)
  -UseProcDump                             Capture crash dumps
  -ProcDumpPath <path>                     Path to procdump (searches Sysinternals dirs if not found)
  -DumpRoot <path>                         Dump output directory
"@
    exit 0
}

# --- Paths ---
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$buildDir = Join-Path $repoRoot 'build'

$configNorm = $Configuration.ToLowerInvariant()
$buildSubDir = switch ($configNorm) {
    'debug' { 'debug' }
    'release' { 'release' }
    'minsize' { 'release' }
    'minsizerel' { 'release' }
    default { $configNorm }
}

$testDir = Join-Path $buildDir $buildSubDir
$testDir = Join-Path $testDir 'tests'
$testPath = Join-Path $testDir $TestExe

if (-not (Test-Path $testPath)) {
    throw "Test executable not found: $testPath"
}

$cpuCount = [Environment]::ProcessorCount
# --- Defaults ---
if ($Instances -le 0) {
    $Instances = $cpuCount
}
if ($Instances -lt 1) { $Instances = 1 }

if (-not $DumpRoot) {
    $DumpRoot = Join-Path $buildDir 'test-dumps'
}

$runLabel = if ($Runs -eq 0) { 'infinite' } else { "$Runs" }
Write-Section 'Stress configuration'
Write-Detail 'Configuration' "$Configuration -> build/$buildSubDir"
Write-Detail 'Test executable' $testPath
Write-Detail 'Instances' $Instances
Write-Detail 'Runs requested' $runLabel
Write-Detail 'ProcDump enabled' $(if ($UseProcDump) { 'Yes' } else { 'No' })
Write-Detail 'Dump root' $DumpRoot
Write-Section 'Environment'
Write-Detail 'Machine' $env:COMPUTERNAME
Write-Detail 'CPU cores' $cpuCount
Write-Detail 'Start time' $scriptStartTime

# --- Resolve ProcDump ---
if ($UseProcDump) {
    # 1. Check user override or PATH
    $found = $false
    if (Test-Path $ProcDumpPath) {
        $procDumpExe = (Resolve-Path $ProcDumpPath).Path
        $found = $true
    }
    elseif (Get-Command $ProcDumpPath -ErrorAction SilentlyContinue) {
        $procDumpExe = (Get-Command $ProcDumpPath).Source
        $found = $true
    }
    
    # 2. Check standard install locations if not found
    if (-not $found) {
        $candidates = @(
            "$env:ProgramFiles\procdump\procdump.exe", 
            "$env:ProgramFiles\Sysinternals\procdump.exe",
            "${env:ProgramFiles(x86)}\Sysinternals\procdump.exe",
            "C:\Sysinternals\procdump.exe",
            "C:\Tools\Sysinternals\procdump.exe"
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) {
                $procDumpExe = $c
                $found = $true
                break
            }
        }
    }

    if (-not $found) {
        throw "Could not locate procdump.exe. Please install Sysinternals Suite or specify -ProcDumpPath."
    }
    
    Write-Host "Using ProcDump: $procDumpExe" -ForegroundColor Cyan
    New-Item -Path $DumpRoot -ItemType Directory -Force | Out-Null
}

# --- Helper Function ---
function Start-TestProcess {
    param($index, $runId)

    # Use unique port for each instance to prevent binding conflicts (8086 + index)
    $port = 8086 + ($index % 1000)
    
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.WorkingDirectory = $testDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
        
    # The DLLs are in build/debug, but tests are in build/debug/tests
    # We must add build/debug to the PATH so the test exe can find torrent-rasterbar.dll
    $dllDir = Split-Path -Parent $testDir
    
    # Also add vcpkg bin dirs just in case they weren't copied.
    # IMPORTANT: avoid mixing triplets (this can reintroduce ABI/CRT issues).
    $vcpkgBins = @()
    if ($buildSubDir -eq 'debug') {
        $triplet = 'x64-windows-asan'
        $tripletRoot = Join-Path $repoRoot "vcpkg_installed\$triplet"
        $candidates = @(
            (Join-Path $tripletRoot 'bin'),
            (Join-Path $tripletRoot 'debug\bin')
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) { $vcpkgBins += $c }
        }
    }
    
    # Try to locate Visual Studio MSVC bin (contains clang_rt.asan_dynamic etc.)
    $msvcBin = $null
    $vswhereCandidates = @(
        "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe",
        "$env:ProgramFiles(x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    )
    foreach ($c in $vswhereCandidates) {
        if (Test-Path $c) { $vswhere = $c; break }
    }
    if (-not $vswhere) {
        $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
        if ($cmd) { $vswhere = $cmd.Source }
    }
    if ($vswhere) {
        try {
            $vsRoot = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
            if ($vsRoot) {
                $msvcRoot = Join-Path $vsRoot 'VC\Tools\MSVC'
                if (Test-Path $msvcRoot) {
                    $versions = Get-ChildItem -Path $msvcRoot -Directory | Sort-Object Name -Descending
                    if ($versions -and $versions.Count -gt 0) {
                        $candidate = Join-Path $versions[0].FullName 'bin\Hostx64\x64'
                        if (Test-Path $candidate) { $msvcBin = $candidate }
                    }
                }
            }
        }
        catch {
            # ignore errors locating VS; we'll still try other paths
        }
    }

    $prefixParts = @()
    if ($msvcBin) { $prefixParts += $msvcBin }
    $prefixParts += $dllDir
    $prefixParts += $vcpkgBins
    $prefix = ($prefixParts -join ';')
    if ($prefix) { $prefix += ';' }
    $newPath = $prefix + $env:PATH
    
    if ($psi.EnvironmentVariables.ContainsKey('PATH')) {
        $psi.EnvironmentVariables['PATH'] = $newPath
    }
    else {
        $psi.EnvironmentVariables.Add('PATH', $newPath)
    }

    # Set environment variable for this specific process instance
    if ($psi.EnvironmentVariables.ContainsKey('TT_TEST_PORT')) {
        $psi.EnvironmentVariables['TT_TEST_PORT'] = $port.ToString()
    }
    else {
        $psi.EnvironmentVariables.Add('TT_TEST_PORT', $port.ToString())
    }

    if ($UseProcDump) {
        $iterationDumpDir = Join-Path $DumpRoot "run-$runId"
        New-Item -Path $iterationDumpDir -ItemType Directory -Force | Out-Null
        
        $psi.FileName = $procDumpExe
        # -accepteula -ma (full dump) -e (unhandled exception) -x (launch)
        $pArgs = @('-accepteula', '-ma', '-e', '-x', $iterationDumpDir, $testPath)
        if ($TestArguments) { $pArgs += $TestArguments }
        $psi.Arguments = $pArgs -join ' '
    }
    else {
        $psi.FileName = $testPath
        if ($TestArguments) { $psi.Arguments = $TestArguments }
    }

    return [System.Diagnostics.Process]::Start($psi)
}
# --- Main Loop ---
$runNumber = 0
$batchTimes = @()
$totalProcesses = 0
while ($Runs -eq 0 -or $runNumber -lt $Runs) {
    $runNumber++
    $batchStartTime = Get-Date
    Write-Section "Batch #$runNumber"
    Write-Detail 'Start time' $batchStartTime
    Write-Detail 'Launching' "$Instances instances of $TestExe"

    $processes = @()
    for ($idx = 0; $idx -lt $Instances; $idx++) {
        $processes += Start-TestProcess -index $idx -runId $runNumber
    }

    $batchFailed = $false
    foreach ($proc in $processes) {
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) {
            Write-Host "Instance $($proc.Id) failed with exit code $($proc.ExitCode)" -ForegroundColor Red
            $batchFailed = $true
        }
        $proc.Dispose()
    }
    
    if ($batchFailed) {
        Write-Host "Batch $runNumber failed." -ForegroundColor Red
        exit 1
    }
    $batchDuration = (Get-Date) - $batchStartTime
    $batchTimes += $batchDuration
    $totalProcesses += $processes.Count
    Write-Detail 'Duration' (Format-TimeSpan $batchDuration)
    Write-Detail 'Completed at' (Get-Date)
}

Write-Section 'Run summary'
Write-Detail 'Batches completed' $runNumber
Write-Detail 'Total processes' $totalProcesses
if ($batchTimes.Count -gt 0) {
    $totalTime = (Get-Date) - $scriptStartTime
    $avgTime = ([TimeSpan]::FromTicks(($batchTimes | Measure-Object -Property Ticks -Sum).Sum / $batchTimes.Count))
    Write-Detail 'Total duration' (Format-TimeSpan $totalTime)
    Write-Detail 'Average batch' (Format-TimeSpan $avgTime)
}
Write-Host 'Completed stress run without failure.' -ForegroundColor Green