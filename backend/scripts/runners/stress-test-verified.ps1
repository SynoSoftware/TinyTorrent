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

# Set up PATH for vcpkg dependencies (critical!)
$releaseBin = ".\vcpkg_installed\x64-windows\bin"
$debugBin = ".\vcpkg_installed\x64-windows\debug\bin"
$paths = @()
if (Test-Path $releaseBin) { $paths += (Resolve-Path $releaseBin).Path }
if (Test-Path $debugBin) { $paths += (Resolve-Path $debugBin).Path }
if ($paths.Count -gt 0) {
    $env:PATH = ($paths -join ';') + ';' + $env:PATH
}

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
$proofFolder = "$([io.path]::GetTempPath())tinytorrent-proof-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"
mkdir $proofFolder | Out-Null

Write-Host "Starting stress test with proof-of-work validation..."
Write-Host "Max concurrent processes: $MaxConcurrent"
Write-Host "Total tests to run: $TotalTests"
Write-Host "Proof directory: $proofFolder"
Write-Host ""

# Start initial batch
Write-Host "Filling initial queue with $MaxConcurrent processes..."
$testIndex = 0
$checksumAlgorithm = [System.Security.Cryptography.SHA256]::Create()

for ($i = 0; $i -lt $MaxConcurrent -and $testIndex -lt $TotalTests; $i++) {
    $testIdx = $testIndex % $testExes.Length
    $exe = $testExes[$testIdx]
    $port = (8086 + ($testIndex % 200))
    $proofFile = "$proofFolder\test_$testIndex.proof"
    
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $exe
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $port.ToString()
    
    $proc = [System.Diagnostics.Process]::Start($pinfo)
    $activeProcesses += @{
        Process   = $proc
        TestIndex = $testIndex
        Port      = $port
        TestName  = Split-Path -Leaf $exe
        StartTime = Get-Date
        ProofFile = $proofFile
    }
    
    $testIndex++
}

Write-Host "Started $($activeProcesses.Count) initial processes"
Write-Host ""

$startTime = Get-Date
$lastReport = $startTime

# Main loop: keep queue full
while ($activeProcesses.Count -gt 0) {
    # Find finished processes
    $stillRunning = @()
    
    foreach ($procObj in $activeProcesses) {
        if ($procObj.Process.HasExited) {
            # Process finished - create proof file
            $stdout = $procObj.Process.StandardOutput.ReadToEnd()
            $stderr = $procObj.Process.StandardError.ReadToEnd()
            $exitCode = $procObj.Process.ExitCode
            $duration = (Get-Date) - $procObj.StartTime
            
            # Create proof: hash + metadata file
            $metadata = @{
                TestIndex = $procObj.TestIndex
                TestName  = $procObj.TestName
                Port      = $procObj.Port
                ExitCode  = $exitCode
                Duration  = $duration.TotalMilliseconds
                Timestamp = (Get-Date -Format 'o')
                StdoutLen = $stdout.Length
                StderrLen = $stderr.Length
            }
            
            # Write proof file with metadata
            $proofContent = $metadata | ConvertTo-Json
            $hashBytes = $checksumAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($proofContent))
            $proofHash = [System.BitConverter]::ToString($hashBytes).Replace("-", "")
            
            @{
                Hash     = $proofHash
                Metadata = $metadata
            } | ConvertTo-Json | Out-File $procObj.ProofFile -Force
            
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
                $proofFile = "$proofFolder\test_$testIndex.proof"
                
                $pinfo = New-Object System.Diagnostics.ProcessStartInfo
                $pinfo.FileName = $exe
                $pinfo.UseShellExecute = $false
                $pinfo.RedirectStandardOutput = $true
                $pinfo.RedirectStandardError = $true
                $pinfo.EnvironmentVariables["TT_TEST_PORT"] = $port.ToString()
                
                $newProc = [System.Diagnostics.Process]::Start($pinfo)
                $stillRunning += @{
                    Process   = $newProc
                    TestIndex = $testIndex
                    Port      = $port
                    TestName  = Split-Path -Leaf $exe
                    StartTime = Get-Date
                    ProofFile = $proofFile
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

# Verify proof files exist
$proofFiles = Get-ChildItem $proofFolder -Filter "*.proof" | Measure-Object | Select-Object -ExpandProperty Count

# Create master proof hash
$allProofs = Get-ChildItem $proofFolder -Filter "*.proof" | ForEach-Object { Get-Content $_ | ConvertFrom-Json | Select-Object -ExpandProperty Hash } | Sort-Object | Join-String -Separator ","
$masterProofBytes = $checksumAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($allProofs))
$masterProof = [System.BitConverter]::ToString($masterProofBytes).Replace("-", "")

Write-Host ""
Write-Host "==============================================="
Write-Host "Stress test complete!"
Write-Host "Total tests run: $totalTestsRun"
Write-Host "Time elapsed: $([Math]::Round($elapsed, 1)) seconds"
Write-Host "Average rate: $([Math]::Round($rate, 1)) tests/second"
Write-Host ""
Write-Host "PROOF OF WORK:"
Write-Host "Proof files written: $proofFiles"
Write-Host "Proof directory: $proofFolder"
Write-Host "Master verification hash: $masterProof"
Write-Host ""
Write-Host "Sample proof files (first 3):"
Get-ChildItem $proofFolder -Filter "*.proof" | Sort-Object Name | Select-Object -First 3 | ForEach-Object {
    $content = Get-Content $_.FullName | ConvertFrom-Json
    Write-Host "  $($_.Name): Hash=$($content.Hash) TestIndex=$($content.Metadata.TestIndex)"
}
Write-Host "==============================================="

if ($failed) {
    exit 1
}
exit 0
