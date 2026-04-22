param(
    [Parameter(Position = 0)]
    [string]$Target = 'debug',

    [Parameter(Position = 1)]
    [ValidateSet('Debug', 'Release')]
    [string]$Config,

    [ValidateSet('ninja', 'vs2022')]
    [string]$Backend = 'ninja'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot

function Ensure-VsEnv {
    $hasCl = Get-Command cl.exe -ErrorAction SilentlyContinue
    $hasLib = Get-Command lib.exe -ErrorAction SilentlyContinue
    if ($hasCl -and $hasLib) {
        return
    }

    $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) {
        throw "vswhere.exe not found: $vswhere"
    }

    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
    if (-not $vsInstall) {
        throw 'Visual Studio with C++ tools was not found.'
    }

    $vcvars = Join-Path $vsInstall.Trim() 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path -LiteralPath $vcvars)) {
        throw "vcvars64.bat not found: $vcvars"
    }

    cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
        if ($_ -match '^(.*?)=(.*)$') {
            try {
                Set-Item -Path ("Env:{0}" -f $matches[1]) -Value $matches[2]
            }
            catch {
            }
        }
    }
}

function Get-BuildDir {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][ValidateSet('ninja', 'vs2022')][string]$SelectedBackend
    )

    $base = if ($SelectedBackend -eq 'vs2022') { 'build_vs' } else { 'build' }
    return Join-Path $Root ("{0}\{1}" -f $base, $Configuration.ToLowerInvariant())
}

function Invoke-Configure {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][ValidateSet('ninja', 'vs2022')][string]$SelectedBackend
    )

    Ensure-VsEnv

    $buildDir = Get-BuildDir -Configuration $Configuration -SelectedBackend $SelectedBackend
    $buildType = if ($Configuration -eq 'Debug') { 'debug' } else { 'minsize' }
    $crt = if ($Configuration -eq 'Debug') { 'md' } else { 'mt' }

    $args = @(
        'setup',
        $buildDir,
        $Root,
        "--backend=$SelectedBackend",
        "--buildtype=$buildType",
        "-Db_vscrt=$crt"
    )

    if (Test-Path -LiteralPath (Join-Path $buildDir 'meson-private\coredata.dat')) {
        $args += '--reconfigure'
    }

    & meson @args
    if ($LASTEXITCODE -ne 0) {
        throw "Meson configure failed for $Configuration."
    }
}

function Invoke-Build {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][ValidateSet('ninja', 'vs2022')][string]$SelectedBackend
    )

    Ensure-VsEnv

    $buildDir = Get-BuildDir -Configuration $Configuration -SelectedBackend $SelectedBackend
    & meson compile -C $buildDir
    if ($LASTEXITCODE -ne 0) {
        throw "Meson build failed for $Configuration."
    }
}

switch ($Target.ToLowerInvariant()) {
    'debug' {
        Invoke-Configure -Configuration 'Debug' -SelectedBackend $Backend
        Invoke-Build -Configuration 'Debug' -SelectedBackend $Backend
    }
    'release' {
        Invoke-Configure -Configuration 'Release' -SelectedBackend $Backend
        Invoke-Build -Configuration 'Release' -SelectedBackend $Backend
    }
    'vs' {
        $resolvedConfig = if ($Config) { $Config } else { 'Debug' }
        Invoke-Configure -Configuration $resolvedConfig -SelectedBackend 'vs2022'
    }
    'build' {
        $resolvedConfig = if ($Config) { $Config } else { 'Debug' }
        Invoke-Build -Configuration $resolvedConfig -SelectedBackend $Backend
    }
    'clean' {
        foreach ($dirName in @('build', 'build_vs')) {
            $buildRoot = Join-Path $Root $dirName
            if (Test-Path -LiteralPath $buildRoot) {
                Remove-Item -LiteralPath $buildRoot -Recurse -Force
            }
        }
    }
    default {
        Write-Output 'Usage:'
        Write-Output '  .\make.ps1 debug'
        Write-Output '  .\make.ps1 release'
        Write-Output '  .\make.ps1 vs [Debug|Release]'
        Write-Output '  .\make.ps1 build [Debug|Release] [-Backend ninja|vs2022]'
        Write-Output '  .\make.ps1 clean'
        exit 1
    }
}
