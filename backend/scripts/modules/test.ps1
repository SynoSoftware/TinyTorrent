Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env.ps1')

function test {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())
    $TestDir = Join-Path $BuildDir 'tests'

    if (-not (Test-Path -LiteralPath $TestDir)) {
        throw "Test directory not found: $TestDir. Build/tests must exist first."
    }

    $tools = Get-Tooling

    $executables = Get-ChildItem -LiteralPath $TestDir -Filter '*-test.exe' -File -ErrorAction Stop
    foreach ($exe in $executables) {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $exe.FullName
        $psi.WorkingDirectory = $TestDir
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $false
        $psi.RedirectStandardError = $false

        $p = [System.Diagnostics.Process]::Start($psi)
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) {
            throw "Test failed: $($exe.Name) (exit $($p.ExitCode))."
        }
    }
}
