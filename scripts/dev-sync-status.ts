import { verifyDevDatabase } from '../src/lib/dev-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const mediaDir = parseArg('--media')
const jsonMode = process.argv.includes('--json')

const report = verifyDevDatabase({ dbPath, mediaDir })

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

console.log('\n========================================================')
console.log('       NORI — TRẠNG THÁI ĐỒNG BỘ DỮ LIỆU (DEV STATUS)   ')
console.log('========================================================\n')

const isPostgres = Boolean(
  process.env.DATABASE_URL?.startsWith('postgresql:') ||
  process.env.DATABASE_URL?.startsWith('postgres:')
)

console.log('1. Chế độ Cơ sở dữ liệu:')
if (isPostgres) {
  console.log('   - Loại: Neon PostgreSQL (Shared Staging Cloud Database)')
  console.log('   - Trạng thái: Kết nối trực tiếp qua mạng')
} else {
  console.log('   - Loại: SQLite (Cục bộ)')
  console.log(`   - File: ${report.localDbPath}`)
}

console.log('\n2. Trạng thái Snapshot Git (dev-data/):')
console.log(`   - Snapshot Database:   ${report.snapshotExists ? 'TỒN TẠI' : 'THIẾU'}`)
console.log(`   - Manifest:            ${report.manifestExists ? 'TỒN TẠI' : 'THIẾU'}`)
console.log(`   - Checksum DB:         ${report.snapshotDbSha ? report.snapshotDbSha.slice(0, 16) + '...' : 'N/A'}`)

console.log('\n3. Trạng thái Đồng bộ Cục bộ:')
const statusMap: Record<string, string> = {
  IN_SYNC: 'ĐỒNG BỘ HOÀN TOÀN (Clean / Khớp 100% với Git)',
  AHEAD: 'CÓ THAY ĐỔI CỤC BỘ MỚI (Cần chạy `pnpm dev:sync:export` trước khi commit)',
  BEHIND: 'ĐANG CŨ HƠN GIT (Cần chạy `pnpm dev:sync:import` sau khi pull)',
  CONFLICT: 'XUNG ĐỘT DỮ LIỆU (Cả máy này và Git đều có thay đổi riêng)',
  NO_LOCAL_DB: 'CHƯA CÓ DATABASE CỤC BỘ (Cần chạy `pnpm dev:sync:import`)',
}
console.log(`   - Đánh giá:            ${statusMap[report.localStatus] || report.localStatus}`)
console.log(`   - Media vật lý:        ${report.mediaOk ? 'OK (100% đầy đủ)' : `THIẾU ${report.missingMediaFiles.length} file`}`)
console.log(`   - File tạm/Lock:       ${report.noTempFilesOk ? 'Sạch sẽ (Không có lock)' : 'CÓ FILE TẠM'}`)

console.log('\n========================================================')
