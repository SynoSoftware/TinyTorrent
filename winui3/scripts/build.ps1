[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',

    [string]$EngineDirectory = 'C:\Program Files\Transmission',

    [string]$MsBuildPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot
$uiProject = Join-Path $repository 'src\TinyTorrent.Ui\TinyTorrent.Ui.csproj'
$trayProject = Join-Path $repository 'src\Tray\Tray.vcxproj'
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $repository 'artifacts\TinyTorrent')).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$stage = [System.IO.Path]::GetFullPath((Join-Path $artifactRoot "$Configuration\x64"))
$work = [System.IO.Path]::GetFullPath("$stage.work")
$previous = [System.IO.Path]::GetFullPath("$stage.previous")
$artifactPrefix = "$artifactRoot$([System.IO.Path]::DirectorySeparatorChar)"
$engineFiles = [ordered]@{
    'transmission-daemon.exe' = 'DD26F9900BB4572446E905B74823B36DE167936726BDFA17B56B9147E4FD35D9'
    'libcurl.dll' = 'DDA69C7E2E52ACD2186C39002EE658F07EF2BA7E08E42366D81D1230193AEC15'
    'libssl-3-x64.dll' = 'A03DF669BFA03BF69B8F881A31DB2F1F30B277E53316925664BA7451E1F9EBE7'
    'libcrypto-3-x64.dll' = '1776B6519D268097E61C28D745EAFBDBA8F134CDCE0087AD311FB162A9E6E285'
    'zlib.dll' = 'CFEF8CE7244757D44B4AE1B2FFEC64A4DB7C59BFA87B7BD966D0CC382B670D86'
}

function Find-MsBuild {
    param([string]$Path)

    if ($Path) {
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            return (Resolve-Path -LiteralPath $Path).Path
        }

        throw "MSBuild was not found at '$Path'."
    }

    $vswhere = @(
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe"
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

    if ($vswhere) {
        $found = @(& $vswhere -latest -products * -requires Microsoft.Component.MSBuild Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'MSBuild\Current\Bin\amd64\MSBuild.exe')
        if ($LASTEXITCODE -eq 0 -and $found -and (Test-Path -LiteralPath $found[0] -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $found[0]).Path
        }
    }

    $documented = 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe'
    if (Test-Path -LiteralPath $documented -PathType Leaf) {
        return $documented
    }

    throw '64-bit Visual Studio MSBuild with C++ tools is required. Install it or pass -MsBuildPath.'
}

function Invoke-MsBuild {
    param(
        [string]$MsBuild,
        [string[]]$Arguments
    )

    & $MsBuild @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "MSBuild failed: $($Arguments[0])"
    }
}

function Remove-StagingDirectory {
    param([string]$Path)

    if ($Path -notin @($work, $previous) -or -not $Path.StartsWith($artifactPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside this script's generated staging directories: '$Path'."
    }

    Write-Host "Removing generated '$Path'."
    Remove-Item -LiteralPath $Path -Recurse -Force -WhatIf
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

foreach ($path in @($uiProject, $trayProject)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required project file is missing: '$path'."
    }
}

foreach ($path in @($stage, $work, $previous)) {
    if (-not $path.StartsWith($artifactPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Release staging path escaped '$artifactRoot': '$path'."
    }
}

if (-not (Test-Path -LiteralPath $EngineDirectory -PathType Container)) {
    throw "Transmission candidate directory does not exist: '$EngineDirectory'. Pass -EngineDirectory with a specific tested candidate."
}

if (Test-Path -LiteralPath $previous) {
    if (Test-Path -LiteralPath $stage) {
        Remove-StagingDirectory $previous
    }
    else {
        Move-Item -LiteralPath $previous -Destination $stage -ErrorAction Stop
    }
}

if (Test-Path -LiteralPath $work) {
    Remove-StagingDirectory $work
}

$msbuild = Find-MsBuild $MsBuildPath
$engine = (Resolve-Path -LiteralPath $EngineDirectory).Path

New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null

try {
    # Default MSBuild execution uses one node. Keep it serial: this machine locks intermediates under parallel solution builds.
    Invoke-MsBuild $msbuild @(
        $uiProject,
        '/restore',
        '/t:Publish',
        "/p:Configuration=$Configuration",
        '/p:Platform=x64',
        '/p:RuntimeIdentifier=win-x64',
        '/p:DebugSymbols=false',
        '/p:DebugType=None',
        "/p:PublishDir=$work\",
        '/nodeReuse:false'
    )

    Invoke-MsBuild $msbuild @(
        $trayProject,
        '/t:Build',
        "/p:Configuration=$Configuration",
        '/p:Platform=x64',
        '/nodeReuse:false'
    )

    $tray = Join-Path $repository "src\Tray\bin\x64\$Configuration\TinyTorrent.exe"
    if (-not (Test-Path -LiteralPath $tray -PathType Leaf)) {
        throw "Tray build did not produce '$tray'."
    }

    Copy-Item -LiteralPath $tray -Destination (Join-Path $work 'TinyTorrent.exe') -ErrorAction Stop

    foreach ($file in $engineFiles.Keys) {
        $source = Join-Path $engine $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "The selected Transmission candidate is missing '$source'."
        }

        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        if ($hash -ne $engineFiles[$file]) {
            throw "The selected Transmission candidate does not match the recorded '$file' hash. Update the candidate record before staging another engine build."
        }

        Copy-Item -LiteralPath $source -Destination (Join-Path $work $file) -ErrorAction Stop
    }

    $licenseDirectory = Join-Path $work 'LICENSES'
    New-Item -ItemType Directory -Path $licenseDirectory -Force -ErrorAction Stop | Out-Null
    foreach ($file in @(
        'transmission-COPYING.txt',
        'GPL-3.0.txt',
        'curl-8.16.0-COPYING.txt',
        'openssl-3.5.4-LICENSE.txt',
        'zlib-1.3.1-LICENSE.txt',
        'transmission-4.1.1.md'
    )) {
        $source = Join-Path $repository "LICENSES\\$file"
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Required candidate notice is missing: '$source'."
        }

        Copy-Item -LiteralPath $source -Destination (Join-Path $licenseDirectory $file) -ErrorAction Stop
    }

    foreach ($file in @('TinyTorrent.exe', 'TinyTorrent.Ui.exe', 'transmission-daemon.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $work $file) -PathType Leaf)) {
            throw "Release stage is missing '$file'."
        }
    }

    $manifest = [ordered]@{
        Product = 'TinyTorrent'
        Configuration = $Configuration
        Platform = 'x64'
        BuiltAtUtc = [DateTime]::UtcNow.ToString('O')
        MsBuild = $msbuild
        EngineDirectory = $engine
        Files = @(
            Get-ChildItem -LiteralPath $work -File -Recurse |
                Sort-Object FullName |
                ForEach-Object {
                    $version = $_.VersionInfo
                    [ordered]@{
                        Path = $_.FullName.Substring($work.Length).TrimStart('\\')
                        Bytes = $_.Length
                        FileVersion = $version.FileVersion
                        ProductVersion = $version.ProductVersion
                        Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
                    }
                }
        )
    }

    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $work 'manifest.json') -Encoding UTF8
    if (Test-Path -LiteralPath $stage) {
        Move-Item -LiteralPath $stage -Destination $previous -ErrorAction Stop
    }

    try {
        Move-Item -LiteralPath $work -Destination $stage -ErrorAction Stop
    }
    catch {
        if (-not (Test-Path -LiteralPath $stage) -and (Test-Path -LiteralPath $previous)) {
            Move-Item -LiteralPath $previous -Destination $stage -ErrorAction Stop
        }

        throw
    }

    if (Test-Path -LiteralPath $previous) {
        Remove-StagingDirectory $previous
    }
}
catch {
    Write-Host "Staging failed; the incomplete candidate remains at '$work'."
    throw
}

Write-Host "Staged $Configuration x64 candidate at '$stage'."
