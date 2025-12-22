Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -eq $PSCommandPath) {
    throw "Internal build-system module. Do not execute directly."
}

$Script:LogSupportsColor = ($Host -and $Host.UI -and -not [Console]::IsOutputRedirected)

# Logging style:
# - Default is ASCII in Windows PowerShell (5.1) to avoid mojibake.
# - Default is Unicode in PowerShell 7+.
# - Override with env vars:
#   - TT_LOG_ASCII=1 forces ASCII
#   - TT_LOG_UNICODE=1 forces Unicode
$Script:LogUseUnicode = $false
try {
    if ($env:TT_LOG_UNICODE -eq '1') {
        $Script:LogUseUnicode = $true
    }
    elseif ($env:TT_LOG_ASCII -eq '1') {
        $Script:LogUseUnicode = $false
    }
    elseif ($PSVersionTable -and $PSVersionTable.PSVersion -and $PSVersionTable.PSVersion.Major -ge 7) {
        $Script:LogUseUnicode = $true
    }
}
catch {
    $Script:LogUseUnicode = $false
}

function Get-LogSymbols {
    if ($Script:LogUseUnicode) {
        return @{
            'INFO'  = [char]0x2139  # ℹ
            'OK'    = [char]0x2714  # ✔
            'WARN'  = [char]0x26A0  # ⚠
            'ERROR' = [char]0x2716  # ✖
            'NOTE'  = [char]0x27A4  # ➤
        }
    }

    return @{
        'INFO'  = 'i'
        'OK'    = '+'
        'WARN'  = '!'
        'ERROR' = 'x'
        'NOTE'  = '>'
    }
}

$Script:LogSymbols = Get-LogSymbols

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
    $symbol = $Script:LogSymbols[$Level]
    if (-not $symbol) {
        $symbol = '•'
    }
    $text = ("[{0}] [{1}] {2} {3}" -f $stamp, $Level, $symbol, $Message).Trim()
    Write-Decorated -Text $text -Color $Color
}

function Log-Info {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Log -Level 'INFO' -Message $Message -Color $Color
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

    Write-Output ''

    if (-not $Script:LogUseUnicode) {
        Write-Decorated -Text ("---- {0} ----" -f $Title) -Color ([ConsoleColor]::DarkCyan)
        if ($Subtitle) {
            Write-Decorated -Text $Subtitle -Color ([ConsoleColor]::Gray)
        }
        return
    }

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

    $chH = [char]0x2500  # ─
    $chTL = [char]0x256D # ╭
    $chTR = [char]0x256E # ╮
    $chV = [char]0x2502  # │
    $chBL = [char]0x2570 # ╰
    $chBR = [char]0x256F # ╯

    $titlePrefix = ("{0} {1}" -f $chH, $titleText)
    $titleFill = [Math]::Max(0, $contentWidth - $titlePrefix.Length)
    $topLine = $chTL + $titlePrefix + (($chH.ToString()) * $titleFill) + $chTR

    $subtitleText = if ($Subtitle) { $Subtitle } else { ' ' }
    if ($subtitleText.Length -gt $innerWidth) {
        $subtitleText = $subtitleText.Substring(0, $innerWidth - 3) + '...'
    }
    $detailLine = ("{0} {1,-$innerWidth} {2}" -f $chV, $subtitleText, $chV)
    $bottomLine = $chBL + (($chH.ToString()) * $contentWidth) + $chBR

    Write-Decorated -Text $topLine -Color ([ConsoleColor]::DarkCyan)
    Write-Decorated -Text $detailLine -Color ([ConsoleColor]::Gray)
    Write-Decorated -Text $bottomLine -Color ([ConsoleColor]::DarkCyan)
}
