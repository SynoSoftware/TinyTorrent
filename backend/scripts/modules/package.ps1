Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')

function package {
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

    $bundleName = "tt-engine-{0}.zip" -f $Configuration.ToLower()
    $bundlePath = Join-Path $Destination $bundleName

    if (Test-Path -LiteralPath $bundlePath) {
        Remove-Item -LiteralPath $bundlePath -Force
    }

    $items = @('tt-engine.exe', 'tt-engine.pdb')
    $paths = @()
    foreach ($i in $items) {
        $p = Join-Path $BuildDir $i
        if (Test-Path -LiteralPath $p) {
            $paths += $p
        }
    }

    if ($paths.Count -eq 0) {
        throw "No artifacts found to package in $BuildDir."
    }

    Compress-Archive -LiteralPath $paths -DestinationPath $bundlePath -Force
}
