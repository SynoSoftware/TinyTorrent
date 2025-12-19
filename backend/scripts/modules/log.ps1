Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

$Script:LogSupportsColor = ($Host -and $Host.UI -and -not [Console]::IsOutputRedirected)
$Script:LogSymbols = @{
    'INFO'  = 'ℹ'
    'OK'    = '✔'
    'WARN'  = '⚠'
    'ERROR' = '✖'
    'NOTE'  = '➤'
}

function Write-Decorated {
    param(
        [string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    if ($Script:LogSupportsColor) {
        Microsoft.PowerShell.Utility\Write-Host $Text -ForegroundColor $Color
    }
    else {
        Write-Output $Text
    }
}

function Write-Log {
    param(
        [Parameter(Mandatory)] [string]$Level,
        [Parameter(Mandatory)] [string]$Message,
        [Parameter()] [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $stamp = (Get-Date).ToString('HH:mm:ss')
    $symbol = $Script:LogSymbols[$Level] ?? '•'
    $text = ("[{0}] [{1}] {2} {3}" -f $stamp, $Level, $symbol, $Message).Trim()
    Write-Decorated -Text $text -Color $Color
}

function Log-Info {
    param([string]$Message)
    Write-Log -Level 'INFO' -Message $Message -Color ([ConsoleColor]::Cyan)
}

function Log-Success {
    param([string]$Message)
    Write-Log -Level 'OK' -Message $Message -Color ([ConsoleColor]::Green)
}

function Log-Warn {
    param([string]$Message)
    Write-Log -Level 'WARN' -Message $Message -Color ([ConsoleColor]::Yellow)
}

function Log-Error {
    param([string]$Message)
    Write-Log -Level 'ERROR' -Message $Message -Color ([ConsoleColor]::Red)
}

function Log-Note {
    param([string]$Message)
    Write-Log -Level 'NOTE' -Message $Message -Color ([ConsoleColor]::DarkGray)
}

function Log-Section {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [string]$Subtitle = ''
    )

    $lineWidth = 64
    $innerWidth = $lineWidth - 4
    $contentWidth = $lineWidth - 2

    $maxTitleLength = [Math]::Max(0, $contentWidth - 2)
    if ($Title.Length -gt $maxTitleLength) {
        if ($maxTitleLength -lt 3) {
            $titleText = '...'
        }
        else {
            $titleText = $Title.Substring(0, $maxTitleLength - 3) + '...'
        }
    }
    else {
        $titleText = $Title
    }

    $titlePrefix = "─ $titleText"
    $titleFill = [Math]::Max(0, $contentWidth - $titlePrefix.Length)
    $topLine = "╭" + $titlePrefix + ('─' * $titleFill) + "╮"
    $subtitleText = if ($Subtitle) { $Subtitle } else { ' ' }
    if ($subtitleText.Length -gt $innerWidth) {
        $subtitleText = $subtitleText.Substring(0, $innerWidth - 3) + '...'
    }
    $detailLine = "│ {0,-$innerWidth} │" -f $subtitleText
    $bottomLine = "╰" + ('─' * $contentWidth) + "╯"

    Write-Output ''
    Write-Decorated -Text $topLine -Color ([ConsoleColor]::DarkCyan)
    Write-Decorated -Text $detailLine -Color ([ConsoleColor]::Gray)
    Write-Decorated -Text $bottomLine -Color ([ConsoleColor]::DarkCyan)
}
