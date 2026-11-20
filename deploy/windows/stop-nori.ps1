<#
.SYNOPSIS
    Dừng tiến trình NORI Server trên Windows Home Server.
#>
param(
    [int]$Port = 3000
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

Write-Host "Dang tim tien trinh dang lang nghe tren cong $Port..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
if (-not $connections) {
    Write-Host "[INFO] Khong co tien trinh nao dang lang nghe tren cong $Port." -ForegroundColor Green
    exit 0
}

foreach ($conn in $connections) {
    $procId = $conn.OwningProcess
    try {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "Dang dung tien trinh $($p.ProcessName) (PID=$procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force
            Write-Host "[OK] Da dung tien trinh PID=$procId thanh cong!" -ForegroundColor Green
        }
    } catch {
        Write-Host "[WARN] Khong the dung tien trinh PID=$procId: $($_.Exception.Message)" -ForegroundColor Red
    }
}
