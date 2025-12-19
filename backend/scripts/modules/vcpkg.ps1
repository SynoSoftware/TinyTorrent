Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')

function Test-VcpkgTriplet {
    param(
        [Parameter(Mandatory = $true)][string]$TripletRoot,
        [Parameter(Mandatory = $true)][string]$Triplet
    )

    $required = @(
        'include/libtorrent/session.hpp',
        'include/yyjson.h',
        'include/sqlite3.h',
        'lib/torrent-rasterbar.lib',
        'lib/yyjson.lib',
        'lib/sqlite3.lib'
    )

    $rootsToTry = @(
        $TripletRoot,
        (Join-Path $TripletRoot $Triplet)
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique

    foreach ($candidateRoot in $rootsToTry) {
        $missing = @()
        foreach ($rel in $required) {
            $path = Join-Path $candidateRoot $rel
            if (-not (Test-Path -LiteralPath $path)) {
                $missing += $rel
            }
        }

        if ($missing.Count -eq 0) {
            return
        }
    }

    throw "Triplet validation failed for ${Triplet}: missing include/libtorrent/session.hpp (and/or other required files). Found no usable layout under: $TripletRoot. Manual repair required; no automatic fixes performed."
}

