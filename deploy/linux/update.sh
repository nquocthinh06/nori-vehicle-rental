#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

echo "========================================================"
echo "   NORI HOME SERVER — QUY TRÌNH CẬP NHẬT AN TOÀN (LINUX)"
echo "========================================================"

# 1. Kiểm tra git status
echo "[1/6] Kiểm tra trạng thái Git..."
if [[ -n $(git status --porcelain) ]]; then
    echo "[ERROR] Máy chủ Home Server đang có file bị sửa đổi chưa commit!"
    echo "Dừng quy trình để tránh mất mát dữ liệu."
    exit 1
fi

# 2. Tạo hot backup
echo "[2/6] Tạo hot backup trước khi nâng cấp..."
node scripts/backup-db.mjs

# 3. Pull code mới
echo "[3/6] Pull code mới nhất từ origin/${BRANCH}..."
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

# 4. Cài đặt dependencies
echo "[4/6] Cài đặt dependencies theo lockfile..."
pnpm install --frozen-lockfile

# 5. Database migration
echo "[5/6] Kiểm tra và chạy migrations..."
pnpm db:migrate

# 6. Build Production
echo "[6/6] Build production artifact (pnpm build)..."
pnpm build

# 7. Restart systemd service nếu có hoặc restart script
if systemctl is-active --quiet nori.service 2>/dev/null; then
    echo "Restarting nori.service via systemctl..."
    sudo systemctl restart nori.service
    sleep 3
else
    echo "Restarting via stop/start scripts..."
    "${SCRIPT_DIR}/stop-nori.sh" || true
    sleep 2
    nohup "${SCRIPT_DIR}/start-nori.sh" > logs/nori-server.log 2>&1 &
    sleep 4
fi

echo "Kiểm tra Health Check..."
node scripts/healthcheck.mjs

echo "========================================================"
echo "       CẬP NHẬT HỆ THỐNG THÀNH CÔNG VÀ ĐÃ HOẠT ĐỘNG!    "
echo "========================================================"
