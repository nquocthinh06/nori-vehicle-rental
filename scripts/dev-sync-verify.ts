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
  process.exit(report.ok ? 0 : 1)
}

console.log('\n========================================================')
console.log('       NORI — KIỂM TRA ĐỒNG BỘ DỮ LIỆU (DEV VERIFY)     ')
console.log('========================================================\n')

console.log(
  `1. Snapshot Database:   ${report.snapshotExists ? 'TỒN TẠI' : 'THIẾU (dev-data/database/nori-dev.db)'}`,
)
console.log(
  `2. Manifest Metadata:   ${report.manifestExists ? 'TỒN TẠI (dev-data/manifest.json)' : 'THIẾU'}`,
)
console.log(
  `3. SQLite Integrity:    ${report.dbIntegrity === 'ok' ? 'OK (Hợp lệ)' : report.dbIntegrity}`,
)
console.log(`4. Foreign Keys:        ${report.foreignKeysOk ? 'OK (0 vi phạm)' : 'VI PHẠM'}`)
console.log(
  `5. File Media vật lý:   ${report.mediaOk ? 'OK (100% đầy đủ)' : `THIẾU ${report.missingMediaFiles.length} file`}`,
)
console.log(
  `6. File tạm / Locks:    ${report.noTempFilesOk ? 'OK (Sạch sẽ, không có file tạm)' : `CÓ ${report.tempFilesFound.length} FILE TẠM`}`,
)

console.log('\n7. Trạng thái máy cục bộ:')
console.log(`  - Vị trí active DB:   ${report.localDbPath}`)
const statusMap: Record<string, string> = {
  IN_SYNC: 'ĐỒNG BỘ HOÀN TOÀN (khớp 100% với dev-data từ Git)',
  AHEAD: 'CÓ THAY ĐỔI MỚI CHƯA XUẤT (chạy `npm run dev:sync:export` để cập nhật snapshot)',
  BEHIND: 'ĐANG CŨ HƠN GIT (chạy `npm run dev:sync:import` để nạp snapshot mới)',
  CONFLICT: 'XUNG ĐỘT (cả local và Git đều có chỉnh sửa độc lập)',
  NO_LOCAL_DB: 'CHƯA CÓ DATABASE CỤC BỘ (chạy `npm run dev:sync:import` để nạp lần đầu)',
}
console.log(`  - Đánh giá:           ${statusMap[report.localStatus] || report.localStatus}`)

if (report.counts) {
  console.log('\nThống kê bản ghi trong snapshot:')
  for (const [table, count] of Object.entries(report.counts)) {
    if (count > 0) {
      console.log(`  - ${table.padEnd(24)}: ${count} bản ghi`)
    }
  }
}

if (report.errors.length > 0) {
  console.log('\n[ERROR] Các lỗi phát hiện:')
  for (const err of report.errors) {
    console.log(`  ❌ ${err}`)
  }
}

if (report.warnings.length > 0) {
  console.log('\n[WARN] Các cảnh báo:')
  for (const w of report.warnings) {
    console.log(`  ⚠️  ${w}`)
  }
}

console.log('\n========================================================')
if (report.ok) {
  console.log('        KẾT QUẢ: TẤT CẢ KIỂM TRA ĐỀU HỢP LỆ (PASS)      ')
} else {
  console.log('        KẾT QUẢ: CÓ LỖI CẦN XỬ LÝ (FAIL)                ')
}
console.log('========================================================\n')

process.exit(report.ok ? 0 : 1)
