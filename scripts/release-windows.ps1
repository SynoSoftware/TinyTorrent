param(
    [ValidateSet('fast', 'ultra')][string]$UWx = 'fast',
    [switch]$ForceFrontend,
    [switch]$SkipFrontend,
    [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'

# --- Tool Discovery & Polyfill ---
$repoRoot = if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..') -ErrorAction SilentlyContinue).Path } else { $null }
$helper = if ($repoRoot) { Join-Path $repoRoot 'scripts\everything.ps1' } else { $null }
if ($helper -and (Test-Path $helper)) { . $helper; if (Get-Command Ensure-Everything -ErrorAction SilentlyContinue) { [void](Ensure-Everything) } }
if (-not (Get-Command Find-Executable -ErrorAction SilentlyContinue)) {
    function Find-Executable {
        param($Name, $OverridePath, $Id, $PackageId)
        if ($OverridePath -and (Test-Path $OverridePath)) { return (Resolve-Path $OverridePath).Path }
        $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
        return if ($cmd) { (Resolve-Path $cmd.Source).Path } else { $null }
    }
}
# --- End Tool Discovery ---

$root = $repoRoot
$versionJson = Join-Path $root 'version.json'
$version = if (Test-Path $versionJson) { (Get-Content $versionJson | ConvertFrom-Json).version } else { '0.0.0' }

Write-Host "TinyTorrent Release Pipeline (v$version)" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan

$frontendDir = Join-Path $root 'frontend'
$backendDir = Join-Path $root 'backend'
$distDir = Join-Path $frontendDir 'dist'
$ReleaseVcpkgTriplet = 'x64-windows-static'
$ReleaseVcpkgInstallRootBase = Join-Path $backendDir 'vcpkg_installed'
$ReleaseVcpkgTripletRoot = Join-Path $ReleaseVcpkgInstallRootBase $ReleaseVcpkgTriplet
$ReleaseVcpkgContentRoot = $ReleaseVcpkgTripletRoot
$nestedReleaseTripletRoot = Join-Path $ReleaseVcpkgTripletRoot $ReleaseVcpkgTriplet
if (Test-Path -LiteralPath (Join-Path $nestedReleaseTripletRoot 'include')) {
    $ReleaseVcpkgContentRoot = $nestedReleaseTripletRoot
}

# Prefer PowerShell 7 if present. Always run child shell non-interactively.
$shellExe = (Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $shellExe) {
    $shellExe = (Get-Command powershell -ErrorAction SilentlyContinue | Select-Object -First 1).Source
}
if (-not $shellExe) {
    throw "Neither pwsh nor powershell is available on PATH."
}
$frontendBuildMarker = Join-Path $frontendDir '.last_frontend_signature'
$frontendSourceDirs = @(
    Join-Path $frontendDir 'src';
    Join-Path $frontendDir 'app';
    Join-Path $frontendDir 'config';
    Join-Path $frontendDir 'i18n';
    Join-Path $frontendDir 'modules';
    Join-Path $frontendDir 'public';
    Join-Path $frontendDir 'services';
    Join-Path $frontendDir 'shared'
)
$frontendTrackedFiles = @(
    Join-Path $frontendDir 'hero.ts';
    Join-Path $frontendDir 'main.tsx';
    Join-Path $frontendDir 'App.css';
    Join-Path $frontendDir 'index.css';
    Join-Path $frontendDir 'tailwind.config.ts';
    Join-Path $frontendDir 'tsconfig.app.json';
    Join-Path $frontendDir 'tsconfig.json';
    Join-Path $frontendDir 'tsconfig.node.json';
    Join-Path $frontendDir 'vite.config.ts';
    Join-Path $frontendDir 'postcss.config.js';
    Join-Path $frontendDir 'package.json';
    Join-Path $frontendDir 'package-lock.json';
    Join-Path $frontendDir 'eslint.config.js'
)

function Get-FrontendSourceSignature {
    $builder = New-Object System.Text.StringBuilder
    foreach ($dir in $frontendSourceDirs) {
        if (-not (Test-Path -LiteralPath $dir)) {
            continue
        }
        foreach ($file in Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue) {
            $builder.AppendLine("$($file.FullName):$($file.Length):$([int64]$file.LastWriteTimeUtc.Ticks)")
        }
    }
    foreach ($filePath in $frontendTrackedFiles) {
        if (-not (Test-Path -LiteralPath $filePath)) {
            continue
        }
        $file = Get-Item -LiteralPath $filePath
        $builder.AppendLine("$($file.FullName):$($file.Length):$([int64]$file.LastWriteTimeUtc.Ticks)")
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($builder.ToString())
    $hash = $sha.ComputeHash($bytes)
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ''
}

function Get-LastFrontendSignature {
    param(
        [string]$Marker
    )
    if (-not (Test-Path -LiteralPath $Marker)) {
        return ''
    }
    return (Get-Content -LiteralPath $Marker -Raw).Trim()
}

function Save-FrontendSignature {
    param(
        [string]$Marker,
        [string]$Signature
    )
    Set-Content -LiteralPath $Marker -Value $Signature -Encoding UTF8
}

function Invoke-FrontendNpm {
    param(
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [string]$FailureHint = $null
    )

    & npm @ArgumentList
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        if ($FailureHint) {
            Write-Host $FailureHint -ForegroundColor Yellow
        }
        $commandText = "npm $($ArgumentList -join ' ')"
        throw "Frontend command '$commandText' failed (exit $exitCode)."
    }
}

if (-not $SkipFrontend) {
    $currentSignature = Get-FrontendSourceSignature
    $lastSignature = Get-LastFrontendSignature -Marker $frontendBuildMarker
    $needsBuild = $ForceFrontend -or -not (Test-Path -LiteralPath $distDir) -or ($currentSignature -ne $lastSignature)
    if ($needsBuild) {
        Write-Host "Building frontend..." -ForegroundColor Cyan
        Push-Location $frontendDir
        try {
            Invoke-FrontendNpm -ArgumentList @('ci') `
                -FailureHint "npm ci failed; lockable files (e.g. lightningcss.win32-...) may be in use. Stop any running npm run dev instances before rerunning."
            Invoke-FrontendNpm -ArgumentList @('run', 'build')
        }
        finally { Pop-Location }
        Save-FrontendSignature -Marker $frontendBuildMarker -Signature $currentSignature
    }
    else {
        Write-Host "Skipping frontend build (up to date)." -ForegroundColor Cyan
    }
}

Write-Host "Generating embedded UI pack..." -ForegroundColor Cyan
$outC = Join-Path $backendDir 'src\\vendor\\tt_packed_fs.c'
& (Join-Path $root 'scripts\\gen-packed-fs.ps1') -InputDir $distDir -OutputFile $outC

function Resolve-ConsoleColor {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return $null }

    $parsed = $null
    if ([Enum]::TryParse([System.ConsoleColor], $Name, $true, [ref]$parsed)) {
        return $parsed
    }
    return $null
}

function Try-RenderColoredLine {
    param([string]$Line)

    $pattern = '^(?<text>.+?) -ForegroundColor (?<fg>\w+)(?: -BackgroundColor (?<bg>\w+))?'
    $match = [regex]::Match($Line, $pattern)
    if (-not $match.Success) { return $false }

    $text = $match.Groups['text'].Value
    $fgColor = Resolve-ConsoleColor $match.Groups['fg'].Value
    $bgColor = $null
    if ($match.Groups['bg'].Success) { $bgColor = Resolve-ConsoleColor $match.Groups['bg'].Value }

    if ($fgColor -and $bgColor) {
        Write-Host $text -ForegroundColor $fgColor -BackgroundColor $bgColor
    }
    elseif ($fgColor) {
        Write-Host $text -ForegroundColor $fgColor
    }
    else {
        Write-Host $text
    }

    return $true
}

function Invoke-BackendBuild {
    param(
        [int]$MaxAttempts = 3
    )

    $buildctl = Join-Path $backendDir 'scripts\buildctl.ps1'
    if (-not (Test-Path -LiteralPath $buildctl)) {
        throw "buildctl.ps1 not found at: $buildctl"
    }

    function Run-ProcessCapture {
        param(
            [string]$Exe,
            [string[]]$ArgumentList,
            [string]$WorkingDir = $null
        )

        $startDir = Get-Location
        if ($WorkingDir) { Set-Location $WorkingDir }

        try {
            # We use a List to capture output while streaming it LIVE to the console.
            # This ensures the user sees progress immediately.
            $captured = New-Object System.Collections.Generic.List[string]
            
            Write-Host "  Exec: $Exe $($ArgumentList -join ' ')" -ForegroundColor DarkGray
            
            # IMPORTANT: use splatting so the child process receives the args.
            & $Exe @ArgumentList 2>&1 | ForEach-Object {
                # Print to console immediately (colorize known Write-Host metadata)
                if (-not (Try-RenderColoredLine $_)) {
                    Write-Host $_
                }
                # Store for later analysis (e.g. error detection)
                $captured.Add($_.ToString())
            }
            
            $fullOutput = $captured -join [Environment]::NewLine
            
            return @{ 
                ExitCode = $LASTEXITCODE; 
                StdOut   = $fullOutput; 
                StdErr   = "" 
            }
        }
        catch {
            return @{ ExitCode = -1; StdOut = ""; StdErr = $_.Exception.Message }
        }
        finally {
            if ($WorkingDir) { Set-Location $startDir }
        }
    }

    # Quick pre-check: if core vcpkg headers are missing, run buildctl setup once.
    try {
        $libtorrentHeader = Join-Path $ReleaseVcpkgContentRoot 'include\libtorrent\add_torrent_params.hpp'
        $yyjsonHeader = Join-Path $ReleaseVcpkgContentRoot 'include\yyjson.h'
        $sqliteHeader = Join-Path $ReleaseVcpkgContentRoot 'include\sqlite3.h'
        $haveAny = (Test-Path $libtorrentHeader) -or (Test-Path $yyjsonHeader) -or (Test-Path $sqliteHeader)
        if (-not $haveAny) {
            Write-Host "vcpkg headers not present; running backend setup (buildctl setup)." -ForegroundColor Yellow
            $setupRes = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $buildctl, 'setup') -WorkingDir $backendDir
            if ($setupRes.ExitCode -ne 0) {
                Write-Host "Backend setup failed (Exit $($setupRes.ExitCode))." -ForegroundColor Yellow
            }
        }
    }
    catch { }

    for ($attempt = 1; $attempt -le $MaxAttempts; ++$attempt) {
        if ($attempt -gt 1) {
            Write-Host "Retrying backend build (attempt $attempt/$MaxAttempts)..." -ForegroundColor Yellow
        }
        try {
            Write-Host "Building backend (Release) (this may take several minutes)..." -ForegroundColor Cyan
            $resSetup = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $buildctl, 'setup') -WorkingDir $backendDir
            if ($resSetup.ExitCode -ne 0) {
                throw "Backend setup exited with code $($resSetup.ExitCode)."
            }

            $resCfg = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $buildctl, 'configure', '-Configuration', 'Release') -WorkingDir $backendDir
            if ($resCfg.ExitCode -ne 0) {
                throw "Backend configure exited with code $($resCfg.ExitCode)."
            }

            $resBuild = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $buildctl, 'build', '-Configuration', 'Release') -WorkingDir $backendDir
            if ($resBuild.ExitCode -ne 0) {
                throw "Backend build exited with code $($resBuild.ExitCode)."
            }
            
            Write-Host "Backend build finished (exit 0)." -ForegroundColor Green
            return
        }
        catch {
            $message = $_.Exception.Message
            if ($message -match 'Failed to take the filesystem lock') {
                if ($attempt -eq $MaxAttempts) {
                    throw
                }
                $delay = 5 * $attempt
                Write-Host "vcpkg lock busy (message: $message); sleeping $delay seconds before retry." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
                continue
            }
            throw
        }
    }
}

function Report-AppReady {
    param([Parameter(Mandatory)][string]$ExePath)

    $status = "TinyTorrent ready at $ExePath"
    if ($SkipLaunch -or ($env:CI -eq 'true')) {
        Write-Host $status -ForegroundColor Green
        Write-Host "Run the exe manually to see the frontend." -ForegroundColor Cyan
        return
    }

    try {
        $proc = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath) -PassThru
        Write-Host $status -ForegroundColor Green
        Write-Host ("Launched TinyTorrent (PID {0}); the should appear shortly." -f $proc.Id) -ForegroundColor Yellow
    }
    catch {
        Write-Host $status -ForegroundColor Green
        Write-Host ("Unable to launch automatically: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        Write-Host "Please start the executable manually to start the server and tray app." -ForegroundColor Cyan
    }
}

Write-Host "Building backend (Release)..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    Invoke-BackendBuild
}
finally { Pop-Location }

$buildExe = Join-Path $backendDir 'buildstate\\release\\TinyTorrent.exe'
if (-not (Test-Path -LiteralPath $buildExe)) {
    # Fallback to old target name if TinyTorrent target not enabled yet.
    $buildExe = Join-Path $backendDir 'buildstate\\release\\tt-engine.exe'
}
if (-not (Test-Path -LiteralPath $buildExe)) {
    throw "Build did not produce an exe (expected TinyTorrent.exe or tt-engine.exe)."
}

$finalDir = Join-Path $root 'dist\windows'
New-Item -ItemType Directory -Force -Path $finalDir | Out-Null
$finalExe = Join-Path $finalDir 'TinyTorrent.exe'

try {
    Copy-Item -LiteralPath $buildExe -Destination $finalExe -Force -ErrorAction Stop
}
catch {
    $msg = $_.Exception.Message
    if ($msg -notlike '*being used by another process*') {
        throw
    }

    Write-Host "Destination is locked: $finalExe" -ForegroundColor Yellow
    Write-Host "Attempting to stop a running TinyTorrent instance from that path..." -ForegroundColor Yellow

    $finalExeFullPath = $finalExe
    try {
        if (Test-Path -LiteralPath $finalExe) {
            $finalExeFullPath = (Resolve-Path -LiteralPath $finalExe).Path
        }
    }
    catch {
        # Keep best-effort path.
    }

    $pidsToStop = @()

    foreach ($p in @(Get-Process TinyTorrent -ErrorAction SilentlyContinue)) {
        $exePath = $null
        try { $exePath = $p.MainModule.FileName } catch {}
        if (-not $exePath) { continue }

        $exeFullPath = $exePath
        try { $exeFullPath = (Resolve-Path -LiteralPath $exePath).Path } catch {}

        if ($exeFullPath -ieq $finalExeFullPath) {
            $pidsToStop += $p.Id
        }
    }

    if (-not $pidsToStop) {
        # Fallback when MainModule access is restricted.
        try {
            foreach ($cim in @(Get-CimInstance Win32_Process -Filter "Name='TinyTorrent.exe'")) {
                if (-not $cim.ExecutablePath) { continue }
                $exeFullPath = $cim.ExecutablePath
                try { $exeFullPath = (Resolve-Path -LiteralPath $cim.ExecutablePath).Path } catch {}

                if ($exeFullPath -ieq $finalExeFullPath) {
                    $pidsToStop += [int]$cim.ProcessId
                }
            }
        }
        catch {
            # Ignore; we'll fail with a helpful message below.
        }
    }

    if (-not $pidsToStop) {
        throw "Unable to overwrite $finalExe because it is in use. Close TinyTorrent (if running from dist\\windows) and rerun the script."
    }

    foreach ($processId in $pidsToStop | Select-Object -Unique) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            throw "Failed to stop TinyTorrent (PID $processId). Close it manually and rerun the script."
        }
    }

    Start-Sleep -Milliseconds 500
    Copy-Item -LiteralPath $buildExe -Destination $finalExe -Force -ErrorAction Stop
}

if (-not $SkipFrontend) {
    $upxPath = Find-Executable -Name "upx" -Id "UPX" -PackageId "upx.upx"
    if (-not $upxPath) {
        Write-Host "UPX not found (add upx.exe to PATH); skipping compression." -ForegroundColor Yellow
    }
    else {
        Write-Host "Compressing with UPX ($UWx)..." -ForegroundColor Cyan
        if ($UWx -eq 'ultra') {
            & $upxPath --ultra-brute $finalExe
        }
        else {
            & $upxPath --best $finalExe
        }

        if ($LASTEXITCODE -ne 0) {
            throw "UPX failed (exit $LASTEXITCODE)."
        }
    }
}
else {
    Write-Host "Skipping UPX compression because -SkipFrontend was specified." -ForegroundColor Cyan
}

Write-Host "Done: $finalExe" -ForegroundColor Green
Report-AppReady -ExePath $finalExe
