[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$MyDriveRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskName = 'Yasnomera Project Context Mirror'
$syncScript = Join-Path $PSScriptRoot 'sync-project-context.ps1'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$git = (Get-Command git.exe -CommandType Application).Source
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$service = Join-Path $env:LOCALAPPDATA 'Yasnomera\ProjectContextMirror'
$MyDriveRoot = [IO.Path]::GetFullPath($MyDriveRoot).TrimEnd('\')
if ($MyDriveRoot -notmatch '^G:\\[^\\"]+$') { throw 'Expected a My Drive folder directly under G:.' }

function Assert-PlainPath([string]$Path) {
    $parent = [IO.Path]::GetDirectoryName($Path)
    if ($parent) { Assert-PlainPath $parent }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing reparse point: $Path"
    }
}

function Test-TaskOwner([string]$UserId) {
    if ($UserId -eq $identity.User.Value) { return $true }
    try {
        $account = [Security.Principal.NTAccount]::new($UserId)
        return $account.Translate([Security.Principal.SecurityIdentifier]).Value -eq $identity.User.Value
    } catch { return $false }
}

function Read-MirrorTask {
    $tasks = @(Get-ScheduledTask | Where-Object { $_ -and $_.TaskName -eq $taskName })
    if ($tasks.Count -gt 1 -or ($tasks.Count -eq 1 -and $tasks[0].TaskPath -ne '\')) {
        throw "Ambiguous task '$taskName'. Inspect Task Scheduler before migrating."
    }
    $tasks
}

Assert-PlainPath $syncScript
Assert-PlainPath $service
$hash = (Get-FileHash -LiteralPath $syncScript -Algorithm SHA256).Hash
$runner = Join-Path $service "runner-$hash.ps1"
Assert-PlainPath $runner
$prefix = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File'
$arguments = '{0} "{1}" -MyDriveRoot "{2}" -GitExecutable "{3}"' -f $prefix, $runner, $MyDriveRoot, $git
$existing = Read-MirrorTask
$oldArguments = $null

if ($existing) {
    $existing | Select-Object TaskName, TaskPath, State, Actions, Triggers, Principal | Format-List | Out-Host
    $actions = @($existing.Actions)
    if ($existing.State -in @('Running', 'Disabled') -or $actions.Count -ne 1 -or
        $actions[0].Execute -ine $powerShell -or
        -not (Test-TaskOwner $existing.Principal.UserId) -or
        $existing.Principal.LogonType -ne 'Interactive' -or $existing.Principal.RunLevel -ne 'Limited') {
        throw "Unexpected task configuration for '$taskName'. Inspect it before migrating."
    }
    $oldArguments = $actions[0].Arguments
    $legacyPattern = '^' + [regex]::Escape($prefix) +
        ' "([A-Za-z]:\\[^"]+\\dev_tools\\sync-project-context\.ps1)" -MyDriveRoot "' +
        [regex]::Escape($MyDriveRoot) + '"$'
    $installedPattern = '^' + [regex]::Escape($prefix + ' "' + $service + '\runner-') +
        '[A-F0-9]{64}\.ps1" -MyDriveRoot "' + [regex]::Escape($MyDriveRoot) + '" -GitExecutable "[^"]+"$'
    if ($oldArguments -match $legacyPattern) {
        $oldScript = $Matches[1]
        Assert-PlainPath $oldScript
        $oldRepo = Split-Path -Parent (Split-Path -Parent $oldScript)
        $oldOrigin = & $git -C $oldRepo config --local --get remote.origin.url
        if ($LASTEXITCODE -ne 0 -or $oldOrigin -cne 'https://github.com/Porfhub/my_calculator.git') {
            throw 'The previous action is not backed by the expected Yasnomera checkout.'
        }
    } elseif ($oldArguments -notmatch $installedPattern) {
        throw "Unrecognized existing action for '$taskName'. Inspect it before migrating."
    }
}

New-Item -ItemType Directory -Path $service -Force | Out-Null
if (-not (Test-Path -LiteralPath $runner)) { [IO.File]::Copy($syncScript, $runner, $false) }
if ((Get-FileHash -LiteralPath $runner -Algorithm SHA256).Hash -ne $hash) { throw 'Installed script failed SHA-256 verification.' }

# Verify a complete real run before replacing the action. The old task is retained if it fails.
& $powerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -MyDriveRoot $MyDriveRoot -GitExecutable $git
if ($LASTEXITCODE -ne 0) { throw 'Initial mirror verification failed. Task configuration was not changed.' }

$current = Read-MirrorTask
if ([bool]$existing -ne [bool]$current -or ($current -and (
    $current.State -in @('Running', 'Disabled') -or @($current.Actions).Count -ne 1 -or
    $current.Actions[0].Arguments -cne $oldArguments -or $current.Actions[0].Execute -ine $powerShell -or
    -not (Test-TaskOwner $current.Principal.UserId) -or
    $current.Principal.LogonType -ne 'Interactive' -or $current.Principal.RunLevel -ne 'Limited'))) {
    throw 'Task changed during installation. Retry after inspecting its configuration.'
}

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
if ($existing) {
    if ($oldArguments -cne $arguments) {
        Set-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action | Out-Null
    }
} else {
    $triggers = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $identity.Name),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15))
    )
    $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'One-way verified Markdown mirror from GitHub main to My Drive.' | Out-Null
}
Get-ScheduledTask -TaskName $taskName -TaskPath '\' | Select-Object TaskName, State, Actions, Triggers, Principal
