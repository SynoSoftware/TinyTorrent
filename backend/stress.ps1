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
  -Configuration <debug|release|minsize>   Build configuration whose tests should run (default: debug)
  -TestExe <name>                          Test executable to launch from build/$Configuration/tests
  -Instances <N>                           Number of parallel instances (default: logical processors)
  -Runs <N>                                Total number of batches to run (0 for until failure)
  -UseProcDump                             Wrap the test in procdump and capture crash dumps
  -ProcDumpPath <path>                     Path to procdump.exe when using -UseProcDump (default: procdump.exe on PATH)
  -DumpRoot <path>                         Directory where procdump writes dumps (default: build/test-dumps)
  -Help                                    Show this help text
"@
    exit 0
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$buildDir = Join-Path $repoRoot 'build'
$testDir = Join-Path $buildDir $Configuration
$testDir = Join-Path $testDir 'tests'
$testPath = Join-Path $testDir $TestExe

if (-not (Test-Path $testPath)) {
    throw "Test executable not found: $testPath"
}

if ($Instances -le 0) {
    $Instances = [Environment]::ProcessorCount
}
if ($Instances -lt 1) {
    $Instances = 1
}

if ($UseProcDump) {
    $procDumpExe = Get-Command $ProcDumpPath -ErrorAction SilentlyContinue
    if (-not $procDumpExe) {
        throw "procdump executable not found: $ProcDumpPath"
    }
    $procDumpExe = $procDumpExe.Source
}

if (-not $DumpRoot) {
    $DumpRoot = Join-Path $buildDir 'test-dumps'
}
New-Item -Path $DumpRoot -ItemType Directory -Force | Out-Null

function Start-TestProcess {
    param($index, $runId)

    if ($UseProcDump) {
        $iterationDumpDir = Join-Path $DumpRoot "run-$runId"
        New-Item -Path $iterationDumpDir -ItemType Directory -Force | Out-Null
        $args = @('-accepteula', '-ma', '-e', '-x', $iterationDumpDir, $testPath)
        if ($TestArguments) {
            $args += $TestArguments
        }
        return Start-Process -FilePath $procDumpExe -ArgumentList $args -WorkingDirectory $testDir -NoNewWindow -PassThru
    }

    $args = @()
    if ($TestArguments) {
        $args += $TestArguments
    }
    return Start-Process -FilePath $testPath -ArgumentList $args -WorkingDirectory $testDir -NoNewWindow -PassThru
}

$runNumber = 0
while ($Runs -eq 0 -or $runNumber -lt $Runs) {
    $runNumber++
    Write-Host "Starting batch ${runNumber}: launching $Instances parallel instances of $TestExe"

    $processes = for ($idx = 0; $idx -lt $Instances; $idx++) {
        Start-TestProcess -index $idx -runId $runNumber
    }

    foreach ($proc in $processes) {
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) {
            Write-Host "Instance $($proc.Id) failed with exit code $($proc.ExitCode)" -ForegroundColor Red
            exit $proc.ExitCode
        }
    }
}

Write-Host "Completed $runNumber batch(es) of parallel runs without failure."
