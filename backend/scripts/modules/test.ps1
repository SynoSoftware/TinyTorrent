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

    $LogDir = Join-Path $BuildDir 'test-logs'
    if (-not (Test-Path -LiteralPath $LogDir)) {
        [void](New-Item -ItemType Directory -Path $LogDir)
    }

    Log-Info "Running tests ($Configuration)... (logs: $LogDir)"

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
            $stdoutLog = Join-Path $LogDir ("{0}.stdout.log" -f $exe.BaseName)
            $stderrLog = Join-Path $LogDir ("{0}.stderr.log" -f $exe.BaseName)

            $proc = Start-Process -FilePath $exe.FullName -WorkingDirectory $TestDir -NoNewWindow -PassThru -Wait `
                -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

            if ($proc.ExitCode -eq 0) {
                Log-Success "PASS: $($exe.Name)"
                continue
            }

            Log-Error "FAIL: $($exe.Name) (exit $($proc.ExitCode))"
            Log-Info "  stdout: $stdoutLog"
            Log-Info "  stderr: $stderrLog"

            $tailLines = 25
            $stderrTail = @()
            $stdoutTail = @()
            if (Test-Path -LiteralPath $stderrLog) {
                $stderrTail = Get-Content -LiteralPath $stderrLog -Tail $tailLines -ErrorAction SilentlyContinue
            }
            if (Test-Path -LiteralPath $stdoutLog) {
                $stdoutTail = Get-Content -LiteralPath $stdoutLog -Tail $tailLines -ErrorAction SilentlyContinue
            }

            if ($stderrTail.Count -gt 0) {
                Log-Error "--- stderr (last $tailLines lines) ---"
                $stderrTail | ForEach-Object { Write-Output $_ }
            }
            if ($stdoutTail.Count -gt 0) {
                Log-Error "--- stdout (last $tailLines lines) ---"
                $stdoutTail | ForEach-Object { Write-Output $_ }
            }

            throw "Test failed: $($exe.Name)"
        }

        Log-Success 'All tests passed.'
    }
    finally {
        $env:PATH = $oldPath
    }
}
