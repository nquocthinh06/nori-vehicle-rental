@echo off
setlocal
echo ========================================================
echo    NORI VEHICLE RENTAL - CLOUDFLARE QUICK TUNNEL
echo ========================================================
echo [CHU Y] Quick Tunnel cung cap URL trycloudflare.com tam thoi.
echo Chi su dung cho DEMO / TESTING. Khong dung cho Production lau dai.
echo Khong chia se du lieu nhay cam hoac tai khoan production.
echo ========================================================

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay cloudflared.exe trong PATH!
    echo Vui long tai va cai dat Cloudflare Tunnel CLI tu:
    echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    pause
    exit /b 1
)

set PORT=3000
if not "%~1"=="" set PORT=%~1

echo.
echo Dang khoi dong Quick Tunnel den http://127.0.0.1:%PORT% ...
echo URL HTTPS cong khai se xuat hien ben duoi trong vai giay.
echo Nhan Ctrl+C de dung tunnel bat cu luc nao.
echo --------------------------------------------------------
cloudflared tunnel --url http://127.0.0.1:%PORT%
