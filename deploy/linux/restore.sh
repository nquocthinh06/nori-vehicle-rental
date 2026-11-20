#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

echo "========================================================"
echo "   NORI — KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU (LINUX)"
echo "========================================================"
echo "[CẢNH BÁO] Thao tác khôi phục sẽ ghi đè lên cơ sở dữ liệu hiện tại!"

read -p "Bạn có chắc chắn muốn khôi phục không? (Nhập YES để xác nhận): " confirm
if [[ "$confirm" != "YES" ]]; then
    echo "[ABORTED] Đã hủy thao tác khôi phục."
    exit 0
fi

echo "Đang tạo bản backup dự phòng trước khi khôi phục..."
node scripts/backup-db.mjs

echo "Đang tiến hành khôi phục..."
exec node scripts/restore-db.mjs "$@"
