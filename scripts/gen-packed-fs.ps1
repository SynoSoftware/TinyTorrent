param(
    [Parameter(Mandatory = $true)][string]$InputDir,
    [Parameter(Mandatory = $true)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'

$lockStream = $null
$lockAcquired = $false
$waitMs = 200
$maxAttempts = 300
$lockPath = $null

try {
    if (-not (Test-Path -LiteralPath $InputDir -PathType Container)) {
        Write-Host "Warning: InputDir '$InputDir' does not exist; emitting empty packed fs stub." -ForegroundColor Yellow
        $files = @()
    }
    else {
        $files = Get-ChildItem -LiteralPath $InputDir -Recurse -File | Sort-Object FullName
    }

    $outputDir = Split-Path -Parent $OutputFile
    $outBin = Join-Path $outputDir 'tt_packed_fs.bin'

    $entries = @()
    $offset = 0
    $buffer = New-Object System.Collections.Generic.List[byte]
    $epoch = [datetime]"1970-01-01T00:00:00Z"

    foreach ($f in $files) {
        $relPath = $f.FullName.Substring($InputDir.Length).TrimStart('\', '/')
        $relPath = $relPath -replace '\\', '/'
        $urlPath = '/' + $relPath

        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $mtime =
            [int64]([Math]::Floor(($f.LastWriteTimeUtc - $epoch).TotalSeconds))
        $entries += [pscustomobject]@{
            Name   = $urlPath
            Offset = $offset
            Size   = $bytes.Length
            Mtime  = $mtime
        }
        $offset += $bytes.Length
        $buffer.AddRange($bytes)
    }

    if ($outputDir -and -not (Test-Path -LiteralPath $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }

    $lockPath = Join-Path $outputDir 'tt_packed_fs.lock'
    for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
        try {
            $lockStream = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
            $lockAcquired = $true
            break
        }
        catch [System.IO.IOException] {
            Start-Sleep -Milliseconds $waitMs
        }
    }

    $callbackDuration = $waitMs * $maxAttempts
    if (-not $lockAcquired) {
        Write-Error "Unable to acquire frontend sync lock after $([Math]::Round($callbackDuration / 1000, 1)) seconds."
        exit 1
    }

    $newBinBytes = $buffer.ToArray()
    $binChanged = $true
    if (Test-Path -LiteralPath $outBin) {
        $existingBytes = $null
        try {
            $existingBytes = [System.IO.File]::ReadAllBytes($outBin)
        }
        catch {
            $existingBytes = $null
        }
        if ($existingBytes -and $existingBytes.Length -eq $newBinBytes.Length) {
            $equal = $true
            for ($i = 0; $i -lt $existingBytes.Length; $i++) {
                if ($existingBytes[$i] -ne $newBinBytes[$i]) {
                    $equal = $false
                    break
                }
            }
            if ($equal) {
                $binChanged = $false
            }
        }
    }
    if ($binChanged) {
        [System.IO.File]::WriteAllBytes($outBin, $newBinBytes)
    }

    $sb = New-Object System.Text.StringBuilder
    $null = $sb.AppendLine('/* Auto-generated. DO NOT EDIT. */')
    $null = $sb.AppendLine('#include <stddef.h>')
    $null = $sb.AppendLine('#include <string.h>')
    $null = $sb.AppendLine('#include <time.h>')
    $null = $sb.AppendLine('#include "tt_packed_fs_data.h"')
    $null = $sb.AppendLine('')
    $null = $sb.AppendLine('struct tt_packed_file { const char *name; size_t offset; size_t size; time_t mtime; };')
    $null = $sb.AppendLine('')
    $null = $sb.AppendLine('static const struct tt_packed_file tt_files[] = {')
    foreach ($e in $entries) {
        $line = ('  {{ "{0}", {1}u, {2}u, {3} }},' -f
                 $e.Name, $e.Offset, $e.Size, $e.Mtime)
        $null = $sb.AppendLine($line)
    }
    $null = $sb.AppendLine('};')
    $null = $sb.AppendLine('static const size_t tt_files_count = sizeof(tt_files) / sizeof(tt_files[0]);')
    $null = $sb.AppendLine('')
    $null = $sb.AppendLine('static const struct tt_packed_file *find_file(const char *path)')
    $null = $sb.AppendLine('{')
    $null = $sb.AppendLine('  if (path == NULL)')
    $null = $sb.AppendLine('    return NULL;')
    $null = $sb.AppendLine('  for (size_t i = 0; i < tt_files_count; ++i)')
    $null = $sb.AppendLine('  {')
    $null = $sb.AppendLine('    if (strcmp(tt_files[i].name, path) == 0)')
    $null = $sb.AppendLine('      return &tt_files[i];')
    $null = $sb.AppendLine('  }')
    $null = $sb.AppendLine('  return NULL;')
    $null = $sb.AppendLine('}')
    $null = $sb.AppendLine('')
    $null = $sb.AppendLine('const char *mg_unpack(const char *path, size_t *size, time_t *mtime)')
    $null = $sb.AppendLine('{')
    $null = $sb.AppendLine('  const struct tt_packed_file *entry = find_file(path);')
    $null = $sb.AppendLine('  if (entry == NULL)')
    $null = $sb.AppendLine('    return NULL;')
    $null = $sb.AppendLine('  const unsigned char *data = tt_packed_fs_data();')
    $null = $sb.AppendLine('  if (!data)')
    $null = $sb.AppendLine('    return NULL;')
    $null = $sb.AppendLine('  if (size)')
    $null = $sb.AppendLine('    *size = entry->size;')
    $null = $sb.AppendLine('  if (mtime)')
    $null = $sb.AppendLine('    *mtime = entry->mtime;')
    $null = $sb.AppendLine('  return (const char *)(data + entry->offset);')
    $null = $sb.AppendLine('}')
    $null = $sb.AppendLine('')
    $null = $sb.AppendLine('const char *mg_unlist(size_t no)')
    $null = $sb.AppendLine('{')
    $null = $sb.AppendLine('  return (no < tt_files_count) ? tt_files[no].name : NULL;')
    $null = $sb.AppendLine('}')
    $null = $sb.AppendLine('')

    $body = $sb.ToString()
    $cppChanged = $true
    if (Test-Path -LiteralPath $OutputFile) {
        $existingCpp = $null
        try {
            $existingCpp = [System.IO.File]::ReadAllText($OutputFile, (New-Object System.Text.UTF8Encoding($false)))
        }
        catch {
            $existingCpp = $null
        }
        if ($existingCpp -and $existingCpp -eq $body) {
            $cppChanged = $false
        }
    }
    if ($cppChanged) {
        [System.IO.File]::WriteAllText($OutputFile, $body, (New-Object System.Text.UTF8Encoding($false)))
    }

    if (-not $binChanged -and -not $cppChanged) {
        Write-Host "Packed filesystem already up to date." -ForegroundColor Yellow
    }
    else {
        Write-Host "Wrote packed filesystem: $OutputFile and binary data: $outBin" -ForegroundColor Green
    }
}
catch {
    Write-Error "gen-packed-fs failure: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($lockStream) {
        $lockStream.Close()
        $lockStream = $null
    }
    if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
}

exit 0
