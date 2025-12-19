param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration,
    [Parameter(Mandatory = $true)][string]$Destination
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'deploy.ps1')

Log-Section -Title 'Command: package' -Subtitle ("Configuration: {0} | Destination: {1}" -f $Configuration, $Destination)

Invoke-PackageArtifacts -Configuration $Configuration -Destination $Destination
