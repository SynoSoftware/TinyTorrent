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

function Invoke-MesonConfigure {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    $triplet = Get-TripletName -Configuration $Configuration
    $tripletRoot = Get-TripletRoot -Triplet $triplet
    Test-VcpkgTriplet -TripletRoot $tripletRoot -Triplet $triplet

    $prefixPath = "$tripletRoot;$tripletRoot\share"
    if (-not (Test-Path -LiteralPath $buildDir)) {
        [void](New-Item -ItemType Directory -Path $buildDir)
    }

    $buildNinja = Join-Path $buildDir 'build.ninja'
    $isReconfigure = Test-Path -LiteralPath $buildNinja

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
        '--backend=ninja',
        $buildDir,
        $(Get-RepoRoot)
    )

    $tools = Get-Tooling
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($tools.Meson) {
        $psi.FileName = $tools.Meson
    }
    else {
        $psi.FileName = $tools.Python
        [void]$psi.ArgumentList.Add('-m')
        [void]$psi.ArgumentList.Add('mesonbuild.mesonmain')
    }

    foreach ($a in $mesonArgs) { [void]$psi.ArgumentList.Add($a) }
    $psi.WorkingDirectory = Get-RepoRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $psi.Environment['CMAKE_PREFIX_PATH'] = $prefixPath

    $process = [System.Diagnostics.Process]::Start($psi)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Meson failed with exit code $($process.ExitCode)."
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

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($tools.Meson) {
        $psi.FileName = $tools.Meson
    }
    else {
        $psi.FileName = $tools.Python
        [void]$psi.ArgumentList.Add('-m')
        [void]$psi.ArgumentList.Add('mesonbuild.mesonmain')
    }
    foreach ($a in $mesonArgs) { [void]$psi.ArgumentList.Add($a) }
    $psi.WorkingDirectory = Get-RepoRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false

    $process = [System.Diagnostics.Process]::Start($psi)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Ninja failed with exit code $($process.ExitCode)."
    }

    $primaryExe = Join-Path $buildDir 'TinyTorrent.exe'
    if (-not (Test-Path -LiteralPath $primaryExe)) {
        $primaryExe = Join-Path $buildDir 'tt-engine.exe'
    }
    if (Test-Path -LiteralPath $primaryExe) {
        $sizeKB = (Get-Item -LiteralPath $primaryExe).Length / 1KB
        Log-Success "SUCCESS: $Configuration Build Complete"
        Log-Info "Artifact: $primaryExe"
        Log-Info ("Size:     {0:N0} KB" -f $sizeKB)
    }
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

    $logDir = Join-Path $buildDir 'test-logs'
    if (-not (Test-Path -LiteralPath $logDir)) {
        [void](New-Item -ItemType Directory -Path $logDir)
    }

    Log-Info "Running tests ($Configuration)... (logs: $logDir)"

    $oldPath = $env:PATH
    try {
        if ($Configuration -eq 'Debug') {
            $dllDirs = @(
                (Join-Path $tripletRoot 'bin'),
                (Join-Path $tripletRoot 'debug\bin')
            )
            foreach ($d in $dllDirs) {
                if (Test-Path -LiteralPath $d) {
                    $env:PATH = "$d;$env:PATH"
                }
            }
        }

        $executables = Get-ChildItem -LiteralPath $testDir -Filter '*-test.exe' -File -ErrorAction Stop
        foreach ($exe in $executables) {
            $stdoutLog = Join-Path $logDir ("{0}.stdout.log" -f $exe.BaseName)
            $stderrLog = Join-Path $logDir ("{0}.stderr.log" -f $exe.BaseName)

            $proc = Start-Process -FilePath $exe.FullName -WorkingDirectory $testDir -NoNewWindow -PassThru -Wait `
                -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

            if ($proc.ExitCode -eq 0) {
                Log-Success "PASS: $($exe.Name)"
                continue
            }

            Log-Error "FAIL: $($exe.Name) (exit $($proc.ExitCode))"
            Log-Info "  stdout: $stdoutLog"
            Log-Info "  stderr: $stderrLog"

            $tailLines = 25
            $stderrTail = @()
            $stdoutTail = @()
            if (Test-Path -LiteralPath $stderrLog) {
                $stderrTail = Get-Content -LiteralPath $stderrLog -Tail $tailLines -ErrorAction SilentlyContinue
            }
            if (Test-Path -LiteralPath $stdoutLog) {
                $stdoutTail = Get-Content -LiteralPath $stdoutLog -Tail $tailLines -ErrorAction SilentlyContinue
            }

            if ($stderrTail.Count -gt 0) {
                Log-Error "--- stderr (last $tailLines lines) ---"
                $stderrTail | ForEach-Object { Write-Output $_ }
            }
            if ($stdoutTail.Count -gt 0) {
                Log-Error "--- stdout (last $tailLines lines) ---"
                $stdoutTail | ForEach-Object { Write-Output $_ }
            }

            throw "Test failed: $($exe.Name)"
        }

        Log-Success 'All tests passed.'
    }
    finally {
        $env:PATH = $oldPath
    }
}
