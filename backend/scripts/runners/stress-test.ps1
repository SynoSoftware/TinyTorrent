param(
    [int]$MaxConcurrent = 96,
    [int]$TotalTests = 10000
)

$ErrorActionPreference = 'Stop'

# First, rebuild
Write-Host "Building project..."
try {
    & .\build.ps1 -Configuration Debug 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
}
catch {
    Write-Error "Build failed: $_"
    exit 1
}

Write-Host "Build complete."

# Define test executables (cycle through them)
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

$basePort = 8086
$failed = $false
$totalTestsRun = 0
$activeJobs = @()

Write-Host "Starting stress test with continuous queue..."
Write-Host "Max concurrent jobs: $MaxConcurrent"
Write-Host "Total tests to run: $TotalTests"
Write-Host "Test executables: $($testExes.Length)"
Write-Host ""

# Function to start a new test job
function Start-TestJob {
    param([int]$TestIndex)
    
    $testIdx = $TestIndex % $testExes.Length
    $exe = $testExes[$testIdx]
    $port = (8086 + ($TestIndex % 200))  # Cycle ports to avoid exhaustion
    $jobName = "test_${TestIndex}"

    $job = Start-Job -ScriptBlock {
        param($exe, $port)
        $env:TT_TEST_PORT = $port.ToString()
        & $exe
        return $LASTEXITCODE
    } -ArgumentList $exe, $port -Name $jobName

    return [PSCustomObject]@{
        Job       = $job
        TestIndex = $TestIndex
        Port      = $port
        TestName  = Split-Path -Leaf $exe
    }
}

# Start initial batch to fill the queue
Write-Host "Filling initial queue with $MaxConcurrent jobs..."
for ($i = 0; $i -lt $MaxConcurrent; $i++) {
    $job = Start-TestJob -TestIndex $i
    $activeJobs += $job
}

$nextTestIndex = $MaxConcurrent
$startTime = Get-Date
$lastReport = $startTime

# Main loop: keep queue full until we hit $TotalTests
while ($totalTestsRun -lt $TotalTests) {
    # Find first completed job
    $completedIdx = -1
    
    for ($i = 0; $i -lt $activeJobs.Count; $i++) {
        if ($activeJobs[$i].Job.State -eq "Completed") {
            $completedIdx = $i
            break
        }
    }

    if ($completedIdx -eq -1) {
        # No job completed yet, wait a bit
        Start-Sleep -Milliseconds 50
        continue
    }

    # Get completed job info
    $jobObj = $activeJobs[$completedIdx]
    $result = $jobObj.Job | Receive-Job -ErrorAction SilentlyContinue
    
    if ($jobObj.Job.State -eq "Completed") {
        $totalTestsRun++
    }
    else {
        Write-Host "ERROR: Test failed: [Port $($jobObj.Port)] $($jobObj.TestName)"
        $failed = $true
        break
    }

    Remove-Job -Job $jobObj.Job -Force

    # Start new test if we haven't reached total yet
    if ($nextTestIndex -lt $TotalTests) {
        $newJob = Start-TestJob -TestIndex $nextTestIndex
        $activeJobs[$completedIdx] = $newJob
        $nextTestIndex++
    }
    else {
        # Remove this job from active list
        $activeJobs = $activeJobs[0..($completedIdx - 1)] + $activeJobs[($completedIdx + 1)..($activeJobs.Count - 1)]
    }

    # Progress report every 2 seconds
    $now = Get-Date
    if (($now - $lastReport).TotalSeconds -ge 2) {
        $elapsed = ($now - $startTime).TotalSeconds
        $rate = $totalTestsRun / $elapsed
        $remaining = $TotalTests - $totalTestsRun
        $eta = $remaining / $rate
        $msg = "[$(Get-Date -Format 'HH:mm:ss')] Tests: $totalTestsRun/$TotalTests (rate: {0:F1}/sec, ETA: {1:F0}s, Active: $($activeJobs.Count))" -f $rate, $eta
        Write-Host $msg
        $lastReport = $now
    }
}

# Wait for remaining jobs to complete
Write-Host "Waiting for $($activeJobs.Count) remaining jobs..."
while ($activeJobs.Count -gt 0) {
    for ($i = 0; $i -lt $activeJobs.Count; $i++) {
        if ($activeJobs[$i].Job.State -eq "Completed") {
            $jobObj = $activeJobs[$i]
            Remove-Job -Job $jobObj.Job -Force
            $activeJobs = $activeJobs[0..($i - 1)] + $activeJobs[($i + 1)..($activeJobs.Count - 1)]
            break
        }
    }
    if ($activeJobs.Count -gt 0) {
        Start-Sleep -Milliseconds 100
    }
}

$endTime = Get-Date
$elapsed = ($endTime - $startTime).TotalSeconds
$rate = $totalTestsRun / $elapsed

Write-Host ""
Write-Host "==============================================="
Write-Host "Stress test complete!"
Write-Host "Total tests run: $totalTestsRun"
$elapsedMsg = "Time elapsed: {0:F1} seconds" -f $elapsed
$rateMsg = "Average rate: {0:F1} tests/second" -f $rate
Write-Host $elapsedMsg
Write-Host $rateMsg
Write-Host "==============================================="

if ($failed) {
    exit 1
}
exit 0
