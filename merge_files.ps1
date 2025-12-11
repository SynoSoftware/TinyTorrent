#Requires -Version 5.1
<#
.SYNOPSIS
    Concatenates files matching patterns, with support for excluding specific file patterns.

.DESCRIPTION
    Scans for files matching <Patterns>. 
    Skips specific directories (node_modules, bin, etc).
    Skips files matching exclusion patterns.

    USAGE:
    1. Using ! for exclusion (Easiest):
       .\merge_files.ps1 *.c *.h !mongoose.* !test*

    2. Using quotes for - exclusion:
       .\merge_files.ps1 *.c *.h '-mongoose.*'

    3. Using explicit parameter:
       .\merge_files.ps1 *.c *.h -Exclude mongoose.*
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Arguments,

    [string[]]$Exclude, # Explicit exclude parameter

    [string]$OutputFile
)

# --- Argument Parsing ---------------------------------------------------------
$Path = '.'
$IncludePatterns = @()
$ExcludePatterns = @()

# Add explicit excludes from parameter if provided
if ($Exclude) { $ExcludePatterns += $Exclude }

# Determine if first arg is a path
$startIndex = 0
if ($Arguments.Count -gt 0 -and (Test-Path -Path $Arguments[0] -PathType Container)) {
    $Path = $Arguments[0]
    $startIndex = 1
}

# Parse the rest of the arguments
if ($Arguments.Count -gt $startIndex) {
    for ($i = $startIndex; $i -lt $Arguments.Count; $i++) {
        $arg = $Arguments[$i]
        
        if ($arg.StartsWith('!')) {
            # Handle !pattern (e.g. !mongoose.*)
            $ExcludePatterns += $arg.Substring(1)
        }
        elseif ($arg.StartsWith('-')) {
            # Handle -pattern (e.g. '-mongoose.*' - requires quotes in CLI)
            $ExcludePatterns += $arg.Substring(1)
        }
        else {
            $IncludePatterns += $arg
        }
    }
}

if (-not $IncludePatterns) {
    Write-Error "No include patterns specified.`nUsage: merge_files.ps1 [Folder] <*.ext> [!exclude*]..."
    exit 1
}

# --- Helper Functions ---------------------------------------------------------

function Parse-Gitignore {
    param([string]$FilePath)
    $rules = @()
    if (Test-Path $FilePath) {
        Get-Content -Path $FilePath -ErrorAction SilentlyContinue | ForEach-Object {
            $line = $_.Trim()
            if (-not [string]::IsNullOrWhiteSpace($line) -and -not $line.StartsWith('#') -and -not $line.StartsWith('!')) {
                $entry = $line.TrimEnd('/', '\')
                $segments = @($entry -split '[\\/]' | Where-Object { $_ })
                if ($segments.Count -gt 0) {
                    $rules += $segments[-1] 
                }
            }
        }
    }
    return $rules
}

# --- Main Execution -----------------------------------------------------------

try {
    $rootPath = (Resolve-Path -Path $Path -ErrorAction Stop).Path
    
    # 1. Setup Directory Exclusions (Skipping folders entirely)
    $DirExcludeSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::InvariantCultureIgnoreCase)
    
    # Default ignored folders
    $defaults = @('bin', 'obj', 'node_modules', '.git', '.vs', 'migrations', 'migration', '.vshistory', 'dist', 'build', '.idea', '.vscode', 'coverage')
    foreach ($d in $defaults) { $DirExcludeSet.Add($d) | Out-Null }

    # Load .gitignore rules
    $current = $rootPath
    while ($current) {
        $gi = Join-Path $current '.gitignore'
        if (Test-Path $gi) {
            foreach ($rule in Parse-Gitignore $gi) { $DirExcludeSet.Add($rule) | Out-Null }
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current -or [string]::IsNullOrEmpty($parent)) { break }
        $current = $parent
    }

    # 2. Output File Setup
    if (-not $PSBoundParameters.ContainsKey('OutputFile') -or [string]::IsNullOrWhiteSpace($OutputFile)) {
        $folderName = Split-Path -Leaf $rootPath
        if ([string]::IsNullOrWhiteSpace($folderName)) { $folderName = "root" }
        $OutputFile = Join-Path 'C:\temp' "$folderName.txt"
    }

    Write-Host "Searching in: $rootPath" -ForegroundColor Yellow
    Write-Host "Include:      $($IncludePatterns -join ', ')" -ForegroundColor Yellow
    if ($ExcludePatterns) {
        Write-Host "Exclude Files:$($ExcludePatterns -join ', ')" -ForegroundColor Red
    }
    Write-Host "Skip Folders: $($DirExcludeSet.Count) rules loaded`n" -ForegroundColor DarkGray

    # 3. Fast Directory Walker
    $stack = [System.Collections.Generic.Stack[string]]::new()
    $stack.Push($rootPath)

    $filesToProcess = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
    $totalBytes = 0

    while ($stack.Count -gt 0) {
        $currentDir = $stack.Pop()
        $items = Get-ChildItem -Path $currentDir -Force -ErrorAction SilentlyContinue

        foreach ($item in $items) {
            $name = $item.Name

            if ($item.PSIsContainer) {
                # --- FOLDER SKIPPING ---
                if ($name.StartsWith('.') -or $DirExcludeSet.Contains($name)) { continue }
                $stack.Push($item.FullName)
            }
            else {
                # --- FILE CHECKING ---
                if ($name -ieq 'package-lock.json') { continue }
                
                # A. Check Excludes first
                $isExcluded = $false
                foreach ($exPat in $ExcludePatterns) {
                    if ($name -like $exPat) {
                        $isExcluded = $true
                        # Write-Verbose "Skipping $name (matches $exPat)"
                        break
                    }
                }
                if ($isExcluded) { continue }

                # B. Check Includes
                foreach ($inPat in $IncludePatterns) {
                    if ($name -like $inPat) {
                        $filesToProcess.Add($item)
                        $totalBytes += $item.Length
                        break
                    }
                }
            }
        }
    }

    if ($filesToProcess.Count -eq 0) {
        Write-Warning "No files found matching the specified patterns."
        return
    }

    # 4. Sorting and Reporting
    $sortedFiles = $filesToProcess | Sort-Object Length

    foreach ($f in $sortedFiles) {
        $relPath = $f.FullName.Substring($rootPath.Length).TrimStart('\', '/')
        $sizeKB = [math]::Round($f.Length / 1KB, 2)
        
        $percentOfTotal = 0
        if ($totalBytes -gt 0) {
            $percentOfTotal = [math]::Round($f.Length / $totalBytes * 100, 2)
        }

        Write-Host ("Include: {0,-60} {1,8} KB {2,6}% of batch" -f $relPath, $sizeKB, $percentOfTotal) -ForegroundColor Cyan
    }

    Write-Host "`nFound $($filesToProcess.Count) files. Concatenating..." -ForegroundColor Yellow

    # Ensure output directory
    $outDir = Split-Path $OutputFile -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

    # 5. Concatenation
    $sb = [System.Text.StringBuilder]::new()
    
    foreach ($file in $sortedFiles) {
        [void]$sb.AppendLine("================================================================================")
        [void]$sb.AppendLine("FILE: $($file.FullName)")
        [void]$sb.AppendLine("================================================================================")
        try {
            [void]$sb.AppendLine([System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8))
        }
        catch {
            [void]$sb.AppendLine("[Error reading file: $_]")
        }
        [void]$sb.AppendLine("`n")
    }

    [System.IO.File]::WriteAllText($OutputFile, $sb.ToString(), [System.Text.Encoding]::UTF8)

    $finalSizeKB = [math]::Round($totalBytes / 1KB, 2)
    $estimatedTokens = [math]::Ceiling($totalBytes / 4)
    $tokenPercent = [math]::Round($estimatedTokens / 128000 * 100, 2)
    
    Write-Host "`nCombined file created at: $OutputFile" -ForegroundColor Green
    Write-Host "Total size: $finalSizeKB KB  ~${estimatedTokens} tokens (${tokenPercent}% of 128K context)`n" -ForegroundColor Magenta
}
catch {
    Write-Error "Fatal: $_"
}