param(
  [ValidateSet('Debug', 'Release', 'MinSizeRel')]
  [string]$Configuration = 'Debug',
  [string]$MesonPath = '',
  [string]$NinjaPath = '',
  [string]$VsWherePath = '',
  [switch]$LoopTests,
  [int]$MaxLoopIterations = 0,
  [switch]$CaptureDumps,
  [string]$DumpToolPath = ''
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
  }
  catch {
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
    $parts = $line -split ('=', 2)
    if ($parts.Count -ne 2) {
      continue
    }
    $envName = $parts[0]
    $envValue = $parts[1]
    Set-Item -Path ("Env:" + $envName) -Value $envValue
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path $scriptRoot
$vcpkgDir = Join-Path $repoRoot 'vcpkg'
$vcpkgExe = Join-Path $vcpkgDir 'vcpkg.exe'
$buildDir = Join-Path $repoRoot 'build'

if (-not (Test-Path $vcpkgDir)) {
  throw 'vcpkg directory not found. Run setup.ps1 first.'
}
if (-not (Test-Path $vcpkgExe)) {
  throw 'vcpkg.exe not found; run setup.ps1 first.'
}

$vswhereExe = Resolve-VsWhere $VsWherePath
Import-VsEnvironment $vswhereExe

$userScriptDirs = Get-UserScriptsPath
$mesonExe = Resolve-Executable $MesonPath 'meson' $userScriptDirs
$ninjaExe = Resolve-Executable $NinjaPath 'ninja' $userScriptDirs

$mesonBuildType = ''
$configSubdir = ''
$mesonBuildDir = ''
$loggingArg = 'true'
$testsArg = 'true'
$vscrt = 'md'

switch ($Configuration) {
  'Debug' {
    $mesonBuildType = 'debug'
    $configSubdir = 'debug'
  }
  'Release' {
    $mesonBuildType = 'minsize'
    $configSubdir = 'release'
    $loggingArg = 'false'
    $testsArg = 'false'
    $vscrt = 'mt'
  }
  'MinSizeRel' {
    $mesonBuildType = 'minsize'
    $configSubdir = 'minsize'
    $loggingArg = 'false'
    $testsArg = 'false'
    $vscrt = 'mt'
  }
}
$mesonBuildDir = Join-Path $buildDir $configSubdir
$vcpkgTriplet = if ($Configuration -eq 'Debug') { 'x64-windows' } else { 'x64-windows-static' }
$useStaticVcpkg = $vcpkgTriplet -eq 'x64-windows-static'
$env:VCPKG_DEFAULT_TRIPLET = $vcpkgTriplet

Write-Host ("Installing manifest dependencies via vcpkg ({0})..." -f $vcpkgTriplet)
Push-Location $vcpkgDir
try {
  & $vcpkgExe install --triplet $vcpkgTriplet
}
finally {
  Pop-Location
}

Set-Location $repoRoot

$vcpkgTripletRoot = Join-Path $repoRoot 'vcpkg_installed'
$vcpkgTripletRoot = Join-Path $vcpkgTripletRoot $vcpkgTriplet
$vcpkgShare = Join-Path $vcpkgTripletRoot 'share'
$vcpkgRoot = $vcpkgTripletRoot
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
  }
  else {
    $env:CMAKE_PREFIX_PATH = $newPrefixValue
  }
}

if ($useStaticVcpkg -and (Test-Path $mesonBuildDir)) {
  Remove-Item $mesonBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

$mesonArgs = @('setup', '--backend=ninja')
if (-not $useStaticVcpkg) {
  $mesonInfo = Join-Path $mesonBuildDir 'meson-info'
  if (Test-Path $mesonInfo) {
    $mesonArgs += '--reconfigure'
  }
}
$mesonArgs += "--buildtype=$mesonBuildType"
$mesonArgs += "-Dtt_enable_logging=$loggingArg"
$mesonArgs += "-Dtt_enable_tests=$testsArg"
$mesonArgs += "-Db_vscrt=$vscrt"
$sizeOptimizedBuild = $mesonBuildType -ne 'debug'
if ($sizeOptimizedBuild) {
  $mesonArgs += '-Db_lto=true'
  $mesonArgs += '-Dstrip=true'
}
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
  $iteration = 0
  $loopLimit = [int]$MaxLoopIterations
  if (-not $LoopTests -and $loopLimit -gt 0) {
    Write-Host ("Warning: -MaxLoopIterations requires -LoopTests; ignoring target of {0} iterations." -f $loopLimit)
  }
  $dumpToolExe = ''
  $dumpRoot = ''
  if ($CaptureDumps) {
    $sysInternalsPaths = @()
    if ($env:ProgramFiles) {
      $sysInternalsPaths += (Join-Path $env:ProgramFiles 'Sysinternals')
    }
    if (${env:ProgramFiles(x86)}) {
      $sysInternalsPaths += (Join-Path ${env:ProgramFiles(x86)} 'Sysinternals')
    }
    $dumpToolExe = Resolve-Executable $DumpToolPath 'procdump' $sysInternalsPaths
    $dumpRoot = Join-Path $mesonBuildDir 'test-dumps'
    New-Item -Path $dumpRoot -ItemType Directory -Force | Out-Null
    Write-Host ("  Capturing crash dumps via {0} -> {1}" -f $dumpToolExe, $dumpRoot)
  }
  try {
    while ($true) {
      $iteration++
      if ($LoopTests) {
        Write-Host ("  Loop iteration {0}" -f $iteration)
      }
      foreach ($testExe in $testExecutables) {
        $testPath = Join-Path $testDir $testExe
        if (-not (Test-Path $testPath)) {
          throw "Test executable not found: $testPath"
        }
        $iterationSuffix = ''
        if ($LoopTests) {
          $iterationSuffix = (" (iteration {0})" -f $iteration)
        }
        Write-Host ("  > {0}{1}" -f $testExe, $iterationSuffix)
        $testDumpDir = ''
        $testOutput = ''
        $previousErrorAction = $ErrorActionPreference
        try {
          $ErrorActionPreference = 'Continue'
          if ($CaptureDumps) {
            $iterationDumpRoot = Join-Path $dumpRoot ("iter-{0}" -f $iteration)
            $testDumpDir = Join-Path $iterationDumpRoot $testExe
            New-Item -ItemType Directory -Force -Path $testDumpDir | Out-Null
            $dumpArgs = @('-accepteula','-ma','-e','-n','1','-x',$testDumpDir,$testPath)
            $testOutput = & $dumpToolExe @dumpArgs 2>&1 | Out-String
          }
          else {
            $testOutput = & $testPath 2>&1 | Out-String
          }
        }
        finally {
          $ErrorActionPreference = $previousErrorAction
        }
        $testExitCode = $LASTEXITCODE
        $trimmedOutput = $testOutput.Trim()
        $testResults += [pscustomobject]@{
          Name     = $testExe
          ExitCode = $testExitCode
          Output   = $trimmedOutput
          Iteration = $iteration
          DumpDir  = $testDumpDir
        }
        if ($testExitCode -ne 0) {
          Write-Host ("    FAIL (exit code {0})" -f $testExitCode)
          Write-Host "    -- captured output --"
          if ($trimmedOutput) {
            Write-Host $trimmedOutput
          }
          else {
            Write-Host "    <no output captured>"
          }
          $runSucceeded = $false
          $failureMessage = "Test $testExe failed (exit code $testExitCode) on iteration $iteration"
          break
        }
        else {
          Write-Host "    PASS"
        }
      }
      if (-not $runSucceeded) {
        break
      }
      if (-not $LoopTests) {
        break
      }
      if ($loopLimit -gt 0 -and $iteration -ge $loopLimit) {
        Write-Host ("  Loop limit reached ({0} iterations); stopping without failure." -f $loopLimit)
        break
      }
    }
  }
  finally {
    $testLogFile = Join-Path $mesonBuildDir 'test-results.log'
    $logLines = @()
    $timestamp = Get-Date -Format o
    $entryLine = "[ {0} - {1} ]" -f $timestamp, $Configuration
    $logLines += $entryLine
    foreach ($entry in $testResults) {
      $status = if ($entry.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
      $statusLine = "$status $($entry.Name) iter=$($entry.Iteration) exit=$($entry.ExitCode)"
      if ($entry.DumpDir) {
        $statusLine += " dumps=$($entry.DumpDir)"
      }
      $logLines += $statusLine
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
}
else {
  Write-Host "Tests are disabled for configuration $Configuration; skipping."
}

if (-not $useStaticVcpkg) {
  $runtimeDlls = @(
    'torrent-rasterbar.dll',
    'yyjson.dll',
    'libssl-3-x64.dll',
    'libcrypto-3-x64.dll'
  )
  $runtimeRoot = Join-Path $repoRoot 'vcpkg_installed\x64-windows'
  $runtimeSourceDir = if ($Configuration -eq 'Debug') {
    Join-Path $runtimeRoot 'debug\bin'
  }
  else {
    Join-Path $runtimeRoot 'bin'
  }
  if (Test-Path $runtimeSourceDir) {
    foreach ($dll in $runtimeDlls) {
      $source = Join-Path $runtimeSourceDir $dll
      if (Test-Path $source) {
        Copy-Item -Path $source -Destination $mesonBuildDir -Force
      }
    }
  }
  else {
    Write-Host "Warning: runtime dependency directory missing: $runtimeSourceDir"
  }
}
else {
  Write-Host "Static vcpkg triplet in use; runtime DLLs are linked statically."
}

$linkedLibs = @(
  'torrent-rasterbar.lib',
  'yyjson.lib',
  'sqlite3.lib',
  'libssl.lib',
  'libcrypto.lib'
)
$staticLibDir = Join-Path $vcpkgTripletRoot 'lib'
Write-Host "Linked library footprint ($vcpkgTriplet):"
foreach ($lib in $linkedLibs) {
  $path = Join-Path $staticLibDir $lib
  if (Test-Path $path) {
    $sizeMb = (Get-Item $path).Length / 1MB
    Write-Host ("  {0,-20} {1,8:N2} MB  {2}" -f $lib, $sizeMb, $path)
  }
  else {
    Write-Host ("  {0,-20}    missing  {1}" -f $lib, $path)
  }
}

$fileName = 'tt-engine.exe'
$exePath = Join-Path $mesonBuildDir $fileName
if (Test-Path $exePath) {
  $lengthKb = (Get-Item $exePath).Length / 1024.0
  Write-Host $exePath
  Write-Host ("\- {0}    {1:N2} kb" -f $fileName, $lengthKb)
  $mapPath = Join-Path $mesonBuildDir 'tt-engine.map'
  if (Test-Path $mapPath) {
    $mapSizeKb = (Get-Item $mapPath).Length / 1024.0
    Write-Host ("   map: {0} ({1:N2} kb)" -f $mapPath, $mapSizeKb)
  }
}
else {
  Write-Host ('Executable not found: {0}' -f $exePath)
}
