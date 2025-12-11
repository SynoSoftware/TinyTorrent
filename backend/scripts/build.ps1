param(
  [ValidateSet('Debug','MinSizeRel')]
  [string]$Configuration = 'Debug',
  [string]$Generator = 'Visual Studio 18 2026',
  [string]$CMakePath = ''
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptRoot '..')
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$buildDir = Join-Path $repoRoot 'build'
$toolchain = Join-Path $vcpkgDir 'scripts\buildsystems\vcpkg.cmake'

function Resolve-CMakeExecutable {
  param($overridePath)

  if ($overridePath -and (Test-Path $overridePath)) {
    return $overridePath
  }

  $cmd = Get-Command cmake -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $defaultPaths = @(
    'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe',
    'C:\Program Files\Microsoft Visual Studio\18\Enterprise\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
  )

  foreach ($path in $defaultPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  throw 'cmake executable not found; ensure it is on PATH or pass -CMakePath.'
}

$cmakeExe = Resolve-CMakeExecutable -overridePath $CMakePath

if (-not (Test-Path $vcpkgDir)) {
  throw 'vcpkg directory not found. Run scripts/setup.ps1 first.'
}

$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
if (-not (Test-Path $vcpkgExe)) {
  throw 'vcpkg.exe not found; run scripts/setup.ps1 first.'
}

Write-Host "Installing manifest dependencies via vcpkg..."
Push-Location $vcpkgDir
try {
  & $vcpkgExe install --triplet x64-windows
}
finally {
  Pop-Location
}

Write-Host "Configuring ($Configuration) with generator '$Generator' (cmake: $cmakeExe)..."
& $cmakeExe -S $repoRoot -B $buildDir -G $Generator -A x64 -DCMAKE_TOOLCHAIN_FILE="$toolchain" `
  -DVCPKG_TARGET_TRIPLET=x64-windows -DCMAKE_BUILD_TYPE="$Configuration"

Write-Host "Building ($Configuration)..."
& $cmakeExe --build $buildDir --config $Configuration --parallel
