param(
  [ValidateSet('Debug','MinSizeRel')]
  [string]$Configuration = 'Debug',
  [string]$MesonPath = '',
  [string]$NinjaPath = ''
)

$ErrorActionPreference = 'Stop'

function Get-UserScriptsPath {
  try {
    $pythonVersioned = & python -c "import os, site, sys; base = site.USER_BASE; ver = 'Python{}{}'.format(sys.version_info.major, sys.version_info.minor); print(os.path.join(base, ver, 'Scripts'))"
    $pythonVersioned = $pythonVersioned.Trim()
    $pythonBase = & python -c "import os, site; print(os.path.join(site.USER_BASE, 'Scripts'))"
    $pythonBase = $pythonBase.Trim()
    $paths = @()
    if ($pythonVersioned) {
      $paths += $pythonVersioned
    }
    if ($pythonBase -and $pythonBase -ne $pythonVersioned) {
      $paths += $pythonBase
    }
    return $paths
  } catch {
    throw 'Unable to determine the Python user scripts path; ensure Python 3.9+ is on the PATH.'
  }
}

function Resolve-Executable {
  param($overridePath, $name, $candidateDirectories)

  if ($overridePath) {
    if (Test-Path $overridePath) {
      return $overridePath
    }
    throw "Override path for $name not found: $overridePath"
  }

  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  foreach ($dir in $candidateDirectories) {
    if (-not $dir) {
      continue
    }
    $candidate = Join-Path $dir "$name.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Could not locate $name; install it with `python -m pip install --user $name` and add the user Scripts folder to PATH, or pass -${name}Path."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptRoot '..')
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
$buildDir = Join-Path $repoRoot 'build'

if (-not (Test-Path $vcpkgDir)) {
  throw 'vcpkg directory not found. Run scripts/setup.ps1 first.'
}
if (-not (Test-Path $vcpkgExe)) {
  throw 'vcpkg.exe not found; run scripts/setup.ps1 first.'
}

$userScriptDirs = Get-UserScriptsPath
$mesonExe = Resolve-Executable $MesonPath 'meson' $userScriptDirs
$ninjaExe = Resolve-Executable $NinjaPath 'ninja' $userScriptDirs

$mesonBuildType = if ($Configuration -eq 'MinSizeRel') { 'minsize' } else { 'debug' }
$configSubdir = if ($Configuration -eq 'MinSizeRel') { 'minsize' } else { 'debug' }
$mesonBuildDir = Join-Path $buildDir $configSubdir

$loggingArg = if ($Configuration -eq 'MinSizeRel') { 'false' } else { 'true' }
$testsArg = if ($Configuration -eq 'MinSizeRel') { 'false' } else { 'true' }
$vscrt = if ($Configuration -eq 'MinSizeRel') { 'static' } else { 'md' }

Write-Host "Installing manifest dependencies via vcpkg..."
Push-Location $vcpkgDir
try {
  & $vcpkgExe install --triplet x64-windows
}
finally {
  Pop-Location
}

Set-Location $repoRoot

$vcpkgShare = Join-Path $repoRoot 'vcpkg_installed\x64-windows\share'
$vcpkgRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
$prefixPaths = @()
if (Test-Path $vcpkgShare) {
  $prefixPaths += $vcpkgShare
}
if (Test-Path $vcpkgRoot) {
  $prefixPaths += $vcpkgRoot
}
if ($prefixPaths.Count -gt 0) {
  $newPrefixValue = $prefixPaths -join ';'
  if ($env:CMAKE_PREFIX_PATH) {
    $env:CMAKE_PREFIX_PATH = "$newPrefixValue;$env:CMAKE_PREFIX_PATH"
  } else {
    $env:CMAKE_PREFIX_PATH = $newPrefixValue
  }
}

$mesonArgs = @('setup', '--backend=ninja')
$mesonInfo = Join-Path $mesonBuildDir 'meson-info'
if (Test-Path $mesonInfo) {
  $mesonArgs += '--reconfigure'
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
$mesonArgs += $mesonBuildDir
$mesonArgs += $repoRoot

Write-Host "Configuring ($Configuration) with Meson/Ninja..."
& $mesonExe @mesonArgs

Write-Host "Building ($Configuration)..."
& $ninjaExe -C $mesonBuildDir
