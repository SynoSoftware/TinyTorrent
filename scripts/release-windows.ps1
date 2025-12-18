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

if (-not $SkipFrontend) {
    $currentSignature = Get-FrontendSourceSignature
    $lastSignature = Get-LastFrontendSignature -Marker $frontendBuildMarker
    $needsBuild = $ForceFrontend -or -not (Test-Path -LiteralPath $distDir) -or ($currentSignature -ne $lastSignature)
    if ($needsBuild) {
        Write-Host "Building frontend..." -ForegroundColor Cyan
        Push-Location $frontendDir
        try {
            npm ci
            npm run build
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

function Invoke-BackendBuild {
    param(
        [int]$MaxAttempts = 3
    )

    $didForceVcpkg = $false

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
                # Print to console immediately
                Write-Host $_
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

    # Quick pre-check: if core vcpkg headers are missing, force a vcpkg install once before building.
    try {
        $libtorrentHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\libtorrent\add_torrent_params.hpp'
        $yyjsonHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\yyjson.h'
        $sqliteHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\sqlite3.h'
        $haveAny = (Test-Path $libtorrentHeader) -or (Test-Path $yyjsonHeader) -or (Test-Path $sqliteHeader)
        if (-not $haveAny) {
            Write-Host "vcpkg headers not present; attempting forced vcpkg install before build." -ForegroundColor Yellow
            try {
                $res = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '.\build.ps1', '-Configuration', 'Release', '-ForceVcpkg', '-SkipTests') -WorkingDir $backendDir
                if ($res.ExitCode -ne 0) { Write-Host "Initial vcpkg install failed (Exit $($res.ExitCode))." -ForegroundColor Yellow }
            }
            catch {
                Write-Host "Forced vcpkg install attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    catch {}

    for ($attempt = 1; $attempt -le $MaxAttempts; ++$attempt) {
        if ($attempt -gt 1) {
            Write-Host "Retrying backend build (attempt $attempt/$MaxAttempts)..." -ForegroundColor Yellow
        }
        try {
            Write-Host "Building backend (Release) (this may take several minutes)..." -ForegroundColor Cyan
            $res = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '.\build.ps1', '-Configuration', 'Release', '-SkipTests') -WorkingDir $backendDir
            
            if ($res.ExitCode -ne 0) {
                throw "Backend build exited with code $($res.ExitCode)."
            }
            Write-Host "Backend build finished (exit 0)." -ForegroundColor Green
            return
        }
        catch {
            $message = $_.Exception.Message
            if (-not $didForceVcpkg -and ($message -match 'Cannot open include file' -or $message -match 'No such file or directory' -or $message -match 'yyjson' -or $message -match 'sqlite3')) {
                Write-Host "Detected missing vcpkg headers/libraries (message: $message). Forcing vcpkg install and retrying..." -ForegroundColor Yellow
                try {
                    $forced = Run-ProcessCapture -Exe $shellExe -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '.\build.ps1', '-Configuration', 'Release', '-ForceVcpkg', '-SkipTests') -WorkingDir $backendDir
                    if ($forced.ExitCode -ne 0) {
                        throw "Forced vcpkg install + build exited with code $($forced.ExitCode)."
                    }
                    $didForceVcpkg = $true
                    continue
                }
                catch {
                    Write-Host "Forced vcpkg attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
                    $didForceVcpkg = $true
                }
            }

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

    $status = "TinyTorrent (Mica-aware) ready at $ExePath"
    if ($SkipLaunch -or ($env:CI -eq 'true')) {
        Write-Host $status -ForegroundColor Green
        Write-Host "Run the exe manually to see the Mica-enhanced frontend." -ForegroundColor Cyan
        return
    }

    try {
        $proc = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath) -PassThru
        Write-Host $status -ForegroundColor Green
        Write-Host ("Launched TinyTorrent (PID {0}); the Mica-aware UI should appear shortly." -f $proc.Id) -ForegroundColor Yellow
    }
    catch {
        Write-Host $status -ForegroundColor Green
        Write-Host ("Unable to launch automatically: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        Write-Host "Please start the executable manually to view the Mica UI." -ForegroundColor Cyan
    }
}

Write-Host "Building backend (MinSizeRel)..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    Invoke-BackendBuild
}
finally { Pop-Location }

$buildExe = Join-Path $backendDir 'build\\release\\TinyTorrent.exe'
if (-not (Test-Path -LiteralPath $buildExe)) {
    # Fallback to old target name if TinyTorrent target not enabled yet.
    $buildExe = Join-Path $backendDir 'build\\release\\tt-engine.exe'
}
if (-not (Test-Path -LiteralPath $buildExe)) {
    throw "Build did not produce an exe (expected TinyTorrent.exe or tt-engine.exe)."
}

$finalDir = Join-Path $root 'dist\windows'
New-Item -ItemType Directory -Force -Path $finalDir | Out-Null
$finalExe = Join-Path $finalDir 'TinyTorrent.exe'
Copy-Item -LiteralPath $buildExe -Destination $finalExe -Force

$upxPath = Find-Executable -Name "upx" -Id "UPX" -PackageId "upx.upx"
if (-not $upxPath) {
    Write-Host "UPX not found (launch Everything to install or add to PATH); skipping packing." -ForegroundColor Yellow
    Report-AppReady -ExePath $finalExe
    exit 0
}

Write-Host "Packing with UPX ($UWx)..." -ForegroundColor Cyan
if ($UWx -eq 'ultra') {
    & $upxPath --ultra-brute $finalExe
}
else {
    & $upxPath --best $finalExe
}

Write-Host "Done: $finalExe" -ForegroundColor Green
Report-AppReady -ExePath $finalExe
