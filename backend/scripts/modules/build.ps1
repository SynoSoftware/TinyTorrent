Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env.ps1')

function build {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())

    if (-not (Test-Path -LiteralPath $BuildDir)) {
        throw "Build directory not found: $BuildDir. Run configure first."
    }

    $tools = Get-Tooling

    $ninjaArgs = @('-C', $BuildDir)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $tools.Ninja
    foreach ($a in $ninjaArgs) { [void]$psi.ArgumentList.Add($a) }
    $psi.WorkingDirectory = $Root
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false

    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) {
        throw "Ninja failed with exit code $($p.ExitCode)."
    }
}
