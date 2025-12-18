param(
    [Parameter(Position = 0)]
    [string]$Configuration = 'Debug',
    
    # Tool Overrides
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',
    
    # Actions
    [switch]$Clean,
    # Safety: vcpkg is never deleted automatically. If you request deletion,
    # the script will show its size and require interactive confirmation.
    [switch]$DeleteVcpkg,
    # Force re-run of vcpkg install even if the triplet cache is present.
    [switch]$ForceVcpkg,
    [switch]$SkipTests,
    [Alias('H')]
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Deletion safety threshold:
# If any folder deletion target exceeds this size, require interactive confirmation.
# Default: 500MB
$PromptOnDeleteAboveBytes = 500MB

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return "$Bytes B" }
    $units = @('KB', 'MB', 'GB', 'TB')
    $size = [double]$Bytes
    $unitIndex = -1
    while ($size -ge 1024 -and $unitIndex -lt ($units.Count - 1)) {
        $size /= 1024
        $unitIndex++
    }
    return ("{0:N2} {1}" -f $size, $units[$unitIndex])
}

function Get-FolderSizeBytes {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0 }
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
    if ($null -eq $m.Sum) { return 0 }
    return [long]$m.Sum
}

function Remove-FolderSafe {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][long]$PromptAboveBytes,
        [switch]$ForcePrompt
    )

    if (-not (Test-Path $Path)) {
        Write-Host "$DisplayName not found: $Path" -ForegroundColor DarkGray
        return
    }

    Write-Host "`nDeletion requested: $DisplayName" -ForegroundColor Yellow
    Write-Host "  Path: $Path" -ForegroundColor Yellow
    Write-Host "  Calculating size..." -ForegroundColor DarkGray
    $bytes = Get-FolderSizeBytes $Path
    Write-Host "  Size: $(Format-Bytes $bytes)" -ForegroundColor Yellow

    $needsPrompt = $ForcePrompt -or ($bytes -ge $PromptAboveBytes)
    if ($needsPrompt) {
        Write-Host "  Threshold: $(Format-Bytes $PromptAboveBytes)" -ForegroundColor Yellow

        # Avoid hanging in CI/non-interactive environments.
        if ($env:CI -eq 'true') {
            throw "Refusing to delete $DisplayName in CI (size requires confirmation). Delete it manually if needed: $Path"
        }

        $answer = Read-Host "Type YES to permanently delete $DisplayName (anything else = cancel)"
        if ($answer -ne 'YES') {
            Write-Host "Cancelled deletion of $DisplayName." -ForegroundColor Cyan
            return
        }
    }

    Write-Host "Deleting $DisplayName..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "Deleted $DisplayName." -ForegroundColor Green
}

function Print-Help {
    Write-Host "Usage: build.ps1 [Configuration|clean|help] [options]"
    Write-Host ""
    Write-Host "Configurations:"
    Write-Host "  Debug        - MSVC AddressSanitizer build (default)."
    Write-Host "  Release      - 64-bit release build (future, not implemented)."
    Write-Host "  MinSizeRel   - MinSizeRel build with static CRT."
    Write-Host ""
    Write-Host "Special keywords:"
    Write-Host "  clean        - wipe and rebuild current configuration."
    Write-Host "  help, -h, --help, --clean, -c"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -MesonPath <path>    Override Meson executable path."
    Write-Host "  -NinjaPath <path>    Override Ninja executable path."
    Write-Host "  -VsWherePath <path>  Override vswhere.exe location."
    Write-Host "  -Clean               Force blowing away the build directory."
    Write-Host "  -DeleteVcpkg         Delete the vcpkg checkout (interactive confirm)."
    Write-Host "  -ForceVcpkg          Reinstall vcpkg packages even when cached."
    Write-Host "  -SkipTests           Build without running the test suite."
    Write-Host "  -Help (-H)           Print this message."
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./build.ps1             # default Debug build."
    Write-Host "  ./build.ps1 clean       # clean + Debug rebuild."
    Write-Host "  ./build.ps1 MinSizeRel  # smallest release build."
    Write-Host "  ./build.ps1 -ForceVcpkg # rebuild vcpkg packages first."
    Write-Host ""
    Write-Host "This script bootstraps vcpkg, runs Meson/Ninja, and optionally runs"
    Write-Host "the doctest suite. Pass -SkipTests to avoid long runtimes."
}

if ($Configuration.StartsWith('-')) {
    switch ($Configuration.ToLowerInvariant()) {
        '--help' { $Help = $true; $Configuration = 'Debug' }
        '-h'     { $Help = $true; $Configuration = 'Debug' }
        '--clean' { $Clean = $true; $Configuration = 'Debug' }
        '-c'     { $Clean = $true; $Configuration = 'Debug' }
        default {
            throw "Invalid option '$Configuration'. Valid options: Debug, Release, MinSizeRel, clean, help."
        }
    }
}
else {
    switch ($Configuration.ToLowerInvariant()) {
        'clean' {
            $Clean = $true
            $Configuration = 'Debug'
        }
        'help' {
            $Help = $true
            $Configuration = 'Debug'
        }
        default {
            $validConfigurations = @{
                'debug' = 'Debug'
                'release' = 'Release'
                'minsizerel' = 'MinSizeRel'
            }
            $normalized = $Configuration.ToLowerInvariant()
            if ($validConfigurations.ContainsKey($normalized)) {
                $Configuration = $validConfigurations[$normalized]
            }
            else {
                throw "Invalid configuration '$Configuration'. Valid values: Debug, Release, MinSizeRel, clean, help."
            }
        }
    }
}

if ($Help) {
    Print-Help
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
        # NOTE: MSVC ASan requires /MD. Mixing /MD app code with /MDd vcpkg debug
        # libs is an ABI/CRT mismatch (esp. std::string) and can crash inside
        # libtorrent settings_pack::set_str.
        # Use a release-only dynamic triplet to keep CRT + STL ABI consistent.
        $VcpkgTrip = "x64-windows-asan"
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
$VcpkgInstallRoot = Join-Path $RepoRoot "vcpkg_installed"
$TripletRoot = Join-Path $VcpkgInstallRoot $VcpkgTrip
$TripletReadyMarker = Join-Path $TripletRoot ".installed.marker"

if ($DeleteVcpkg) {
    Remove-FolderSafe -Path $VcpkgDir -DisplayName 'vcpkg' -PromptAboveBytes $PromptOnDeleteAboveBytes -ForcePrompt
}

# FIX: Automatic Invalidation (Marker File)
$ConfigMarker = "$Configuration|$VcpkgTrip|$VsCrt|$Sanitize"
$MarkerFile = Join-Path $BuildDir "tt-config.marker"

if (Test-Path $BuildDir) {
    $OldMarker = if (Test-Path $MarkerFile) { (Get-Content $MarkerFile -Raw).Trim() } else { "" }
    if ($Clean -or ($OldMarker -ne $ConfigMarker)) {
        $Reason = if ($Clean) { "Manual Clean" } else { "Configuration Changed" }
        Write-Host "Cleaning build directory ($Reason)..." -ForegroundColor Yellow
        Remove-FolderSafe -Path $BuildDir -DisplayName "build directory ($BuildSubDir)" -PromptAboveBytes $PromptOnDeleteAboveBytes
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

function Test-VcpkgTripletReady {
    $statusFile = Join-Path (Join-Path $VcpkgInstallRoot "vcpkg") "status"
    $hasStatus = Test-Path -LiteralPath $statusFile
    $hasMarker = Test-Path -LiteralPath $TripletReadyMarker
    $hasTripletContent = Test-Path -LiteralPath $TripletRoot
    return ($hasMarker -and $hasStatus -and $hasTripletContent)
}

function Invoke-VcpkgInstall {
    param(
        [int]$MaxAttempts = 3
    )

    $lockPath = Join-Path $VcpkgDir '.vcpkg-root'
    function Wait-ForVcpkgLock {
        param([timeSpan]$Timeout = [timeSpan]::FromSeconds(120))

        $deadline = (Get-Date).Add($Timeout)
        while ((Get-Date) -lt $deadline) {
            try {
                $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
                $stream.Close()
                return
            }
            catch [System.IO.IOException] {
                Write-Host "Waiting for vcpkg lock..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
        }
        throw "Timed out waiting for vcpkg lock ($lockPath)."
    }

    for ($attempt = 1; $attempt -le $MaxAttempts; ++$attempt) {
        Wait-ForVcpkgLock
        try {
            Exec-Checked $VcpkgExe @('install', "--triplet=$VcpkgTrip", "--x-install-root=$VcpkgInstallRoot", '--recurse', '--no-binarycaching') `
                -ErrorMessage "Vcpkg install failed."
            return
        }
        catch {
            if ($attempt -eq $MaxAttempts) {
                throw
            }
            $delay = 5 * $attempt
            Write-Host "vcpkg install attempt $attempt/$MaxAttempts failed; sleeping $delay seconds before retry." -ForegroundColor Yellow
            Start-Sleep -Seconds $delay
        }
    }
}

Push-Location $VcpkgDir
try {
    if ($ForceVcpkg -or -not (Test-VcpkgTripletReady)) {
        Invoke-VcpkgInstall
        if (-not (Test-Path -LiteralPath $TripletRoot)) {
            New-Item -ItemType Directory -Path $TripletRoot -Force | Out-Null
        }
        Set-Content -LiteralPath $TripletReadyMarker -Value (Get-Date).ToString('o')
    }
    else {
        Write-Host "Skipping vcpkg install (cached triplet detected: $VcpkgTrip)." -ForegroundColor Cyan
    }
}
finally { Pop-Location }

# ==============================================================================
# 5. MESON SETUP
# ==============================================================================

$TripletInstallDir = Join-Path $VcpkgInstallRoot $VcpkgTrip
$env:CMAKE_PREFIX_PATH = "$TripletInstallDir;$TripletInstallDir\share;$env:CMAKE_PREFIX_PATH"
$MesonOptions = @(
    "--backend=ninja",
    "--buildtype=$MesonType",
    "-Db_vscrt=$VsCrt",
    "-Db_sanitize=$Sanitize",
    "-Db_lto=$UseLto",
    "-Dtt_enable_logging=$Logging",
    "-Dtt_enable_tests=$($(-not $SkipTests).ToString().ToLower())",
    "-Dstrip=$Strip"
)
$MesonBaseArgs = @("setup") + $MesonOptions
$MesonSourceDir = $RepoRoot

if (Test-Path "$BuildDir\build.ninja") {
    Write-Host "Reconfiguring..." -ForegroundColor Cyan
    Exec-Checked $MesonExe ($MesonBaseArgs + @("--reconfigure", $BuildDir, $MesonSourceDir))
}
else {
    Write-Host "Configuring..." -ForegroundColor Cyan
    Exec-Checked $MesonExe ($MesonBaseArgs + @($BuildDir, $MesonSourceDir))
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
        $DllCandidates = @(
            (Join-Path $TripletInstallDir "bin"),
            (Join-Path $TripletInstallDir "debug\bin")
        )
        foreach ($c in $DllCandidates) {
            if (Test-Path $c) {
                $env:PATH = "$c;$env:PATH"
            }
        }
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
    $BinCandidates = @(
        (Join-Path $TripletInstallDir "bin"),
        (Join-Path $TripletInstallDir "debug\bin")
    )
    foreach ($BinDir in $BinCandidates) {
        if (Test-Path $BinDir) {
            Get-ChildItem -Path $BinDir -Filter "*.dll" | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination $BuildDir -Force
            }
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

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return "$Bytes B" }
    $units = @('KB', 'MB', 'GB', 'TB')
    $size = [double]$Bytes
    $unitIndex = -1
    while ($size -ge 1024 -and $unitIndex -lt ($units.Count - 1)) {
        $size /= 1024
        $unitIndex++
    }
    return ("{0:N2} {1}" -f $size, $units[$unitIndex])
}

function Get-FolderSizeBytes {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0 }
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
    if ($null -eq $m.Sum) { return 0 }
    return [long]$m.Sum
}

function Confirm-And-DeleteFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$DisplayName
    )

    if (-not (Test-Path $Path)) {
        Write-Host "$DisplayName not found: $Path" -ForegroundColor DarkGray
        return
    }

    # Avoid hanging in CI/non-interactive environments.
    if ($env:CI -eq 'true') {
        throw "Refusing to delete $DisplayName in CI. Delete it manually if needed: $Path"
    }

    Write-Host "`nDeletion requested: $DisplayName" -ForegroundColor Yellow
    Write-Host "  Path: $Path" -ForegroundColor Yellow
    Write-Host "  Calculating size..." -ForegroundColor DarkGray
    $bytes = Get-FolderSizeBytes $Path
    Write-Host "  Size: $(Format-Bytes $bytes)" -ForegroundColor Yellow

    $answer = Read-Host "Type YES to permanently delete $DisplayName (anything else = cancel)"
    if ($answer -ne 'YES') {
        Write-Host "Cancelled deletion of $DisplayName." -ForegroundColor Cyan
        return
    }

    Write-Host "Deleting $DisplayName..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "Deleted $DisplayName." -ForegroundColor Green
}
