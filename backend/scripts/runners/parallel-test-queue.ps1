param(
    [int]$MaxConcurrent = 0,
    [int]$MaxIterations = 0,
    [int]$RunsPerJob = 10,
    [string]$Duration = '',
    [switch]$MeasureCpu,
    [int]$CpuSampleMs = 500,
    [int]$GraceMs = 3000
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

# Ensure dependent DLLs are on PATH (yyjson, libtorrent, openssl)
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$vcpkgBinRelease = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
$vcpkgBinDebug = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
$originalPath = $env:PATH
try {
    $prepend = @()
    if (Test-Path $vcpkgBinRelease) { $prepend += $vcpkgBinRelease }
    if (Test-Path $vcpkgBinDebug) { $prepend += $vcpkgBinDebug }
    if ($prepend.Count -gt 0) { $env:PATH = ($prepend -join ';') + ';' + $env:PATH }
}
catch { }

$basePort = 8086
$logicalProcs = try { (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum } catch { $null }
if (-not $logicalProcs -or $logicalProcs -lt 1) { $logicalProcs = [Environment]::ProcessorCount }
if (-not $logicalProcs -or $logicalProcs -lt 1) { $logicalProcs = 4 }
if ($MaxConcurrent -le 0) { $MaxConcurrent = $logicalProcs }
$failed = $false
$jobsTotalPass = 0
$jobsTotalFail = 0
$perTest = @{}
$activeJobs = @()
$testQueue = @()
$iterationNum = 0
$jobCounter = 0

# Parse human-friendly duration text (e.g., 5, 5s, 2m, 1h30m)
function ConvertTo-TimeSpan {
    param([string]$text)
    if (-not $text -or $text.Trim().Length -eq 0) { return [TimeSpan]::Zero }
    $t = $text.Trim().ToLowerInvariant()
    if ($t -match '^[0-9]+$') { return [TimeSpan]::FromSeconds([int]$t) }
    $total = [TimeSpan]::Zero
    $matches = [System.Text.RegularExpressions.Regex]::Matches($t, '([0-9]+)(ms|s|m|h)')
    if ($matches.Count -eq 0) { throw "Invalid duration format: $text (use e.g., 5s, 2m, 1h30m, 250ms)" }
    foreach ($m in $matches) {
        $val = [int]$m.Groups[1].Value
        switch ($m.Groups[2].Value) {
            'ms' { $total += [TimeSpan]::FromMilliseconds($val) }
            's' { $total += [TimeSpan]::FromSeconds($val) }
            'm' { $total += [TimeSpan]::FromMinutes($val) }
            'h' { $total += [TimeSpan]::FromHours($val) }
        }
    }
    return $total
}

$durationTs = ConvertTo-TimeSpan $Duration
$useDuration = ($durationTs -ne [TimeSpan]::Zero)
if ($useDuration -and $MaxIterations -gt 0) {
    Write-Host "Note: -Duration specified; ignoring -MaxIterations."
    $MaxIterations = 0
}
$sw = if ($useDuration) { [System.Diagnostics.Stopwatch]::StartNew() } else { $null }
$durationExceededAt = $null

# Optional CPU sampling (background job writing CSV: timestamp,cpu)
$cpuToken = $null
$cpuCsv = $null
$cpuJob = $null
if ($MeasureCpu) {
    $cpuToken = Join-Path $env:TEMP ("tt-cpu-token-" + [guid]::NewGuid().ToString() + ".flag")
    $cpuCsv = Join-Path $env:TEMP ("tt-cpu-samples-" + [guid]::NewGuid().ToString() + ".csv")
    New-Item -ItemType File -Path $cpuToken -Force | Out-Null
    Set-Content -Path $cpuCsv -Value "timestamp,cpu" -Encoding ASCII
    $cpuJob = Start-Job -ScriptBlock {
        param($tokenPath, $csvPath, $intervalMs)
        while (Test-Path $tokenPath) {
            try {
                $ts = [DateTime]::UtcNow.ToString("o")
                $val = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
                Add-Content -Path $csvPath -Value ("{0},{1}" -f $ts, [math]::Round([double]$val, 2))
            }
            catch {}
            Start-Sleep -Milliseconds $intervalMs
        }
    } -ArgumentList $cpuToken, $cpuCsv, $CpuSampleMs
}

Write-Host "Starting queue-based parallel tests..."
Write-Host "Max concurrent jobs: $MaxConcurrent"
Write-Host "Runs per job: $RunsPerJob"
Write-Host ""

# Function to start a new test job
function Start-TestJob {
    param([int]$TestIndex, [int]$Iteration)
    
    $testIdx = $TestIndex % $testExes.Length
    $exe = $testExes[$testIdx]
    $port = $basePort + $TestIndex
    $jobName = "test_${TestIndex}_iter_${Iteration}"

    $job = Start-Job -ScriptBlock {
        param($exe, $port, $runsPerJob)
        $env:TT_TEST_PORT = $port.ToString()
        for ($run = 0; $run -lt $runsPerJob; $run++) {
            $testOutput = & $exe 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $testOutput }
            }
        }
        return [pscustomobject]@{ ExitCode = 0; Output = '' }
    } -ArgumentList $exe, $port, $RunsPerJob -Name $jobName

    return [PSCustomObject]@{
        Job       = $job
        TestIndex = $TestIndex
        Port      = $port
        TestName  = Split-Path -Leaf $exe
        Iteration = $Iteration
    }
}

# Process test jobs with queue
while ($true) {
    if ($useDuration -and $sw.Elapsed -ge $durationTs) {
        Write-Host "Reached duration: $Duration"
        break
    }
    $iterationNum++
    
    if ($MaxIterations -gt 0 -and $iterationNum -gt $MaxIterations) {
        break
    }

    Write-Host "=== Iteration $iterationNum ==="
    
    # Initialize queue with first batch of tests
    $testIndex = 0
    
    # Start initial batch to fill the queue
    while ($activeJobs.Count -lt $MaxConcurrent -and $testIndex -lt $MaxConcurrent * 2) {
        if ($useDuration -and $sw.Elapsed -ge $durationTs) { break }
        $job = Start-TestJob -TestIndex $testIndex -Iteration $iterationNum
        $activeJobs += $job
        $testIndex++
    }

    Write-Host "Started $($activeJobs.Count) initial jobs (indices 0-$($testIndex-1))"

    # Main loop: wait for jobs to finish and start new ones
    while ($activeJobs.Count -gt 0) {
        # Check which jobs are done
        $completedJobs = @()
        $stillRunning = @()

        foreach ($jobObj in $activeJobs) {
            if ($jobObj.Job.State -eq "Completed") {
                $completedJobs += $jobObj
            }
            else {
                $stillRunning += $jobObj
            }
        }

        # Process completed jobs
        foreach ($jobObj in $completedJobs) {
            $result = $jobObj.Job | Receive-Job
            $jobState = $jobObj.Job.State
            $exitCode = 1
            $output = ''
            if ($jobState -eq 'Completed' -and $null -ne $result) {
                if ($result -is [pscustomobject]) { $exitCode = [int]$result.ExitCode; $output = [string]$result.Output }
            }
            if ($exitCode -eq 0) {
                Write-Host "[Port $($jobObj.Port)] $($jobObj.TestName) - PASS"
                $jobsTotalPass += 1
                if (-not $perTest.ContainsKey($jobObj.TestName)) { $perTest[$jobObj.TestName] = [pscustomobject]@{ JobsPass = 0; JobsFail = 0 } }
                $perTest[$jobObj.TestName].JobsPass++
            }
            else {
                Write-Host "[Port $($jobObj.Port)] $($jobObj.TestName) - FAIL (state: $jobState, code: $exitCode)"
                if ($output) { Write-Host "-- output --"; Write-Host $output }
                $jobsTotalFail += 1
                if (-not $perTest.ContainsKey($jobObj.TestName)) { $perTest[$jobObj.TestName] = [pscustomobject]@{ JobsPass = 0; JobsFail = 0 } }
                $perTest[$jobObj.TestName].JobsFail++
                $failed = $true
            }

            # Clean up job
            Remove-Job -Job $jobObj.Job -Force

            # If there are more tests to run for this iteration, start a new one
            if ($testIndex -lt $MaxConcurrent * 2 -and (-not $useDuration -or $sw.Elapsed -lt $durationTs)) {
                $newJob = Start-TestJob -TestIndex $testIndex -Iteration $iterationNum
                $stillRunning += $newJob
                $testIndex++
            }
        }

        $activeJobs = $stillRunning

        # Small sleep to avoid busy waiting
        if ($activeJobs.Count -gt 0) {
            Start-Sleep -Milliseconds 100
        }

        # If duration exceeded for longer than grace, kill remaining
        if ($useDuration -and $sw.Elapsed -ge $durationTs) {
            if (-not $durationExceededAt) { $durationExceededAt = Get-Date }
            elseif ((Get-Date) -ge $durationExceededAt.AddMilliseconds($GraceMs)) {
                foreach ($jobObj in $activeJobs) { Stop-Job -Job $jobObj.Job -Force -ErrorAction SilentlyContinue }
                $activeJobs = @()
            }
        }
    }

    Write-Host ("Iteration {0} complete. Jobs pass={1} fail={2}" -f $iterationNum, $jobsTotalPass, $jobsTotalFail)
    Write-Host ""

    if ($failed) {
        Write-Host "Test failed on iteration $iterationNum"
        $env:PATH = $originalPath
        if ($MeasureCpu -and $cpuToken) { Remove-Item -Path $cpuToken -Force -ErrorAction SilentlyContinue; if ($cpuJob) { $null = $cpuJob | Wait-Job; $cpuJob | Remove-Job -Force } }
        exit 1
    }
}

Write-Host "==============================================="
Write-Host "All tests passed!"
Write-Host ("Jobs summary: pass={0} fail={1}" -f $jobsTotalPass, $jobsTotalFail)
if ($perTest.Keys.Count -gt 0) {
    Write-Host "Per-test job results:"
    foreach ($k in $perTest.Keys | Sort-Object) {
        $v = $perTest[$k]
        Write-Host ("  {0}: pass={1} fail={2}" -f $k, $v.JobsPass, $v.JobsFail)
    }
}
Write-Host "==============================================="
$env:PATH = $originalPath

# CPU sampling summary
if ($MeasureCpu -and $cpuToken) {
    Remove-Item -Path $cpuToken -Force -ErrorAction SilentlyContinue
    if ($cpuJob) { $null = $cpuJob | Wait-Job; $cpuJob | Remove-Job -Force }
    if (Test-Path $cpuCsv) {
        $lines = Get-Content -Path $cpuCsv | Select-Object -Skip 1
        $nums = @()
        foreach ($ln in $lines) {
            if (-not $ln) { continue }
            $parts = $ln.Split(',')
            if ($parts.Count -ge 2) {
                $d = 0.0; if ([double]::TryParse($parts[1], [ref]$d)) { $nums += $d }
            }
        }
        if ($nums.Count -gt 0) {
            $avg = ($nums | Measure-Object -Average).Average
            $min = ($nums | Measure-Object -Minimum).Minimum
            $max = ($nums | Measure-Object -Maximum).Maximum
            $sorted = $nums | Sort-Object
            $p95Index = [int][math]::Ceiling($sorted.Count * 0.95) - 1; if ($p95Index -lt 0) { $p95Index = 0 }
            $p95 = $sorted[$p95Index]
            Write-Host ("CPU usage samples={0} avg={1:N1}% p95={2:N1}% min={3:N1}% max={4:N1}%" -f $sorted.Count, $avg, $p95, $min, $max)
        }
        else {
            Write-Host "CPU usage: no samples collected"
        }
        Remove-Item -Path $cpuCsv -Force -ErrorAction SilentlyContinue
    }
}
exit 0
