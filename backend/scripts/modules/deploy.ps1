Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env-detect.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'meson-config.ps1')

function Get-DebugRedistDir {
    if (-not $env:VCToolsInstallDir) {
        return $null
    }
    $version = Split-Path $env:VCToolsInstallDir -Leaf
    $vsInstall = $env:VSINSTALLDIR
    if (-not $vsInstall) {
        return $null
    }
    $redistRoot = Join-Path $vsInstall 'VC\Redist\MSVC'
    if (-not (Test-Path -LiteralPath $redistRoot)) {
        return $null
    }
    $candidate = Join-Path $redistRoot $version
    if (Test-Path -LiteralPath (Join-Path $candidate 'debug_nonredist\x64')) {
        return $candidate
    }
    $fallback = Get-ChildItem -LiteralPath $redistRoot -Directory |
    Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName 'debug_nonredist\x64')
    } |
    Sort-Object Name -Descending |
    Select-Object -First 1
    if ($fallback) {
        return $fallback.FullName
    }
    return $null
}

function Copy-VcpkgRuntimeDlls {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$BuildDir
    )

    if ($Configuration -ne 'Debug') {
        return
    }

    $triplet = Get-TripletName -Configuration $Configuration
    $tripletRoot = Get-TripletRoot -Triplet $triplet
    if (-not (Test-Path -LiteralPath $tripletRoot)) {
        Log-Warn "Vcpkg triplet root not found: $tripletRoot"
        return
    }

    $binDirs = @()
    $binDirs += Join-Path -Path $tripletRoot -ChildPath 'bin'
    $binDirs += Join-Path -Path $tripletRoot -ChildPath 'debug\bin'
    $copied = $false
    foreach ($binDir in $binDirs) {
        if (-not (Test-Path -LiteralPath $binDir)) {
            continue
        }
        Get-ChildItem -LiteralPath $binDir -File -Filter '*.dll' -ErrorAction SilentlyContinue |
        ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $BuildDir -Force
            $copied = $true
        }
    }

    if ($copied) {
        Log-Info "Copied Vcpkg runtime DLLs into $BuildDir"
    }
    else {
        Log-Warn "No Vcpkg DLLs found under: $($binDirs -join ', ')"
    }
}

function Copy-DebugRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$BuildDir
    )

    Ensure-VsEnv

    $redistDir = Get-DebugRedistDir
    if (-not $redistDir) {
        Log-Warn 'Unable to locate Visual Studio RC runtime directory.'
        return
    }
    $source = Join-Path $redistDir 'debug_nonredist\x64'
    if (-not (Test-Path -LiteralPath $source)) {
        Log-Warn "Missing debug CRT folder: $source"
        return
    }

    Get-ChildItem -LiteralPath $source -File -Filter '*.dll' -ErrorAction SilentlyContinue |
    ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $BuildDir -Force
    }
    Log-Info "Copied debug CRT from $source"

    if ($env:VCToolsInstallDir) {
        $asanHostDir = Join-Path $env:VCToolsInstallDir 'bin\Hostx64\x64'
        if (Test-Path -LiteralPath $asanHostDir) {
            $asanDlls = @(
                'clang_rt.asan_dynamic-x86_64.dll',
                'clang_rt.asan_dbg_dynamic-x86_64.dll'
            )
            foreach ($dll in $asanDlls) {
                $path = Join-Path $asanHostDir $dll
                if (Test-Path -LiteralPath $path) {
                    Copy-Item -LiteralPath $path -Destination $BuildDir -Force
                    Log-Info "Copied ASan runtime $dll"
                }
                else {
                    Log-Warn "ASan runtime missing: $dll"
                }
            }
        }
        else {
            Log-Warn "ASan host runtime directory missing: $asanHostDir"
        }
    }
    else {
        Log-Warn 'VCToolsInstallDir unavailable; ASan runtime cannot be copied.'
    }

    Copy-VcpkgRuntimeDlls -Configuration 'Debug' -BuildDir $BuildDir
}

function Invoke-DeployRuntime {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    if (-not (Test-Path -LiteralPath $buildDir)) {
        throw "Build directory not found: $buildDir. Run configure/build first."
    }

    Copy-DebugRuntime -BuildDir $buildDir
}

function Invoke-InstallArtifacts {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    if (-not (Test-Path -LiteralPath $buildDir)) {
        throw "Build directory not found: $buildDir. Run configure/build first."
    }

    if (-not (Test-Path -LiteralPath $Destination)) {
        [void](New-Item -ItemType Directory -Path $Destination)
    }

    $artifacts = @(
        'tt-engine.exe',
        'tt-engine.pdb'
    )

    foreach ($artifact in $artifacts) {
        $source = Join-Path $buildDir $artifact
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $artifact) -Force
        }
    }
}

function Invoke-PackageArtifacts {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $buildDir = Get-BuildDir -Configuration $Configuration
    if (-not (Test-Path -LiteralPath $buildDir)) {
        throw "Build directory not found: $buildDir. Run configure/build first."
    }

    if (-not (Test-Path -LiteralPath $Destination)) {
        [void](New-Item -ItemType Directory -Path $Destination)
    }

    $bundleName = "tt-engine-{0}.zip" -f $Configuration.ToLower()
    $bundlePath = Join-Path $Destination $bundleName

    if (Test-Path -LiteralPath $bundlePath) {
        Remove-Item -LiteralPath $bundlePath -Force
    }

    $items = @('tt-engine.exe', 'tt-engine.pdb')
    $paths = @()
    foreach ($item in $items) {
        $path = Join-Path $buildDir $item
        if (Test-Path -LiteralPath $path) {
            $paths += $path
        }
    }

    if ($paths.Count -eq 0) {
        throw "No artifacts found to package in $buildDir."
    }

    Compress-Archive -LiteralPath $paths -DestinationPath $bundlePath -Force
}
