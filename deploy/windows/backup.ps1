<#
.SYNOPSIS
    Tạo bản sao lưu toàn diện (Database SQLite Hot Backup + Media + Checksum) trên Windows Home Server.
#>
param(
    [string]$OutDir = "",
    [int]$Keep = 14
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       NORI — SAO LƯU DỮ LIỆU TOÀN DIỆN (WINDOWS)       " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$args = @("scripts/backup-db.mjs", "--keep", $Keep)
if ($OutDir) {
    $args += @("--out-dir", $OutDir)
}

node $args
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Sao luu thanh cong! Du lieu duoc bao toan an toan." -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Sao luu that bai! Kiem tra log chi tiet." -ForegroundColor Red
    exit 1
}
