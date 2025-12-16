param(
    [int]$MaxConcurrent = 96,
    [int]$TotalTests = 10000
)

$ErrorActionPreference = 'Stop'

# First, rebuild
Write-Host "Building project..."
try {
    & .\build.ps1 -Configuration Debug 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
}
catch {
    Write-Error "Build failed: $_"
    exit 1
}

Write-Host "Build complete."

# Set up PATH for vcpkg dependencies
$releaseBin = ".\vcpkg_installed\x64-windows\bin"
$debugBin = ".\vcpkg_installed\x64-windows\debug\bin"
$paths = @()
if (Test-Path $releaseBin) { $paths += (Resolve-Path $releaseBin).Path }
if (Test-Path $debugBin) { $paths += (Resolve-Path $debugBin).Path }
if ($paths.Count -gt 0) {
    $env:PATH = ($paths -join ';') + ';' + $env:PATH
}

# Define test executables
$testExes = @(
    ".\build\debug\tests\dispatcher-test.exe",
    ".\build\debug\tests\rpc-endpoint-test.exe",
    ".\build\debug\tests\memory-leak-test.exe",
    ".\build\debug\tests\rpc-filesystem-test.exe",
    ".\build\debug\tests\serializer-test.exe"
)

# Verify all test executables exist
foreach ($exe in $testExes) {
    if (-not (Test-Path $exe)) {
        Write-Error "Test executable not found: $exe"
        exit 1
    }
}

$failed = $false
$totalTestsRun = 0
$activeProcesses = @()

Write-Host "Starting stress test..."
Write-Host "Max concurrent processes: $MaxConcurrent"
Write-Host "Total tests to run: $TotalTests"
Write-Host ""

# Start initial batch
Write-Host "Filling initial queue with $MaxConcurrent processes..."
$testIndex = 0

for ($i = 0; $i -lt $MaxConcurrent -and $testIndex -lt $TotalTests; $i++) {
    $testIdx = $testIndex % $testExes.Length
    $exe = $testExes[$testIdx]
    # Each concurrent slot gets a unique port range. Slot i uses port (8086 + i)
    $port = (8086 + $i)
    
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "cmd.exe"
    $pinfo.Arguments = "/c `"$exe`" >nul 2>&1"
    $pinfo.UseShellExecute = $false
    $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $port.ToString()
    
    $proc = [System.Diagnostics.Process]::Start($pinfo)
    $activeProcesses += @{
        Process   = $proc
        TestIndex = $testIndex
        Port      = $port
        TestName  = Split-Path -Leaf $exe
        StartTime = Get-Date
    }
    
    $testIndex++
}

Write-Host "Started $($activeProcesses.Count) initial processes"
Write-Host ""

$startTime = Get-Date
$lastReport = $startTime
$failedTests = 0

# Main loop: keep queue full
while ($activeProcesses.Count -gt 0) {
    $stillRunning = @()
    
    foreach ($procObj in $activeProcesses) {
        if ($procObj.Process.HasExited) {
            $exitCode = $procObj.Process.ExitCode
            $procObj.Process.Dispose()
            
            # Check if test passed
            if ($exitCode -eq 0) {
                $totalTestsRun++
            }
            else {
                $failedTests++
                Write-Host "FAILED: Test $($procObj.TestName) (index $($procObj.TestIndex)) exit code $exitCode" -ForegroundColor Red
                $failed = $true
            }
            
            # Start new process if we haven't reached total and no failures
            if (-not $failed -and $testIndex -lt $TotalTests) {
                $testIdx = $testIndex % $testExes.Length
                $exe = $testExes[$testIdx]
                # Reuse the port from the completed process slot
                $port = $procObj.Port
                
                $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                $pinfo.FileName = "cmd.exe"
                $pinfo.Arguments = "/c `"$exe`" >nul 2>&1"
                $pinfo.UseShellExecute = $false
                $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $port.ToString()
                
                $newProc = [System.Diagnostics.Process]::Start($pinfo)
                $stillRunning += @{
                    Process   = $newProc
                    TestIndex = $testIndex
                    Port      = $port
                    TestName  = Split-Path -Leaf $exe
                    StartTime = Get-Date
                }
                
                $testIndex++
            }
        }
        else {
            # Still running
            $stillRunning += $procObj
        }
    }
    
    if ($failed) { break }
    
    $activeProcesses = $stillRunning
    
    # Progress report every 1 second
    $now = Get-Date
    if (($now - $lastReport).TotalSeconds -ge 1) {
        $elapsed = ($now - $startTime).TotalSeconds
        $rate = if ($elapsed -gt 0) { $totalTestsRun / $elapsed } else { 0 }
        $remaining = $TotalTests - $totalTestsRun
        $eta = if ($rate -gt 0) { $remaining / $rate } else { 0 }
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tests: $totalTestsRun/$TotalTests | Rate: $([Math]::Round($rate,1))/sec | Active: $($activeProcesses.Count) | CPU: $(Get-Process -Name dispatcher-test -ErrorAction SilentlyContinue | Measure-Object -Property CPU -Sum | Select -Exp Sum | ForEach {[Math]::Round($_,0)})% | ETA: $([Math]::Round($eta))s"
        $lastReport = $now
    }
    
    # Sleep briefly to avoid busy-waiting
    [System.Threading.Thread]::Sleep(10)  # 10ms = very responsive
}

$endTime = Get-Date
$elapsed = ($endTime - $startTime).TotalSeconds
$rate = if ($elapsed -gt 0) { $totalTestsRun / $elapsed } else { 0 }

Write-Host ""
Write-Host "==============================================="
Write-Host "Stress test complete!"
Write-Host "Total tests run: $totalTestsRun"
Write-Host "Failed tests: $failedTests"
Write-Host "Time elapsed: $([Math]::Round($elapsed, 1)) seconds"
Write-Host "Average rate: $([Math]::Round($rate, 1)) tests/second"
Write-Host "==============================================="

if ($failed) {
    exit 1
}
exit 0
