param(
    [Parameter(Position = 0)]
    [string]$Target = 'debug',

    [Parameter(Position = 1)]
    [string]$Config
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$Ctl = Join-Path $Root 'scripts\buildctl.ps1'

if (-not (Test-Path $Ctl)) {
    throw "buildctl.ps1 not found: $Ctl"
}

switch ($Target.ToLower()) {

    'clean' {
        & $Ctl clean
    }

    'debug' {
        & $Ctl setup
        & $Ctl configure -Configuration Debug
        & $Ctl build     -Configuration Debug
        & $Ctl test      -Configuration Debug
    }

    'release' {
        & $Ctl setup
        & $Ctl configure -Configuration Release
        & $Ctl build     -Configuration Release
    }

    'setup' {
        & $Ctl setup
    }

    'build' {
        & $Ctl build -Configuration ($Config ?? 'Debug')
    }

    'test' {
        & $Ctl test -Configuration ($Config ?? 'Debug')
    }

    default {
        Write-Output "Usage:"
        Write-Output "  make"
        Write-Output "  make debug"
        Write-Output "  make release"
        Write-Output "  make clean"
        Write-Output "  make test [Debug|Release]"
        exit 1
    }
}
