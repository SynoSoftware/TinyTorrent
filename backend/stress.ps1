param(
    # Kept for backwards compatibility.
    # Note: build.ps1 maps Release -> MinSizeRel and outputs to build\release.
    [ValidateSet('debug', 'release', 'minsize', 'Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'debug',
    [string]$TestExe = 'memory-leak-test.exe',
    [switch]$AllTests,
    [ValidateSet('weighted', 'roundrobin', 'Weighted', 'RoundRobin')]
    [string]$Schedule = 'weighted',
    [switch]$RoundRobin,
    # Weighted scheduling bias. 0 = uniform random, higher = stronger preference for short tests.
    # Default 0.5 matches 1/sqrt(avg_ms).
    [double]$WeightExponent = 0.5,
    [double]$WeightStep = 0.1,
    # Controls how the scheduler learns test runtime.
    # - mean: cumulative average over all runs (stable, slow to react)
    # - ewma: exponential moving average (reacts quickly); use -EwmaAlpha to tune
    [ValidateSet('mean', 'ewma', 'Mean', 'Ewma')]
    [string]$Average = 'ewma',
    # EWMA alpha in (0, 1]. Higher = reacts faster to changes.
    [ValidateRange(0.01, 1.0)]
    [double]$EwmaAlpha = 0.2,
    [int]$Instances = 0,
    [int]$Runs = 0,
    [string]$TestArguments = '',
    [int]$StatusIntervalMs = 1000,
    # Output control:
    # - fail: only print failures (recommended)
    # - all: print START/PASS/FAIL
    # - none: print no per-test lines (status line only)
    [ValidateSet('fail', 'all', 'none', 'Fail', 'All', 'None')]
    [string]$Events = 'fail',
    # Show compact weight/odds summary on the status line (toggle during run with 'w')
    [switch]$ShowWeights,
    [switch]$ContinueOnFailure,
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
    if ($Span.TotalMilliseconds -lt 1000) {
        return "{0}ms" -f [int]$Span.TotalMilliseconds
    }
    if ($Span.TotalSeconds -lt 60) {
        return "{0:F2}s" -f $Span.TotalSeconds
    }

    $totalSeconds = [int][math]::Floor($Span.TotalSeconds)
    $hours = [int]($totalSeconds / 3600)
    $minutes = [int](($totalSeconds % 3600) / 60)
    $seconds = [int]($totalSeconds % 60)

    if ($hours -gt 0) {
        return "{0}h {1:D2}m {2:D2}s" -f $hours, $minutes, $seconds
    }
    return "{0}m {1:D2}s" -f $minutes, $seconds
}

function Write-Detail {
    param([string]$Label, [string]$Value)
    Write-Host ("  {0}:`t{1}" -f $Label, $Value)
}

function Get-TotalCpuUsagePercent {
    try {
        if ($null -eq $script:cpuCounter) {
            $script:cpuCounter = New-Object System.Diagnostics.PerformanceCounter('Processor', '% Processor Time', '_Total')
            # Warm-up read (first sample is typically 0 or stale)
            [void]$script:cpuCounter.NextValue()
            $script:cpuCounterReadyAt = Get-Date
        }

        # Give the perf counter a moment to produce a real value.
        if ($null -ne $script:cpuCounterReadyAt -and ((Get-Date) - $script:cpuCounterReadyAt).TotalMilliseconds -lt 250) {
            return $null
        }

        $v = [double]$script:cpuCounter.NextValue()
        if ($v -lt 0) { $v = 0 }
        if ($v -gt 100) { $v = 100 }
        return $v
    }
    catch {
        return $null
    }
}

$scriptStartTime = Get-Date

if ($Help) {
    Write-Host @"
TinyTorrent Stress Helper

Usage: .\stress.ps1 [options]

Options:
    -Configuration <debug|release|minsize>   Build configuration (default: debug)
    -TestExe <name>                          Single test exe to run (default: memory-leak-test.exe)
    -AllTests                                Run all '*-test.exe' in the tests folder
    -Schedule <weighted|roundrobin>           Scheduling mode when running all tests (default: weighted)
    -RoundRobin                              Shortcut for -Schedule roundrobin
    -Average <mean|ewma>                      Runtime learning mode for weighted scheduling (default: ewma)
    -EwmaAlpha <0.01..1.0>                    EWMA alpha (default: 0.2). Higher reacts faster.
    -Instances <N>                           Number of parallel instances (default: CPU count)
    -Runs <N>                                0=infinite; if -AllTests: runs PER TEST; else: batch count equivalent
    -StatusIntervalMs <N>                    Live status interval (default: 1000ms)
    -Events <fail|all|none>                   Per-test output verbosity (default: fail)
    -ShowWeights                              Show weight/odds summary on status line (toggle with 'w')
    -ContinueOnFailure                       Keep going after failures (still reports them)
    -UseProcDump                             Capture crash dumps
    -ProcDumpPath <path>                     Path to procdump (searches Sysinternals dirs if not found)
    -DumpRoot <path>                         Dump output directory

Controls:
    Press 'q' to stop gracefully (no new launches; waits running tests).
    Press '[' ']' to decrease/increase weighted bias (more/less preference for short tests).
    Press 'w' to toggle weight summary on the status line.
    Press 'v' to cycle event verbosity (fail -> all -> none).
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

if (-not (Test-Path $testDir)) {
    throw "Tests directory not found: $testDir"
}

$testExeProvided = $PSBoundParameters.ContainsKey('TestExe')
$resolvedAllTests = $AllTests -or (-not $testExeProvided) -or ($TestExe -eq '') -or ($TestExe -eq 'all') -or ($TestExe -eq '*')
$tests = @()
if ($resolvedAllTests) {
    $tests = Get-ChildItem -Path $testDir -Filter '*-test.exe' | Sort-Object Name
    if (-not $tests -or $tests.Count -lt 1) {
        throw "No test executables found in: $testDir"
    }
}
else {
    $testPath = Join-Path $testDir $TestExe
    if (-not (Test-Path $testPath)) {
        throw "Test executable not found: $testPath"
    }
    $tests = @((Get-Item $testPath))
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
$scheduleNorm = if ($RoundRobin) { 'roundrobin' } else { $Schedule.ToLowerInvariant() }
$averageNorm = $Average.ToLowerInvariant()
$script:eventsNorm = $Events.ToLowerInvariant()
$script:showWeights = [bool]$ShowWeights
$script:lastStatusText = ''
$script:lastStatusAt = Get-Date
$script:statusEnabled = ($StatusIntervalMs -gt 0)
$script:missingDumpOnFailure = $false
Write-Section 'Stress configuration'
Write-Detail 'Configuration' "$Configuration -> build/$buildSubDir"
if ($resolvedAllTests) {
    Write-Detail 'Tests' ("all ({0})" -f $tests.Count)
    Write-Detail 'Schedule' $scheduleNorm
    if ($scheduleNorm -eq 'weighted') {
        Write-Detail 'Weight exponent' ("{0:F2}" -f $WeightExponent)
        Write-Detail 'Weight step' ("{0:F2}" -f $WeightStep)
        Write-Detail 'Average mode' $averageNorm
        if ($averageNorm -eq 'ewma') {
            Write-Detail 'EWMA alpha' ("{0:F2}" -f $EwmaAlpha)
        }
    }
}
else {
    Write-Detail 'Test executable' $tests[0].FullName
}
Write-Detail 'Instances' $Instances
Write-Detail 'Runs requested' $runLabel
Write-Detail 'Status interval' ("{0}ms" -f $StatusIntervalMs)
Write-Detail 'Events' $script:eventsNorm
Write-Detail 'Weights on status' $(if ($script:showWeights) { 'Yes' } else { 'No' })
Write-Detail 'Continue on failure' $(if ($ContinueOnFailure) { 'Yes' } else { 'No' })
Write-Detail 'ProcDump enabled' $(if ($UseProcDump) { 'Yes' } else { 'No' })
Write-Detail 'Dump root' $DumpRoot
Write-Section 'Environment'
Write-Detail 'Machine' $env:COMPUTERNAME
Write-Detail 'CPU cores' $cpuCount
Write-Detail 'Start time' $scriptStartTime
Write-Detail 'Controls' "q=stop, [ or ] for bias, w=weights, v=verbosity"

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
    param(
        [Parameter(Mandatory = $true)][int]$SlotIndex,
        [Parameter(Mandatory = $true)][string]$TestPath,
        [Parameter(Mandatory = $true)][string]$TestName,
        [Parameter(Mandatory = $true)][int]$RunId
    )

    # Use unique port for each instance to prevent binding conflicts (8086 + index)
    $port = 8086 + ($SlotIndex % 1000)
    
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
        $safeName = ($TestName -replace '[^a-zA-Z0-9_.-]', '_')
        $iterationDumpDir = Join-Path $DumpRoot ("run-{0:000000}-{1}" -f $RunId, $safeName)
        New-Item -Path $iterationDumpDir -ItemType Directory -Force | Out-Null
        
        $psi.FileName = $procDumpExe
        # -accepteula -ma (full dump) -e (unhandled exception) -x (launch)
        $pArgs = @('-accepteula', '-ma', '-e', '-x', $iterationDumpDir, $TestPath)
        if ($TestArguments) { $pArgs += $TestArguments }
        $psi.Arguments = $pArgs -join ' '
    }
    else {
        $psi.FileName = $TestPath
        if ($TestArguments) { $psi.Arguments = $TestArguments }
    }

    $p = [System.Diagnostics.Process]::Start($psi)
    return [pscustomobject]@{ Proc = $p; Port = $port; DumpDir = $iterationDumpDir }
}

function Get-DumpFiles {
    param([string]$DumpDir)
    if (-not $DumpDir) { return @() }
    if (-not (Test-Path $DumpDir)) { return @() }
    return @(Get-ChildItem -Path $DumpDir -Filter '*.dmp' -ErrorAction SilentlyContinue)
}

function Ensure-DumpForFailure {
    param(
        [Parameter(Mandatory = $true)][string]$DumpDir,
        [Parameter(Mandatory = $true)][string]$TestPath
    )

    $existing = @(Get-DumpFiles -DumpDir $DumpDir)
    if ($existing.Count -gt 0) { return $true }

    if (-not $UseProcDump) { return $false }
    if (-not $procDumpExe) { return $false }

    # If the test failed via non-zero exit without crashing, ProcDump (-e) won't trigger.
    # Rerun once with -t to force a dump on process termination.
    try {
        New-Item -Path $DumpDir -ItemType Directory -Force | Out-Null

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.WorkingDirectory = $testDir
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.FileName = $procDumpExe

        $pArgs = @('-accepteula', '-ma', '-t', '-x', $DumpDir, $TestPath)
        if ($TestArguments) { $pArgs += $TestArguments }
        $psi.Arguments = $pArgs -join ' '

        $p = [System.Diagnostics.Process]::Start($psi)
        $p.WaitForExit()
        $p.Dispose()
    }
    catch {
        return $false
    }

    $after = @(Get-DumpFiles -DumpDir $DumpDir)
    return ($after.Count -gt 0)
}

# --- Scheduler (weighted by default; round-robin optional) ---
$stopRequested = $false
$stopReason = ''
$nextTestIndex = 0
$globalRunId = 0

$completed = 0
$failed = 0
$started = 0

# Runs semantics:
# - All tests: Runs means "runs per test".
# - Single test: Runs means legacy "batch count" (Instances launches per run).
$targetTotal = 0
if ($Runs -gt 0) {
    if ($resolvedAllTests) {
        $targetTotal = $Runs * $tests.Count
    }
    else {
        $targetTotal = $Runs * $Instances
    }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$recentCompletions = New-Object System.Collections.Generic.Queue[datetime]

$slots = @()
for ($i = 0; $i -lt $Instances; $i++) {
    $slots += [pscustomobject]@{
        Slot      = $i
        Proc      = $null
        TestName  = ''
        TestPath  = ''
        Port      = 0
        DumpDir   = $null
        RunId     = 0
        StartTime = $null
    }
}

$testStates = @()
for ($ti = 0; $ti -lt $tests.Count; $ti++) {
    $t = $tests[$ti]
    $remaining = 0
    if ($resolvedAllTests -and $Runs -gt 0) {
        $remaining = $Runs
    }
    $testStates += [pscustomobject]@{
        Index     = ($ti + 1)
        Name      = $t.Name
        Path      = $t.FullName
        Remaining = $remaining
        Count     = 0
        AvgMs     = 0.0
    }
}

$testStateByPath = @{}
foreach ($s in $testStates) { $testStateByPath[$s.Path] = $s }

function Clear-StatusLine {
    if (-not $script:statusEnabled) { return }
    if (-not $script:lastStatusText) { return }
    $spaces = ' ' * $script:lastStatusText.Length
    Write-Host -NoNewline ("`r{0}`r" -f $spaces)
    $script:lastStatusText = ''
}

function Render-StatusLine {
    param([Parameter(Mandatory = $true)][string]$Text)

    if (-not $script:statusEnabled) { return }

    # Overwrite the same console line without spamming newlines.
    # Pad with spaces to fully clear any previous longer text.
    $pad = ''
    if ($script:lastStatusText -and ($script:lastStatusText.Length -gt $Text.Length)) {
        $pad = ' ' * ($script:lastStatusText.Length - $Text.Length)
    }
    Write-Host -NoNewline ("`r{0}{1}" -f $Text, $pad)
    $script:lastStatusText = $Text
}

function Write-EventLine {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][ConsoleColor]$Color
    )

    if ($script:eventsNorm -eq 'none') { return }
    Clear-StatusLine
    Write-Host $Text -ForegroundColor $Color
}

function Try-ReadKeyChar {
    try {
        if ([Console]::KeyAvailable) {
            return [Console]::ReadKey($true).KeyChar
        }
    }
    catch {
        # ignore
    }

    # Fallback for hosts where Console APIs misbehave (e.g., some integrated terminals)
    try {
        if ($Host -and $Host.UI -and $Host.UI.RawUI -and $Host.UI.RawUI.KeyAvailable) {
            $k = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
            return $k.Character
        }
    }
    catch {
        # ignore
    }

    return $null
}

function Handle-Hotkeys {
    if ($stopRequested) { return }

    $c = Try-ReadKeyChar
    if ($null -eq $c -or $c -eq [char]0) { return }

    if ($c -eq 'q' -or $c -eq 'Q') {
        $script:stopRequested = $true
        $script:stopReason = 'user requested stop'
        Clear-StatusLine
        Write-Host "Stop requested (q). Waiting for running tests to finish..." -ForegroundColor Yellow
        return
    }

    if ($c -eq 'w' -or $c -eq 'W') {
        $script:showWeights = -not $script:showWeights
        Clear-StatusLine
        Write-Host ("Weights on status: {0}" -f $(if ($script:showWeights) { 'ON' } else { 'OFF' })) -ForegroundColor Cyan
        return
    }

    if ($c -eq 'v' -or $c -eq 'V') {
        $script:eventsNorm = switch ($script:eventsNorm) {
            'fail' { 'all' }
            'all' { 'none' }
            default { 'fail' }
        }
        Clear-StatusLine
        Write-Host ("Events: {0}" -f $script:eventsNorm) -ForegroundColor Cyan
        return
    }

    if (($c -eq '[') -or ($c -eq '{')) {
        if ($scheduleNorm -eq 'weighted') {
            $script:WeightExponent = [math]::Max(0.0, $script:WeightExponent - $WeightStep)
            $ratio10 = [math]::Pow(10.0, $script:WeightExponent)
            Clear-StatusLine
            Write-Host ("Bias adjusted: exp={0:F2}. 10x slower runs ~{1:F2}x less often." -f $script:WeightExponent, $ratio10) -ForegroundColor Cyan
        }
        return
    }

    if (($c -eq ']') -or ($c -eq '}')) {
        if ($scheduleNorm -eq 'weighted') {
            $script:WeightExponent = [math]::Min(3.0, $script:WeightExponent + $WeightStep)
            $ratio10 = [math]::Pow(10.0, $script:WeightExponent)
            Clear-StatusLine
            Write-Host ("Bias adjusted: exp={0:F2}. 10x slower runs ~{1:F2}x less often." -f $script:WeightExponent, $ratio10) -ForegroundColor Cyan
        }
        return
    }
}

function Get-EligibleTestStates {
    if (-not $resolvedAllTests) { return @() }
    if ($Runs -gt 0) {
        return @($testStates | Where-Object { $_.Remaining -gt 0 })
    }
    return $testStates
}

function Choose-NextTest {
    $eligible = @(Get-EligibleTestStates)
    if (-not $eligible -or $eligible.Count -lt 1) {
        return $null
    }

    # Round-robin (legacy): deterministic order, skips exhausted tests in finite mode.
    if ($scheduleNorm -eq 'roundrobin') {
        for ($i = 0; $i -lt $tests.Count; $i++) {
            $t = $tests[$script:nextTestIndex]
            $script:nextTestIndex = ($script:nextTestIndex + 1) % $tests.Count
            $state = $testStateByPath[$t.FullName]
            if ($Runs -le 0 -or $state.Remaining -gt 0) {
                $script:globalRunId++
                return [pscustomobject]@{ RunId = $script:globalRunId; Name = $t.Name; Path = $t.FullName }
            }
        }
        return $null
    }

    # Weighted (default): shorter/cheaper tests run more frequently, but long tests still run.
    # Weight formula: 1/(avg_ms^WeightExponent). With WeightExponent=0.5 this is 1/sqrt(avg_ms).
    # WeightExponent can be adjusted live via '[' and ']'.
    $sum = 0.0
    $weights = @()
    foreach ($s in $eligible) {
        $est = if ($s.Count -gt 0 -and $s.AvgMs -gt 0) { $s.AvgMs } else { 1000.0 }
        $exp = [math]::Max(0.0, $script:WeightExponent)
        $w = 1.0 / [math]::Pow([math]::Max(1.0, $est), $exp)
        $sum += $w
        $weights += $w
    }
    $r = (Get-Random -Minimum 0.0 -Maximum $sum)
    $acc = 0.0
    for ($i = 0; $i -lt $eligible.Count; $i++) {
        $acc += $weights[$i]
        if ($r -le $acc) {
            $chosen = $eligible[$i]
            $script:globalRunId++
            return [pscustomobject]@{ RunId = $script:globalRunId; Name = $chosen.Name; Path = $chosen.Path }
        }
    }

    # Fallback
    $chosen = $eligible[$eligible.Count - 1]
    $script:globalRunId++
    return [pscustomobject]@{ RunId = $script:globalRunId; Name = $chosen.Name; Path = $chosen.Path }
}

function Format-WeightSummary {
    # Produces compact odds like: | 3 | 12 | done |
    # Each number N means: expected ~1 run per N selections at current weights.
    if ($scheduleNorm -ne 'weighted') { return '' }
    if (-not $resolvedAllTests) { return '' }

    $states = $testStates
    if ($Runs -gt 0) {
        # Finite mode: show done for exhausted
        $states = $testStates
    }

    $sum = 0.0
    $weightsByIndex = @{}
    foreach ($s in $testStates) {
        if ($Runs -gt 0 -and $s.Remaining -le 0) {
            continue
        }
        $est = if ($s.Count -gt 0 -and $s.AvgMs -gt 0) { $s.AvgMs } else { 1000.0 }
        $exp = [math]::Max(0.0, $script:WeightExponent)
        $w = 1.0 / [math]::Pow([math]::Max(1.0, $est), $exp)
        $sum += $w
        $weightsByIndex[$s.Index] = $w
    }

    if ($sum -le 0.0) { return '' }

    $parts = @()
    foreach ($s in $testStates | Sort-Object Index) {
        if ($Runs -gt 0 -and $s.Remaining -le 0) {
            $parts += 'done'
            continue
        }
        $w = if ($weightsByIndex.ContainsKey($s.Index)) { [double]$weightsByIndex[$s.Index] } else { 0.0 }
        if ($w -le 0.0) {
            $parts += '∞'
            continue
        }
        $expected = [math]::Max(1.0, ($sum / $w))
        $parts += ("{0:N0}" -f $expected)
    }

    # Avoid overly long lines if there are many tests.
    $maxParts = 20
    if ($parts.Count -gt $maxParts) {
        $parts = $parts[0..($maxParts - 1)] + '...'
    }
    return ('{ ' + ($parts -join ' | ') + ' }')
}

function Maybe-PrintStatus {
    param([datetime]$Now, [datetime]$LastStatus)

    if ($StatusIntervalMs -le 0) { return $LastStatus }
    if ((($Now - $LastStatus).TotalMilliseconds) -lt $StatusIntervalMs) { return $LastStatus }

    while ($recentCompletions.Count -gt 0 -and (($Now - $recentCompletions.Peek()).TotalSeconds -gt 10)) {
        [void]$recentCompletions.Dequeue()
    }

    $elapsed = [math]::Max(0.001, $sw.Elapsed.TotalSeconds)
    $totalRate = $completed / $elapsed
    $rollingRate = $recentCompletions.Count / 10.0
    $running = @($slots | Where-Object { $_.Proc -ne $null }).Count

    $cpu = Get-TotalCpuUsagePercent
    $cpuStr = if ($null -ne $cpu) { " | CPU: {0:N0}%" -f $cpu } else { '' }

    $bias = if ($scheduleNorm -eq 'weighted') { " exp={0:F2}" -f $script:WeightExponent } else { '' }
    $weightsStr = if ($script:showWeights -and $scheduleNorm -eq 'weighted') { " | {0}" -f (Format-WeightSummary) } else { '' }

    # Fail count is usually useless when we stop on first failure.
    $failStr = if ($ContinueOnFailure) { " | Fail {0}" -f $failed } else { '' }

    # Compact, single-line UI meant to stay on the bottom.
    $status = "Run {0}/{1} | OK {2}{3} | t/s {4:F2} (10s {5:F2}) | U {6}{7}{8}{9}" -f $running, $Instances, $completed, $failStr, $totalRate, $rollingRate, (Format-TimeSpan $sw.Elapsed), $bias, $cpuStr, $weightsStr
    Render-StatusLine -Text $status
    return $Now
}

Write-Section 'Stress run'
if ($targetTotal -gt 0) {
    Write-Detail 'Target total runs' $targetTotal
}
else {
    Write-Detail 'Target total runs' 'infinite'
}

$lastStatus = Get-Date

while ($true) {
    $now = Get-Date

    Handle-Hotkeys

    # Reap finished processes
    foreach ($slot in $slots) {
        if ($slot.Proc -ne $null -and $slot.Proc.HasExited) {
            $duration = $now - $slot.StartTime
            $code = $slot.Proc.ExitCode
            $slot.Proc.Dispose()

            $completed++
            [void]$recentCompletions.Enqueue($now)

            if ($code -ne 0) {
                $failed++
                Write-EventLine -Text ("FAIL [{0}] {1} (port {2}, exit {3}) in {4}" -f $slot.RunId, $slot.TestName, $slot.Port, $code, (Format-TimeSpan $duration)) -Color Red

                if ($UseProcDump) {
                    $dumpDir = $slot.DumpDir
                    $dumpOk = $false
                    if ($dumpDir) {
                        $dumpOk = Ensure-DumpForFailure -DumpDir $dumpDir -TestPath $slot.TestPath
                    }

                    if (-not $dumpOk) {
                        $script:missingDumpOnFailure = $true
                        Clear-StatusLine
                        Write-Host ("ERROR: -UseProcDump was enabled but no dump was found for the failing run. Expected in: {0}" -f $dumpDir) -ForegroundColor Yellow
                        Write-Host "ProcDump was also asked to force a dump on termination (-t), but no .dmp appeared." -ForegroundColor Yellow
                    }
                }

                if (-not $ContinueOnFailure) {
                    $stopRequested = $true
                    $stopReason = "failure"
                    Clear-StatusLine
                    Write-Host "Stopping after first failure (use -ContinueOnFailure to keep running)." -ForegroundColor Yellow
                }
            }
            else {
                if ($script:eventsNorm -eq 'all') {
                    Write-EventLine -Text ("PASS [{0}] {1} (port {2}) in {3}" -f $slot.RunId, $slot.TestName, $slot.Port, (Format-TimeSpan $duration)) -Color Green
                }
            }

            # Update per-test stats (used by weighted scheduler)
            if ($testStateByPath.ContainsKey($slot.TestPath)) {
                $s = $testStateByPath[$slot.TestPath]
                $ms = [double]$duration.TotalMilliseconds
                $s.Count++
                if ($s.Count -eq 1) {
                    $s.AvgMs = $ms
                }
                else {
                    if ($averageNorm -eq 'ewma') {
                        $a = [double]$EwmaAlpha
                        $s.AvgMs = ($a * $ms) + ((1.0 - $a) * $s.AvgMs)
                    }
                    else {
                        $s.AvgMs = (($s.AvgMs * ($s.Count - 1)) + $ms) / $s.Count
                    }
                }
            }

            $slot.Proc = $null
            $slot.TestName = ''
            $slot.TestPath = ''
            $slot.Port = 0
            $slot.DumpDir = $null
            $slot.RunId = 0
            $slot.StartTime = $null
        }
    }

    # Launch new work
    foreach ($slot in $slots) {
        if ($slot.Proc -eq $null -and -not $stopRequested) {
            # Finite run termination:
            # - All tests: stop when no eligible tests remain.
            # - Single test: stop after started reaches targetTotal.
            if ($resolvedAllTests -and $Runs -gt 0) {
                $eligibleCount = @(Get-EligibleTestStates).Count
                if ($eligibleCount -lt 1) {
                    $stopRequested = $true
                    $stopReason = "target reached"
                    break
                }
            }
            elseif ($targetTotal -gt 0 -and $started -ge $targetTotal) {
                $stopRequested = $true
                $stopReason = "target reached"
                break
            }

            $next = $null
            if ($resolvedAllTests) {
                $next = Choose-NextTest
                if ($null -eq $next) {
                    $stopRequested = $true
                    $stopReason = "target reached"
                    break
                }
            }
            else {
                $script:globalRunId++
                $next = [pscustomobject]@{ RunId = $script:globalRunId; Name = $tests[0].Name; Path = $tests[0].FullName }
            }

            $slot.RunId = $next.RunId
            $slot.TestName = $next.Name
            $slot.TestPath = $next.Path
            $slot.StartTime = Get-Date

            # Decrement remaining on launch in finite all-tests mode.
            if ($resolvedAllTests -and $Runs -gt 0 -and $testStateByPath.ContainsKey($slot.TestPath)) {
                $s = $testStateByPath[$slot.TestPath]
                if ($s.Remaining -gt 0) { $s.Remaining-- }
            }

            $launch = Start-TestProcess -SlotIndex $slot.Slot -TestPath $slot.TestPath -TestName $slot.TestName -RunId $slot.RunId
            $slot.Proc = $launch.Proc
            $slot.Port = $launch.Port
            $slot.DumpDir = $launch.DumpDir
            $started++

            if ($script:eventsNorm -eq 'all') {
                Write-EventLine -Text ("START [{0}] s{1} {2} (p{3}, pid {4})" -f $slot.RunId, $slot.Slot, $slot.TestName, $slot.Port, $slot.Proc.Id) -Color DarkGray
            }
        }
    }

    $lastStatus = Maybe-PrintStatus -Now $now -LastStatus $lastStatus

    # Exit when we're stopping and nothing is running
    $anyRunning = @($slots | Where-Object { $_.Proc -ne $null }).Count -gt 0
    if ($stopRequested -and -not $anyRunning) {
        break
    }

    Start-Sleep -Milliseconds 50
}

Clear-StatusLine

Write-Section 'Run summary'
Write-Detail 'Stop reason' $(if ($stopReason) { $stopReason } else { 'completed' })
Write-Detail 'Started' $started
Write-Detail 'Completed' $completed
Write-Detail 'Failed' $failed
Write-Detail 'Total duration' (Format-TimeSpan $sw.Elapsed)
if ($sw.Elapsed.TotalSeconds -gt 0) {
    Write-Detail 'Average tests/sec' ("{0:F2}" -f ($completed / $sw.Elapsed.TotalSeconds))
}

$exitCode = 0
if ($failed -gt 0 -and -not $ContinueOnFailure) {
    $exitCode = 1
}
if ($script:missingDumpOnFailure) {
    $exitCode = 2
}
exit $exitCode