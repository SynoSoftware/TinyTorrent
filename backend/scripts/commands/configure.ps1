param(
    [Parameter(Position = 0)]
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('ninja', 'vs2022')]
    [string]$Backend = 'ninja'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'env-detect.ps1')
. (Join-Path $ModulesRoot 'meson-config.ps1')

Log-Section -Title 'Command: configure' -Subtitle ("Configuration: {0}" -f $Configuration)

Invoke-MesonConfigure -Configuration $Configuration -Backend $Backend
