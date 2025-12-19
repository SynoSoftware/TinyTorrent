param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('clean', 'configure', 'build', 'test', 'install', 'package', 'setup')]
    [string]$Command,

    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [string]$Destination,

    [switch]$AutoConfirmDeletion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsDir = Join-Path $PSScriptRoot 'commands'
$commandScript = Join-Path $CommandsDir ("{0}.ps1" -f $Command)
if (-not (Test-Path -LiteralPath $commandScript)) {
    throw "Command script not found: $commandScript"
}

switch ($Command) {
    'clean' {
        & $commandScript -Configuration $Configuration -AutoConfirmDeletion:$AutoConfirmDeletion
    }
    'configure' {
        & $commandScript -Configuration $Configuration
    }
    'build' {
        & $commandScript -Configuration $Configuration
    }
    'test' {
        & $commandScript -Configuration $Configuration
    }
    'install' {
        if (-not $Destination) { throw 'Destination is required for install.' }
        & $commandScript -Configuration $Configuration -Destination $Destination
    }
    'package' {
        if (-not $Destination) { throw 'Destination is required for package.' }
        & $commandScript -Configuration $Configuration -Destination $Destination
    }
    'setup' {
        & $commandScript
    }
    default {
        throw "Unsupported command: $Command"
    }
}
