Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env.ps1')

function build {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())

    if (-not (Test-Path -LiteralPath $BuildDir)) {
        throw "Build directory not found: $BuildDir. Run configure first."
    }

    $tools = Get-Tooling

    Ensure-VsEnv

    $mesonArgs = @('compile', '-C', $BuildDir)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($tools.Meson) {
        $psi.FileName = $tools.Meson
    }
    else {
        $psi.FileName = $tools.Python
        [void]$psi.ArgumentList.Add('-m')
        [void]$psi.ArgumentList.Add('mesonbuild.mesonmain')
    }
    foreach ($a in $mesonArgs) { [void]$psi.ArgumentList.Add($a) }
    $psi.WorkingDirectory = $Root
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false

    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) {
        throw "Ninja failed with exit code $($p.ExitCode)."
    }

    $primaryExe = Join-Path $BuildDir 'TinyTorrent.exe'
    if (-not (Test-Path -LiteralPath $primaryExe)) {
        $primaryExe = Join-Path $BuildDir 'tt-engine.exe'
    }
    if (Test-Path -LiteralPath $primaryExe) {
        $SizeKB = (Get-Item -LiteralPath $primaryExe).Length / 1KB
        Log-Success "SUCCESS: $Configuration Build Complete"
        Log-Info "Artifact: $primaryExe"
        Log-Info ("Size:     {0:N0} KB" -f $SizeKB)
    }
}
