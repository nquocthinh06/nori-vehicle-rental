#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

echo "========================================================"
echo "   NORI — SAO LƯU DỮ LIỆU TOÀN DIỆN (LINUX / UBUNTU)"
echo "========================================================"

exec node scripts/backup-db.mjs "$@"
