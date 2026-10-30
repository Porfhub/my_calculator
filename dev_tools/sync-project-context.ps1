[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MyDriveRoot,
    [string]$LogDirectory = (Join-Path $env:LOCALAPPDATA 'Yasnomera\ProjectContextMirror')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $repository 'docs\project-context'
$folderName = 'Ясномера - Project Context'
$requiredFiles = @('00_PROJECT_MASTER_STATUS.md', '01_DECISION_LOG.md', '02_TECHNICAL_HANDOFF.md')
$temporaryFile = $null

function Assert-PlainItem([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing reparse point: $Path"
    }
}

try {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    $logFile = Join-Path $LogDirectory 'sync.log'
    $driveRoot = [IO.Path]::GetFullPath($MyDriveRoot).TrimEnd('\')
    # Only an explicitly supplied My Drive folder immediately beneath the inspected G: mount.
    if ($driveRoot -notmatch '^G:\\[^\\]+$') {
        throw 'MyDriveRoot must be a folder directly under the G: mount, never the drive root.'
    }
    $destination = Join-Path $driveRoot $folderName
    if (-not (Test-Path -LiteralPath $driveRoot -PathType Container)) {
        throw "Google Drive unavailable: $driveRoot. Existing mirror retained."
    }
    Assert-PlainItem $driveRoot
    Assert-PlainItem $source
    foreach ($name in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $name) -PathType Leaf)) {
            throw "Incomplete authoritative source: missing $name. Existing mirror retained."
        }
    }
    $files = @(Get-ChildItem -LiteralPath $source -File -Filter '*.md')
    foreach ($file in $files) { Assert-PlainItem $file.FullName }

    if (Test-Path -LiteralPath $destination) { Assert-PlainItem $destination }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $copied = 0
    foreach ($file in $files) {
        $target = Join-Path $destination $file.Name
        if (Test-Path -LiteralPath $target) { Assert-PlainItem $target }
        $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ((Test-Path -LiteralPath $target -PathType Leaf) -and
            (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $sourceHash) { continue }

        $temporaryFile = Join-Path $destination ('.' + $file.Name + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
        Copy-Item -LiteralPath $file.FullName -Destination $temporaryFile
        if ((Get-FileHash -LiteralPath $temporaryFile -Algorithm SHA256).Hash -ne $sourceHash) {
            throw "Copy verification failed: $($file.Name)"
        }
        Move-Item -LiteralPath $temporaryFile -Destination $target -Force
        $temporaryFile = $null
        $copied++
    }
    # A success requires readback of every source file, including ones already up to date.
    foreach ($file in $files) {
        $target = Join-Path $destination $file.Name
        if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne
            (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) {
            throw "Final readback differs: $($file.Name)"
        }
    }
    $success = [ordered]@{
        last_successful_sync_at = [DateTime]::UtcNow.ToString('o')
        source = $source
        destination = $destination
        verified_files = $files.Count
        copied_files = $copied
    }
    $success | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $LogDirectory 'last-success.json') -Encoding UTF8
    Add-Content -LiteralPath $logFile -Encoding UTF8 -Value "$($success.last_successful_sync_at) SUCCESS verified=$($files.Count) copied=$copied"
    Write-Output ($success | ConvertTo-Json -Compress)
    exit 0
} catch {
    $failure = "$([DateTime]::UtcNow.ToString('o')) FAILURE $($_.Exception.Message)"
    if (Test-Path -LiteralPath $LogDirectory -PathType Container) {
        Add-Content -LiteralPath (Join-Path $LogDirectory 'sync.log') -Encoding UTF8 -Value $failure
    }
    [Console]::Error.WriteLine($failure)
    exit 1
} finally {
    # Only this run's temporary copy, always directly inside the dedicated destination.
    if ($temporaryFile -and (Test-Path -LiteralPath $temporaryFile)) {
        Remove-Item -LiteralPath $temporaryFile -Force
    }
}
