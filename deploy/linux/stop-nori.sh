#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"

echo "Đang tìm tiến trình lắng nghe trên cổng ${PORT}..."
PID=$(lsof -ti :${PORT} 2>/dev/null || true)

if [[ -z "$PID" ]]; then
    echo "[INFO] Không có tiến trình nào đang chạy trên cổng ${PORT}."
    exit 0
fi

echo "Đang dừng tiến trình PID=${PID}..."
kill -15 $PID || kill -9 $PID
echo "[OK] Đã dừng tiến trình thành công!"
