Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env-detect.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'vcpkg.ps1')

function Get-RepoRoot {
    return (Resolve-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath)))).Path
}

function Get-BuildDir {
    param([Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration)
    $repoRoot = Get-RepoRoot
    return Join-Path $repoRoot ("buildstate/{0}" -f $Configuration.ToLower())
}

function Get-VsBuildDir {
    param([Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration)
    $repoRoot = Get-RepoRoot
    return Join-Path $repoRoot ("build_vs/{0}" -f $Configuration.ToLower())
}

function Get-TripletName {
    param([Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration)
    if ($Configuration -eq 'Debug') {
        return 'x64-windows-asan'
    }
    return 'x64-windows-static'
}

function Get-TripletRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Triplet
    )
    $repoRoot = Get-RepoRoot
    $tripletRoot = Join-Path $repoRoot ("vcpkg_installed/{0}" -f $Triplet)
    $nested = Join-Path $tripletRoot $Triplet
    if (Test-Path -LiteralPath (Join-Path $nested 'include')) {
        $tripletRoot = $nested
    }
    return $tripletRoot
}

function Get-TestDir {
    param([Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration)
    $buildDir = Get-BuildDir -Configuration $Configuration
    return Join-Path $buildDir 'tests'
}

function Ensure-VsFrontendSyncHook {
    param(
        [Parameter(Mandatory = $true)][string]$BuildDir
    )

    $exeProjects = Get-ChildItem -LiteralPath $BuildDir -Filter '*@exe.vcxproj' -File -Recurse -ErrorAction SilentlyContinue
    if (-not $exeProjects) {
        return
    }

    $marker = '<Target Name="SyncFrontendAssets"'
    $targetBlock = @'
  <Target Name="SyncFrontendAssets" BeforeTargets="PrepareForBuild" Condition="'$(Configuration)'=='debug'">
    <Exec Command="powershell -NoProfile -ExecutionPolicy Bypass -File &quot;$(ProjectDir)..\..\..\scripts\gen-packed-fs.ps1&quot; -InputDir &quot;$(ProjectDir)..\..\..\frontend\dist&quot; -OutputFile &quot;$(ProjectDir)..\..\src\vendor\tt_packed_fs.c&quot;" />
  </Target>
'@

    foreach ($proj in $exeProjects) {
        if (Select-String -LiteralPath $proj.FullName -Pattern $marker -Quiet) {
            continue
        }
        $content = Get-Content -LiteralPath $proj.FullName -Raw
        $content = $content -replace '(?=</Project>)', "$targetBlock`r`n"
        [System.IO.File]::WriteAllText($proj.FullName, $content, (New-Object System.Text.UTF8Encoding($false)))
        Log-Info "Inserted Visual Studio frontend sync hook into $($proj.Name)"
    }
}

function Invoke-MesonConfigure {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [ValidateSet('ninja', 'vs2022')][string]$Backend = 'ninja'
    )

    $buildDir = if ($Backend -eq 'ninja') {
        Get-BuildDir -Configuration $Configuration
    }
    else {
        Get-VsBuildDir -Configuration $Configuration
    }
    $triplet = Get-TripletName -Configuration $Configuration
    $tripletRoot = Get-TripletRoot -Triplet $triplet
    Test-VcpkgTriplet -TripletRoot $tripletRoot -Triplet $triplet

    $prefixPath = "$tripletRoot;$tripletRoot\share"
    if (-not (Test-Path -LiteralPath $buildDir)) {
        [void](New-Item -ItemType Directory -Path $buildDir)
    }

    $coreData = Join-Path $buildDir 'meson-private\coredata.dat'
    $buildNinja = Join-Path $buildDir 'build.ninja'
    $isReconfigure = (Test-Path -LiteralPath $coreData) -or (Test-Path -LiteralPath $buildNinja)

    Ensure-VsEnv

    $mesonArgs = @()
    if ($isReconfigure) {
        $mesonArgs += 'setup'
        $mesonArgs += '--reconfigure'
    }
    else {
        $mesonArgs += 'setup'
    }
    $mesonArgs += @(
        "--buildtype=$($Configuration.ToLower())",
        "--cmake-prefix-path=$prefixPath",
        "-Db_vscrt=$(if ($Configuration -eq 'Debug') { 'md' } else { 'mt' })",
        "-Db_sanitize=$(if ($Configuration -eq 'Debug') { 'address' } else { 'none' })",
        "-Db_lto=$(if ($Configuration -eq 'Debug') { 'false' } else { 'true' })",
        "-Dstrip=$(if ($Configuration -eq 'Debug') { 'false' } else { 'true' })",
        "-Dtt_enable_logging=$(if ($Configuration -eq 'Debug') { 'true' } else { 'false' })",
        "-Dtt_enable_tests=$(if ($Configuration -eq 'Debug') { 'true' } else { 'false' })",
        "--backend=$Backend",
        $buildDir,
        $(Get-RepoRoot)
    )

    $tools = Get-Tooling
    $exe = if ($tools.Meson) { $tools.Meson } else { $tools.Python }
    $args = if ($tools.Meson) { $mesonArgs } else { @('-m', 'mesonbuild.mesonmain') + $mesonArgs }

function Write-VsDebuggerUserFiles {
    param(
        [Parameter(Mandatory = $true)][string]$BuildDir,
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$TripletRoot
    )

    $vcpkgBin = Join-Path $TripletRoot 'bin'
        $vcpkgDebugBin = Join-Path $TripletRoot 'debug\bin'
        $pathParts = @()

        # AddressSanitizer runtime (MSVC ships clang_rt.asan_dynamic-x86_64.dll)
        # VS does not always include this on PATH when launching from the IDE.
        if ($Configuration -eq 'Debug') {
            $asanDir = $null
            if ($env:VCToolsInstallDir) {
                $candidate = Join-Path $env:VCToolsInstallDir 'bin\Hostx64\x64'
                if (Test-Path -LiteralPath (Join-Path $candidate 'clang_rt.asan_dynamic-x86_64.dll')) {
                    $asanDir = $candidate
                }
            }
            if ($asanDir) {
                $pathParts += $asanDir
            }
        }

        if (Test-Path -LiteralPath $vcpkgBin) {
            $pathParts += $vcpkgBin
        }
        if (Test-Path -LiteralPath $vcpkgDebugBin) {
            $pathParts += $vcpkgDebugBin
        }
        if ($pathParts.Count -eq 0) {
            return
        }
        $pathPrefix = ($pathParts -join ';')

        $exeProjects = Get-ChildItem -LiteralPath $BuildDir -Filter '*@exe.vcxproj' -File -Recurse -ErrorAction SilentlyContinue
        foreach ($proj in $exeProjects) {
            $targetName = $null
            try {
                $xml = New-Object System.Xml.XmlDocument
                $xml.Load($proj.FullName)
                $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
                $ns.AddNamespace('msb', 'http://schemas.microsoft.com/developer/msbuild/2003')
                $node = $xml.SelectSingleNode('//msb:TargetName', $ns)
                if ($node -and $node.InnerText) {
                    $targetName = $node.InnerText
                }
            }
            catch {
                $targetName = $null
            }

            if (-not $targetName) {
                continue
            }

            $userPath = "$($proj.FullName).user"
            $userTemplate = @'
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="Current" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
    <PropertyGroup>
        <LocalDebuggerCommand>$(ProjectDir){1}.exe</LocalDebuggerCommand>
        <LocalDebuggerWorkingDirectory>$(ProjectDir)</LocalDebuggerWorkingDirectory>
        <DebuggerFlavor>WindowsLocalDebugger</DebuggerFlavor>
        <LocalDebuggerEnvironment>PATH={2};$(Path)</LocalDebuggerEnvironment>
    </PropertyGroup>
</Project>
'@
            $userContent = $userTemplate -f '', $targetName, $pathPrefix
            Set-Content -LiteralPath $userPath -Value $userContent -Encoding UTF8
        }
    }

    $oldPrefix = $env:CMAKE_PREFIX_PATH
    try {
        $env:CMAKE_PREFIX_PATH = $prefixPath
        Push-Location (Get-RepoRoot)
        & $exe @args
        if ($LASTEXITCODE -ne 0) {
            throw "Meson failed with exit code $LASTEXITCODE."
        }

        $repoRoot = Get-RepoRoot
        $buildDirRel = $buildDir
        if ($buildDirRel.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $buildDirRel = $buildDirRel.Substring($repoRoot.Length).TrimStart('\', '/')
            if (-not $buildDirRel) {
                $buildDirRel = '.'
            }
        }
        Log-Info "Tip: Meson reconfigure requires the build directory: meson setup --reconfigure $buildDirRel"

        if ($Backend -ne 'ninja') {
            Write-VsDebuggerUserFiles -BuildDir $buildDir -Configuration $Configuration -TripletRoot $tripletRoot
        }
    }
    finally {
        Pop-Location
        $env:CMAKE_PREFIX_PATH = $oldPrefix
    }
}

function Invoke-MesonBuild {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    if (-not (Test-Path -LiteralPath $buildDir)) {
        throw "Build directory not found: $buildDir. Run configure first."
    }

    $tools = Get-Tooling
    $mesonArgs = @('compile', '-C', $buildDir)

    $exe = if ($tools.Meson) { $tools.Meson } else { $tools.Python }
    $args = if ($tools.Meson) { $mesonArgs } else { @('-m', 'mesonbuild.mesonmain') + $mesonArgs }

    Push-Location (Get-RepoRoot)
    try {
        & $exe @args
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $primaryExe = Join-Path $buildDir 'TinyTorrent.exe'
    if (-not (Test-Path -LiteralPath $primaryExe)) {
        $primaryExe = Join-Path $buildDir 'tt-engine.exe'
    }
    if (Test-Path -LiteralPath $primaryExe) {
        $sizeKB = (Get-Item -LiteralPath $primaryExe).Length / 1KB
        Log-Success "SUCCESS: $Configuration Build Complete"
        Log-Info "Artifact: $primaryExe" -Color ([ConsoleColor]::Magenta)
        Log-Info ("Size:     {0:N0} KB" -f $sizeKB) -Color ([ConsoleColor]::Yellow)
    }
}

function Invoke-HarnessSelfCheck {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('Debug', 'Release')]
        [string]$Configuration
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    $targetName = 'harness-crash-sentinel'
    $targetInfo = $null
    $tools = Get-Tooling
    $mesonExe = if ($tools.Meson) { $tools.Meson } else { $tools.Python }
    $introspectArgs = if ($tools.Meson) {
        @('introspect', '--targets', $buildDir)
    }
    else {
        @('-m', 'mesonbuild.mesonmain', 'introspect', '--targets', $buildDir)
    }

    Push-Location (Get-RepoRoot)
    try {
        $introspectOutput = (& $mesonExe @introspectArgs) -join "`n"
        if ($LASTEXITCODE -ne 0) {
            throw "Meson introspect failed (exit $LASTEXITCODE)."
        }
        $targets = try {
            $introspectOutput | ConvertFrom-Json
        }
        catch {
            throw "Meson introspect returned invalid JSON: $($_.Exception.Message)"
        }
        $targetInfo = $targets | Where-Object { $_.name -eq $targetName } |
            Select-Object -First 1
        if (-not $targetInfo) {
            Log-Info "Harness sentinel target '$targetName' missing; skipping self-check."
            return
        }

        $compileArgs = if ($tools.Meson) {
            @('compile', '-C', $buildDir, $targetName)
        }
        else {
            @('-m', 'mesonbuild.mesonmain', 'compile', '-C', $buildDir, $targetName)
        }

        Log-Info "Building harness sentinel target '$targetName'..."
        & $mesonExe @compileArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Meson compile failed for '$targetName' (exit $LASTEXITCODE)."
        }
    }
    finally {
        Pop-Location
    }

    $filename = $targetInfo.filename
    if ($filename -is [System.Array]) {
        $filename = $filename[0]
    }
    $filename = [string]$filename
    if (-not $filename) {
        throw "Meson target '$targetName' missing filename metadata."
    }

    if ([System.IO.Path]::IsPathRooted($filename)) {
        $sentinelExe = $filename
    }
    else {
        $sentinelExe = Join-Path $buildDir $filename
    }
    if (-not (Test-Path -LiteralPath $sentinelExe)) {
        throw "Harness self-check sentinel not found after build: $sentinelExe"
    }

    $workingDir = Split-Path $sentinelExe -Parent
    Log-Section -Title 'Harness Self-Check' -Subtitle 'Crash sentinel exit code'
    Log-Info "Running crash sentinel ($sentinelExe)..."

    $proc = Start-Process -FilePath $sentinelExe -WorkingDirectory $workingDir -NoNewWindow -PassThru -Wait
    $exitCode = $proc.ExitCode
    if ($exitCode -eq 0) {
        throw "Harness self-check sentinel exited 0 (expected crash)."
    }

    Log-Success "HarnessSelfCheck: observed non-zero exit code ($exitCode) (expected)"
}

function Invoke-MesonTests {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    $testDir = Join-Path $buildDir 'tests'

    if (-not (Test-Path -LiteralPath $testDir)) {
        throw "Test directory not found: $testDir. Build/tests must exist first."
    }

    $triplet = Get-TripletName -Configuration $Configuration
    $tripletRoot = Get-TripletRoot -Triplet $triplet
    Test-VcpkgTriplet -TripletRoot $tripletRoot -Triplet $triplet

    Ensure-VsEnv

    $logDir = Join-Path $buildDir 'test-logs'
    if (-not (Test-Path -LiteralPath $logDir)) {
        [void](New-Item -ItemType Directory -Path $logDir)
    }

    Log-Info "Running tests ($Configuration)... (logs: $logDir)"
    Invoke-HarnessSelfCheck -Configuration $Configuration

    $oldPath = $env:PATH
    $oldTtEnginePath = $env:TT_ENGINE_PATH
    $engineCandidates = @(
        (Join-Path $buildDir 'tinytorrent-daemon.exe'),
        (Join-Path $buildDir 'tt-engine.exe'),
        (Join-Path $buildDir 'TinyTorrent.exe')
    )
    $ttEngineExe = $engineCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $ttEngineExe) {
        throw "Engine executable not found. Tried: $($engineCandidates -join ', ')"
    }
    $env:TT_ENGINE_PATH = $ttEngineExe
    try {
        if ($Configuration -eq 'Debug') {
            $dllDirs = @()

            # AddressSanitizer runtime (MSVC ships clang_rt.asan_dynamic-x86_64.dll)
            $asanDir = $null
            if ($env:VCToolsInstallDir) {
                $candidate = Join-Path $env:VCToolsInstallDir 'bin\Hostx64\x64'
                if (Test-Path -LiteralPath (Join-Path $candidate 'clang_rt.asan_dynamic-x86_64.dll')) {
                    $asanDir = $candidate
                }
            }
            if ($asanDir) {
                $dllDirs += $asanDir
            }

            $dllDirs += @(
                (Join-Path $tripletRoot 'bin'),
                (Join-Path $tripletRoot 'debug\bin')
            )
            foreach ($d in $dllDirs) {
                if (Test-Path -LiteralPath $d) {
                    $env:PATH = "$d;$env:PATH"
                }
            }
        }

        $executables = @(Get-ChildItem -LiteralPath $testDir -Filter '*-test.exe' -File -ErrorAction Stop)
        if ($executables.Count -eq 0) {
            Log-Success 'All tests passed.'
            return
        }

        $maxParallel = [Math]::Max(1, [Math]::Min($executables.Count, [Environment]::ProcessorCount))

        $pending = New-Object System.Collections.Generic.Queue[System.IO.FileInfo]
        foreach ($exe in $executables) {
            $pending.Enqueue($exe)
        }

        $runningJobs = @()
        $failures = @()

        function Start-TestJob {
            param([Parameter(Mandatory = $true)][System.IO.FileInfo]$Exe)

            $stdoutLog = Join-Path $logDir ("{0}.stdout.log" -f $Exe.BaseName)
            $stderrLog = Join-Path $logDir ("{0}.stderr.log" -f $Exe.BaseName)

            $job = Start-Job -ScriptBlock {
                param($exeFullName, $exeName, $workDir, $stdoutLog, $stderrLog)
                $proc = Start-Process -FilePath $exeFullName -WorkingDirectory $workDir -NoNewWindow -PassThru -Wait `
                    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

                [PSCustomObject]@{
                    Name      = $exeName
                    ExitCode  = $proc.ExitCode
                    StdoutLog = $stdoutLog
                    StderrLog = $stderrLog
                }
            } -ArgumentList @($Exe.FullName, $Exe.Name, $testDir, $stdoutLog, $stderrLog)

            $job | Add-Member -NotePropertyName TT_ExeName -NotePropertyValue $Exe.Name -Force
            return $job
        }

        while ($runningJobs.Count -lt $maxParallel -and $pending.Count -gt 0) {
            $runningJobs += Start-TestJob -Exe ($pending.Dequeue())
        }

        while ($runningJobs.Count -gt 0) {
            $done = Wait-Job -Job $runningJobs -Any -Timeout 1
            if (-not $done) {
                continue
            }

            $result = $null
            try {
                $result = Receive-Job -Job $done -ErrorAction SilentlyContinue
            }
            catch {
                $result = $null
            }

            $runningJobs = @($runningJobs | Where-Object { $_.Id -ne $done.Id })
            Remove-Job -Job $done -Force -ErrorAction SilentlyContinue

            if (-not $result) {
                $failures += [PSCustomObject]@{ Name = $done.TT_ExeName; ExitCode = 1; StdoutLog = ''; StderrLog = '' }
                Log-Error "FAIL: $($done.TT_ExeName) (no result)"
            }
            elseif ($result.ExitCode -eq 0) {
                Log-Success "PASS: $($result.Name)"
            }
            else {
                Log-Error "FAIL: $($result.Name) (exit $($result.ExitCode))"
                Log-Info "  stdout: $($result.StdoutLog)"
                Log-Info "  stderr: $($result.StderrLog)"
                $failures += $result
            }

            while ($runningJobs.Count -lt $maxParallel -and $pending.Count -gt 0) {
                $runningJobs += Start-TestJob -Exe ($pending.Dequeue())
            }
        }

        if ($failures.Count -gt 0) {
            $tailLines = 25
            foreach ($f in $failures) {
                if ($f.StdoutLog -and (Test-Path -LiteralPath $f.StdoutLog)) {
                    Log-Error "--- $($f.Name) stdout (last $tailLines lines) ---"
                    @(Get-Content -LiteralPath $f.StdoutLog -Tail $tailLines -ErrorAction SilentlyContinue) | ForEach-Object { Write-Output $_ }
                }
                if ($f.StderrLog -and (Test-Path -LiteralPath $f.StderrLog)) {
                    Log-Error "--- $($f.Name) stderr (last $tailLines lines) ---"
                    @(Get-Content -LiteralPath $f.StderrLog -Tail $tailLines -ErrorAction SilentlyContinue) | ForEach-Object { Write-Output $_ }
                }
            }
            throw "Test failed: $($failures[0].Name)"
        }

        Log-Success 'All tests passed.'
    }
    finally {
        $env:PATH = $oldPath
        if ($oldTtEnginePath) {
            $env:TT_ENGINE_PATH = $oldTtEnginePath
        }
        else {
            Remove-Item env:TT_ENGINE_PATH -ErrorAction SilentlyContinue
        }
    }
}
