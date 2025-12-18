param(
    [ValidateSet('fast', 'ultra')][string]$UWx = 'fast',
    [switch]$ForceFrontend,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
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

    for ($attempt = 1; $attempt -le $MaxAttempts; ++$attempt) {
        if ($attempt -gt 1) {
            Write-Host "Retrying backend build (attempt $attempt/$MaxAttempts)..." -ForegroundColor Yellow
        }
        try {
            powershell -ExecutionPolicy Bypass -NoProfile -File .\build.ps1 -Configuration MinSizeRel -SkipTests
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

$finalDir = Join-Path $root 'dist\\windows'
New-Item -ItemType Directory -Force -Path $finalDir | Out-Null
$finalExe = Join-Path $finalDir 'TinyTorrent.exe'
Copy-Item -LiteralPath $buildExe -Destination $finalExe -Force

$upx = Get-Command upx.exe -ErrorAction SilentlyContinue
if (-not $upx) {
    Write-Host "UPX not found on PATH; skipping packing." -ForegroundColor Yellow
    Write-Host "Final: $finalExe" -ForegroundColor Green
    exit 0
}

Write-Host "Packing with UPX ($UWx)..." -ForegroundColor Cyan
if ($UWx -eq 'ultra') {
    & $upx.Source --ultra-brute $finalExe
}
else {
    & $upx.Source --best $finalExe
}

Write-Host "Done: $finalExe" -ForegroundColor Green
