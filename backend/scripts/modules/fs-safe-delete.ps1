Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

. (Join-Path (Split-Path -Parent $PSCommandPath) 'log.ps1')

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return "$Bytes B" }
    $units = @('KB', 'MB', 'GB', 'TB')
    $size = [double]$Bytes
    $unitIndex = -1
    while ($size -ge 1024 -and $unitIndex -lt ($units.Count - 1)) {
        $size /= 1024
        $unitIndex++
    }
    return ("{0:N2} {1}" -f $size, $units[$unitIndex])
}

function Get-FolderSizeBytes {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    $measure = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
    if ($null -eq $measure.Sum) { return 0 }
    return [long]$measure.Sum
}

function Remove-FolderSafe {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [long]$PromptAboveBytes = 500MB,
        [switch]$ForcePrompt,
        [switch]$AutoConfirm
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Log-Note "$DisplayName not found: $Path"
        return
    }

    Log-Warn "Deletion requested: $DisplayName"
    Log-Note "  Path: $Path"
    $bytes = Get-FolderSizeBytes $Path
    Log-Note "  Size: $(Format-Bytes $bytes)"

    $needsPrompt = $ForcePrompt -or ($bytes -ge $PromptAboveBytes)
    if ($needsPrompt) {
        Log-Note "  Threshold: $(Format-Bytes $PromptAboveBytes)"
        if ($AutoConfirm) {
            Log-Note "  Auto-confirmed (auto flag enabled)."
        }
        else {
            if ($env:CI -eq 'true') {
                throw "Refusing to delete $DisplayName in CI (size $($bytes)). Delete it manually or rerun with AutoConfirm."
            }
            $answer = Read-Host "Type YES to permanently delete $DisplayName (anything else = cancel)"
            if ($answer -ne 'YES') {
                Log-Info "Cancelled deletion of $DisplayName."
                return
            }
        }
    }

    Log-Warn "Deleting $DisplayName..."
    Remove-Item -LiteralPath $Path -Recurse -Force
    Log-Success "Deleted $DisplayName."
}
