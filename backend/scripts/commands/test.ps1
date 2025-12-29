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

Log-Section -Title 'Command: test' -Subtitle ("Configuration: {0}" -f $Configuration)

Invoke-MesonTests -Configuration $Configuration

$CommandsRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $CommandsRoot
$VerifierScript = Join-Path $RepoRoot 'verify_upgrade.py'
if (Test-Path -LiteralPath $VerifierScript) {
    Log-Section -Title 'Acceptance Test' -Subtitle 'Host-shell simulator'
    $pythonExe = (Get-Command python -ErrorAction SilentlyContinue)?.Source
    if (-not $pythonExe) {
        $pythonExe = (Get-Command py -ErrorAction SilentlyContinue)?.Source
    }
    if (-not $pythonExe) {
        Log-Warn 'Python interpreter not found; skipping verify_upgrade.py'
    }
    else {
        Log-Info "Running $VerifierScript"
        & $pythonExe $VerifierScript
    }
}
