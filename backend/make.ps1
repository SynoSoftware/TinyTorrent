param(
    [Parameter(Position = 0)]
    [string]$Target = 'debug',

    [Parameter(Position = 1)]
    [string]$Config,

    [switch]$AutoConfirmDeletion
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
        & $Ctl clean -AutoConfirmDeletion:$AutoConfirmDeletion
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

    'vs' {
        & $Ctl setup
        $resolvedConfig = if ($Config) { $Config } else { 'Debug' }
        & $Ctl configure -Configuration $resolvedConfig -Backend 'vs2022'
    }

    'build' {
        $resolvedConfig = if ($Config) { $Config } else { 'Debug' }
        & $Ctl build -Configuration $resolvedConfig
    }

    'test' {
        $resolvedConfig = if ($Config) { $Config } else { 'Debug' }
        & $Ctl test -Configuration $resolvedConfig
    }

    default {
        Write-Output "Usage:"
        Write-Output "  make"
        Write-Output "  make debug"
        Write-Output "  make release"
        Write-Output "  make vs [Debug|Release]"
        Write-Output "  make clean"
        Write-Output "  make test [Debug|Release]"
        exit 1
    }
}
