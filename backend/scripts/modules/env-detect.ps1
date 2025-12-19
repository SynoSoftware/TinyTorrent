Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')

function Resolve-ToolPath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $esPath = 'C:\Program Files\Everything\es.exe'
    if (Test-Path -LiteralPath $esPath) {
        try {
            $candidate = & $esPath -w -n 1 $Name 2>$null | Select-Object -First 1
            if ($candidate) {
                $candidate = $candidate.Trim()
                if ([string]::IsNullOrWhiteSpace($candidate) -eq $false -and (Test-Path -LiteralPath $candidate)) {
                    if ($candidate.ToLowerInvariant().EndsWith('.exe')) {
                        return (Resolve-Path -LiteralPath $candidate).Path
                    }
                }
            }
        }
        catch {}
    }

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) {
        return (Resolve-Path -LiteralPath $cmd.Source).Path
    }

    if ($Name -eq 'ninja') {
        $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path -LiteralPath $vswhere) {
            try {
                $vsInstall = & $vswhere -latest -products * -property installationPath 2>$null | Select-Object -First 1
                if ($vsInstall) {
                    $vsInstall = $vsInstall.Trim()
                    $candidates = @(
                        (Join-Path $vsInstall 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'),
                        (Join-Path $vsInstall 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\ninja.exe')
                    )

                    foreach ($candidate in $candidates) {
                        if (Test-Path -LiteralPath $candidate) {
                            return (Resolve-Path -LiteralPath $candidate).Path
                        }
                    }
                }
            }
            catch {}
        }

        $cmakeNinja = 'C:\Program Files\CMake\bin\ninja.exe'
        if (Test-Path -LiteralPath $cmakeNinja) {
            return (Resolve-Path -LiteralPath $cmakeNinja).Path
        }
    }

    if ($Name -eq 'cl') {
        $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path -LiteralPath $vswhere) {
            try {
                $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
                if ($vsInstall) {
                    $vsInstall = $vsInstall.Trim()
                    $msvcRoot = Join-Path $vsInstall 'VC\Tools\MSVC'
                    if (Test-Path -LiteralPath $msvcRoot) {
                        $versions = Get-ChildItem -LiteralPath $msvcRoot -Directory -ErrorAction SilentlyContinue |
                        Sort-Object Name -Descending
                        $latest = $versions | Select-Object -First 1
                        if ($latest) {
                            $candidate = Join-Path $latest.FullName 'bin\Hostx64\x64\cl.exe'
                            if (Test-Path -LiteralPath $candidate) {
                                return (Resolve-Path -LiteralPath $candidate).Path
                            }
                        }
                    }
                }
            }
            catch {}
        }
    }

    throw "Required tool $Name not found. Manual installation required."
}

function Try-ResolveToolPath {
    param([Parameter(Mandatory = $true)][string]$Name)
    try {
        return Resolve-ToolPath -Name $Name
    }
    catch {
        return $null
    }
}

function Get-Tooling {
    return [pscustomobject]@{
        Meson  = Try-ResolveToolPath -Name 'meson'
        Ninja  = Resolve-ToolPath -Name 'ninja'
        Python = Resolve-ToolPath -Name 'python'
        CL     = Resolve-ToolPath -Name 'cl'
    }
}

function Ensure-VsEnv {
    # Ensure MSVC tools are available on PATH (lib.exe/cl.exe) and that
    # INCLUDE/LIB etc are initialized. This mirrors the legacy build.legacy.ps1
    # behavior and avoids relying on Meson --vsenv.
    if ($IsWindows -ne $true) {
        return
    }

    $hasLib = (Get-Command 'lib.exe' -ErrorAction SilentlyContinue) -or (Get-Command 'lib' -ErrorAction SilentlyContinue)
    $hasCl = (Get-Command 'cl.exe' -ErrorAction SilentlyContinue) -or (Get-Command 'cl' -ErrorAction SilentlyContinue)
    if ($hasLib -and $hasCl) {
        return
    }

    $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) {
        throw "vswhere.exe not found at: $vswhere"
    }

    $vsInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
    if (-not $vsInstall) {
        throw 'No Visual Studio installation found (VC tools required).'
    }
    $vsInstall = $vsInstall.Trim()

    $vcvars = Join-Path $vsInstall 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path -LiteralPath $vcvars)) {
        throw "vcvars64.bat not found at: $vcvars"
    }

    # Import the environment variables from vcvars64 into this PowerShell process.
    cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") {
            $name = $matches[1]
            $value = $matches[2]
            try {
                Set-Item -Path ("Env:{0}" -f $name) -Value $value
            }
            catch {
                # Ignore variables PowerShell cannot set (rare).
            }
        }
    }

    $hasLib = (Get-Command 'lib.exe' -ErrorAction SilentlyContinue) -or (Get-Command 'lib' -ErrorAction SilentlyContinue)
    if (-not $hasLib) {
        throw 'Visual Studio environment activation failed: lib.exe still not on PATH.'
    }
}
