Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Log-Info {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Output "[INFO] $Message"
}

function Log-Warn {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Output "[WARN] $Message"
}

function Log-Error {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Output "[ERROR] $Message"
}
