#Requires -Version 5.1
<#
.SYNOPSIS
    Concatenates all files matching the specified patterns into a single text file.

.DESCRIPTION
    Recursively searches a directory for files that match one or more wildcard patterns
    (e.g., *.cs, *.razor) and combines their content into a single output file.

    By default, the output file is named after the search folder and placed in C:\temp.
    Common build / tooling folders (bin, obj, node_modules, .git, .vs, and *any* directory
    whose name starts with a dot) are skipped automatically.

.PARAMETER Patterns
    One or more file patterns to search for.

.PARAMETER OutputFile
    Optional explicit output file path.  If omitted -> C:\temp\<SearchFolderName>.txt.

.PARAMETER Path
    Root folder to start the search.  Defaults to the current directory ('.').
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Patterns,

    [string]$OutputFile,

    [string]$Path = '.'
)

try {
    $searchPath = (Resolve-Path -Path $Path -ErrorAction Stop).Path
    if (-not $PSBoundParameters.ContainsKey('OutputFile')) {
        $searchFolderName = Split-Path -Leaf $searchPath
        $OutputFile       = Join-Path 'C:\temp' "$searchFolderName.txt"
    }

    Write-Host "Searching in '$searchPath' for patterns: $($Patterns -join ', ')`n" -ForegroundColor Yellow

    $excludeDirs = @('bin', 'obj', 'node_modules', '.git', '.vs', 'migrations', 'migration', '.vshistory')
    $totalRAMMB  = [math]::Round((Get-CimInstance CIM_ComputerSystem).TotalPhysicalMemory / 1MB, 2)

    # --- file discovery -------------------------------------------------------
    $allFiles = @()
    foreach ($pattern in $Patterns) {
        $allFiles += Get-ChildItem -Path $searchPath -Recurse -File -Include $pattern -ErrorAction SilentlyContinue
    }
    $allFiles = $allFiles | Sort-Object -Unique -Property FullName


    $filesToProcess = @()
    $totalBytes     = 0



    foreach ($file in $allFiles) {
        $dirParts = $file.DirectoryName -split '[\\/]' | ForEach-Object { $_.ToLowerInvariant() }

        $relativePath = $file.FullName.Substring($searchPath.Length).TrimStart('\','/')

        # skip explicit list OR any directory that starts with dot
        if ($dirParts | Where-Object { $_ -in $excludeDirs -or $_ -match '^\.' }) {
            Write-Host ("Excluded: {0,-60}" -f $relativePath) -ForegroundColor DarkGray
            continue
        }

        if ($file.Name -ieq 'package-lock.json') {   # same exclusion rule as before
            Write-Host ("Excluded: {0,-60}" -f $relativePath) -ForegroundColor DarkGray
            continue
        }

        $filesToProcess += $file
        $totalBytes     += $file.Length
    }

    if (-not $filesToProcess) {
        Write-Warning 'No files found matching the specified patterns.'
        return
    }

    # --- reporting ------------------------------------------------------------
    foreach ($f in $filesToProcess | Sort-Object Length) {
        $sizeKB         = [math]::Round($f.Length / 1KB, 2)
        $percentOfTotal = [math]::Round($f.Length / $totalBytes * 100, 2)
        $relativePath   = $f.FullName.Substring($searchPath.Length).TrimStart('\','/')
        Write-Host ("Include: {0,-60} {1,8} KB {2,6}% of batch" -f $relativePath, $sizeKB, $percentOfTotal) -ForegroundColor Cyan
    }


    Write-Host "`nFound $($filesToProcess.Count) files. Concatenating..." -ForegroundColor Yellow

    # ensure output directory exists
    $outDir = Split-Path $OutputFile -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

    # --- concatenate ----------------------------------------------------------
    $filesToProcess | ForEach-Object {
        @"
================================================================================
FILE: $($_.FullName)
================================================================================

"@
        [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
        "`n"
    } | Set-Content -Path $OutputFile -Encoding UTF8 -NoNewline

    $sizeKB         = [math]::Round($totalBytes / 1KB, 2)
    $estimatedTokens = [math]::Ceiling($totalBytes / 4)
    $tokenPercent   = [math]::Round($estimatedTokens / 128000 * 100, 2)

    Write-Host "`nCombined file created at: $(Resolve-Path $OutputFile)" -ForegroundColor Green
    Write-Host "Total combined size: $sizeKB KB  ~${estimatedTokens} tokens (${tokenPercent}% of 128K context)`n" -ForegroundColor Magenta


}
catch {
    Write-Error "Fatal: $_"
}
