param(
  [string]$TaskName = 'NORI-Daily-Backup-2359',
  [string]$TriggerTime = '23:59',
  [switch]$WakeToRun,
  [switch]$Unregister,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunnerPath = (Resolve-Path (Join-Path $ScriptDir 'run-daily-backup.ps1')).Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

if ($Status) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Output "Task '$TaskName' is NOT registered."
    exit 1
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Output "TaskName:      $($task.TaskName)"
  Write-Output "State:         $($task.State)"
  Write-Output "StartWhenAvail:$($task.Settings.StartWhenAvailable)"
  Write-Output "WakeToRun:     $($task.Settings.WakeToRun)"
  Write-Output "NextRunTime:   $($info.NextRunTime)"
  Write-Output "LastRunTime:   $($info.LastRunTime)"
  Write-Output "LastResult:    $($info.LastTaskResult)"
  exit 0
}

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Unregistered scheduled task '$TaskName'."
  exit 0
}

$actionArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime

$settingsParams = @{
  StartWhenAvailable       = $true
  AllowStartIfOnBatteries  = $true
  DontStopIfGoingOnBatteries = $true
  ExecutionTimeLimit       = (New-TimeSpan -Hours 2)
  MultipleInstances        = 'IgnoreNew'
}
if ($WakeToRun) {
  $settingsParams['WakeToRun'] = $true
}
$settings = New-ScheduledTaskSettingsSet @settingsParams

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'NORI Vehicle Rental daily encrypted PostgreSQL + Media backup at 23:59 Asia/Ho_Chi_Minh with catch-up on wake/login.' `
  -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Output "Registered '$($registered.TaskName)' (State=$($registered.State), StartWhenAvailable=$($registered.Settings.StartWhenAvailable), NextRunTime=$($info.NextRunTime))"
exit 0
