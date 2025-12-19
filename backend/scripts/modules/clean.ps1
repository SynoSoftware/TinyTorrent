Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'safe-delete.ps1')

function clean {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration,
        [switch]$AutoConfirmDeletion
    )

    $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())

    if (-not (Test-Path -LiteralPath $BuildDir)) {
        Log-Info "No build directory found for $Configuration (expected: $BuildDir)."
        return
    }

    Remove-FolderSafe -Path $BuildDir -DisplayName "buildstate ($Configuration)" -PromptAboveBytes 500MB -AutoConfirm:$AutoConfirmDeletion
}
