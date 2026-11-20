@echo off
setlocal
echo ========================================================
echo    NORI VEHICLE RENTAL - CLOUDFLARE NAMED TUNNEL
echo ========================================================

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay cloudflared.exe trong PATH!
    pause
    exit /b 1
)

set CONFIG_FILE=%~dp0config.yml
if not exist "%CONFIG_FILE%" (
    echo [WARNING] Chua tim thay %CONFIG_FILE%
    echo Vui long copy tu config.yml.example va dien TUNNEL_ID cua ban.
    if "%~1"=="" (
        echo Hoac truyen Tunnel Name: run-named-tunnel.bat my-tunnel-name
        pause
        exit /b 1
    )
    cloudflared tunnel run %1
    exit /b %errorlevel%
)

echo Dang chay Cloudflare Named Tunnel voi file cau hinh: %CONFIG_FILE%
cloudflared tunnel --config "%CONFIG_FILE%" run
