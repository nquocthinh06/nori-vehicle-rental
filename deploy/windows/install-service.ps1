<#
.SYNOPSIS
    Cấu hình tự động khởi động NORI khi mở máy Windows Home Server (không cần mở màn hình terminal).
    Tuân thủ nguyên tắc quyền tối thiểu (Least Privilege), mặc định chạy dưới tài khoản người dùng hiện tại
    thay vì SYSTEM trừ khi được chỉ định rõ ràng.
.PARAMETER TaskName
    Tên của Task trong Task Scheduler (Mặc định: NORI_HomeServer).
.PARAMETER RunAs
    Chế độ tài khoản chạy dịch vụ: 'CurrentUser' (Quyền tối thiểu - Khuyến nghị), 'SYSTEM' hoặc 'ServiceAccount'.
.PARAMETER ServiceUser
    Tên tài khoản người dùng cụ thể khi chọn RunAs = 'ServiceAccount'.
.PARAMETER Uninstall
    Gỡ bỏ Task Scheduler đã đăng ký.
#>
param(
    [string]$TaskName = "NORI_HomeServer",
    [ValidateSet("CurrentUser", "SYSTEM", "ServiceAccount")]
    [string]$RunAs = "CurrentUser",
    [string]$ServiceUser = "",
    [switch]$Uninstall = $false
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       CẤU HÌNH TỰ KHỞI ĐỘNG WINDOWS TASK SCHEDULER     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Xử lý gỡ bỏ Task
if ($Uninstall) {
    Write-Host "[INFO] Dang kiem tra va go bo Scheduled Task '$TaskName'..." -ForegroundColor Yellow
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[OK] Da go bo thanh cong Task '$TaskName'!" -ForegroundColor Green
    } else {
        Write-Host "[INFO] Task '$TaskName' khong ton tai tren he thong." -ForegroundColor Green
    }
    exit 0
}

# 2. Kiểm tra node.exe
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Host "[ERROR] Khong tim thay node.exe trong PATH!" -ForegroundColor Red
    exit 1
}

$scriptPath = Join-Path $ProjectRoot "scripts\start-standalone.mjs"
if (-not (Test-Path $scriptPath)) {
    Write-Host "[ERROR] Khong tim thay scripts\start-standalone.mjs tai $ProjectRoot!" -ForegroundColor Red
    exit 1
}

Write-Host "Dang chuan bi Scheduled Task '$TaskName'..." -ForegroundColor Yellow
Write-Host "Che do tai khoan: $RunAs" -ForegroundColor Cyan

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "scripts/start-standalone.mjs" -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# 3. Cấu hình Principal theo nguyên tắc Least Privilege
if ($RunAs -eq "CurrentUser") {
    $currentUserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    Write-Host "[LEAST PRIVILEGE] Thiet lap chay duoi tai khoan hien tai: $currentUserName (Limited Privilege)" -ForegroundColor Green
    $principal = New-ScheduledTaskPrincipal -UserId $currentUserName -LogonType Interactive -RunLevel Limited
} elseif ($RunAs -eq "SYSTEM") {
    Write-Host "[WARN] Ban da chon chay duoi quyen cao nhat 'NT AUTHORITY\SYSTEM'!" -ForegroundColor Yellow
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} elseif ($RunAs -eq "ServiceAccount") {
    if (-not $ServiceUser) {
        Write-Host "[ERROR] Khi chon -RunAs ServiceAccount, vui long cung cap -ServiceUser <TenUser>!" -ForegroundColor Red
        exit 1
    }
    Write-Host "[INFO] Thiet lap chay duoi tai khoan dich vu: $ServiceUser" -ForegroundColor Cyan
    $principal = New-ScheduledTaskPrincipal -UserId $ServiceUser -LogonType S4U -RunLevel Limited
}

try {
    # Check if task already exists
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[INFO] Da go Task cu de cap nhat." -ForegroundColor Yellow
    }

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "NORI Vehicle Rental Home Server Service (Least Privilege: $RunAs)" | Out-Null

    Write-Host "[OK] Da tao thanh cong Windows Scheduled Task '$TaskName'!" -ForegroundColor Green
    Write-Host "Ung dung se tu dong chay ngam moi khi may tinh duoc bat hoac khoi dong lai." -ForegroundColor Green
    Write-Host "De quan ly hoac kiem tra, mo: Task Scheduler -> $TaskName"
    Write-Host "De go bo khi can: powershell .\deploy\windows\install-service.ps1 -Uninstall" -ForegroundColor Cyan
} catch {
    Write-Host "[ERROR] Khong the dang ky Task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Luu y: Can chay PowerShell voi quyen 'Run as Administrator' de dang ky Task Scheduler." -ForegroundColor Yellow
    exit 1
}
