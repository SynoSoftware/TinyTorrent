$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptRoot '..')
$vcpkgDir = Join-Path $repoRoot 'vcpkg'

function Throw-IfError() {
  if ($LASTEXITCODE -ne 0) {
    throw "Previous command failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-Path $vcpkgDir)) {
  Write-Host "Cloning vcpkg..."
  git clone https://github.com/microsoft/vcpkg.git $vcpkgDir
  Throw-IfError
} else {
  Write-Host "Updating vcpkg repository..."
  git -C $vcpkgDir pull --ff-only
  Throw-IfError
}

Push-Location $vcpkgDir
try {
  Write-Host "Bootstrapping vcpkg..."
  .\bootstrap-vcpkg.bat
  Throw-IfError

  Write-Host "Installing manifest dependencies..."
  .\vcpkg.exe install --triplet x64-windows
  Throw-IfError
}
finally {
  Pop-Location
}
