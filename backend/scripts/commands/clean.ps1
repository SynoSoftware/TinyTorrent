param(
    [Parameter(Position = 0)]
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',
    [switch]$AutoConfirmDeletion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'fs-safe-delete.ps1')
. (Join-Path $ModulesRoot 'meson-config.ps1')

Log-Section -Title 'Command: clean' -Subtitle ("Configuration: {0}" -f $Configuration)

$buildDir = Get-BuildDir -Configuration $Configuration
Remove-FolderSafe -Path $buildDir -DisplayName "buildstate ($Configuration)" -PromptAboveBytes 500MB -AutoConfirm:$AutoConfirmDeletion
