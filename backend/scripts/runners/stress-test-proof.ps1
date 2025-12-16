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
$activeProcesses = @()
$proofOfWork = @()  # Track hash of each completed test

Write-Host "Starting stress test with proof-of-work validation..."
Write-Host "Max concurrent processes: $MaxConcurrent"
Write-Host "Total tests to run: $TotalTests"
Write-Host ""

# Start initial batch
Write-Host "Filling initial queue with $MaxConcurrent processes..."
$testIndex = 0

for ($i = 0; $i -lt $MaxConcurrent -and $testIndex -lt $TotalTests; $i++) {
    $testIdx = $testIndex % $testExes.Length
    $exe = $testExes[$testIdx]
    $port = (8086 + ($testIndex % 200))
    
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "cmd.exe"
    $pinfo.Arguments = "/c `"set TT_TEST_PORT=$port && $exe`""
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.WorkingDirectory = (Get-Location).Path
    
    $proc = [System.Diagnostics.Process]::Start($pinfo)
    $activeProcesses += @{
        Process     = $proc
        TestIndex   = $testIndex
        Port        = $port
        TestName    = Split-Path -Leaf $exe
        StartTime   = Get-Date
        OutputLines = 0
    }
    
    $testIndex++
}

Write-Host "Started $($activeProcesses.Count) initial processes"
Write-Host ""

$startTime = Get-Date
$lastReport = $startTime
$checksumAlgorithm = [System.Security.Cryptography.SHA256]::Create()

# Main loop: keep queue full
while ($activeProcesses.Count -gt 0) {
    # Find finished processes
    $stillRunning = @()
    
    foreach ($procObj in $activeProcesses) {
        if ($procObj.Process.HasExited) {
            # Process finished - collect output for proof of work
            $stdout = $procObj.Process.StandardOutput.ReadToEnd()
            $stderr = $procObj.Process.StandardError.ReadToEnd()
            $exitCode = $procObj.Process.ExitCode
            $duration = (Get-Date) - $procObj.StartTime
            
            # Create proof of work: hash the output
            $combinedOutput = "$($procObj.TestName)|$($procObj.Port)|$($exitCode)|$stdout|$stderr|$($duration.TotalMilliseconds)"
            $hashBytes = $checksumAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($combinedOutput))
            $proofHash = [System.BitConverter]::ToString($hashBytes).Replace("-", "").Substring(0, 16)
            
            $proofOfWork += @{
                TestIndex = $procObj.TestIndex
                TestName  = $procObj.TestName
                Port      = $procObj.Port
                ExitCode  = $exitCode
                Duration  = $duration.TotalMilliseconds
                ProofHash = $proofHash
                OutputLen = $stdout.Length + $stderr.Length
            }
            
            $procObj.Process.Dispose()
            $totalTestsRun++
            
            # Validate the test actually ran
            if ($exitCode -ne 0) {
                Write-Host "FAILED: Test $($procObj.TestName) exit code $exitCode" -ForegroundColor Red
                $failed = $true
                break
            }
            
            # Start new process if we haven't reached total
            if ($testIndex -lt $TotalTests) {
                $testIdx = $testIndex % $testExes.Length
                $exe = $testExes[$testIdx]
                $port = (8086 + ($testIndex % 200))
                
                $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                $pinfo.FileName = "cmd.exe"
                $pinfo.Arguments = "/c `"set TT_TEST_PORT=$port && $exe`""
                $pinfo.UseShellExecute = $false
                $pinfo.RedirectStandardOutput = $true
                $pinfo.RedirectStandardError = $true
                $pinfo.WorkingDirectory = (Get-Location).Path
                
                $newProc = [System.Diagnostics.Process]::Start($pinfo)
                $stillRunning += @{
                    Process     = $newProc
                    TestIndex   = $testIndex
                    Port        = $port
                    TestName    = Split-Path -Leaf $exe
                    StartTime   = Get-Date
                    OutputLines = 0
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
    
    # Progress report every 2 seconds
    $now = Get-Date
    if (($now - $lastReport).TotalSeconds -ge 2) {
        $elapsed = ($now - $startTime).TotalSeconds
        $rate = if ($elapsed -gt 0) { $totalTestsRun / $elapsed } else { 0 }
        $remaining = $TotalTests - $totalTestsRun
        $eta = if ($rate -gt 0) { $remaining / $rate } else { 0 }
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tests: $totalTestsRun/$TotalTests | Rate: $([Math]::Round($rate,1))/sec | Active: $($activeProcesses.Count) | ETA: $([Math]::Round($eta))s"
        $lastReport = $now
    }
    
    # Sleep briefly to avoid busy-waiting
    [System.Threading.Thread]::Sleep(50)
}

$endTime = Get-Date
$elapsed = ($endTime - $startTime).TotalSeconds
$rate = if ($elapsed -gt 0) { $totalTestsRun / $elapsed } else { 0 }

# Compute overall proof hash
$allProofs = $proofOfWork | ForEach-Object { $_.ProofHash } | Sort-Object | Join-String -Separator ","
$finalProofBytes = $checksumAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($allProofs))
$finalProof = [System.BitConverter]::ToString($finalProofBytes).Replace("-", "")

Write-Host ""
Write-Host "==============================================="
Write-Host "Stress test complete!"
Write-Host "Total tests run: $totalTestsRun"
Write-Host "Time elapsed: $([Math]::Round($elapsed, 1)) seconds"
Write-Host "Average rate: $([Math]::Round($rate, 1)) tests/second"
Write-Host ""
Write-Host "PROOF OF WORK:"
Write-Host "Total unique test hashes: $($proofOfWork.Count)"
Write-Host "Sample hashes (first 5):"
for ($i = 0; $i -lt [Math]::Min(5, $proofOfWork.Count); $i++) {
    $p = $proofOfWork[$i]
    Write-Host "  Test $($p.TestIndex): $($p.TestName) -> $($p.ProofHash) (exit: $($p.ExitCode), duration: $([Math]::Round($p.Duration))ms, output: $($p.OutputLen)B)"
}
Write-Host ""
Write-Host "Final verification hash: $finalProof"
Write-Host "==============================================="

if ($failed) {
    exit 1
}
exit 0
