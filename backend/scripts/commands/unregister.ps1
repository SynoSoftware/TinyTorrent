Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$ModulesRoot = Join-Path $CommandsRoot 'modules'

. (Join-Path $ModulesRoot 'log.ps1')
. (Join-Path $ModulesRoot 'windows-registration.ps1')

Log-Section -Title 'Command: unregister' -Subtitle 'Remove TinyTorrent Windows integration'

Invoke-TinyTorrentUnregisterAll
