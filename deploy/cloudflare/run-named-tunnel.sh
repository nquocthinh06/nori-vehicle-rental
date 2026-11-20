#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.yml"

echo "========================================================"
echo "   NORI VEHICLE RENTAL - CLOUDFLARE NAMED TUNNEL"
echo "========================================================"

if ! command -v cloudflared &> /dev/null; then
    echo "[ERROR] Không tìm thấy cloudflared trong PATH!"
    exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    if [[ -z "${1:-}" ]]; then
        echo "[ERROR] Chưa tìm thấy ${CONFIG_FILE}!"
        echo "Vui lòng copy từ config.yml.example hoặc chạy: $0 <tunnel-name>"
        exit 1
    fi
    exec cloudflared tunnel run "$1"
fi

echo "Đang chạy Cloudflare Named Tunnel với file cấu hình: ${CONFIG_FILE}"
exec cloudflared tunnel --config "${CONFIG_FILE}" run
