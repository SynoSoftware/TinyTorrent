param(
    [switch]$UpdateVcpkg,
    [string]$RebuildPackage = '',
    [switch]$ForceBootstrap
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'toolchain-bootstrap.ps1')

$subtitle = "UpdateVcpkg=$UpdateVcpkg | RebuildPackage=$RebuildPackage | ForceBootstrap=$ForceBootstrap"
Log-Section -Title 'Command: setup' -Subtitle $subtitle

Invoke-ToolchainBootstrap -UpdateVcpkg:$UpdateVcpkg -RebuildPackage $RebuildPackage -ForceBootstrap:$ForceBootstrap
