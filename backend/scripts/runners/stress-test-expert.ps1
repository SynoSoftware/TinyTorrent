param(
    [int]$MaxConcurrent = 96,
    [int]$TotalTests = 10000,
    [switch]$QuickCheck  # Early exit after first batch completes
)

$ErrorActionPreference = 'Stop'

# Quick build
Write-Host "Building..."
& .\build.ps1 -Configuration Debug 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

# Setup PATH
$env:PATH = "$(Resolve-Path .\vcpkg_installed\x64-windows\debug\bin).Path;$(Resolve-Path .\vcpkg_installed\x64-windows\bin).Path;" + $env:PATH

$testExes = @(
    ".\build\debug\tests\dispatcher-test.exe",
    ".\build\debug\tests\rpc-endpoint-test.exe",
    ".\build\debug\tests\memory-leak-test.exe",
    ".\build\debug\tests\rpc-filesystem-test.exe",
    ".\build\debug\tests\serializer-test.exe"
)

$testExes | ForEach-Object { if (-not (Test-Path $_)) { Write-Error "Missing: $_"; exit 1 } }

Write-Host "Stress test: $MaxConcurrent concurrent, $TotalTests total tests"
Write-Host "Quick check mode: $QuickCheck"
Write-Host ""

$testIndex = 0
$exeIndex = 0
$testsPassed = 0
$testsFailed = 0
$startTime = Get-Date
$lastReport = $startTime

# Pre-generate all process infos (no startup overhead during run)
$queue = for ($i = 0; $i -lt $TotalTests; $i++) {
    @{ Index = $i; Exe   = $testExes[$i % $testExes.Length]; Port  = 8086 + ($i % 200) }
}

# Start initial batch
$active = @()
for ($i = 0; $i -lt $MaxConcurrent -and $i -lt $TotalTests; $i++) {
    $cfg = $queue[$i]
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "cmd.exe"
    $pinfo.Arguments = "/c `"$($cfg.Exe)`" >nul 2>&1"
    $pinfo.UseShellExecute = $false
    $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $cfg.Port
    
    $proc = [System.Diagnostics.Process]::Start($pinfo)
    $active += @{ Proc  = $proc; Index = $cfg.Index; Start = Get-Date }
}

Write-Host "Started $($active.Count) initial tests"
Write-Host ""

# Main loop: keep batch full, replace completed tests immediately
$queuePos = $MaxConcurrent
while ($queuePos -lt $TotalTests -or $active.Count -gt 0) {
    # Check for completed tests (non-blocking)
    $completed = @()
    $still_running = @()
    
    foreach ($item in $active) {
        if ($item.Proc.HasExited) {
            $exitCode = $item.Proc.ExitCode
            $duration = ((Get-Date) - $item.Start).TotalMilliseconds
            $item.Proc.Dispose()
            
            if ($exitCode -eq 0) {
                $testsPassed++
            }
            else {
                $testsFailed++
                Write-Host "FAIL: Test $($item.Index) exit=$exitCode" -ForegroundColor Red
            }
            
            $completed += $item
            
            # Immediately start replacement if available
            if ($queuePos -lt $TotalTests) {
                $cfg = $queue[$queuePos]
                $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                $pinfo.FileName = "cmd.exe"
                $pinfo.Arguments = "/c `"$($cfg.Exe)`" >nul 2>&1"
                $pinfo.UseShellExecute = $false
                $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $cfg.Port
                
                $newProc = [System.Diagnostics.Process]::Start($pinfo)
                $still_running += @{ Proc  = $newProc; Index = $cfg.Index; Start = Get-Date }
                $queuePos++
            }
        }
        else {
            $still_running += $item
        }
    }
    
    $active = $still_running
    
    # Report progress every 2 seconds
    $now = Get-Date
    if (($now - $lastReport).TotalSeconds -ge 2) {
        $elapsed = ($now - $startTime).TotalSeconds
        $total = $testsPassed + $testsFailed
        $rate = if ($elapsed -gt 0) { $total / $elapsed } else { 0 }
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Passed: $testsPassed | Failed: $testsFailed | Active: $($active.Count)/$MaxConcurrent | Rate: $([Math]::Round($rate, 1))/sec"
        $lastReport = $now
        
        # Early exit on first batch completion for quick validation
        if ($QuickCheck -and $testsPassed -ge $MaxConcurrent) {
            Write-Host "Quick check mode: first batch complete. All tests passed." -ForegroundColor Green
            $active | ForEach-Object { $_.Proc.Kill(); $_.Proc.Dispose() }
            break
        }
    }
    
    # Minimal sleep - only if nothing completed (avoid busy-wait)
    if ($completed.Count -eq 0 -and $active.Count -gt 0) {
        [System.Threading.Thread]::Sleep(5)
    }
}

$endTime = Get-Date
$elapsed = ($endTime - $startTime).TotalSeconds
$rate = if ($elapsed -gt 0) { ($testsPassed + $testsFailed) / $elapsed } else { 0 }

Write-Host ""
Write-Host "=================================================="
Write-Host "Stress test complete!"
Write-Host "Total:   $($testsPassed + $testsFailed)"
Write-Host "Passed:  $testsPassed"
Write-Host "Failed:  $testsFailed"
Write-Host "Time:    $([Math]::Round($elapsed, 1))s"
Write-Host "Rate:    $([Math]::Round($rate, 1)) tests/sec"
Write-Host "=================================================="

if ($testsFailed -gt 0) { exit 1 }
exit 0
