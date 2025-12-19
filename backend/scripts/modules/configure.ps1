Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'env.ps1')
. (Join-Path (Split-Path -Parent $PSCommandPath) 'vcpkg.ps1')

function configure {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Debug', 'Release')][string]$Configuration
    )

    $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
    $BuildDir = Join-Path $Root ("buildstate/{0}" -f $Configuration.ToLower())
    $Triplet = if ($Configuration -eq 'Debug') { 'x64-windows-asan' } else { 'x64-windows-static' }
    $TripletRoot = Join-Path $Root ("vcpkg_installed/{0}" -f $Triplet)

    Test-VcpkgTriplet -TripletRoot $TripletRoot -Triplet $Triplet

    $nestedTripletRoot = Join-Path $TripletRoot $Triplet
    if (Test-Path -LiteralPath (Join-Path $nestedTripletRoot 'include')) {
        $TripletRoot = $nestedTripletRoot
    }

    $tools = Get-Tooling

    $prefixPath = "$TripletRoot;$TripletRoot\share"

    if (-not (Test-Path -LiteralPath $BuildDir)) {
        [void](New-Item -ItemType Directory -Path $BuildDir)
    }

    $buildNinja = Join-Path $BuildDir 'build.ninja'
    $isReconfigure = Test-Path -LiteralPath $buildNinja

    Ensure-VsEnv

    $mesonArgs = @()
    if ($isReconfigure) {
        $mesonArgs += 'setup', '--reconfigure'
    }
    else {
        $mesonArgs += 'setup'
    }
    $mesonArgs += @(
        "--buildtype=$($Configuration.ToLower())",
        "--cmake-prefix-path=$prefixPath",
        "-Db_vscrt=$(if ($Configuration -eq 'Debug') { 'md' } else { 'mt' })",
        "-Db_sanitize=$(if ($Configuration -eq 'Debug') { 'address' } else { 'none' })",
        "-Db_lto=$(if ($Configuration -eq 'Debug') { 'false' } else { 'true' })",
        "-Dstrip=$(if ($Configuration -eq 'Debug') { 'false' } else { 'true' })",
        "-Dtt_enable_logging=$(if ($Configuration -eq 'Debug') { 'true' } else { 'false' })",
        "-Dtt_enable_tests=$(if ($Configuration -eq 'Debug') { 'true' } else { 'false' })",
        "--backend=ninja",
        $BuildDir,
        $Root
    )

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
    $psi.Environment['CMAKE_PREFIX_PATH'] = $prefixPath

    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) {
        throw "Meson failed with exit code $($p.ExitCode)."
    }
}
