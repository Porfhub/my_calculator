[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$MyDriveRoot)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskName = 'Yasnomera Project Context Mirror'
$syncScript = Join-Path $PSScriptRoot 'sync-project-context.ps1'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

# Verify the source, destination and actual copy before installing any persistent task.
& $powerShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $syncScript -MyDriveRoot $MyDriveRoot
if ($LASTEXITCODE -ne 0) { throw 'Initial mirror verification failed; task not registered.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powerShell -Argument (
    '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -MyDriveRoot "{1}"' -f $syncScript, $MyDriveRoot
)
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $user),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15))
)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    throw "Task '$taskName' already exists. Inspect its action and triggers before changing it."
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Principal $principal `
    -Settings $settings -Description 'One-way Markdown documentation mirror from my_calculator/docs/project-context to its dedicated My Drive folder. No deletion or reverse sync.' | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State, Actions, Triggers, Principal
