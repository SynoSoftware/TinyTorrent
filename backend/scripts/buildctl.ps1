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

$Root = Split-Path -Parent $PSScriptRoot
$ModulesDir = Join-Path $PSScriptRoot 'modules'

function Import-ModuleScript {
    param([string]$Name)
    $path = Join-Path $ModulesDir $Name
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Module not found: $path"
    }
    . $path
}

# Load logging first for consistent output
Import-ModuleScript 'logging.ps1'

switch ($Command) {
    'clean' { $module = 'clean' }
    'configure' { $module = 'configure' }
    'build' { $module = 'build' }
    'test' { $module = 'test' }
    'install' { $module = 'install' }
    'package' { $module = 'package' }
    'setup' {
        $setupScript = Join-Path $ModulesDir 'setup.ps1'
        if (-not (Test-Path -LiteralPath $setupScript)) {
            throw "Setup script missing: $setupScript"
        }
        try {
            & $setupScript
        }
        catch {
            throw
        }
        exit 0
    }
    default { throw "Unsupported command: $Command" }
}

$modulePath = Join-Path $ModulesDir ("{0}.ps1" -f $module)
if (-not (Test-Path -LiteralPath $modulePath)) {
    throw "Module not found: $modulePath"
}

try {
    . $modulePath
}
catch {
    throw
}

try {
    if ($module -eq 'install' -or $module -eq 'package') {
        if (-not $Destination) { throw 'Destination is required for install/package.' }
        & $module -Configuration $Configuration -Destination $Destination
    }
    elseif ($module -eq 'clean') {
        & $module -Configuration $Configuration -AutoConfirmDeletion:$AutoConfirmDeletion
    }
    else {
        & $module -Configuration $Configuration
    }
}
catch {
    throw
}
