Set-StrictMode -Version 3

$script:EverythingReady = $false
$script:EverythingAsked = $false
$script:EverythingCliPath = $null

function Write-Log {
    param([string]$Message, [string]$Level = 'Info')
    $c = switch ($Level) { 'Info' { 'Cyan' } 'Warn' { 'Yellow' } 'Error' { 'Red' } 'Success' { 'Green' } default { 'White' } }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')][$Level] $Message" -ForegroundColor $c
}

function Safe-TestPath {
    param([string]$Path)
    try { return Test-Path $Path -ErrorAction Stop } catch { return $false }
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory)][psobject]$Object,
        [Parameter(Mandatory)][string]$Property
    )
    if (-not $Object) { return $null }
    $prop = $Object.PSObject.Properties[$Property]
    if ($prop) { return $prop.Value }
    return $null
}

function Find-ViaPath {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return (Resolve-Path $cmd.Source).Path }
    return $null
}

function Find-ViaRegistry {
    param([string]$Id, [string]$Name)
    $hives = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')
    foreach ($h in $hives) {
        if (-not (Safe-TestPath $h)) { continue }
        $keys = Get-ChildItem $h -ErrorAction SilentlyContinue
        foreach ($k in $keys) {
            $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
            if (-not $p) { continue }
            $displayName = Get-PropertyValue -Object $p -Property 'DisplayName'
            $installLocation = Get-PropertyValue -Object $p -Property 'InstallLocation'
            if ($displayName -and $installLocation -and $displayName -like "*$Id*") {
                $base = $installLocation
                $try = Join-Path $base $Name; if (Safe-TestPath $try) { return $try }
                $try = Join-Path $base "bin\$Name"; if (Safe-TestPath $try) { return $try }
            }
        }
    }
    return $null
}

function Find-ViaAppx {
    param([string]$Id, [string]$Name)
    try {
        $pkg = Get-AppxPackage -Name "*$Id*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pkg -and $pkg.InstallLocation) {
            $loc = $pkg.InstallLocation
            $paths = @("$loc\$Name", "$loc\bin\$Name", "$loc\VFS\ProgramFilesX64\$Id\bin\$Name", "$loc\VFS\ProgramFilesX64\$Id\$Name")
            foreach ($p in $paths) { if (Safe-TestPath $p) { return $p } }
        }
    }
    catch {}
    return $null
}

function Find-ViaStandardPaths {
    param([string]$Id, [string]$Name)
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
    foreach ($r in $roots) {
        if (-not (Safe-TestPath $r)) { continue }
        $dirs = Get-ChildItem $r -Directory -Filter "$Id*" -ErrorAction SilentlyContinue
        foreach ($d in $dirs) {
            $try = Join-Path $d.FullName $Name; if (Safe-TestPath $try) { return $try }
            $try = Join-Path $d.FullName "bin\$Name"; if (Safe-TestPath $try) { return $try }
        }
    }
    return $null
}

function Initialize-Everything-Silent {
    $localAppData = $env:LOCALAPPDATA
    $candidates = @()
    if ($localAppData) { $candidates += Join-Path $localAppData 'voidtools\es.exe' }
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Everything\es.exe' }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} 'Everything\es.exe' }
    if ($env:ChocolateyInstall) { $candidates += Join-Path $env:ChocolateyInstall 'bin\es.exe' }
    $candidates += Find-ViaPath "es.exe"
    foreach ($c in $candidates) {
        if ($c -and (Safe-TestPath $c)) {
            $script:EverythingCliPath = $c
            break
        }
    }
    $engine = Get-Process "Everything" -ErrorAction SilentlyContinue
        if (-not $engine -and $script:EverythingCliPath) {
            $exeCandidates = @()
            if ($env:ProgramFiles) { $exeCandidates += Join-Path $env:ProgramFiles 'Everything\Everything.exe' }
            if (${env:ProgramFiles(x86)}) { $exeCandidates += Join-Path ${env:ProgramFiles(x86)} 'Everything\Everything.exe' }
        foreach ($exe in $exeCandidates) {
            if (Safe-TestPath $exe) {
                Start-Process $exe -WindowStyle Hidden
                Start-Sleep -Seconds 1
                $engine = Get-Process "Everything" -ErrorAction SilentlyContinue
                break
            }
        }
    }
    $script:EverythingReady = $script:EverythingCliPath -and (Get-Process "Everything" -ErrorAction SilentlyContinue)
    $script:EverythingReady = [bool]$script:EverythingReady
}

function Install-Everything-Interactive {
    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        Write-Log "Winget not found. Please install Everything manually." "Error"
        return $false
    }
    Start-Process "winget" -ArgumentList "install voidtools.everything -e --accept-package-agreements --accept-source-agreements --scope machine" -Wait
    Start-Sleep -Seconds 3
    Initialize-Everything-Silent
    return $script:EverythingReady
}

function Ensure-Everything {
    param(
        [switch]$Prompt = $true
    )

    if ($script:EverythingReady) { return $true }

    Initialize-Everything-Silent
    if ($script:EverythingReady) {
        Write-Log "Everything search engine ready at $script:EverythingCliPath" "Success"
        return $true
    }

    if ($Prompt -and -not $script:EverythingAsked) {
        $script:EverythingAsked = $true
        $reply = Read-Host "Everything search not found. Install/configure 'Everything' via Winget? (Y/N)"
        if ($reply -match '^[yY]') {
            if (Install-Everything-Interactive) {
                Write-Log "Everything is now ready at $script:EverythingCliPath" "Success"
                return $true
            }
        }
    }

    Write-Log "Everything unavailable; deep scans will fall back to PATH-only lookups." "Warn"
    return $false
}

function Resolve-Tool {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$OverridePath,
        [string]$Id,
        [string]$PackageId
    )

    if ($OverridePath) {
        $resolved = Resolve-Path -Path $OverridePath -ErrorAction SilentlyContinue
        if ($resolved -and (Test-Path $resolved.Path)) { return $resolved.Path }
        throw "Override path for $Name must be a file: $OverridePath"
    }

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return (Resolve-Path $cmd.Source).Path }

    if ($PackageId) {
        $found = Locate-Or-Install -Name $Name -Id ($Id -or $Name) -PackageId $PackageId
        if ($found) { return $found }
    }

    return $null
}

function Find-ViaEverything {
    param([string]$Name)
    if (-not $script:EverythingCliPath) { return $null }
    $query = "$Name ext:exe !C:\Windows"
    $res = & $script:EverythingCliPath $query -n 1 -w -sort-date-modified 2>&1
    if ($res -isnot [System.Management.Automation.ErrorRecord] -and (Safe-TestPath $res)) { return $res }
    return $null
}

function Install-Tool {
    param([string]$Name, [string]$Id, [string]$PackageId)
    $reply = Read-Host "Tool '$Id' ($Name) is missing. Install it via Winget? (Y/N)"
    if ($reply -match "^[yY]") {
        if (Get-Command "winget" -ErrorAction SilentlyContinue) {
            Start-Process "winget" -ArgumentList "install $PackageId -e --accept-package-agreements --accept-source-agreements" -Wait
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            return $true
        }
        else {
            Write-Log "Winget not found. Please install $Id manually." "Error"
        }
    }
    return $false
}

function Locate-Or-Install {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$PackageId
    )

    Write-Log "Locating $Id..." "Info"

    if ($p = Find-ViaPath $Name) { Write-Log "Found in PATH: $p" "Success"; return $p }
    if ($p = Find-ViaRegistry $Id $Name) { Write-Log "Found in Registry: $p" "Success"; return $p }
    if ($p = Find-ViaAppx $Id $Name) { Write-Log "Found in Appx: $p" "Success"; return $p }
    if ($p = Find-ViaStandardPaths $Id $Name) { Write-Log "Found in Std Paths: $p" "Success"; return $p }

    if (-not $script:EverythingReady) { Initialize-Everything-Silent }

    if ($script:EverythingReady) {
        if ($p = Find-ViaEverything $Name) { Write-Log "Found via Everything: $p" "Success"; return $p }
    }
    elseif (-not $script:EverythingAsked) {
        Write-Log "Standard search failed." "Warn"
        $script:EverythingAsked = $true
        $reply = Read-Host "Do you want to install/configure 'Everything' for a deep system scan? (Y/N)"
        if ($reply -match "^[yY]") {
            Install-Everything-Interactive
            if ($script:EverythingReady) {
                if ($p = Find-ViaEverything $Name) { Write-Log "Found via Everything: $p" "Success"; return $p }
            }
        }
    }

    if (Install-Tool $Name $Id $PackageId) {
        if ($p = Find-ViaPath $Name) { return $p }
        if ($p = Find-ViaRegistry $Id $Name) { return $p }
        if ($script:EverythingReady) {
            if ($p = Find-ViaEverything $Name) { return $p }
        }
    }

    return $null
}
