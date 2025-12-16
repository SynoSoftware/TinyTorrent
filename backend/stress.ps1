param(
    [ValidateSet('debug', 'release', 'minsize')]
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
$testDir = Join-Path $buildDir $Configuration
$testDir = Join-Path $testDir 'tests'
$testPath = Join-Path $testDir $TestExe

if (-not (Test-Path $testPath)) {
    throw "Test executable not found: $testPath"
}

# --- Defaults ---
if ($Instances -le 0) {
    $Instances = [Environment]::ProcessorCount
}
if ($Instances -lt 1) { $Instances = 1 }

if (-not $DumpRoot) {
    $DumpRoot = Join-Path $buildDir 'test-dumps'
}

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
while ($Runs -eq 0 -or $runNumber -lt $Runs) {
    $runNumber++
    Write-Host "Starting batch ${runNumber}: launching $Instances parallel instances of $TestExe"

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
}

Write-Host "Completed $runNumber batch(es) of parallel runs without failure." -ForegroundColor Green