param(
    [switch]$UpdateVcpkg,           # Pass this to force a git pull of vcpkg
    [string]$RebuildPackage = "",   # Pass a package name (e.g., 'libtorrent') to force a clean rebuild of just that lib
    [switch]$ForceBootstrap         # Force regeneration of vcpkg.exe
)

$ErrorActionPreference = 'Stop'

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Split-Path -Parent (Split-Path -Parent $scriptRoot))
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'

$triplets = @(
    "x64-windows-asan",
    "x64-windows-static"
)

$overlayTripletsDir = Join-Path $repoRoot 'vcpkg-triplets'


$defaultTriplet = $triplets[0]


# -------------------------------------------------------------------------
# Helper Functions
# -------------------------------------------------------------------------
function Throw-IfError {
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE"
    }
}

function Test-CommandExists {
    param($cmd)
    return (Get-Command $cmd -ErrorAction SilentlyContinue)
}

# -------------------------------------------------------------------------
# 1. Acquire VCPKG (Idempotent)
# -------------------------------------------------------------------------
if (-not (Test-Path $vcpkgDir)) {
    Write-Host "Cloning vcpkg (fresh install)..." -ForegroundColor Cyan
    git clone https://github.com/microsoft/vcpkg.git $vcpkgDir
    Throw-IfError
}
elseif ($UpdateVcpkg) {
    Write-Host "Updating vcpkg repository..." -ForegroundColor Yellow
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
    Write-Host "Vcpkg repository found. Skipping update (use -UpdateVcpkg to force)." -ForegroundColor Green
}

# -------------------------------------------------------------------------
# 2. Bootstrap VCPKG (Lazy Loading)
# -------------------------------------------------------------------------
$needsBootstrap = (-not (Test-Path $vcpkgExe)) -or $ForceBootstrap -or $UpdateVcpkg

if ($needsBootstrap) {
    Write-Host "Bootstrapping vcpkg executable..." -ForegroundColor Cyan
    Push-Location $vcpkgDir
    try {
        .\bootstrap-vcpkg.bat -disableMetrics
        Throw-IfError
    }
    finally {
        Pop-Location
    }
}

# -------------------------------------------------------------------------
# 3. Targeted Cleaning (The "Clean Single Folder" Fix)
# -------------------------------------------------------------------------
if ($RebuildPackage) {
    Write-Host "Removing package artifact: $RebuildPackage (triplet: $defaultTriplet)..." -ForegroundColor Yellow
    Push-Location $vcpkgDir
    try {
        # 'remove' deletes it from the 'installed' tree, forcing a reinstall next step.
        # It does NOT delete the downloaded source zip (saving bandwidth).
        & $vcpkgExe remove $RebuildPackage --triplet $defaultTriplet --recurse
        # We don't throw here because it might already be gone, which is fine.
    }
    finally {
        Pop-Location
    }
}

# -------------------------------------------------------------------------
# 4. Install Dependencies
# -------------------------------------------------------------------------
Write-Host "Verifying Dependencies ($($triplets -join ', '))..." -ForegroundColor Cyan
Push-Location $vcpkgDir
try {
    # Note: We rely on vcpkg.json in the repo root (Manifest Mode).
    # If you don't have vcpkg.json, add 'libtorrent openssl' etc to the end of this command.
    
    # We deliberately ALLOW binary caching here for general dependencies (speed).
    # If you have ABI issues with specific libs, handle that in build.ps1 or use -RebuildPackage here.
    
    foreach ($triplet in $triplets) {
        $installRoot = Join-Path $repoRoot "vcpkg_installed\$triplet"
        $installArgs = @(
            'install',
            '--triplet', $triplet,
            '--x-install-root', $installRoot
        )

        if (Test-Path $overlayTripletsDir) {
            $installArgs += @('--overlay-triplets', $overlayTripletsDir)
        }

        & $vcpkgExe @installArgs
        Throw-IfError
    }

    
    Throw-IfError
    Write-Host "Dependencies are ready." -ForegroundColor Green
    Write-Host " - Installed roots: vcpkg_installed\" -ForegroundColor Gray
}
finally {
    Pop-Location
}