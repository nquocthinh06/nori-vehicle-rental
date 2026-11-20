#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

echo "========================================================"
echo "   NORI VEHICLE RENTAL — UBUNTU / LINUX STARTUP"
echo "========================================================"

# 1. Check .env
if [[ ! -f ".env" ]]; then
    echo "[SETUP] Creating .env from template..."
    node scripts/setup.mjs
fi

# 2. Validate environment
echo "[1/3] Kiểm tra cấu hình môi trường..."
node scripts/validate-env.mjs

# 3. Check database
echo "[2/3] Kiểm tra schema database..."
if ! node scripts/check-db-schema.mjs; then
    echo "[SETUP] Chạy migration database..."
    pnpm db:migrate
fi

# 4. Check build
if [[ ! -f ".next/standalone/server.js" ]]; then
    echo "[BUILD] Đang build production artifact..."
    pnpm build
fi

# 5. Start
echo "[3/3] Khởi động NORI Production Server..."
exec node scripts/start-standalone.mjs
