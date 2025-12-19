Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')

function install {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())

    if (-not (Test-Path -LiteralPath $BuildDir)) {
        throw "Build directory not found: $BuildDir. Run configure/build first."
    }

    if (-not (Test-Path -LiteralPath $Destination)) {
        [void](New-Item -ItemType Directory -Path $Destination)
    }

    $artifacts = @(
        'tt-engine.exe',
        'tt-engine.pdb'
    )

    foreach ($a in $artifacts) {
        $src = Join-Path $BuildDir $a
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $Destination $a) -Force
        }
    }
}
