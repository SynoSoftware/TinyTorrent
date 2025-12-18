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
$frontendDir = Join-Path $root 'frontend'
$backendDir = Join-Path $root 'backend'
$distDir = Join-Path $frontendDir 'dist'
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
    # Quick pre-check: if core vcpkg headers are missing, force a vcpkg install once before building.
    try {
        $libtorrentHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\libtorrent\add_torrent_params.hpp'
        $yyjsonHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\yyjson.h'
        $sqliteHeader = Join-Path $backendDir 'vcpkg_installed\x64-windows-static\include\sqlite3.h'
        $haveAny = (Test-Path $libtorrentHeader) -or (Test-Path $yyjsonHeader) -or (Test-Path $sqliteHeader)
        if (-not $haveAny) {
            Write-Host "vcpkg headers not present; attempting forced vcpkg install before build." -ForegroundColor Yellow
            try {
                powershell -ExecutionPolicy Bypass -NoProfile -File .\build.ps1 -Configuration MinSizeRel -ForceVcpkg -SkipTests
                if ($LASTEXITCODE -eq 0) { $didForceVcpkg = $true }
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
            # Run build in a separate PowerShell process and capture output and exit code
            $buildOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -Configuration MinSizeRel -SkipTests 2>&1
            $buildExit = $LASTEXITCODE
            if ($buildExit -ne 0) {
                $global:buildOutput = $buildOutput
                $combined = ($buildOutput -join "`n")
                throw "Backend build failed with exit $buildExit" 
            }
            return
        }
        catch {
            # Normalize message and output depending on thrown object
            $message = $_.Exception.Message
            $output = $null
            if ($_.Exception -and $_.Exception.GetType().Name -eq 'RuntimeException' -and ($_.Exception.InnerException -is [hashtable])) {
                # nothing
            }
            if ($_.Exception -is [System.Management.Automation.RuntimeException] -and $_.Exception.ErrorRecord -and $_.Exception.ErrorRecord.Exception -is [hashtable]) {
                # nothing
            }
            # If the catch received the hashtable we threw above, extract it from $_.Exception
            if ($_.Exception -and $_.Exception -isnot [System.String]) {
                try {
                    $maybe = $_.Exception.ToString() | Out-String
                    # attempt to parse our thrown hashtable by looking for the Exit code marker in the string
                    if ($maybe -match 'Exit =') {
                        $output = ($maybe)
                    }
                }
                catch {}
            }
            # Also try to get pipeline output if available
            if (-not $output -and (Get-Variable -Name global:buildOutput -Scope Global -ErrorAction SilentlyContinue)) { $output = ($global:buildOutput -join "`n") }

            # If vcpkg headers/libs are missing, attempt a forced vcpkg install once
            if (-not $didForceVcpkg -and (($message -match 'Cannot open include file') -or ($message -match "No such file or directory") -or ($output -and $output -match 'Cannot open include file') -or ($output -and $output -match 'No such file or directory') -or ($output -and $output -match 'yyjson') -or ($output -and $output -match 'sqlite3') )) {
                Write-Host "Detected missing vcpkg headers/libraries (message: $message). Forcing vcpkg install and retrying..." -ForegroundColor Yellow
                try {
                    $forcedOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -Configuration MinSizeRel -ForceVcpkg -SkipTests 2>&1
                    $forcedExit = $LASTEXITCODE
                    if ($forcedExit -ne 0) { throw "Forced vcpkg install + build exited with code $forcedExit.`n$($forcedOutput -join "`n")" }
                    # If forced build succeeded, return
                    return
                }
                catch {
                    Write-Host "Forced vcpkg attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
                    $didForceVcpkg = $true
                    # fallthrough to normal retry logic
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
