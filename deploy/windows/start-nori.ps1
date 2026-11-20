<#
.SYNOPSIS
    Khởi động ứng dụng NORI trên Windows Home Server ở chế độ Production Standalone.
#>
param(
    [switch]$Background = $false,
    [string]$Port = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       NORI VEHICLE RENTAL — HOME SERVER STARTUP        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Thu muc du an: $ProjectRoot"

# 1. Kiem tra file .env
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] Chua co file .env! Dang tao file tu .env.example..." -ForegroundColor Red
    node scripts/setup.mjs
}

# 2. Chay kiem tra moi truong
Write-Host "[1/3] Kiem tra cau hinh moi truong..." -ForegroundColor Yellow
node scripts/validate-env.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[BLOCKED] Moi truong chua dat chuan! Kiem tra cac loi tren." -ForegroundColor Red
    exit 1
}

# 3. Kiem tra database schema va migration
Write-Host "[2/3] Kiem tra schema database..." -ForegroundColor Yellow
node scripts/check-db-schema.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[SETUP] Running pnpm db:migrate..." -ForegroundColor Yellow
    pnpm db:migrate
}

# 4. Kiem tra bundle standalone
$serverEntry = Join-Path $ProjectRoot ".next\standalone\server.js"
if (-not (Test-Path $serverEntry)) {
    Write-Host "[BUILD] Chua co bundle production. Dang build pnpm build..." -ForegroundColor Yellow
    pnpm build
}

# 5. Khoi dong server
Write-Host "[3/3] Khoi dong server NORI..." -ForegroundColor Green
if ($Port) {
    $env:PORT = $Port
}

if ($Background) {
    Write-Host "Dang khoi chay ngam (Background Process)..." -ForegroundColor Cyan
    $logFile = Join-Path $ProjectRoot "logs\nori-server.log"
    $errFile = Join-Path $ProjectRoot "logs\nori-error.log"
    $logsDir = Join-Path $ProjectRoot "logs"
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

    $proc = Start-Process node -ArgumentList "scripts/start-standalone.mjs" -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
    Write-Host "[OK] NORI Server dang chay ngam voi PID=$($proc.Id)" -ForegroundColor Green
    Write-Host "Log xem tai: $logFile"
} else {
    node scripts/start-standalone.mjs
}
