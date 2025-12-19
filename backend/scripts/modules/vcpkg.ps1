Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')

function Test-VcpkgTriplet {
    param(
        [Parameter(Mandatory = $true)][string]$TripletRoot,
        [Parameter(Mandatory = $true)][string]$Triplet
    )

    $required = @(
        'vcpkg/status',
        'include/libtorrent/session.hpp',
        'include/yyjson.h',
        'include/sqlite3.h',
        'lib/torrent-rasterbar.lib',
        'lib/yyjson.lib',
        'lib/sqlite3.lib'
    )

    foreach ($rel in $required) {
        $path = Join-Path $TripletRoot $rel
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Triplet validation failed for ${Triplet}: missing $rel. Manual repair required; no automatic fixes performed."
        }
    }

    return $true
}

