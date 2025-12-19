param(
    [Parameter(Position = 0)]
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'env-detect.ps1')
. (Join-Path $ModulesRoot 'meson-config.ps1')
. (Join-Path $ModulesRoot 'deploy.ps1')

Log-Section -Title 'Command: build' -Subtitle ("Configuration: {0}" -f $Configuration)

Invoke-MesonBuild -Configuration $Configuration
Invoke-DeployRuntime -Configuration $Configuration
