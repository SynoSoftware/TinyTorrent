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
$repoRoot = Resolve-Path $scriptRoot
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'

# The default triplet builds BOTH Debug and Release libraries.
# Do not use x64-windows-static unless you specifically want that.
$triplet = "x64-windows" 

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
    Write-Host "Removing package artifact: $RebuildPackage..." -ForegroundColor Yellow
    Push-Location $vcpkgDir
    try {
        # 'remove' deletes it from the 'installed' tree, forcing a reinstall next step.
        # It does NOT delete the downloaded source zip (saving bandwidth).
        & $vcpkgExe remove $RebuildPackage --triplet $triplet --recurse
        # We don't throw here because it might already be gone, which is fine.
    }
    finally {
        Pop-Location
    }
}

# -------------------------------------------------------------------------
# 4. Install Dependencies
# -------------------------------------------------------------------------
Write-Host "Verifying Dependencies ($triplet)..." -ForegroundColor Cyan
Push-Location $vcpkgDir
try {
    # Note: We rely on vcpkg.json in the repo root (Manifest Mode).
    # If you don't have vcpkg.json, add 'libtorrent openssl' etc to the end of this command.
    
    # We deliberately ALLOW binary caching here for general dependencies (speed).
    # If you have ABI issues with specific libs, handle that in build.ps1 or use -RebuildPackage here.
    
    & $vcpkgExe install --triplet $triplet --x-install-root="$repoRoot\vcpkg_installed"
    
    Throw-IfError
    Write-Host "Dependencies are ready." -ForegroundColor Green
    Write-Host " - Debug libs:  vcpkg_installed\$triplet\debug\lib" -ForegroundColor Gray
    Write-Host " - Release libs: vcpkg_installed\$triplet\lib" -ForegroundColor Gray
}
finally {
    Pop-Location
}