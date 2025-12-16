param(
    [int]$NumTests = 0,
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
if ($NumTests -le 0) { $NumTests = $logicalProcs }
$results = @{}
$failed = $false
$iterationNum = 0
$jobsTotalPass = 0
$jobsTotalFail = 0
$perTest = @{}

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

Write-Host "Starting parallel tests with $NumTests concurrent instances..."
Write-Host "Base port: $basePort"
Write-Host ""

while ($true) {
    if ($useDuration -and $sw.Elapsed -ge $durationTs) {
        Write-Host "Reached duration: $Duration"
        break
    }
    $iterationNum++
    if ($MaxIterations -gt 0 -and $iterationNum -gt $MaxIterations) {
        Write-Host "Reached max iterations: $MaxIterations"
        break
    }

    Write-Host "=== Iteration $iterationNum ==="
    $jobs = @()
    $iterationResults = @{}

    # Start up to NumTests in parallel
    for ($i = 0; $i -lt $NumTests; $i++) {
        if ($useDuration -and $sw.Elapsed -ge $durationTs) { break }
        $testIdx = $i % $testExes.Length
        $exe = $testExes[$testIdx]
        $port = $basePort + $i
        $jobName = "test_${i}_iter_${iterationNum}"

        # Start the test in a job
        $job = Start-Job -ScriptBlock {
            param($exe, $port, $runsPerJob)
            $env:TT_TEST_PORT = $port.ToString()
            # Run the test multiple times sequentially within this job
            for ($run = 0; $run -lt $runsPerJob; $run++) {
                $testOutput = & $exe 2>&1 | Out-String
                if ($LASTEXITCODE -ne 0) {
                    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $testOutput }
                }
            }
            return [pscustomobject]@{ ExitCode = 0; Output = '' }
        } -ArgumentList $exe, $port, $RunsPerJob -Name $jobName

        $jobs += [PSCustomObject]@{
            Job      = $job
            Exe      = $exe
            Port     = $port
            Index    = $i
            TestName = Split-Path -Leaf $exe
        }
    }

    Write-Host "Started $($jobs.Count) test jobs"

    # Wait for all jobs and collect results
    $jobsCompleted = 0
    $jobsFailed = 0

    $remaining = @($jobs)
    while ($remaining.Count -gt 0) {
        if ($useDuration -and $sw.Elapsed -ge $durationTs) {
            if (-not $durationExceededAt) { $durationExceededAt = Get-Date }
            elseif ((Get-Date) -ge $durationExceededAt.AddMilliseconds($GraceMs)) {
                foreach ($j in $remaining) { Stop-Job -Job $j.Job -Force -ErrorAction SilentlyContinue }
            }
        }
        $done = $remaining | Wait-Job -Any -Timeout 1
        if ($done) {
            $res = $done | Receive-Job
            $jobState = $done.State
            $exitCode = 1
            $output = ''
            if ($jobState -eq 'Completed' -and $null -ne $res) {
                if ($res -is [pscustomobject]) { $exitCode = [int]$res.ExitCode; $output = [string]$res.Output } else { $exitCode = 0 }
            }
            if ($exitCode -eq 0) {
                Write-Host ("[Port {0}] {1} - PASS" -f ($remaining | Where-Object { $_.Job.Id -eq $done.Id }).Port, ($remaining | Where-Object { $_.Job.Id -eq $done.Id }).TestName)
                $jobsCompleted++
            }
            else {
                Write-Host ("[Port {0}] {1} - FAIL (state: {2}, code: {3})" -f ($remaining | Where-Object { $_.Job.Id -eq $done.Id }).Port, ($remaining | Where-Object { $_.Job.Id -eq $done.Id }).TestName, $jobState, $exitCode)
                if ($output) { Write-Host "-- output --"; Write-Host $output }
                $jobsFailed++
                $failed = $true
            }
            # remove processed job
            $remaining = $remaining | Where-Object { $_.Job.Id -ne $done.Id }
            Remove-Job -Job $done -Force -ErrorAction SilentlyContinue
        }
        else {
            # timeout tick; loop again to check duration/grace
        }
    }

    # Update totals and per-test counts
    $jobsTotalPass += $jobsCompleted
    $jobsTotalFail += $jobsFailed
    Write-Host "Iteration ${iterationNum}: $jobsCompleted passed, $jobsFailed failed"
    Write-Host ""

    if ($failed) {
        Write-Host "Test failed on iteration ${iterationNum}"
        $env:PATH = $originalPath
        if ($MeasureCpu -and $cpuToken) { Remove-Item -Path $cpuToken -Force -ErrorAction SilentlyContinue; if ($cpuJob) { $null = $cpuJob | Wait-Job; $cpuJob | Remove-Job -Force } }
        exit 1
    }
}

Write-Host "All tests passed!"
Write-Host ("Total jobs: pass={0} fail={1}" -f $jobsTotalPass, $jobsTotalFail)
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
