param(
    [ValidateSet('Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'Debug',
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',
    [switch]$Clean,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host @"
TinyTorrent Build Script

Usage: .\build.ps1 [options]

Options:
  -Configuration <Debug|Release|MinSizeRel>  Build configuration (default: Debug)
  -Clean                                     Remove the build directory before configuring
  -MesonPath <path>                          Override meson.exe location
  -NinjaPath <path>                          Override ninja.exe location
  -VsWherePath <path>                        Override vswhere.exe location
  -Help                                      Show this help message
"@
    exit 0
}

function Get-UserScriptsPath {
    try {
        $pythonVersioned = & python -c "import os, site, sys; base = site.USER_BASE; ver = 'Python{}{}'.format(sys.version_info.major, sys.version_info.minor); print(os.path.join(base, ver, 'Scripts'))"
        $pythonBase = & python -c "import os, site; print(os.path.join(site.USER_BASE, 'Scripts'))"
        $paths = @()
        if ($pythonVersioned) { $paths += $pythonVersioned.Trim() }
        if ($pythonBase -and $pythonBase.Trim() -ne $pythonVersioned.Trim()) { $paths += $pythonBase.Trim() }
        return $paths
    }
    catch {
        throw 'Unable to determine the Python user scripts path; ensure Python 3.9+ is on PATH.'
    }
}

function Resolve-Executable {
    param($overridePath, $name, $candidateDirs)

    if ($overridePath) {
        if (Test-Path $overridePath) { return $overridePath }
        throw "Override path for $name not found: $overridePath"
    }

    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    foreach ($dir in $candidateDirs) {
        if (-not $dir) { continue }
        $candidate = Join-Path $dir "$name.exe"
        if (Test-Path $candidate) { return $candidate }
    }

    throw "Could not locate $name; install it with `python -m pip install --user $name` or pass -${name}Path."
}

function Resolve-VsWhere {
    param($overridePath)

    if ($overridePath) {
        if (Test-Path $overridePath) { return $overridePath }
        throw "Override path for vswhere.exe not found: $overridePath"
    }

    $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) {
        $default = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path $default) { return $default }
    }

    throw 'Could not locate vswhere.exe; install Visual Studio 2017+ or provide a path via -VsWherePath.'
}

function Import-VsEnvironment {
    param($vswhere)

    $vsInstallArgs = @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath')
    $vsInstallPath = (& $vswhere @vsInstallArgs) | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
    if (-not $vsInstallPath) {
        throw 'Unable to locate a Visual Studio installation that contains the MSVC toolset.'
    }

    $vcvarsPath = Join-Path $vsInstallPath 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path $vcvarsPath)) {
        throw "Could not find vcvars64.bat under $vsInstallPath."
    }

    $cmd = "`"$vcvarsPath`" amd64 && set"
    $envOutput = & cmd /c $cmd
    foreach ($line in ($envOutput -split "`r?`n")) {
        if (-not $line) { continue }
        $parts = $line -split ('=', 2)
        if ($parts.Count -ne 2) { continue }
        Set-Item -Path ("Env:" + $parts[0]) -Value $parts[1]
    }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
$buildDir = Join-Path $repoRoot 'build'

if (-not (Test-Path $vcpkgDir)) {
    throw 'vcpkg directory not found. Run setup.ps1 first.'
}
if (-not (Test-Path $vcpkgExe)) {
    throw 'vcpkg.exe not found; run setup.ps1 first.'
}

$vswhereExe = Resolve-VsWhere $VsWherePath
Import-VsEnvironment $vswhereExe

$userScriptDirs = Get-UserScriptsPath
$mesonExe = Resolve-Executable $MesonPath 'meson' $userScriptDirs
$ninjaExe = Resolve-Executable $NinjaPath 'ninja' $userScriptDirs

$mesonBuildType = ''
$configSubdir = ''
$loggingArg = 'true'
$testsArg = 'true'
$vscrt = 'md'

switch ($Configuration) {
    'Debug' {
        $mesonBuildType = 'debug'
        $configSubdir = 'debug'
    }
    'Release' {
        $mesonBuildType = 'minsize'
        $configSubdir = 'release'
        $loggingArg = 'false'
        $testsArg = 'false'
        $vscrt = 'mt'
    }
    'MinSizeRel' {
        $mesonBuildType = 'minsize'
        $configSubdir = 'minsize'
        $loggingArg = 'false'
        $testsArg = 'false'
        $vscrt = 'mt'
    }
}

$mesonBuildDir = Join-Path $buildDir $configSubdir

if ($Clean -and (Test-Path $mesonBuildDir)) {
    Write-Host "Cleaning build directory: $mesonBuildDir"
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

$vcpkgTriplet = if ($Configuration -eq 'Debug') { 'x64-windows' } else { 'x64-windows-static' }
$useStaticVcpkg = $vcpkgTriplet -eq 'x64-windows-static'
$env:VCPKG_DEFAULT_TRIPLET = $vcpkgTriplet

Write-Host ("Installing manifest dependencies via vcpkg ({0})..." -f $vcpkgTriplet)
Push-Location $vcpkgDir
try {
    & $vcpkgExe install --triplet $vcpkgTriplet
}
finally {
    Pop-Location
}

Set-Location $repoRoot

$vcpkgTripletRoot = Join-Path $repoRoot 'vcpkg_installed'
$vcpkgTripletRoot = Join-Path $vcpkgTripletRoot $vcpkgTriplet
$vcpkgShare = Join-Path $vcpkgTripletRoot 'share'
$vcpkgRoot = $vcpkgTripletRoot
$prefixPaths = @()
if (Test-Path $vcpkgShare) { $prefixPaths += $vcpkgShare }
if (Test-Path $vcpkgRoot) { $prefixPaths += $vcpkgRoot }
if ($prefixPaths.Count -gt 0) {
    $newPrefixValue = $prefixPaths -join ';'
    if ($env:CMAKE_PREFIX_PATH) {
        $env:CMAKE_PREFIX_PATH = "$newPrefixValue;$env:CMAKE_PREFIX_PATH"
    }
    else {
        $env:CMAKE_PREFIX_PATH = $newPrefixValue
    }
}

if ($useStaticVcpkg -and (Test-Path $mesonBuildDir)) {
    Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

$mesonArgs = @('setup', '--backend=ninja')
if (-not $useStaticVcpkg) {
    $mesonInfo = Join-Path $mesonBuildDir 'meson-info'
    if (Test-Path $mesonInfo) {
        $mesonArgs += '--reconfigure'
    }
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
if ($mesonBuildType -ne 'debug') {
    $mesonArgs += '-Db_lto=true'
    $mesonArgs += '-Dstrip=true'
}
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson/Ninja..."
& $mesonExe @mesonArgs

Write-Host "Building ($Configuration)..."
& $ninjaExe -C $mesonBuildDir
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -ne 0) {
    Write-Host "Build failed with exit code $buildExitCode" -ForegroundColor Red
    exit $buildExitCode
}

$testsEnabled = $testsArg -eq 'true'
if ($testsEnabled) {
    Write-Host "Running tests..."
    $testBinDirs = @()
    $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
    $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
    if (Test-Path $releaseBin) { $testBinDirs += $releaseBin }
    if (Test-Path $debugBin) { $testBinDirs += $debugBin }

    $originalPath = $env:PATH
    if ($testBinDirs.Count -gt 0) {
        $env:PATH = ($testBinDirs -join ';') + ';' + $env:PATH
    }

    $testResults = @()
    $runSucceeded = $true
    try {
        $testDir = Join-Path $mesonBuildDir 'tests'
        $testExecutables = @(
            'dispatcher-test.exe',
            'rpc-endpoint-test.exe',
            'memory-leak-test.exe',
            'rpc-filesystem-test.exe',
            'serializer-test.exe'
        )

        foreach ($testExe in $testExecutables) {
            $testPath = Join-Path $testDir $testExe
            if (-not (Test-Path $testPath)) {
                throw "Test executable not found: $testPath"
            }
            Write-Host "  Running $testExe"
            $testOutput = & $testPath 2>&1 | Out-String
            $testExitCode = $LASTEXITCODE
            $trimmedOutput = $testOutput.Trim()
            $testResults += [pscustomobject]@{
                Name     = $testExe
                ExitCode = $testExitCode
                Output   = $trimmedOutput
            }
            if ($testExitCode -ne 0) {
                Write-Host ("    FAIL (exit code {0})" -f $testExitCode) -ForegroundColor Red
                if ($trimmedOutput) {
                    Write-Host "    -- captured output --"
                    Write-Host $trimmedOutput
                }
                $runSucceeded = $false
                break
            }
            Write-Host "    PASS"
        }

        if (-not $runSucceeded) {
            throw "One or more tests failed; check the log above."
        }
    }
    finally {
        $env:PATH = $originalPath
        $logLines = @()
        $timestamp = Get-Date -Format o
        $logLines += "[ {0} - {1} ]" -f $timestamp, $Configuration
        foreach ($entry in $testResults) {
            $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            $statusLine = "{0} {1} exit={2}" -f $status, $entry.Name, $entry.ExitCode
            $logLines += $statusLine
            if ($entry.ExitCode -ne 0 -and $entry.Output) {
                $logLines += "  Output: $($entry.Output)"
            }
        }
        if ($logLines.Count -gt 0) {
            $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
            Add-Content -Path $testLogFile -Value $logLines
        }
    }
}
else {
    Write-Host "Tests are disabled for configuration $Configuration; skipping."
}

if (-not $useStaticVcpkg) {
    $runtimeDlls = @(
        'torrent-rasterbar.dll',
        'yyjson.dll',
        'libssl-3-x64.dll',
        'libcrypto-3-x64.dll'
    )
    $runtimeRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
    $runtimeSourceDir = if ($Configuration -eq 'Debug') {
        Join-Path $runtimeRoot 'debug\bin'
    }
    else {
        Join-Path $runtimeRoot 'bin'
    }
    if (Test-Path $runtimeSourceDir) {
        foreach ($dll in $runtimeDlls) {
            $source = Join-Path $runtimeSourceDir $dll
            if (Test-Path $source) {
                Copy-Item -Path $source -Destination $mesonBuildDir -Force
            }
        }
    }
    else {
        Write-Host "Warning: runtime dependency directory missing: $runtimeSourceDir"
    }
    Write-Host "Runtime DLLs:"
    foreach ($dll in $runtimeDlls) {
        $path = Join-Path $mesonBuildDir $dll
        if (Test-Path $path) {
            $sizeKb = (Get-Item $path).Length / 1KB
            Write-Host ("  {0,-20} {1,8:N2} KB" -f $dll, $sizeKb)
        }
    }
}
else {
    Write-Host "Static vcpkg triplet in use; runtime DLLs are linked statically."
}

$linkedLibs = @(
    'torrent-rasterbar.lib',
    'yyjson.lib',
    'sqlite3.lib',
    'libssl.lib',
    'libcrypto.lib'
)
$staticLibDir = Join-Path $vcpkgTripletRoot 'lib'
Write-Host "Linked library footprint ($vcpkgTriplet):"
foreach ($lib in $linkedLibs) {
    $path = Join-Path $staticLibDir $lib
    if (Test-Path $path) {
        $sizeMb = (Get-Item $path).Length / 1MB
        Write-Host ("  {0,-20} {1,8:N2} MB  {2}" -f $lib, $sizeMb, $path)
    }
    else {
        Write-Host ("  {0,-20}    missing  {1}" -f $lib, $path)
    }
}

$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
    $lengthKb = (Get-Item $exePath).Length / 1024.0
    Write-Host $exePath
    Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
    $mapPath = Join-Path $mesonBuildDir 'tt-engine.map'
    if (Test-Path $mapPath) {
        $mapSizeKb = (Get-Item $mapPath).Length / 1024.0
        Write-Host ("   map: {0} ({1:N2} kb)" -f $mapPath, $mapSizeKb)
    }
}
else {
    Write-Host ('Executable not found: {0}' -f $exePath)
}

$mesonArgs = @('setup', '--backend=ninja')
if (-not $useStaticVcpkg) {
    $mesonInfo = Join-Path $mesonBuildDir 'meson-info'
    if (Test-Path $mesonInfo) {
        $mesonArgs += '--reconfigure'
    }
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
$sizeOptimizedBuild = $mesonBuildType -ne 'debug'
if ($sizeOptimizedBuild) {
    $mesonArgs += '-Db_lto=true'
    $mesonArgs += '-Dstrip=true'
}
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson/Ninja..."
& $mesonExe @mesonArgs

Write-Host "Building ($Configuration)..."
& $ninjaExe -C $mesonBuildDir
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -ne 0) {
    Write-Host "Build failed with exit code $buildExitCode" -ForegroundColor Red
    exit $buildExitCode
}

$testsEnabled = $testsArg -eq 'true'

if ($testsEnabled) {
    Write-Host "Running tests..."
    $testBinDirs = @()
    $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
    $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
    if (Test-Path $releaseBin) {
        $testBinDirs += $releaseBin
    }
    if (Test-Path $debugBin) {
        $testBinDirs += $debugBin
    }
    $originalPath = $env:PATH
    if ($testBinDirs.Count -gt 0) {
        $env:PATH = ($testBinDirs -join ';') + ';' + $env:PATH
    }
    $testDir = Join-Path $mesonBuildDir 'tests'
    $testExecutables = @('dispatcher-test.exe', 'rpc-endpoint-test.exe', 'memory-leak-test.exe')
    $testResults = @()
    $runSucceeded = $true
    $failureMessage = ''
    $iteration = 0
    $loopLimit = [int]$MaxLoopIterations
    if (-not $LoopTests -and $loopLimit -gt 0) {
        Write-Host ("Warning: -MaxLoopIterations requires -LoopTests; ignoring target of {0} iterations." -f $loopLimit)
    }
    $dumpToolExe = ''
    $dumpRoot = ''
    if ($CaptureDumps) {
        $sysInternalsPaths = @()
        if ($env:ProgramFiles) {
            $sysInternalsPaths += (Join-Path $env:ProgramFiles 'Sysinternals')
        }
        if (${env:ProgramFiles(x86)}) {
            $sysInternalsPaths += (Join-Path ${env:ProgramFiles(x86)} 'Sysinternals')
        }
        $dumpToolExe = Resolve-Executable $DumpToolPath 'procdump' $sysInternalsPaths
        $dumpRoot = Join-Path $mesonBuildDir 'test-dumps'
        New-Item -Path $dumpRoot -ItemType Directory -Force | Out-Null
        Write-Host ("  Capturing crash dumps via {0} -> {1}" -f $dumpToolExe, $dumpRoot)
    }
    
    # Determine number of parallel test jobs to run
    $cpuCount = (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
    if (-not $cpuCount -or $cpuCount -lt 1) {
        $cpuCount = [Environment]::ProcessorCount
    }
    if (-not $cpuCount -or $cpuCount -lt 1) {
        $cpuCount = 4  # Fallback default
    }
    
    # Note: Cannot run RPC tests in parallel due to fixed port binding (127.0.0.1:8086)
    # Sequential execution is required to avoid "bind: 10048" errors
    
    try {
        while ($true) {
            # Run iterations sequentially to avoid port conflicts
            if ($LoopTests -and $false) {
                # Disabled parallel iterations due to port conflicts
                $iterationBatch = @()
                for ($i = 0; $i -lt $parallelIterations; $i++) {
                    $iteration++
                    if ($loopLimit -gt 0 -and $iteration -gt $loopLimit) {
                        break
                    }
                    $iterationBatch += $iteration
                }
                
                if ($iterationBatch.Count -eq 0) {
                    break
                }
                
                Write-Host ("  Running iterations {0}-{1} in parallel" -f $iterationBatch[0], $iterationBatch[-1])
                
                # Run COMPLETE test iterations in parallel (all tests sequentially per iteration)
                # This avoids port binding conflicts between tests
                $jobs = @()
                foreach ($iter in $iterationBatch) {
                    $jobParams = @{
                        TestDir      = $testDir
                        TestExes     = $testExecutables
                        Iteration    = $iter
                        CaptureDumps = $CaptureDumps
                        DumpToolExe  = $dumpToolExe
                        DumpRoot     = $dumpRoot
                    }
                    
                    $job = Start-Job -ScriptBlock {
                        param($params)
                        $allResults = @()
                        
                        # Run all tests sequentially for this iteration
                        foreach ($testExe in $params.TestExes) {
                            $testPath = Join-Path $params.TestDir $testExe
                            $testOutput = ''
                            $testDumpDir = ''
                            
                            try {
                                if ($params.CaptureDumps) {
                                    $iterationDumpRoot = Join-Path $params.DumpRoot ("iter-{0}" -f $params.Iteration)
                                    $testDumpDir = Join-Path $iterationDumpRoot $testExe
                                    New-Item -ItemType Directory -Force -Path $testDumpDir | Out-Null
                                    $dumpArgs = @('-accepteula', '-ma', '-e', '-n', '1', '-x', $testDumpDir, $testPath)
                                    $testOutput = & $params.DumpToolExe @dumpArgs 2>&1 | Out-String
                                }
                                else {
                                    $testOutput = & $testPath 2>&1 | Out-String
                                }
                            }
                            catch {
                                $testOutput = $_.Exception.Message
                            }
                            
                            $allResults += [pscustomobject]@{
                                Name      = $testExe
                                ExitCode  = $LASTEXITCODE
                                Output    = $testOutput.Trim()
                                Iteration = $params.Iteration
                                DumpDir   = $testDumpDir
                            }
                            
                            # Stop running tests in this iteration if one fails
                            if ($LASTEXITCODE -ne 0) {
                                break
                            }
                        }
                        
                        return $allResults
                    } -ArgumentList $jobParams
                        
                    $jobs += $job
                }
                
                # Wait for all jobs and collect results
                $jobResults = $jobs | Wait-Job | Receive-Job
                $jobs | Remove-Job
                
                # Process and display results grouped by iteration
                $resultsByIteration = $jobResults | Group-Object -Property Iteration | Sort-Object -Property Name
                foreach ($iterGroup in $resultsByIteration) {
                    $iter = $iterGroup.Name
                    Write-Host ("  Loop iteration {0}" -f $iter)
                    
                    foreach ($result in ($iterGroup.Group | Sort-Object -Property Name)) {
                        Write-Host ("    > {0}" -f $result.Name)
                        
                        $testResults += $result
                        
                        if ($result.ExitCode -ne 0) {
                            Write-Host ("      FAIL (exit code {0})" -f $result.ExitCode) -ForegroundColor Red
                            if ($result.Output) {
                                Write-Host "      -- output --"
                                Write-Host $result.Output
                            }
                            $runSucceeded = $false
                            $failureMessage = "Test $($result.Name) failed (exit code $($result.ExitCode)) on iteration $iter"
                        }
                        else {
                            Write-Host "      PASS" -ForegroundColor Green
                        }
                    }
                }
                
                if (-not $runSucceeded) {
                    break
                }
                
                if ($loopLimit -gt 0 -and $iteration -ge $loopLimit) {
                    Write-Host ("  Loop limit reached ({0} iterations); stopping without failure." -f $loopLimit)
                    break
                }
            }
            else {
                # Single iteration mode or non-loop mode
                $iteration++
                if ($LoopTests) {
                    Write-Host ("  Loop iteration {0}" -f $iteration)
                }
            
                # Run tests in parallel using background jobs
                $jobs = @()
                foreach ($testExe in $testExecutables) {
                    $testPath = Join-Path $testDir $testExe
                    if (-not (Test-Path $testPath)) {
                        throw "Test executable not found: $testPath"
                    }
                
                    $jobParams = @{
                        TestPath     = $testPath
                        TestExe      = $testExe
                        Iteration    = $iteration
                        CaptureDumps = $CaptureDumps
                        DumpToolExe  = $dumpToolExe
                        DumpRoot     = $dumpRoot
                    }
                
                    $job = Start-Job -ScriptBlock {
                        param($params)
                        $testOutput = ''
                        $testDumpDir = ''
                    
                        try {
                            if ($params.CaptureDumps) {
                                $iterationDumpRoot = Join-Path $params.DumpRoot ("iter-{0}" -f $params.Iteration)
                                $testDumpDir = Join-Path $iterationDumpRoot $params.TestExe
                                New-Item -ItemType Directory -Force -Path $testDumpDir | Out-Null
                                $dumpArgs = @('-accepteula', '-ma', '-e', '-n', '1', '-x', $testDumpDir, $params.TestPath)
                                $testOutput = & $params.DumpToolExe @dumpArgs 2>&1 | Out-String
                            }
                            else {
                                $testOutput = & $params.TestPath 2>&1 | Out-String
                            }
                        }
                        catch {
                            $testOutput = $_.Exception.Message
                        }
                    
                        [pscustomobject]@{
                            Name      = $params.TestExe
                            ExitCode  = $LASTEXITCODE
                            Output    = $testOutput.Trim()
                            Iteration = $params.Iteration
                            DumpDir   = $testDumpDir
                        }
                    } -ArgumentList $jobParams
                
                    $jobs += $job
                }
            
                # Wait for all jobs to complete and collect results
                $jobResults = $jobs | Wait-Job | Receive-Job
                $jobs | Remove-Job
            
                # Process results
                foreach ($result in $jobResults) {
                    $iterationSuffix = ''
                    if ($LoopTests) {
                        $iterationSuffix = (" (iteration {0})" -f $iteration)
                    }
                    Write-Host ("  > {0}{1}" -f $result.Name, $iterationSuffix)
                
                    $testResults += $result
                
                    if ($result.ExitCode -ne 0) {
                        Write-Host ("    FAIL (exit code {0})" -f $result.ExitCode)
                        Write-Host "    -- captured output --"
                        if ($result.Output) {
                            Write-Host $result.Output
                        }
                        else {
                            Write-Host "    <no output captured>"
                        }
                        $runSucceeded = $false
                        $failureMessage = "Test $($result.Name) failed (exit code $($result.ExitCode)) on iteration $iteration"
                    }
                    else {
                        Write-Host "    PASS"
                    }
                }
            
                if (-not $runSucceeded) {
                    break
                }
                if (-not $LoopTests) {
                    break
                }
                if ($loopLimit -gt 0 -and $iteration -ge $loopLimit) {
                    Write-Host ("  Loop limit reached ({0} iterations); stopping without failure." -f $loopLimit)
                    break
                }
            }
        }
    }
    finally {
        $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
        $logLines = @()
        $timestamp = Get-Date -Format o
        $entryLine = "[ {0} - {1} ]" -f $timestamp, $Configuration
        $logLines += $entryLine
        foreach ($entry in $testResults) {
            $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            $statusLine = "$status $($entry.Name) iter=$($entry.Iteration) exit=$($entry.ExitCode)"
            if ($entry.DumpDir) {
                $statusLine += " dumps=$($entry.DumpDir)"
            }
            $logLines += $statusLine
            if ($entry.ExitCode -ne 0 -and $entry.Output) {
                $logLines += "  Output: $($entry.Output)"
            }
        }
        if ($logLines.Count -gt 0) {
            Add-Content -Path $testLogFile -Value $logLines
        }
        $env:PATH = $originalPath
    }
    if (-not $runSucceeded) {
        throw $failureMessage
    }
}
else {
    Write-Host "Tests are disabled for configuration $Configuration; skipping."
}

if (-not $useStaticVcpkg) {
    $runtimeDlls = @(
        'torrent-rasterbar.dll',
        'yyjson.dll',
        'libssl-3-x64.dll',
        'libcrypto-3-x64.dll'
    )
    $runtimeRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
    $runtimeSourceDir = if ($Configuration -eq 'Debug') {
        Join-Path $runtimeRoot 'debug\bin'
    }
    else {
        Join-Path $runtimeRoot 'bin'
    }
    if (Test-Path $runtimeSourceDir) {
        foreach ($dll in $runtimeDlls) {
            $source = Join-Path $runtimeSourceDir $dll
            if (Test-Path $source) {
                Copy-Item -Path $source -Destination $mesonBuildDir -Force
            }
        }
    }
    else {
        Write-Host "Warning: runtime dependency directory missing: $runtimeSourceDir"
    }
}
else {
    Write-Host "Static vcpkg triplet in use; runtime DLLs are linked statically."
}

$linkedLibs = @(
    'torrent-rasterbar.lib',
    'yyjson.lib',
    'sqlite3.lib',
    'libssl.lib',
    'libcrypto.lib'
)
$staticLibDir = Join-Path $vcpkgTripletRoot 'lib'
Write-Host "Linked library footprint ($vcpkgTriplet):"
foreach ($lib in $linkedLibs) {
    $path = Join-Path $staticLibDir $lib
    if (Test-Path $path) {
        $sizeMb = (Get-Item $path).Length / 1MB
        Write-Host ("  {0,-20} {1,8:N2} MB  {2}" -f $lib, $sizeMb, $path)
    }
    else {
        Write-Host ("  {0,-20}    missing  {1}" -f $lib, $path)
    }
}

$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
    $lengthKb = (Get-Item $exePath).Length / 1024.0
    Write-Host $exePath
    Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
    $mapPath = Join-Path $mesonBuildDir 'tt-engine.map'
    if (Test-Path $mapPath) {
        $mapSizeKb = (Get-Item $mapPath).Length / 1024.0
        Write-Host ("   map: {0} ({1:N2} kb)" -f $mapPath, $mapSizeKb)
    }
}
else {
    Write-Host ('Executable not found: {0}' -f $exePath)
}

$mesonArgs = @('setup', '--backend=ninja')
if (-not $useStaticVcpkg) {
    $mesonInfo = Join-Path $mesonBuildDir 'meson-info'
    if (Test-Path $mesonInfo) {
        $mesonArgs += '--reconfigure'
    }
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
$sizeOptimizedBuild = $mesonBuildType -ne 'debug'
if ($sizeOptimizedBuild) {
    $mesonArgs += '-Db_lto=true'
    $mesonArgs += '-Dstrip=true'
}
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson/Ninja..."
& $mesonExe @mesonArgs

Write-Host "Building ($Configuration)..."
& $ninjaExe -C $mesonBuildDir
$buildExitCode = $LASTEXITCODE

if ($buildExitCode -ne 0) {
    Write-Host "Build failed with exit code $buildExitCode" -ForegroundColor Red
    exit $buildExitCode
}

$testsEnabled = $testsArg -eq 'true'

if ($testsEnabled) {
    Write-Host "Running tests..."
    $testBinDirs = @()
    $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
    $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
    if (Test-Path $releaseBin) {
        $testBinDirs += $releaseBin
    }
    if (Test-Path $debugBin) {
        $testBinDirs += $debugBin
    }
    $originalPath = $env:PATH
    if ($testBinDirs.Count -gt 0) {
        $env:PATH = ($testBinDirs -join ';') + ';' + $env:PATH
    }
    $testDir = Join-Path $mesonBuildDir 'tests'
    $testExecutables = @('dispatcher-test.exe', 'rpc-endpoint-test.exe', 'memory-leak-test.exe')
    $testResults = @()
    $runSucceeded = $true
    $failureMessage = ''
    $iteration = 0
    $loopLimit = [int]$MaxLoopIterations
    if (-not $LoopTests -and $loopLimit -gt 0) {
        Write-Host ("Warning: -MaxLoopIterations requires -LoopTests; ignoring target of {0} iterations." -f $loopLimit)
    }
    $dumpToolExe = ''
    $dumpRoot = ''
    if ($CaptureDumps) {
        $sysInternalsPaths = @()
        if ($env:ProgramFiles) {
            $sysInternalsPaths += (Join-Path $env:ProgramFiles 'Sysinternals')
        }
        if (${env:ProgramFiles(x86)}) {
            $sysInternalsPaths += (Join-Path ${env:ProgramFiles(x86)} 'Sysinternals')
        }
        $dumpToolExe = Resolve-Executable $DumpToolPath 'procdump' $sysInternalsPaths
        $dumpRoot = Join-Path $mesonBuildDir 'test-dumps'
        New-Item -Path $dumpRoot -ItemType Directory -Force | Out-Null
        Write-Host ("  Capturing crash dumps via {0} -> {1}" -f $dumpToolExe, $dumpRoot)
    }
    
    # Determine number of parallel test jobs to run
    $cpuCount = (Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
    if (-not $cpuCount -or $cpuCount -lt 1) {
        $cpuCount = [Environment]::ProcessorCount
    }
    if (-not $cpuCount -or $cpuCount -lt 1) {
        $cpuCount = 4  # Fallback default
    }
    
    # Note: Cannot run RPC tests in parallel due to fixed port binding (127.0.0.1:8086)
    # Sequential execution is required to avoid "bind: 10048" errors
    
    try {
        while ($true) {
            # Run iterations sequentially to avoid port conflicts
            if ($LoopTests -and $false) {
                # Disabled parallel iterations due to port conflicts
                $iterationBatch = @()
                for ($i = 0; $i -lt $parallelIterations; $i++) {
                    $iteration++
                    if ($loopLimit -gt 0 -and $iteration -gt $loopLimit) {
                        break
                    }
                    $iterationBatch += $iteration
                }
                
                if ($iterationBatch.Count -eq 0) {
                    break
                }
                
                Write-Host ("  Running iterations {0}-{1} in parallel" -f $iterationBatch[0], $iterationBatch[-1])
                
                # Run COMPLETE test iterations in parallel (all tests sequentially per iteration)
                # This avoids port binding conflicts between tests
                $jobs = @()
                foreach ($iter in $iterationBatch) {
                    $jobParams = @{
                        TestDir      = $testDir
                        TestExes     = $testExecutables
                        Iteration    = $iter
                        CaptureDumps = $CaptureDumps
                        DumpToolExe  = $dumpToolExe
                        DumpRoot     = $dumpRoot
                    }
                    
                    $job = Start-Job -ScriptBlock {
                        param($params)
                        $allResults = @()
                        
                        # Run all tests sequentially for this iteration
                        foreach ($testExe in $params.TestExes) {
                            $testPath = Join-Path $params.TestDir $testExe
                            $testOutput = ''
                            $testDumpDir = ''
                            
                            try {
                                if ($params.CaptureDumps) {
                                    $iterationDumpRoot = Join-Path $params.DumpRoot ("iter-{0}" -f $params.Iteration)
                                    $testDumpDir = Join-Path $iterationDumpRoot $testExe
                                    New-Item -ItemType Directory -Force -Path $testDumpDir | Out-Null
                                    $dumpArgs = @('-accepteula', '-ma', '-e', '-n', '1', '-x', $testDumpDir, $testPath)
                                    $testOutput = & $params.DumpToolExe @dumpArgs 2>&1 | Out-String
                                }
                                else {
                                    $testOutput = & $testPath 2>&1 | Out-String
                                }
                            }
                            catch {
                                $testOutput = $_.Exception.Message
                            }
                            
                            $allResults += [pscustomobject]@{
                                Name      = $testExe
                                ExitCode  = $LASTEXITCODE
                                Output    = $testOutput.Trim()
                                Iteration = $params.Iteration
                                DumpDir   = $testDumpDir
                            }
                            
                            # Stop running tests in this iteration if one fails
                            if ($LASTEXITCODE -ne 0) {
                                break
                            }
                        }
                        
                        return $allResults
                    } -ArgumentList $jobParams
                        
                    $jobs += $job
                }
                
                # Wait for all jobs and collect results
                $jobResults = $jobs | Wait-Job | Receive-Job
                $jobs | Remove-Job
                
                # Process and display results grouped by iteration
                $resultsByIteration = $jobResults | Group-Object -Property Iteration | Sort-Object -Property Name
                foreach ($iterGroup in $resultsByIteration) {
                    $iter = $iterGroup.Name
                    Write-Host ("  Loop iteration {0}" -f $iter)
                    
                    foreach ($result in ($iterGroup.Group | Sort-Object -Property Name)) {
                        Write-Host ("    > {0}" -f $result.Name)
                        
                        $testResults += $result
                        
                        if ($result.ExitCode -ne 0) {
                            Write-Host ("      FAIL (exit code {0})" -f $result.ExitCode) -ForegroundColor Red
                            if ($result.Output) {
                                Write-Host "      -- output --"
                                Write-Host $result.Output
                            }
                            $runSucceeded = $false
                            $failureMessage = "Test $($result.Name) failed (exit code $($result.ExitCode)) on iteration $iter"
                        }
                        else {
                            Write-Host "      PASS" -ForegroundColor Green
                        }
                    }
                }
                
                if (-not $runSucceeded) {
                    break
                }
                
                if ($loopLimit -gt 0 -and $iteration -ge $loopLimit) {
                    Write-Host ("  Loop limit reached ({0} iterations); stopping without failure." -f $loopLimit)
                    break
                }
            }
            else {
                # Single iteration mode or non-loop mode
                $iteration++
                if ($LoopTests) {
                    Write-Host ("  Loop iteration {0}" -f $iteration)
                }
            
                # Run tests in parallel using background jobs
                $jobs = @()
                foreach ($testExe in $testExecutables) {
                    $testPath = Join-Path $testDir $testExe
                    if (-not (Test-Path $testPath)) {
                        throw "Test executable not found: $testPath"
                    }
                
                    $jobParams = @{
                        TestPath     = $testPath
                        TestExe      = $testExe
                        Iteration    = $iteration
                        CaptureDumps = $CaptureDumps
                        DumpToolExe  = $dumpToolExe
                        DumpRoot     = $dumpRoot
                    }
                
                    $job = Start-Job -ScriptBlock {
                        param($params)
                        $testOutput = ''
                        $testDumpDir = ''
                    
                        try {
                            if ($params.CaptureDumps) {
                                $iterationDumpRoot = Join-Path $params.DumpRoot ("iter-{0}" -f $params.Iteration)
                                $testDumpDir = Join-Path $iterationDumpRoot $params.TestExe
                                New-Item -ItemType Directory -Force -Path $testDumpDir | Out-Null
                                $dumpArgs = @('-accepteula', '-ma', '-e', '-n', '1', '-x', $testDumpDir, $params.TestPath)
                                $testOutput = & $params.DumpToolExe @dumpArgs 2>&1 | Out-String
                            }
                            else {
                                $testOutput = & $params.TestPath 2>&1 | Out-String
                            }
                        }
                        catch {
                            $testOutput = $_.Exception.Message
                        }
                    
                        [pscustomobject]@{
                            Name      = $params.TestExe
                            ExitCode  = $LASTEXITCODE
                            Output    = $testOutput.Trim()
                            Iteration = $params.Iteration
                            DumpDir   = $testDumpDir
                        }
                    } -ArgumentList $jobParams
                
                    $jobs += $job
                }
            
                # Wait for all jobs to complete and collect results
                $jobResults = $jobs | Wait-Job | Receive-Job
                $jobs | Remove-Job
            
                # Process results
                foreach ($result in $jobResults) {
                    $iterationSuffix = ''
                    if ($LoopTests) {
                        $iterationSuffix = (" (iteration {0})" -f $iteration)
                    }
                    Write-Host ("  > {0}{1}" -f $result.Name, $iterationSuffix)
                
                    $testResults += $result
                
                    if ($result.ExitCode -ne 0) {
                        Write-Host ("    FAIL (exit code {0})" -f $result.ExitCode)
                        Write-Host "    -- captured output --"
                        if ($result.Output) {
                            Write-Host $result.Output
                        }
                        else {
                            Write-Host "    <no output captured>"
                        }
                        $runSucceeded = $false
                        $failureMessage = "Test $($result.Name) failed (exit code $($result.ExitCode)) on iteration $iteration"
                    }
                    else {
                        Write-Host "    PASS"
                    }
                }
            
                if (-not $runSucceeded) {
                    break
                }
                if (-not $LoopTests) {
                    break
                }
                if ($loopLimit -gt 0 -and $iteration -ge $loopLimit) {
                    Write-Host ("  Loop limit reached ({0} iterations); stopping without failure." -f $loopLimit)
                    break
                }
            }
        }
    }
    finally {
        $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
        $logLines = @()
        $timestamp = Get-Date -Format o
        $entryLine = "[ {0} - {1} ]" -f $timestamp, $Configuration
        $logLines += $entryLine
        foreach ($entry in $testResults) {
            $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            $statusLine = "$status $($entry.Name) iter=$($entry.Iteration) exit=$($entry.ExitCode)"
            if ($entry.DumpDir) {
                $statusLine += " dumps=$($entry.DumpDir)"
            }
            $logLines += $statusLine
            if ($entry.ExitCode -ne 0 -and $entry.Output) {
                $logLines += "  Output: $($entry.Output)"
            }
        }
        if ($logLines.Count -gt 0) {
            Add-Content -Path $testLogFile -Value $logLines
        }
        $env:PATH = $originalPath
    }
    if (-not $runSucceeded) {
        throw $failureMessage
    }
}
else {
    Write-Host "Tests are disabled for configuration $Configuration; skipping."
}

if (-not $useStaticVcpkg) {
    $runtimeDlls = @(
        'torrent-rasterbar.dll',
        'yyjson.dll',
        'libssl-3-x64.dll',
        'libcrypto-3-x64.dll'
    )
    $runtimeRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
    $runtimeSourceDir = if ($Configuration -eq 'Debug') {
        Join-Path $runtimeRoot 'debug\bin'
    }
    else {
        Join-Path $runtimeRoot 'bin'
    }
    if (Test-Path $runtimeSourceDir) {
        foreach ($dll in $runtimeDlls) {
            $source = Join-Path $runtimeSourceDir $dll
            if (Test-Path $source) {
                Copy-Item -Path $source -Destination $mesonBuildDir -Force
            }
        }
    }
    else {
        Write-Host "Warning: runtime dependency directory missing: $runtimeSourceDir"
    }
}
else {
    Write-Host "Static vcpkg triplet in use; runtime DLLs are linked statically."
}

$linkedLibs = @(
    'torrent-rasterbar.lib',
    'yyjson.lib',
    'sqlite3.lib',
    'libssl.lib',
    'libcrypto.lib'
)
$staticLibDir = Join-Path $vcpkgTripletRoot 'lib'
Write-Host "Linked library footprint ($vcpkgTriplet):"
foreach ($lib in $linkedLibs) {
    $path = Join-Path $staticLibDir $lib
    if (Test-Path $path) {
        $sizeMb = (Get-Item $path).Length / 1MB
        Write-Host ("  {0,-20} {1,8:N2} MB  {2}" -f $lib, $sizeMb, $path)
    }
    else {
        Write-Host ("  {0,-20}    missing  {1}" -f $lib, $path)
    }
}

$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
    $lengthKb = (Get-Item $exePath).Length / 1024.0
    Write-Host $exePath
    Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
    $mapPath = Join-Path $mesonBuildDir 'tt-engine.map'
    if (Test-Path $mapPath) {
        $mapSizeKb = (Get-Item $mapPath).Length / 1024.0
        Write-Host ("   map: {0} ({1:N2} kb)" -f $mapPath, $mapSizeKb)
    }
}
else {
    Write-Host ('Executable not found: {0}' -f $exePath)
}
