param(
    [ValidateSet('Debug', 'Release', 'MinSizeRel')]
    [string]$Configuration = 'Debug',
    
    # Tool Overrides
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',
    
    # Actions
    [switch]$Clean,
    [switch]$SkipTests,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host "TinyTorrent Build Script (Final)"
    Write-Host "Features: Auto-Discovery (User+System), Auto-Clean (Marker), Full Logging."
    exit 0
}

# ==============================================================================
# 1. ROBUST DISCOVERY (Fixed User Paths)
# ==============================================================================

function Exec-Checked {
    param([string]$Command, [string[]]$Arguments, [string]$ErrorMessage = "Command failed.")
    Write-Host "[$Command] $Arguments" -ForegroundColor Gray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$ErrorMessage (Exit Code: $LASTEXITCODE)" }
}

function Resolve-Executable {
    param($Name, $OverridePath)
    if ($OverridePath) {
        if (Test-Path $OverridePath -PathType Leaf) { return $OverridePath }
        throw "Override path for $Name must be a file: $OverridePath"
    }
    $cmd = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Resolve-PythonScript {
    param($ScriptName, $OverridePath)
    
    # 1. Override / PATH
    $exe = Resolve-Executable $ScriptName $OverridePath
    if ($exe) { return $exe }

    # 2. Heuristic Scan (System AND User Scripts)
    Write-Host "Scanning for $ScriptName..." -ForegroundColor DarkGray
    $candidates = @()
    $pyLaunchers = @("py", "python3", "python")
    
    foreach ($py in $pyLaunchers) {
        if (Get-Command $py -ErrorAction SilentlyContinue) {
            try {
                # FIX: Ask for BOTH 'scripts' (System) and 'nt_user' (Roaming/User)
                $code = "import sys, sysconfig; print(sys.version_info.major); print(sys.version_info.minor); print(sysconfig.get_path('scripts')); print(sysconfig.get_path('scripts', 'nt_user'))"
                $res = & $py -c $code 2>$null
                
                if ($res.Count -ge 3) {
                    $ver = [int]$res[0] * 100 + [int]$res[1]
                    $pathsToCheck = @()
                    if ($res[2]) { $pathsToCheck += $res[2] } # System
                    if ($res.Count -ge 4 -and $res[3]) { $pathsToCheck += $res[3] } # User (Roaming)

                    foreach ($p in $pathsToCheck) {
                        if (Test-Path $p) {
                            $target = Join-Path $p "$ScriptName.exe"
                            if (Test-Path $target -PathType Leaf) {
                                $candidates += [pscustomobject]@{ Path = $target; Score = $ver }
                            }
                        }
                    }
                }
            }
            catch {}
        }
    }

    # Deterministic Winner: Highest Python Version
    $winner = $candidates | Sort-Object Score -Descending | Select-Object -First 1
    if ($winner) { return $winner.Path }
    
    throw "Could not find '$ScriptName'. Run: pip install --user $ScriptName"
}

function Get-FirstCommandLine {
    param(
        [scriptblock]$Command,
        [string]$Fallback = 'Unavailable'
    )
    try {
        $line = & $Command 2>&1 | Select-Object -First 1
        if ($line -ne $null) { return $line.ToString().Trim() }
    }
    catch {
        return $_.Exception.Message
    }
    return $Fallback
}

# ==============================================================================
# 2. TOOLCHAIN & ENVIRONMENT
# ==============================================================================

# -- Visual Studio --
if (-not (Get-Command "cl.exe" -ErrorAction SilentlyContinue)) {
    Write-Host "Locating Visual Studio..." -ForegroundColor Cyan
    $vswhereExe = Resolve-Executable "vswhere" $VsWherePath
    if (-not $vswhereExe) {
        $default = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $default) { $vswhereExe = $default }
        else { throw "vswhere.exe not found." }
    }
    $vsPath = & $vswhereExe -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vsPath) { throw "No VS installation found." }
    $vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
    cmd /c "`"$vcvars`" && set" | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") { Set-Content "Env:\$($matches[1])" $matches[2] }
    }
}

# -- Tool Discovery --
$MesonExe = Resolve-PythonScript "meson" $MesonPath
$NinjaExe = Resolve-PythonScript "ninja" $NinjaPath

# -- Version Reporting --
Write-Host "`nToolchain Verification:" -ForegroundColor Cyan
$clVersion = Get-FirstCommandLine { cl.exe }
$mesonVersion = Get-FirstCommandLine { & $MesonExe --version }
$ninjaVersion = Get-FirstCommandLine { & $NinjaExe --version }
Write-Host "  CL:    $clVersion"
Write-Host "  Meson: $mesonVersion ($MesonExe)"
Write-Host "  Ninja: $ninjaVersion ($NinjaExe)"

# ==============================================================================
# 3. CONFIGURATION & AUTO-CLEAN
# ==============================================================================

if ($Configuration -eq 'Release') { $Configuration = 'MinSizeRel' }

switch ($Configuration) {
    'Debug' {
        $BuildSubDir = "debug"
        $MesonType = "debug"
        $VcpkgTrip = "x64-windows"
        $VsCrt = "md"
        $Sanitize = "address"
        $Logging = "true"
        $UseLto = "false"
        $Strip = "false"
        $IsStatic = $false
    }
    'MinSizeRel' {
        $BuildSubDir = "release"
        $MesonType = "minsize"
        $VcpkgTrip = "x64-windows-static"
        $VsCrt = "mt"
        $Sanitize = "none"
        $Logging = "false"
        $UseLto = "true"
        $Strip = "true"
        $IsStatic = $true
    }
}

$RepoRoot = $PSScriptRoot
$BuildDir = Join-Path $RepoRoot "build\$BuildSubDir"
$VcpkgDir = Join-Path $RepoRoot "vcpkg"
$VcpkgExe = Join-Path $VcpkgDir "vcpkg.exe"

# FIX: Automatic Invalidation (Marker File)
$ConfigMarker = "$Configuration|$VcpkgTrip|$VsCrt|$Sanitize"
$MarkerFile = Join-Path $BuildDir "tt-config.marker"

if (Test-Path $BuildDir) {
    $OldMarker = if (Test-Path $MarkerFile) { Get-Content $MarkerFile -Raw } else { "" }
    if ($Clean -or ($OldMarker -ne $ConfigMarker)) {
        $Reason = if ($Clean) { "Manual Clean" } else { "Configuration Changed" }
        Write-Host "Cleaning build directory ($Reason)..." -ForegroundColor Yellow
        Remove-Item $BuildDir -Recurse -Force
    }
}

if (-not (Test-Path $BuildDir)) { New-Item -ItemType Directory -Path $BuildDir | Out-Null }
Set-Content -Path $MarkerFile -Value $ConfigMarker

# ==============================================================================
# 4. DEPENDENCY MANAGEMENT
# ==============================================================================

Write-Host "`nVerifying Dependencies ($VcpkgTrip)..." -ForegroundColor Cyan
if (-not (Test-Path $VcpkgDir)) {
    Write-Host "Cloning Vcpkg..."
    Exec-Checked "git" @("clone", "https://github.com/microsoft/vcpkg.git", $VcpkgDir, "--depth", "1")
}

# FIX: Check VcpkgDir exists before checking Exe (Git might have failed)
if (Test-Path $VcpkgDir) {
    if (-not (Test-Path $VcpkgExe)) {
        Write-Host "Bootstrapping Vcpkg..." -ForegroundColor Yellow
        Start-Process -FilePath (Join-Path $VcpkgDir "bootstrap-vcpkg.bat") -ArgumentList "-disableMetrics" -Wait -NoNewWindow
        if (-not (Test-Path $VcpkgExe)) { throw "Bootstrap failed." }
    }
}
else { throw "Vcpkg directory missing." }

$env:VCPKG_DEFAULT_TRIPLET = $VcpkgTrip
$VcpkgInstallRoot = Join-Path $RepoRoot "vcpkg_installed"

Push-Location $VcpkgDir
try {
    Exec-Checked $VcpkgExe @('install', "--triplet=$VcpkgTrip", "--x-install-root=$VcpkgInstallRoot", '--recurse', '--no-binarycaching') `
        -ErrorMessage "Vcpkg install failed."
}
finally { Pop-Location }

# ==============================================================================
# 5. MESON SETUP
# ==============================================================================

$TripletInstallDir = Join-Path $VcpkgInstallRoot $VcpkgTrip
$env:CMAKE_PREFIX_PATH = "$TripletInstallDir;$TripletInstallDir\share;$env:CMAKE_PREFIX_PATH"

$MesonArgs = @(
    "setup", $BuildDir,
    "--backend=ninja",
    "--buildtype=$MesonType",
    "-Db_vscrt=$VsCrt",
    "-Db_sanitize=$Sanitize",
    "-Db_lto=$UseLto",
    "-Dtt_enable_logging=$Logging",
    "-Dtt_enable_tests=$($(-not $SkipTests).ToString().ToLower())",
    "-Dstrip=$Strip"
)

if (Test-Path "$BuildDir\build.ninja") {
    Write-Host "Reconfiguring..." -ForegroundColor Cyan
    Exec-Checked $MesonExe ($MesonArgs + "--reconfigure")
}
else {
    Write-Host "Configuring..." -ForegroundColor Cyan
    Exec-Checked $MesonExe $MesonArgs
}

if (-not (Test-Path "$BuildDir\build.ninja")) { throw "Meson completed but 'build.ninja' is missing." }

# ==============================================================================
# 6. BUILD
# ==============================================================================

Write-Host "`nCompiling ($Configuration)..." -ForegroundColor Cyan
Exec-Checked $NinjaExe @('-C', $BuildDir)

# ==============================================================================
# 7. TEST HARNESS
# ==============================================================================

if (-not $SkipTests) {
    Write-Host "`nRunning Tests..." -ForegroundColor Cyan
    $OldPath = $env:PATH
    
    if (-not $IsStatic) {
        $DllSource = Join-Path $TripletInstallDir "debug\bin"
        if (Test-Path $DllSource) { $env:PATH = "$DllSource;$OldPath" }
    }

    try {
        $TestDir = Join-Path $BuildDir "tests"
        if (Test-Path $TestDir) {
            $Tests = Get-ChildItem -Path $TestDir -Filter "*-test.exe"
            $LogSummary = @()
            $AnyFailed = $false

            foreach ($Test in $Tests) {
                Write-Host "  Exec: $($Test.Name) ... " -NoNewline
                $OutLog = "$($Test.FullName).stdout.log"
                $ErrLog = "$($Test.FullName).stderr.log"
                
                $Process = Start-Process -FilePath $Test.FullName -NoNewWindow -PassThru -Wait `
                    -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
                
                $Status = if ($Process.ExitCode -eq 0) { "PASS" } else { "FAIL" }
                $LogSummary += "$Status : $($Test.Name) (Exit: $($Process.ExitCode))"

                if ($Status -eq "PASS") {
                    Write-Host "PASS" -ForegroundColor Green
                }
                else {
                    Write-Host "FAIL (Exit: $($Process.ExitCode))" -ForegroundColor Red
                    $AnyFailed = $true
                    $FullOutput = (Get-Content $OutLog -Raw) + "`n" + (Get-Content $ErrLog -Raw)
                    if ($FullOutput.Trim()) {
                        Write-Host "    --- OUTPUT ---" -ForegroundColor DarkRed
                        Write-Host $FullOutput.Trim() -ForegroundColor DarkRed
                    }
                }
            }
            $SummaryFile = Join-Path $BuildDir "test-results.log"
            $LogSummary | Set-Content $SummaryFile
            if ($AnyFailed) { throw "One or more tests failed." }
        }
    }
    finally { $env:PATH = $OldPath }
}

# ==============================================================================
# 8. DEPLOYMENT
# ==============================================================================

if (-not $IsStatic) {
    $BinDir = Join-Path $TripletInstallDir "debug\bin"
    if (Test-Path $BinDir) {
        Get-ChildItem -Path $BinDir -Filter "*.dll" | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $BuildDir -Force
        }
    }
}

$ExePath = Join-Path $BuildDir "tt-engine.exe"
if (Test-Path $ExePath) {
    $SizeKB = (Get-Item $ExePath).Length / 1KB
    Write-Host "`nSUCCESS: $Configuration Build Complete" -ForegroundColor Green
    Write-Host "Artifact: $ExePath"
    Write-Host ("Size:     {0:N0} KB" -f $SizeKB)
}