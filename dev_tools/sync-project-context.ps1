[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$MyDriveRoot,
    [string]$LogDirectory = (Join-Path $env:LOCALAPPDATA 'Yasnomera\ProjectContextMirror'),
    [string]$GitExecutable = (Get-Command git.exe -CommandType Application -ErrorAction Stop).Source
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$origin = 'https://github.com/Porfhub/my_calculator.git'
$service = Join-Path $env:LOCALAPPDATA 'Yasnomera\ProjectContextMirror'
$cache = Join-Path $service 'main.git'
$required = @{
    'project-context' = @('PROJECT_OVERVIEW', '00_PROJECT_MASTER_STATUS', '01_DECISION_LOG',
        '02_TECHNICAL_HANDOFF', '03_CONTEXT_MIRROR_RUNBOOK', '04_CHATGPT_PROJECT_SOURCES')
    'pages' = @('README', 'mortgage', 'rent-vs-mortgage', 'time-is-money', 'honest-credit',
        'millionaire', 'financial-freedom', 'inflation-shredder', 'car-vs-taxi', 'genetic-wealth', 'wealth')
}
$temporary = [Collections.Generic.List[string]]::new()
$stage = $null
$lock = $null
$logFile = $null
$sha = '-'
$verified = 0

function Assert-PlainPath([string]$Path) {
    $parent = [IO.Path]::GetDirectoryName($Path)
    if ($parent) { Assert-PlainPath $parent }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing reparse point: $Path"
    }
}

function Invoke-Git([string[]]$GitArguments) {
    $output = & $GitExecutable -c http.sslVerify=true -c http.followRedirects=false -c http.lowSpeedLimit=1 -c http.lowSpeedTime=30 @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed (exit $LASTEXITCODE): $($GitArguments -join ' ')" }
    $output
}

function Get-Sha256([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Publish-File([string]$From, [string]$To, [bool]$Replace) {
    Assert-PlainPath $From
    Assert-PlainPath $To
    # Rename within one directory, without copy/delete fallback across volumes.
    if (-not [YasnomeraMirror.FileMove]::MoveFileEx($From, $To, [int]$Replace)) {
        $cause = [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
        throw "Cannot publish '$To': $($cause.Message)"
    }
}

try {
    $LogDirectory = [IO.Path]::GetFullPath($LogDirectory)
    Assert-PlainPath $LogDirectory
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    $logFile = Join-Path $LogDirectory 'sync.log'
    $lastSuccess = Join-Path $LogDirectory 'last-success.json'
    Assert-PlainPath $logFile
    Assert-PlainPath $lastSuccess

    Assert-PlainPath $service
    New-Item -ItemType Directory -Path $service -Force | Out-Null
    $lockFile = Join-Path $service 'sync.lock'
    Assert-PlainPath $lockFile
    $lock = [IO.File]::Open($lockFile, 'OpenOrCreate', 'ReadWrite', 'None')
    $driveRoot = [IO.Path]::GetFullPath($MyDriveRoot).TrimEnd('\')
    if ($driveRoot -notmatch '^G:\\[^\\]+$') {
        throw 'MyDriveRoot must be a folder directly under the G: mount.'
    }
    Assert-PlainPath $driveRoot
    if (-not (Test-Path -LiteralPath $driveRoot -PathType Container)) {
        throw "Google Drive unavailable: $driveRoot"
    }

    # The scheduled action runs a separate PowerShell process.
    Get-ChildItem Env: | Where-Object Name -Like 'GIT_*' | ForEach-Object {
        Remove-Item -LiteralPath "Env:$($_.Name)"
    }
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GIT_CONFIG_NOSYSTEM = '1'
    $env:GIT_CONFIG_GLOBAL = 'NUL'
    $env:GIT_NO_REPLACE_OBJECTS = '1'
    Assert-PlainPath $cache
    if (-not (Test-Path -LiteralPath $cache)) {
        Invoke-Git @('init', '--bare', '--template=', $cache) | Out-Null
        Invoke-Git @('--git-dir', $cache, 'remote', 'add', 'origin', $origin)
    }
    # Git walks its object and ref directories itself. Inspect them without
    # traversing directory junctions or symlinks.
    $directories = [Collections.Generic.Stack[string]]::new()
    $directories.Push($cache)
    while ($directories.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $directories.Pop() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing reparse point in Git cache: $($item.FullName)"
            }
            if ($item.PSIsContainer) { $directories.Push($item.FullName) }
        }
    }
    foreach ($path in @('commondir', 'objects/info/alternates', 'objects/info/http-alternates')) {
        $candidate = Join-Path $cache $path
        Assert-PlainPath $candidate
        if (Test-Path -LiteralPath $candidate) { throw "Unexpected Git storage redirect: $path" }
    }
    if ((Invoke-Git @('--git-dir', $cache, 'rev-parse', '--is-bare-repository')) -cne 'true' -or
        (@(Invoke-Git @('--git-dir', $cache, 'config', '--local', '--get-all', 'remote.origin.url')) -join [char]10) -cne $origin -or
        (Invoke-Git @('--git-dir', $cache, 'remote', 'get-url', 'origin')) -cne $origin) {
        throw 'Service repository is not bare or origin differs from the expected URL.'
    }

    Invoke-Git @('--git-dir', $cache, 'fetch', '--no-tags', '--no-recurse-submodules', 'origin', 'refs/heads/main') | Out-Null
    $fetchHead = Join-Path $cache 'FETCH_HEAD'
    Assert-PlainPath $fetchHead
    $fetched = @(Get-Content -LiteralPath $fetchHead)
    if ($fetched.Count -ne 1 -or $fetched[0] -cnotmatch '^([0-9a-f]{40})\t\tbranch ''main'' of ') {
        throw 'Git did not fetch a single main branch commit.'
    }
    $sha = $Matches[1]
    if ((Invoke-Git @('--git-dir', $cache, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}')) -cne $sha) {
        throw 'Fetched main does not resolve to the expected commit.'
    }

    $documents = [ordered]@{}
    foreach ($group in @('project-context', 'pages')) {
        foreach ($line in @(Invoke-Git @('--git-dir', $cache, 'ls-tree', $sha, "docs/$group/"))) {
            if ($line -cnotmatch '\.md$') { continue }
            if ($line -cnotmatch "^100644 blob ([0-9a-f]{40})\tdocs/$group/([A-Za-z0-9_-]+\.md)$") {
                throw "Unexpected Markdown path or Git mode under docs/$group."
            }
            $name = $Matches[2]
            $blob = $Matches[1]
            if ($name -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])\.') { throw "Reserved filename: $name" }
            $key = "docs/$group/$name"
            if ($documents.Contains($key)) { throw "Duplicate Windows filename: $key" }
            $documents.Add($key, [pscustomobject]@{ Group = $group; Name = $name; Blob = $blob })
        }
        foreach ($name in $required[$group]) {
            if (@($documents.Keys) -cnotcontains "docs/$group/$name.md") {
                throw "Incomplete main snapshot: missing docs/$group/$name.md"
            }
        }
    }

    $stage = Join-Path $service ('stage-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    $archive = Join-Path $stage 'main.zip'
    $temporary.Add($archive)
    Invoke-Git (@('--git-dir', $cache, 'archive', '--format=zip', "--output=$archive", $sha, '--') + @($documents.Keys)) | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $plan = [Collections.Generic.List[object]]::new()
    $destination = Join-Path $driveRoot 'Ясномера - Project Context'
    $pages = Join-Path $destination 'pages'

    try {
        foreach ($key in $documents.Keys) {
            $document = $documents[$key]
            $entry = $zip.GetEntry($key)
            if (-not $entry) { throw "Archive is missing $key" }
            $local = Join-Path $stage ($document.Group + '-' + $document.Name)
            $temporary.Add($local)
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $local)
            if ((Invoke-Git @('--git-dir', $cache, 'hash-object', '--no-filters', '--', $local)) -cne $document.Blob) {
                throw "Archive content differs from the Git blob: $key"
            }
            $content = $utf8.GetString([IO.File]::ReadAllBytes($local)).TrimStart([char]0xFEFF)
            if ([string]::IsNullOrWhiteSpace($content) -or $content.Contains([char]0)) {
                throw "Empty or invalid Markdown: $key"
            }
            $parent = if ($document.Group -eq 'pages') { $pages } else { $destination }
            $target = Join-Path $parent $document.Name
            Assert-PlainPath $target
            $existing = Test-Path -LiteralPath $target -PathType Leaf
            if (-not $existing -and (Test-Path -LiteralPath $target)) { throw "Expected a file: $target" }
            $hash = Get-Sha256 $local
            $changed = -not $existing -or (Get-Sha256 $target) -ne $hash
            $plan.Add([pscustomobject]@{
                Source = $local; Target = $target; Parent = $parent; Hash = $hash
                Existing = $existing; Changed = $changed; Pending = $null
            })
        }
    } finally { $zip.Dispose() }

    # Validate the complete source and target set before writing any Drive files.
    Add-Type -Namespace YasnomeraMirror -Name FileMove -MemberDefinition '[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool MoveFileEx(string existingPath, string newPath, int flags);'
    foreach ($directory in @($destination, $pages)) {
        Assert-PlainPath $directory
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    foreach ($file in $plan) {
        if (-not $file.Changed) { continue }
        $file.Pending = Join-Path $file.Parent ('.yasnomera-' + [guid]::NewGuid().ToString('N') + '.tmp')
        Assert-PlainPath $file.Pending
        $pendingStream = [IO.File]::Open($file.Pending, 'CreateNew', 'Write', 'None')
        $temporary.Add($file.Pending)
        try {
            $localStream = [IO.File]::OpenRead($file.Source)
            try { $localStream.CopyTo($pendingStream) } finally { $localStream.Dispose() }
        } finally { $pendingStream.Dispose() }
        if ((Get-Sha256 $file.Pending) -ne $file.Hash) { throw "Copy verification failed: $($file.Target)" }
    }

    $copied = 0
    foreach ($file in $plan) {
        if (-not $file.Changed) { continue }
        Publish-File $file.Pending $file.Target $file.Existing
        $copied++
    }
    foreach ($file in $plan) {
        Assert-PlainPath $file.Target
        if ((Get-Sha256 $file.Target) -ne $file.Hash) { throw "Final readback differs: $($file.Target)" }
        $verified++
    }

    $success = [ordered]@{
        last_successful_sync_at = [DateTime]::UtcNow.ToString('o')
        git_sha = $sha
        source = "$origin refs/heads/main"
        destination = $destination
        verified_files = $verified
        copied_files = $copied
    }
    $receipt = Join-Path $LogDirectory ('.last-success-' + [guid]::NewGuid().ToString('N') + '.tmp')
    $temporary.Add($receipt)
    $success | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
    Invoke-Git @('--git-dir', $cache, 'update-ref', 'refs/yasnomera/last-success', $sha) | Out-Null
    Publish-File $receipt $lastSuccess (Test-Path -LiteralPath $lastSuccess -PathType Leaf)
    Add-Content -LiteralPath $logFile -Encoding UTF8 -Value "$($success.last_successful_sync_at) SUCCESS sha=$sha verified=$verified copied=$copied"
    Write-Output ($success | ConvertTo-Json -Compress)
    exit 0
} catch {
    $failure = "$([DateTime]::UtcNow.ToString('o')) FAILURE sha=$sha verified=$verified $($_.Exception.Message)"
    [Console]::Error.WriteLine($failure)
    if ($logFile) {
        try {
            Assert-PlainPath $logFile
            Add-Content -LiteralPath $logFile -Encoding UTF8 -Value $failure
        } catch { [Console]::Error.WriteLine($_.Exception.Message) }
    }
    exit 1
} finally {
    foreach ($path in $temporary) {
        try {
            Assert-PlainPath $path
            if (Test-Path -LiteralPath $path -PathType Leaf) { [IO.File]::Delete($path) }
        } catch { [Console]::Error.WriteLine("Temporary file cleanup failed: $path ($($_.Exception.Message))") }
    }
    if ($stage) {
        try {
            Assert-PlainPath $stage
            [IO.Directory]::Delete($stage, $false)
        } catch { [Console]::Error.WriteLine("Stage cleanup failed: $stage ($($_.Exception.Message))") }
    }
    if ($lock) { $lock.Dispose() }
}
