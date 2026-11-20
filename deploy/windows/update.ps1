<#
.SYNOPSIS
    Cập nhật an toàn source code NORI trên Windows Home Server từ GitHub:
    Kiểm tra git -> Backup dữ liệu -> Pull code -> Migration -> Build -> Restart -> Health Check.
#>
param(
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       NORI HOME SERVER — QUY TRÌNH CẬP NHẬT AN TOÀN    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Kiem tra git status - khong ghi de uncommitted changes
Write-Host "[1/6] Kiem tra trang thai Git..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "[ERROR] May chu Home Server dang co file bi sua doi chua commit!" -ForegroundColor Red
    Write-Host "Khong the tu dong pull vi nguy co mat du lieu. Vui long kiem tra bang 'git status'." -ForegroundColor Red
    exit 1
}

# 2. Tao hot backup truoc khi nang cap
Write-Host "[2/6] Tao backup du phong truoc khi nang cap..." -ForegroundColor Yellow
node scripts/backup-db.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Khong the tao backup. Dung quy trinh cap nhat de dam bao toan ven du lieu!" -ForegroundColor Red
    exit 1
}

# 3. Pull code moi tu branch chi dinh
Write-Host "[3/6] Dang pull code moi nhat tu origin/$Branch..." -ForegroundColor Yellow
git fetch origin $Branch
git checkout $Branch
git pull origin $Branch

# 4. Cai dat dependencies theo lockfile
Write-Host "[4/6] Kiem tra va cap nhat dependencies (pnpm install --frozen-lockfile)..." -ForegroundColor Yellow
pnpm install --frozen-lockfile

# 5. Chay database migration neu co migration moi
Write-Host "[5/6] Kiem tra va ap dung migrations..." -ForegroundColor Yellow
pnpm db:migrate

# 6. Build Production Standalone
Write-Host "[6/6] Build production artifact (pnpm build)..." -ForegroundColor Yellow
pnpm build

# 7. Restart Server va Health Check
Write-Host "`nDang khoi dong lai tien trinh NORI..." -ForegroundColor Green
& "$ScriptDir\stop-nori.ps1"
Start-Sleep -Seconds 2
& "$ScriptDir\start-nori.ps1" -Background

Start-Sleep -Seconds 4
Write-Host "`nKiem tra Health Check..." -ForegroundColor Yellow
node scripts/healthcheck.mjs

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "       CAP NHAT HE THONG THANH CONG VA DA SAN SANG!     " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
