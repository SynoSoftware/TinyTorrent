param(
  [ValidateSet('Debug','MinSizeRel')]
  [string]$Configuration = 'Debug',
  [string]$MesonPath = '',
  [string]$NinjaPath = '',
  [string]$VsWherePath = ''
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

function Resolve-VsWhere {
  param($overridePath)

  if ($overridePath) {
    if (Test-Path $overridePath) {
      return $overridePath
    }
    throw "Override path for vswhere.exe not found: $overridePath"
  }

  $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  if ($programFilesX86) {
    $default = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $default) {
      return $default
    }
  }

  throw 'Could not locate vswhere.exe; install Visual Studio 2017+ or provide a path via -VsWherePath.'
}

function Import-VsEnvironment {
  param($vswhere)

  $vsInstallArgs = @('-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath')
  $vsInstallPath = (& $vswhere @vsInstallArgs) | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
  if (-not $vsInstallPath) {
    throw 'Unable to locate a Visual Studio installation that contains the MSVC toolset.'
  }

  $vcvarsPath = Join-Path $vsInstallPath 'VC\Auxiliary\Build\vcvars64.bat'
  if (-not (Test-Path $vcvarsPath)) {
    throw "Could not find vcvars64.bat under $vsInstallPath."
  }

  $cmd = "`"$vcvarsPath`" amd64 && set"
  $envOutput = & cmd /c $cmd
  foreach ($line in ($envOutput -split "`r?`n")) {
    if (-not $line) {
      continue
    }
    $parts = $line -split('=', 2)
    if ($parts.Count -ne 2) {
      continue
    }
    $envName = $parts[0]
    $envValue = $parts[1]
    Set-Item -Path ("Env:" + $envName) -Value $envValue
  }
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

$vswhereExe = Resolve-VsWhere $VsWherePath
Import-VsEnvironment $vswhereExe

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

$testsEnabled = $testsArg -eq 'true'
if ($testsEnabled) {
  Write-Host "Running tests..."
  $testBinDirs = @()
  $releaseBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\bin'
  $debugBin = Join-Path $repoRoot 'vcpkg_installed\x64-windows\debug\bin'
  if (Test-Path $releaseBin) {
    $testBinDirs += $releaseBin
  }
  if (Test-Path $debugBin) {
    $testBinDirs += $debugBin
  }
  $originalPath = $env:PATH
  if ($testBinDirs.Count -gt 0) {
    $env:PATH = ($testBinDirs -join ';') + ';' + $env:PATH
  }
  $testDir = Join-Path $mesonBuildDir 'tests'
  $testExecutables = @('dispatcher-test.exe', 'rpc-endpoint-test.exe')
  $testResults = @()
  $runSucceeded = $true
  $failureMessage = ''
  try {
    foreach ($testExe in $testExecutables) {
      $testPath = Join-Path $testDir $testExe
      if (-not (Test-Path $testPath)) {
        throw "Test executable not found: $testPath"
      }
      Write-Host "  ▶ $testExe"
      $testOutput = & $testPath 2>&1 | Out-String
      $testExitCode = $LASTEXITCODE
      $trimmedOutput = $testOutput.Trim()
      $testResults += [pscustomobject]@{
        Name = $testExe
        ExitCode = $testExitCode
        Output = $trimmedOutput
      }
      if ($testExitCode -ne 0) {
        Write-Host "    ✗ failed (exit code $testExitCode)"
        Write-Host "    ── captured output ──"
        if ($trimmedOutput) {
          Write-Host $trimmedOutput
        } else {
          Write-Host "    <no output captured>"
        }
        $runSucceeded = $false
        $failureMessage = "Test $testExe failed (exit code $testExitCode)"
        break
      } else {
        Write-Host "    ✔ done"
      }
    }
  }
  finally {
    $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
    $logLines = @()
    $logLines += "[ $(Get-Date -Format o) | $Configuration ]"
    foreach ($entry in $testResults) {
      $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
      $logLines += "$status $($entry.Name) exit=$($entry.ExitCode)"
      if ($entry.ExitCode -ne 0 -and $entry.Output) {
        $logLines += "  Output: $($entry.Output)"
      }
    }
    if ($logLines.Count -gt 0) {
      Add-Content -Path $testLogFile -Value $logLines
    }
    $env:PATH = $originalPath
  }
  if (-not $runSucceeded) {
    throw $failureMessage
  }
} else {
  Write-Host "Tests are disabled for configuration $Configuration; skipping."
}
