Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'vcpkg.ps1')

$Script:ToolchainTriplets = @('x64-windows-asan', 'x64-windows-static')

function Get-RepoRoot {
    return Resolve-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath)))
}

function Get-VcpkgDir {
    return Join-Path (Get-RepoRoot).Path 'vcpkg'
}

function Get-VcpkgExe {
    $dir = Get-VcpkgDir
    return Join-Path $dir 'vcpkg.exe'
}

function Get-VcpkgInstalledRoot {
    return Join-Path (Get-RepoRoot).Path 'vcpkg_installed'
}

function Throw-IfError {
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE"
    }
}

function Invoke-ToolchainBootstrap {
    param(
        [switch]$UpdateVcpkg,
        [string]$RebuildPackage = '',
        [switch]$ForceBootstrap
    )

    $repoRoot = Get-RepoRoot
    $vcpkgDir = Get-VcpkgDir
    $vcpkgExe = Get-VcpkgExe
    $installRoot = Get-VcpkgInstalledRoot
    $overlayTripletsDir = Join-Path $repoRoot.Path 'vcpkg-triplets'

    if (-not (Test-Path -LiteralPath $vcpkgDir)) {
        Log-Info "Cloning vcpkg (fresh install)..."
        git clone https://github.com/microsoft/vcpkg.git $vcpkgDir
        Throw-IfError
    }
    elseif ($UpdateVcpkg) {
        Log-Info "Updating vcpkg repository..."
        Push-Location $vcpkgDir
        try {
            git pull --ff-only
            Throw-IfError
        }
        finally {
            Pop-Location
        }
    }
    else {
        Log-Info "Vcpkg repository found. Skipping update (use -UpdateVcpkg to force)."
    }

    $needsBootstrap = (-not (Test-Path -LiteralPath $vcpkgExe)) -or $ForceBootstrap -or $UpdateVcpkg
    if ($needsBootstrap) {
        Log-Info "Bootstrapping vcpkg executable..."
        Push-Location $vcpkgDir
        try {
            .\bootstrap-vcpkg.bat -disableMetrics
            Throw-IfError
        }
        finally {
            Pop-Location
        }
    }

    if ($RebuildPackage) {
        Log-Note "Removing package artifact: $RebuildPackage (triplet: $($Script:ToolchainTriplets[0]))..."
        Push-Location $vcpkgDir
        try {
            $defaultInstallRoot = Join-Path $installRoot $Script:ToolchainTriplets[0]
            & $vcpkgExe remove $RebuildPackage --triplet $Script:ToolchainTriplets[0] --recurse --x-install-root $defaultInstallRoot
            # Ignore failure; absence is tolerated.
        }
        finally {
            Pop-Location
        }
    }

    Log-Info "Verifying Dependencies ($($Script:ToolchainTriplets -join ', '))..."
    Push-Location $vcpkgDir
    try {
        foreach ($triplet in $Script:ToolchainTriplets) {
            $tripletInstallRoot = Join-Path $installRoot $triplet

            if (Test-Path -LiteralPath $tripletInstallRoot) {
                try {
                    Test-VcpkgTriplet -TripletRoot $tripletInstallRoot -Triplet $triplet
                    Log-Info " - $triplet already present at $tripletInstallRoot (skipping)."
                    continue
                }
                catch {
                    Log-Warn "  Triplet $triplet present but invalid layout; reinstalling."
                }
            }

            $installArgs = @(
                'install',
                '--triplet', $triplet,
                '--x-manifest-root', $repoRoot.Path,
                '--x-install-root', $tripletInstallRoot
            )

            if (Test-Path -LiteralPath $overlayTripletsDir) {
                $installArgs += @('--overlay-triplets', $overlayTripletsDir)
            }

            & $vcpkgExe @installArgs
            Throw-IfError
        }

        Log-Info "Dependencies are ready."
        Log-Info " - Installed roots: vcpkg_installed\"
    }
    finally {
        Pop-Location
    }
}
