param(
    [ValidateSet('build', 'test', 'loop', 'parallel')]
    [string]$Command = 'build',
    [ValidateSet('Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'Debug',
    [string[]]$Tests = @('dispatcher-test', 'rpc-endpoint-test', 'memory-leak-test', 'rpc-filesystem-test', 'serializer-test'),
    [int]$Iterations = 1,
    [int]$MaxConcurrent = 0,
    [int]$RunsPerJob = 1,
    [int]$BasePort = 8086,
    [string]$Duration = '',
    [switch]$SkipBuild,
    [switch]$Clean,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Show-Help {
    @"
TinyTorrent helper

Usage: .\tt.ps1 <command> [options]

Commands:
  build      Build via build.ps1 (respects -Configuration, -Clean)
  test       Build (unless -SkipBuild) then run tests once sequentially
  loop       Sequential loop (-Iterations or -Duration)
  parallel   Queue tests across jobs (-MaxConcurrent, -RunsPerJob)

Examples:
  .\tt.ps1 build -Configuration Release -Clean
  .\tt.ps1 test -SkipBuild
  .\tt.ps1 loop -Iterations 25
  .\tt.ps1 parallel -MaxConcurrent 8 -RunsPerJob 3 -Duration 10m
"@
}

if ($Help) { Show-Help; exit 0 }

function ConvertTo-TimeSpan {
    param([string]$text)
    if (-not $text -or $text.Trim().Length -eq 0) { return [TimeSpan]::Zero }
    $t = $text.Trim().ToLowerInvariant()
    if ($t -match '^[0-9]+$') { return [TimeSpan]::FromSeconds([int]$t) }
    $total = [TimeSpan]::Zero
    $matches = [System.Text.RegularExpressions.Regex]::Matches($t, '([0-9]+)(ms|s|m|h)')
    if ($matches.Count -eq 0) { throw "Invalid duration: $text" }
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

function Resolve-ConfigSubdir {
    param([string]$cfg)
    switch ($cfg) {
        'Debug' { 'debug' }
        'Release' { 'release' }
        'MinSizeRel' { 'minsize' }
    }
}

function Get-TestPaths {
    param([string[]]$names, [string]$cfgSubdir, [string]$repoRoot)
    $dir = Join-Path $repoRoot "build/$cfgSubdir/tests"
    $paths = @()
    foreach ($name in $names) {
        $exe = "$name.exe"
        $path = Join-Path $dir $exe
        if (-not (Test-Path $path)) { throw "Test executable not found: $path" }
        $paths += [pscustomobject]@{ Name = $name; Path = $path }
    }
    return $paths
}

function Ensure-VcpkgOnPath {
    param([string]$repoRoot)
    $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
    $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
    $prepend = @()
    if (Test-Path $releaseBin) { $prepend += $releaseBin }
    if (Test-Path $debugBin) { $prepend += $debugBin }
    $original = $env:PATH
    if ($prepend.Count -gt 0) { $env:PATH = ($prepend -join ';') + ';' + $env:PATH }
    return $original
}

function Invoke-Build {
    param([string]$cfg, [switch]$clean)
    Write-Host "Building ($cfg)..."
    $args = @('-Configuration', $cfg)
    if ($clean) { $args += '-Clean' }
    & .\build.ps1 @args
    if ($LASTEXITCODE -ne 0) { throw "build.ps1 failed with exit code $LASTEXITCODE" }
}

function Run-TestExe {
    param([string]$path, [int]$port)
    $env:TT_TEST_PORT = $port.ToString()
    $output = & $path 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output.Trim(); Name = (Split-Path $path -Leaf); Port = $port }
}

function Run-Sequential {
    param($tests, [int]$iterations, [TimeSpan]$duration, [int]$basePort)
    $start = [DateTime]::UtcNow
    for ($iter = 1; $iter -le $iterations; $iter++) {
        $idx = 0
        foreach ($test in $tests) {
            $port = $basePort + (($iter + $idx) % 200)
            $idx++
            $result = Run-TestExe -path $test.Path -port $port
            $suffix = if ($iterations -gt 1) { " (iter $iter)" } else { '' }
            if ($result.ExitCode -eq 0) {
                Write-Host ("PASS  {0}{1}" -f $result.Name, $suffix)
            }
            else {
                Write-Host ("FAIL  {0}{1} (exit {2})" -f $result.Name, $suffix, $result.ExitCode) -ForegroundColor Red
                if ($result.Output) { Write-Host $result.Output }
                return $false
            }
        }
        if ($duration -ne [TimeSpan]::Zero -and ([DateTime]::UtcNow - $start) -ge $duration) {
            Write-Host "Duration reached; stopping."
            break
        }
    }
    return $true
}

function Start-TestJob {
    param($test, [int]$port, [int]$runsPerJob)
    Start-Job -ScriptBlock {
        param($exe, $runs, $port)
        $env:TT_TEST_PORT = $port.ToString()
        for ($r = 0; $r -lt $runs; $r++) {
            $output = & $exe 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output.Trim(); Run = $r + 1; Port = $port; Name = (Split-Path $exe -Leaf) }
            }
        }
        return [pscustomobject]@{ ExitCode = 0; Output = ''; Run = $runs; Port = $port; Name = (Split-Path $exe -Leaf) }
    } -ArgumentList $test.Path, $runsPerJob, $port
}

function Run-Parallel {
    param($tests, [int]$maxConcurrent, [int]$runsPerJob, [int]$iterations, [TimeSpan]$duration, [int]$basePort)
    if ($maxConcurrent -le 0) {
        $maxConcurrent = [math]::Max(2, [Environment]::ProcessorCount)
    }

    $durationMode = $duration -ne [TimeSpan]::Zero
    $queue = New-Object System.Collections.Generic.Queue[object]
    if (-not $durationMode) {
        for ($iter = 1; $iter -le $iterations; $iter++) {
            foreach ($test in $tests) {
                $queue.Enqueue([pscustomobject]@{ Iteration = $iter; Test = $test })
            }
        }
    }

    $running = @()
    $start = [DateTime]::UtcNow
    $portCounter = 0
    $testCounter = 0

    while ($queue.Count -gt 0 -or $running.Count -gt 0 -or $durationMode) {
        if ($durationMode -and ([DateTime]::UtcNow - $start) -ge $duration) {
            if ($running.Count -eq 0) { break }
        }

        while ($running.Count -lt $maxConcurrent) {
            if ($durationMode) {
                if (([DateTime]::UtcNow - $start) -ge $duration) { break }
                $jobDef = [pscustomobject]@{ Iteration = ($testCounter / $tests.Count) + 1; Test = $tests[$testCounter % $tests.Count] }
                $testCounter++
            }
            else {
                if ($queue.Count -eq 0) { break }
                $jobDef = $queue.Dequeue()
            }

            $port = $basePort + ($portCounter % 200)
            $portCounter++
            $job = Start-TestJob -test $jobDef.Test -port $port -runsPerJob $runsPerJob
            $running += [pscustomobject]@{ Job = $job; Def = $jobDef; Port = $port }
        }

        if ($running.Count -eq 0) {
            if (-not $durationMode) { break }
            Start-Sleep -Milliseconds 50
            continue
        }

        $done = Wait-Job -Any ($running.Job) -Timeout 1
        if (-not $done) { continue }

        $result = Receive-Job $done
        $jobInfo = $running | Where-Object { $_.Job.Id -eq $done.Id } | Select-Object -First 1
        $running = $running | Where-Object { $_.Job.Id -ne $done.Id }
        Remove-Job -Job $done -Force -ErrorAction SilentlyContinue

        $iterLabel = if ($jobInfo) { $jobInfo.Def.Iteration } else { '-' }
        $label = "[iter $iterLabel] $($result.Name)".Trim()
        if ($result.ExitCode -eq 0) {
            Write-Host ("PASS  {0} (port {1})" -f $label, $result.Port)
        }
        else {
            Write-Host ("FAIL  {0} (exit {1}, port {2})" -f $label, $result.ExitCode, $result.Port) -ForegroundColor Red
            if ($result.Output) { Write-Host $result.Output }
            return $false
        }

        if ($durationMode -and ([DateTime]::UtcNow - $start) -ge $duration -and $running.Count -eq 0) {
            break
        }
    }
}

if (-not $SkipBuild) { Invoke-Build -cfg $Configuration -clean:$Clean }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$configSubdir = Resolve-ConfigSubdir $Configuration
$durationTs = ConvertTo-TimeSpan $Duration
$testPaths = Get-TestPaths -names $Tests -cfgSubdir $configSubdir -repoRoot $repoRoot
$originalPath = Ensure-VcpkgOnPath -repoRoot $repoRoot
$ok = $true

try {
    switch ($Command) {
        'build' { Write-Host "Build completed." }
        'test' { $ok = Run-Sequential -tests $testPaths -iterations 1 -duration ([TimeSpan]::Zero) -basePort $BasePort }
        'loop' { $ok = Run-Sequential -tests $testPaths -iterations ([math]::Max(1, $Iterations)) -duration $durationTs -basePort $BasePort }
        'parallel' { $ok = Run-Parallel -tests $testPaths -maxConcurrent $MaxConcurrent -runsPerJob ([math]::Max(1, $RunsPerJob)) -iterations ([math]::Max(1, $Iterations)) -duration $durationTs -basePort $BasePort }
    }
}
finally { $env:PATH = $originalPath }
