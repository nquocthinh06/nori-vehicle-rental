#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo "   NORI VEHICLE RENTAL - CLOUDFLARE QUICK TUNNEL"
echo "========================================================"
echo "[CHÚ Ý] Quick Tunnel cung cấp URL trycloudflare.com tạm thời."
echo "Chỉ sử dụng cho DEMO / TESTING. Không dùng cho Production lâu dài."
echo "========================================================"

if ! command -v cloudflared &> /dev/null; then
    echo "[ERROR] Không tìm thấy cloudflared trong PATH!"
    echo "Vui lòng cài đặt: sudo apt-get install cloudflared hoặc tải từ:"
    echo "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
fi

PORT="${1:-3000}"

echo "Đang khởi động Quick Tunnel đến http://127.0.0.1:${PORT} ..."
echo "URL HTTPS công khai sẽ xuất hiện bên dưới trong vài giây."
echo "Nhấn Ctrl+C để dừng tunnel bất cứ lúc nào."
echo "--------------------------------------------------------"
cloudflared tunnel --url "http://127.0.0.1:${PORT}"
