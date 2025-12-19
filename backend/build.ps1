param(
    [Parameter(Position = 0)]
    [string]$Configuration = 'Debug',

    # Tool Overrides
    [string]$MesonPath = '',
    [string]$NinjaPath = '',
    [string]$VsWherePath = '',

    # Actions
    [switch]$Clean,
    [switch]$DeleteVcpkg,
    [switch]$ForceVcpkg,
    [switch]$SkipTests,
    [Alias('H')]
    [switch]$Help,
    [switch]$AutoConfirmDeletion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Logging Layer ---
function Write-Log {
    param(
        [Parameter(Mandatory)] [string]$Level,
        [Parameter(Mandatory)] [string]$Message,
        [Parameter()] [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $text = "[$Level] $Message"
    Write-Output $text

    if ($Host -and $Host.UI -and -not [Console]::IsOutputRedirected) {
        Microsoft.PowerShell.Utility\Write-Host $text -ForegroundColor $Color
    }
}

function Log-Info { param([string]$Message) Write-Log -Level 'INFO'    -Message $Message -Color ([ConsoleColor]::Cyan) }
function Log-Success { param([string]$Message) Write-Log -Level 'OK'      -Message $Message -Color ([ConsoleColor]::Green) }
function Log-Warn { param([string]$Message) Write-Log -Level 'WARN'    -Message $Message -Color ([ConsoleColor]::Yellow) }
function Log-Error { param([string]$Message) Write-Log -Level 'ERROR'   -Message $Message -Color ([ConsoleColor]::Red) }
function Log-Note { param([string]$Message) Write-Log -Level 'NOTE'    -Message $Message -Color ([ConsoleColor]::DarkGray) }

$OriginalEnv = @{ Path = $env:Path; PYTHON = $env:PYTHON }

# --- Tool Discovery & Polyfill ---
$repoRoot = if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..') -ErrorAction SilentlyContinue).Path } else { $null }
$helper = if ($repoRoot) { Join-Path $repoRoot 'scripts\everything.ps1' } else { $null }
if ($helper -and (Test-Path $helper)) { . $helper; if (Get-Command Ensure-Everything -ErrorAction SilentlyContinue) { [void](Ensure-Everything) } }

# 2. Define the Universal Discovery Function
if (-not (Get-Command Find-Executable -ErrorAction SilentlyContinue)) {
    function Find-Executable {
        param($Name, $OverridePath, $Id, $PackageId)
        if ($OverridePath -and (Test-Path $OverridePath)) { return (Resolve-Path $OverridePath).Path }
        $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
        return if ($cmd) { (Resolve-Path $cmd.Source).Path } else { $null }
    }
}
# ==============================================================================
# Helper: Python & Meson discovery connected to the active Python install.
# ==============================================================================

function Get-PythonVersionText {
    param([string]$PythonExe)
    if (-not $PythonExe) { return 'python (unknown)' }
    try {
        $line = & $PythonExe --version 2>&1 | Select-Object -First 1
        if ($line) { return $line.ToString().Trim() }
    }
    catch {}
    return 'python (unknown)'
}

function Find-MesonNearPython {
    param([string]$PythonExe)
    if (-not $PythonExe) { return $null }
    $pythonParent = Split-Path -Parent $PythonExe
    if ($pythonParent -is [System.Array]) { $pythonParent = $pythonParent[0] }
    $scriptsDir = [System.IO.Path]::Combine($pythonParent, 'Scripts')
    $candidates = @(
        [System.IO.Path]::Combine($scriptsDir, 'meson.exe'),
        [System.IO.Path]::Combine($scriptsDir, 'meson')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}
# --- End Tool Discovery ---

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
        [switch]$ForcePrompt,
        [switch]$AutoConfirm
    )

    if (-not (Test-Path $Path)) {
        Log-Note "$DisplayName not found: $Path"
        return
    }

    Log-Warn "Deletion requested: $DisplayName"
    Log-Note "  Path: $Path"
    Log-Note "  Calculating size..."
    $bytes = Get-FolderSizeBytes $Path
    Log-Warn "  Size: $(Format-Bytes $bytes)"

    $needsPrompt = $ForcePrompt -or ($bytes -ge $PromptAboveBytes)
    if ($needsPrompt) {
        Log-Warn "  Threshold: $(Format-Bytes $PromptAboveBytes)"

        if ($AutoConfirm) {
            Log-Note "  Auto-confirming deletion (non-interactive/automated run)."
        }
        else {
            # Avoid hanging in CI/non-interactive environments.
            if ($env:CI -eq 'true') {
                throw "Refusing to delete $DisplayName in CI. Delete it manually if needed: $Path"
            }
            try {
                $answer = Read-Host "Type YES to permanently delete $DisplayName (anything else = cancel)"
            }
            catch {
                throw "Cannot prompt for $DisplayName deletion in this shell. Rerun interactively or pass -AutoConfirmDeletion to skip the prompt."
            }
            if ($answer -ne 'YES') {
                Log-Info "Cancelled deletion of $DisplayName."
                return
            }
        }
    }

    Log-Warn "Deleting $DisplayName..."
    Remove-Item -LiteralPath $Path -Recurse -Force
    Log-Success "Deleted $DisplayName."
}

function Print-Help {
    $helpLines = @(
        "Usage: build.ps1 [Configuration|clean|help] [options]",
        "",
        "Configurations:",
        "  Debug        - MSVC AddressSanitizer build (default).",
        "  Release      - Release build with static CRT.",
        "",
        "Special keywords:",
        "  clean        - wipe and rebuild current configuration.",
        "  help, -h, --help, --clean, -c",
        "",
        "Options:",
        "  -MesonPath <path>    Override Meson executable path.",
        "  -NinjaPath <path>    Override Ninja executable path.",
        "  -VsWherePath <path>  Override vswhere.exe location.",
        "  -Clean               Force blowing away the build directory.",
        "  -DeleteVcpkg         Delete the vcpkg checkout (interactive confirm).",
        "  -ForceVcpkg          Reinstall vcpkg packages even when cached.",
        "  -SkipTests           Build without running the test suite.",
        "  -Help (-H)           Print this message.",
        "",
        "Examples:",
        "  ./build.ps1             # default Debug build.",
        "  ./build.ps1 clean       # clean + Debug rebuild.",
        "  ./build.ps1 release     # 64-bit release build.",
        "  ./build.ps1 -ForceVcpkg # rebuild vcpkg packages first.",
        "",
        "This script bootstraps vcpkg, runs Meson/Ninja, and optionally runs",
        "the doctest suite. Pass -SkipTests to avoid long runtimes."
    )
    $helpLines | ForEach-Object { Write-Output $_ }
}

try {

    if ($Configuration.StartsWith('-')) {
        switch ($Configuration.ToLowerInvariant()) {
            '--help' { $Help = $true; $Configuration = 'Debug' }
            '-h' { $Help = $true; $Configuration = 'Debug' }
            '--clean' { $Clean = $true; $Configuration = 'Debug' }
            '-c' { $Clean = $true; $Configuration = 'Debug' }
            default {
                throw "Invalid option '$Configuration'. Valid options: Debug, Release, clean, help."
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
                    'debug'   = 'Debug'
                    'release' = 'Release'
                }
                $normalized = $Configuration.ToLowerInvariant()
                if ($validConfigurations.ContainsKey($normalized)) {
                    $Configuration = $validConfigurations[$normalized]
                }
                else {
                    throw "Invalid configuration '$Configuration'. Valid values: Debug, Release, clean, help."
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
        Log-Note "[$Command] $Arguments"
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$ErrorMessage (Exit Code: $LASTEXITCODE)" }
    }

    function Update-EmbeddedUiPack {
        function Get-LatestWriteUtc {
            param([Parameter(Mandatory)] [string]$Path)
            if (-not (Test-Path -LiteralPath $Path)) { return [DateTime]::MinValue }
            $item = Get-Item -LiteralPath $Path -ErrorAction Stop
            if ($item.PSIsContainer) {
                $latest = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending |
                Select-Object -First 1
                if ($latest) { return $latest.LastWriteTimeUtc }
                return $item.LastWriteTimeUtc
            }
            return $item.LastWriteTimeUtc
        }

        $packedFsBin = Join-Path (Split-Path -Parent $PackedFsOutputFile) 'tt_packed_fs.bin'

        if (-not (Test-Path -LiteralPath $GenPackedFsScript)) {
            Log-Warn "UI packaging script not found ($GenPackedFsScript); skipping asset packing."
            return
        }
        Log-Info "Generating embedded UI pack..."
        if (-not (Test-Path -LiteralPath $FrontendDistDir)) {
            Log-Warn "Frontend dist directory missing ($FrontendDistDir); embedded UI will be empty."
        }

        $inputStamp = Get-LatestWriteUtc -Path $FrontendDistDir
        $scriptStamp = Get-LatestWriteUtc -Path $GenPackedFsScript
        $outputStamp = Get-LatestWriteUtc -Path $PackedFsOutputFile
        $binStamp = Get-LatestWriteUtc -Path $packedFsBin
        $latestOutput = ($outputStamp, $binStamp | Measure-Object -Maximum).Maximum

        $needsPack = ($latestOutput -eq [DateTime]::MinValue) -or
        ($inputStamp -gt $latestOutput) -or
        ($scriptStamp -gt $latestOutput)

        if (-not $needsPack) {
            Log-Info "Skipping UI pack (up to date)."
            return
        }

        try {
            Log-Note "[$GenPackedFsScript] -InputDir $FrontendDistDir -OutputFile $PackedFsOutputFile"
            & $GenPackedFsScript -InputDir $FrontendDistDir -OutputFile $PackedFsOutputFile
        }
        catch {
            throw "Failed to generate embedded UI pack (via $GenPackedFsScript): $($_)"
        }
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
        Log-Info "Locating Visual Studio..."
        $vswhereExe = Find-Executable -Name "vswhere" -OverridePath $VsWherePath -Id "Visual Studio Locator" -PackageId "Microsoft.VisualStudio.Locator"
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
    $PythonExe = Find-Executable -Name "python" -Id "Python" -PackageId "Python.Python"
    if (-not $PythonExe) { throw "Python executable not found. Install via winget or ensure it's on PATH." }
    $pythonVersion = Get-PythonVersionText $PythonExe

    $pythonDir = Split-Path -Parent $PythonExe
    if ($pythonDir -and (Test-Path $pythonDir)) {
        $env:Path = "$pythonDir;$env:Path"
    }
    $env:PYTHON = $PythonExe

    $PythonExe = if ($PythonExe -is [System.Array]) { $PythonExe[0] } else { $PythonExe }

    $MesonExe = Find-MesonNearPython -PythonExe $PythonExe
    if (-not $MesonExe) {
        $MesonExe = Find-Executable -Name "meson" -OverridePath $MesonPath -Id "Meson" -PackageId "mesonbuild.meson"
    }
    if (-not $MesonExe) { throw "Meson executable not found. Install via winget or ensure it's on PATH." }
    $NinjaExe = Find-Executable -Name "ninja" -OverridePath $NinjaPath -Id "Ninja" -PackageId "Ninja-build.Ninja"
    if (-not $NinjaExe) { throw "Ninja executable not found. Install via winget or ensure it's on PATH." }

    # -- Version Reporting --
    Log-Info "Toolchain Verification:"
    $clVersion = Get-FirstCommandLine { cl.exe }
    $mesonVersion = Get-FirstCommandLine { & $MesonExe --version }
    $ninjaVersion = Get-FirstCommandLine { & $NinjaExe --version }
    Log-Note "  CL:    $clVersion"
    Log-Note "  Python: $pythonVersion ($PythonExe)"
    Log-Note "  Meson: $mesonVersion ($MesonExe)"
    Log-Note "  Ninja: $ninjaVersion ($NinjaExe)"

    # ==============================================================================
    # 3. CONFIGURATION & AUTO-CLEAN
    # ==============================================================================

    if ($Configuration -eq 'Release') { $Configuration = 'Release' }

    switch ($Configuration) {
        'Debug' {
            $BuildSubDir = "debug"
            $MesonType = "debug"
            # NOTE: MSVC ASan requires /MD. Mixing /MD app code with /MDd vcpkg debug
            # libs is an ABI/CRT mismatch (esp. std::string) and can crash inside
            # libtorrent settings_pack::set_str.
            # Use a release-only dynamic triplet to keep CRT + STL ABI consistent.
            $VcpkgTrip = "x64-windows-asan"
            $env:VCPKG_BUILD_TYPE = "release"
            $VsCrt = "md"
            $Sanitize = "address"
            $Logging = "true"
            $UseLto = "false"
            $Strip = "false"
            $IsStatic = $false
        }
        'Release' {
            $BuildSubDir = "release"
            $MesonType = "release"
            $VcpkgTrip = "x64-windows-static"
            $env:VCPKG_BUILD_TYPE = "release"
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
    $VcpkgInstallRootBase = Join-Path $RepoRoot "vcpkg_installed"
    $VcpkgInstallRoot = Join-Path $VcpkgInstallRootBase $VcpkgTrip
    $TripletRoot = Join-Path $VcpkgInstallRoot $VcpkgTrip
    $TripletReadyMarker = Join-Path $TripletRoot ".installed.marker"
    $WorkspaceRoot = Split-Path -Parent $RepoRoot
    $FrontendDistDir = Join-Path $WorkspaceRoot "frontend\dist"
    $GenPackedFsScript = Join-Path $WorkspaceRoot "scripts\gen-packed-fs.ps1"
    $PackedFsOutputFile = Join-Path $RepoRoot "src\vendor\tt_packed_fs.c"

    if ($DeleteVcpkg) {
        Remove-FolderSafe -Path $VcpkgDir -DisplayName 'vcpkg' -PromptAboveBytes $PromptOnDeleteAboveBytes -ForcePrompt -AutoConfirm:$AutoConfirmDeletion
    }

    # FIX: Automatic Invalidation (Marker File)
    $ConfigMarker = "$Configuration|$VcpkgTrip|$VsCrt|$Sanitize|$VcpkgInstallRoot"
    $MarkerFile = Join-Path $BuildDir "tt-config.marker"

    if (Test-Path $BuildDir) {
        $OldMarker = if (Test-Path $MarkerFile) { (Get-Content $MarkerFile -Raw).Trim() } else { "" }
        if ($Clean -or ($OldMarker -ne $ConfigMarker)) {
            $Reason = if ($Clean) { "Manual Clean" } else { "Configuration Changed" }
            Log-Warn "Cleaning build directory ($Reason)..."
            Remove-FolderSafe -Path $BuildDir -DisplayName "build directory ($BuildSubDir)" -PromptAboveBytes $PromptOnDeleteAboveBytes -AutoConfirm:$AutoConfirmDeletion
        }
    }

    if (-not (Test-Path $BuildDir)) { New-Item -ItemType Directory -Path $BuildDir | Out-Null }
    Set-Content -Path $MarkerFile -Value $ConfigMarker

    Update-EmbeddedUiPack

    # ==============================================================================
    # 4. DEPENDENCY MANAGEMENT
    # ==============================================================================

    Log-Info "Verifying Dependencies ($VcpkgTrip)..."
    if (-not (Test-Path $VcpkgDir)) {
        Log-Info "Cloning Vcpkg..."
        Exec-Checked "git" @("clone", "https://github.com/microsoft/vcpkg.git", $VcpkgDir, "--depth", "1")
    }

    # FIX: Check VcpkgDir exists before checking Exe (Git might have failed)
    if (Test-Path $VcpkgDir) {
        if (-not (Test-Path $VcpkgExe)) {
            Log-Warn "Bootstrapping Vcpkg..."
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

        if (-not ($hasMarker -and $hasStatus -and $hasTripletContent)) {
            return $false
        }

        # Sanity check: ensure ALL expected headers from core deps exist.
        $expectedHeaders = @(
            "libtorrent/session.hpp",
            "yyjson.h",
            "sqlite3.h"
        )
        foreach ($h in $expectedHeaders) {
            $p = Join-Path $TripletRoot (Join-Path 'include' $h)
            if (-not (Test-Path -LiteralPath $p)) {
                Log-Warn "Missing expected header: $h (at $p)"
                return $false
            }
        }

        return $true
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
                    Log-Warn "Waiting for vcpkg lock..."
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
                Log-Warn "vcpkg install attempt $attempt/$MaxAttempts failed; sleeping $delay seconds before retry."
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
            Log-Info "Skipping vcpkg install (cached triplet detected: $VcpkgTrip)."
        }
    }
    finally { Pop-Location }

    # ==============================================================================
    # 5. MESON SETUP
    # ==============================================================================

    $TripletInstallDir = $TripletRoot
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
    $buildNinja = Join-Path $BuildDir "build.ninja"
    $mesonRootFile = Join-Path $RepoRoot "meson.build"
    $needsConfig = -not (Test-Path $buildNinja)
    if (-not $needsConfig) {
        $buildStamp = (Get-Item $buildNinja -ErrorAction Stop).LastWriteTimeUtc
        $sourceStamp = (Get-Item $mesonRootFile -ErrorAction Stop).LastWriteTimeUtc
        if ($sourceStamp -gt $buildStamp) {
            $needsConfig = $true
        }
    }

    if ($needsConfig) {
        $isReconfigure = Test-Path $buildNinja
        $args = if ($isReconfigure) { $MesonBaseArgs + @("--reconfigure", $BuildDir, $MesonSourceDir) } else { $MesonBaseArgs + @($BuildDir, $MesonSourceDir) }
        if ($isReconfigure) { Log-Info "Reconfiguring..." } else { Log-Info "Configuring..." }
        Exec-Checked $MesonExe $args
    }
    else {
        Log-Info "Meson configure is up to date; skipping."
    }

    if (-not (Test-Path $buildNinja)) { throw "Meson completed but 'build.ninja' is missing." }

    # ==============================================================================
    # 6. BUILD
    # ==============================================================================

    Log-Info "Compiling ($Configuration)..."
    Exec-Checked $NinjaExe @('-C', $BuildDir)

    # ==============================================================================
    # 7. TEST HARNESS
    # ==============================================================================

    if (-not $SkipTests) {
        Log-Info "Running Tests..."
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
                    Log-Note "  Exec: $($Test.Name) ... "
                    $OutLog = "$($Test.FullName).stdout.log"
                    $ErrLog = "$($Test.FullName).stderr.log"
                
                    $Process = Start-Process -FilePath $Test.FullName -NoNewWindow -PassThru -Wait `
                        -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
                
                    $Status = if ($Process.ExitCode -eq 0) { "PASS" } else { "FAIL" }
                    $LogSummary += "$Status : $($Test.Name) (Exit: $($Process.ExitCode))"

                    if ($Status -eq "PASS") {
                        Log-Success "    PASS"
                    }
                    else {
                        Log-Error "    FAIL (Exit: $($Process.ExitCode))"
                        $AnyFailed = $true
                        $FullOutput = (Get-Content $OutLog -Raw) + "`n" + (Get-Content $ErrLog -Raw)
                        if ($FullOutput.Trim()) {
                            Log-Error "    --- OUTPUT ---"
                            Log-Error ($FullOutput.Trim())
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
        Log-Success "SUCCESS: $Configuration Build Complete"
        Log-Info "Artifact: $ExePath"
        Log-Info ("Size:     {0:N0} KB" -f $SizeKB)
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
            Log-Note "$DisplayName not found: $Path"
            return
        }

        # Avoid hanging in CI/non-interactive environments.
        if ($env:CI -eq 'true') {
            throw "Refusing to delete $DisplayName in CI. Delete it manually if needed: $Path"
        }

        Log-Warn "Deletion requested: $DisplayName"
        Log-Note "  Path: $Path"
        Log-Note "  Calculating size..."
        $bytes = Get-FolderSizeBytes $Path
        Log-Warn "  Size: $(Format-Bytes $bytes)"

        $answer = Read-Host "Type YES to permanently delete $DisplayName (anything else = cancel)"
        if ($answer -ne 'YES') {
            Log-Info "Cancelled deletion of $DisplayName."
            return
        }

        Log-Warn "Deleting $DisplayName..."
        Remove-Item -LiteralPath $Path -Recurse -Force
        Log-Success "Deleted $DisplayName."
    }

}
finally {
    $env:Path = $OriginalEnv.Path
    if ($OriginalEnv.PYTHON) {
        $env:PYTHON = $OriginalEnv.PYTHON
    }
    else {
        Remove-Item Env:PYTHON -ErrorAction SilentlyContinue
    }
}
