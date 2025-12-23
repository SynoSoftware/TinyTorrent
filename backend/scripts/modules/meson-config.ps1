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

    $oldPath = $env:PATH
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
                $stderrTail = @(Get-Content -LiteralPath $stderrLog -Tail $tailLines -ErrorAction SilentlyContinue)
            }
            if (Test-Path -LiteralPath $stdoutLog) {
                $stdoutTail = @(Get-Content -LiteralPath $stdoutLog -Tail $tailLines -ErrorAction SilentlyContinue)
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
