Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSCommandPath) 'logging.ps1')

function Resolve-ToolPath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $esPath = 'C:\Program Files\Everything\es.exe'
    if (Test-Path -LiteralPath $esPath) {
        try {
            $candidate = & $esPath -w -n 1 $Name 2>$null | Select-Object -First 1
            if ($candidate) {
                $candidate = $candidate.Trim()
                if ([string]::IsNullOrWhiteSpace($candidate) -eq $false -and (Test-Path -LiteralPath $candidate)) {
                    if ($candidate.ToLowerInvariant().EndsWith('.exe')) {
                        return (Resolve-Path -LiteralPath $candidate).Path
                    }
                }
            }
        }
        catch {}
    }

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) {
        return (Resolve-Path -LiteralPath $cmd.Source).Path
    }

    throw "Required tool $Name not found. Manual installation required."
}

function Get-Tooling {
    return [pscustomobject]@{
        Meson  = Resolve-ToolPath -Name 'meson'
        Ninja  = Resolve-ToolPath -Name 'ninja'
        Python = Resolve-ToolPath -Name 'python'
        CL     = Resolve-ToolPath -Name 'cl'
    }
}
