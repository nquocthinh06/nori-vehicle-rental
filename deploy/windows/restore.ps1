<#
.SYNOPSIS
    Khôi phục an toàn cơ sở dữ liệu và media từ bản sao lưu trên Windows Home Server.
#>
param(
    [string]$Source = "",
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "       NORI — KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU          " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "[CANH BAO] Thao tac khoi phuc se ghi de len co so du lieu hien tai!" -ForegroundColor Red

if (-not $Force) {
    $confirm = Read-Host "Ban co chac chan muon khoi phuc khong? (Nhap YES de xac nhan)"
    if ($confirm -ne "YES") {
        Write-Host "[ABORTED] Da huy thao tac khoi phuc." -ForegroundColor Yellow
        exit 0
    }
}

# Tao ban backup an toan truoc khi restore de chong mat mat
Write-Host "`n[1/2] Dang tao ban snapshot du phong truoc khi khoi phuc..." -ForegroundColor Cyan
node scripts/backup-db.mjs

Write-Host "`n[2/2] Dang tien hanh khoi phuc..." -ForegroundColor Cyan
$args = @("scripts/restore-db.mjs")
if ($Source) {
    $args += @("--source", $Source)
}

node $args
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[OK] Khoi phuc thanh cong! Hay khoi dong lai ung dung de ap dung." -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Khoi phuc that bai!" -ForegroundColor Red
    exit 1
}
