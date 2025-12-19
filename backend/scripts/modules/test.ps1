Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'vcpkg.ps1')

function test {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())
    $TestDir = Join-Path $BuildDir 'tests'

    if (-not (Test-Path -LiteralPath $TestDir)) {
        throw "Test directory not found: $TestDir. Build/tests must exist first."
    }

    $Triplet = if ($Configuration -eq 'Debug') { 'x64-windows-asan' } else { 'x64-windows-static' }
    $TripletRoot = Join-Path $Root ("vcpkg_installed/{0}" -f $Triplet)
    Test-VcpkgTriplet -TripletRoot $TripletRoot -Triplet $Triplet

    $nestedTripletRoot = Join-Path $TripletRoot $Triplet
    if (Test-Path -LiteralPath (Join-Path $nestedTripletRoot 'include')) {
        $TripletRoot = $nestedTripletRoot
    }

    Log-Info "Running tests ($Configuration)..."

    $oldPath = $env:PATH
    try {
        if ($Configuration -eq 'Debug') {
            $dllDirs = @(
                (Join-Path $TripletRoot 'bin'),
                (Join-Path $TripletRoot 'debug\bin')
            )
            foreach ($d in $dllDirs) {
                if (Test-Path -LiteralPath $d) {
                    $env:PATH = "$d;$env:PATH"
                }
            }
        }

        $executables = Get-ChildItem -LiteralPath $TestDir -Filter '*-test.exe' -File -ErrorAction Stop
        foreach ($exe in $executables) {
            Log-Info "  Exec: $($exe.Name)"

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
            Log-Success "  PASS: $($exe.Name)"
        }
    }
    finally {
        $env:PATH = $oldPath
    }
}
