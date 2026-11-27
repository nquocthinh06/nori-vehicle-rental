param(
  [switch]$AllowUnencryptedDev,
  [switch]$SkipMedia
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
Set-Location $RepoRoot

$LogDir = Join-Path $RepoRoot 'logs'
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = Join-Path $LogDir 'backup-scheduler.log'

$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
$nowHcm = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$stamp = $nowHcm.ToString('yyyy-MM-dd HH:mm:ss') + ' +07:00'

function Write-Log([string]$Message) {
  $line = "[$stamp] $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Output $line
}

Write-Log '=== Starting NORI Daily Automated Backup ==='

$backupArgs = @('scripts/pg-backup.mjs')
if ($AllowUnencryptedDev) {
  $backupArgs += '--allow-unencrypted-dev'
}

& node @backupArgs 2>&1 | ForEach-Object {
  $txt = "$_"
  if ($txt -notmatch 'password=|token=|postgresql://[^@]+@') {
    Add-Content -Path $LogFile -Value "  $txt" -Encoding UTF8
  }
}
if ($LASTEXITCODE -ne 0) {
  Write-Log "[ERROR] pg-backup exited with code $LASTEXITCODE"
  exit $LASTEXITCODE
}

$verifyArgs = @('scripts/pg-backup-verify.mjs')
if ($AllowUnencryptedDev) {
  $verifyArgs += '--allow-unencrypted-dev'
}
& node @verifyArgs 2>&1 | ForEach-Object {
  Add-Content -Path $LogFile -Value "  $_" -Encoding UTF8
}
if ($LASTEXITCODE -ne 0) {
  Write-Log "[ERROR] pg-backup-verify exited with code $LASTEXITCODE"
  exit $LASTEXITCODE
}

if (-not $SkipMedia) {
  & node scripts/media-backup.mjs 2>&1 | ForEach-Object {
    Add-Content -Path $LogFile -Value "  $_" -Encoding UTF8
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Log "[ERROR] media-backup exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
  & node scripts/media-backup.mjs --verify 2>&1 | ForEach-Object {
    Add-Content -Path $LogFile -Value "  $_" -Encoding UTF8
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Log "[ERROR] media-backup --verify exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
}

Write-Log '=== NORI Daily Automated Backup COMPLETED ==='
exit 0
