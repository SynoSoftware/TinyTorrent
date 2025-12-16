param(
    [int]$MaxConcurrent = 24,
    [int]$TotalTests = 480,
    [switch]$QuickCheck
)

$ErrorActionPreference = 'Stop'

# Build only once
Write-Host "Building..."
& .\build.ps1 -Configuration Debug 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

# Change to test directory ONCE - keep CWD local
Push-Location .\build\debug\tests

$testExes = @(
    ".\dispatcher-test.exe",
    ".\rpc-endpoint-test.exe", 
    ".\memory-leak-test.exe",
    ".\rpc-filesystem-test.exe",
    ".\serializer-test.exe"
)

$testExes | ForEach-Object { if (-not (Test-Path $_)) { Write-Error "Missing: $_"; Pop-Location; exit 1 } }

Write-Host "Stress test: $MaxConcurrent concurrent, $TotalTests total tests"
Write-Host ""

$testsPassed = 0
$testsFailed = 0
$startTime = Get-Date
$lastReport = $startTime

# Pre-generate queue
$queue = for ($i = 0; $i -lt $TotalTests; $i++) {
    @{ Index = $i; Exe   = $testExes[$i % $testExes.Length]; Port  = 8086 + ($i % 200) }
}

# Start initial batch
$active = @()
for ($i = 0; $i -lt $MaxConcurrent -and $i -lt $TotalTests; $i++) {
    $cfg = $queue[$i]
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $cfg.Exe
    $pinfo.UseShellExecute = $false
    $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $cfg.Port
    $pinfo.CreateNoWindow = $true
    $pinfo.StandardOutputEncoding = $null  # Use binary stdout
    $pinfo.StandardErrorEncoding = $null   # Use binary stderr
    
    try {
        $proc = [System.Diagnostics.Process]::Start($pinfo)
        $active += @{ Proc = $proc; Index = $cfg.Index; Start = Get-Date }
    }
    catch {
        Write-Host "FAIL: Test $($cfg.Index) spawn error: $_" -ForegroundColor Red
        $testsFailed++
    }
}

Write-Host "Started $($active.Count) initial tests"
Write-Host ""

# Main loop
$queuePos = $MaxConcurrent
while ($queuePos -lt $TotalTests -or $active.Count -gt 0) {
    $completed = @()
    $still_running = @()
    
    foreach ($item in $active) {
        if ($item.Proc.HasExited) {
            $exitCode = $item.Proc.ExitCode
            $item.Proc.Dispose()
            
            if ($exitCode -eq 0) {
                $testsPassed++
            }
            else {
                $testsFailed++
            }
            
            $completed += $item
            
            # Start replacement
            if ($queuePos -lt $TotalTests) {
                $cfg = $queue[$queuePos]
                $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                $pinfo.FileName = $cfg.Exe
                $pinfo.UseShellExecute = $false
                $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $cfg.Port
                $pinfo.CreateNoWindow = $true
                $pinfo.StandardOutputEncoding = $null
                $pinfo.StandardErrorEncoding = $null
                
                try {
                    $newProc = [System.Diagnostics.Process]::Start($pinfo)
                    $still_running += @{ Proc = $newProc; Index = $cfg.Index; Start = Get-Date }
                    $queuePos++
                }
                catch {
                    Write-Host "FAIL: Test $($cfg.Index) spawn error: $_" -ForegroundColor Red
                    $testsFailed++
                }
            }
        }
        else {
            $still_running += $item
        }
    }
    
    $active = $still_running
    
    # Progress every 2 sec
    $now = Get-Date
    if (($now - $lastReport).TotalSeconds -ge 2) {
        $elapsed = ($now - $startTime).TotalSeconds
        $total = $testsPassed + $testsFailed
        $rate = if ($elapsed -gt 0) { $total / $elapsed } else { 0 }
        $remaining = $TotalTests - $total
        $eta = $remaining / $rate
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Passed: $testsPassed | Failed: $testsFailed | Active: $($active.Count)/$MaxConcurrent | Rate: $([Math]::Round($rate, 1))/sec"
        $lastReport = $now
        
        if ($QuickCheck -and $testsPassed -ge $MaxConcurrent) {
            Write-Host "Quick check passed." -ForegroundColor Green
            $active | ForEach-Object { $_.Proc.Kill(); $_.Proc.Dispose() }
            break
        }
    }
    
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

Pop-Location

if ($testsFailed -gt 0) { exit 1 }
exit 0
