import { importDevDatabase } from '../src/lib/dev-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const mediaDir = parseArg('--media')
const force = process.argv.includes('--force')
const conflictArg =
  parseArg('--on-conflict') ||
  process.argv.find((a) => a.startsWith('--on-conflict='))?.split('=')[1]
const onConflict =
  conflictArg === 'keep-local' || conflictArg === 'prefer-snapshot'
    ? conflictArg
    : force
      ? 'prefer-snapshot'
      : 'abort'

console.log('\n========================================================')
console.log('       NORI — NẠP DỮ LIỆU PHÁT TRIỂN (DEV IMPORT)       ')
console.log('========================================================\n')

try {
  const res = importDevDatabase({ dbPath, mediaDir, force, onConflict })

  if (res.status === 'CONFLICT') {
    console.error('⚠️  [XUNG ĐỘT DỮ LIỆU PHÁT TRIỂN]')
    for (const err of res.errors) {
      console.error(`   ${err}`)
    }
    if (res.conflictDetails) {
      console.error('\nChi tiết:')
      console.error(`  - Local SHA256:    ${res.conflictDetails.localSha.slice(0, 16)}...`)
      console.error(`  - Snapshot SHA256: ${res.conflictDetails.snapshotSha.slice(0, 16)}...`)
      console.error(
        `  - Last Synced Ver: ${res.conflictDetails.lastSyncedVersion ?? 'Chưa ghi nhận'}`,
      )
    }
    console.error('\nThao tác đã dừng để đảm bảo an toàn. Không có dữ liệu nào bị mất.\n')
    process.exit(1)
  }

  if (res.status === 'ALREADY_UP_TO_DATE') {
    console.log('[INFO] Database cục bộ đã hoàn toàn đồng bộ với dev-data từ GitHub (cùng SHA256).')
    console.log(`[INFO] Snapshot Version: ${res.snapshotVersion}`)
    console.log(
      `[INFO] Đã kiểm tra và nạp bổ sung ${res.restoredMediaCount} file media mới (nếu có).`,
    )
    console.log('\n[OK] Hệ thống đã sẵn sàng phát triển!')
    process.exit(0)
  }

  console.log(`[OK] Trạng thái:           THÀNH CÔNG`)
  console.log(`[OK] Snapshot Version:     ${res.snapshotVersion}`)
  console.log(`[OK] Nạp vào thời điểm:   ${res.importedAt}`)
  if (res.backupPath) {
    console.log(`[OK] Bản sao lưu an toàn:  ${res.backupPath}`)
  }
  console.log(`[OK] Khôi phục media:      ${res.restoredMediaCount} file(s)`)

  console.log('\n[OK] Thống kê dữ liệu đã nạp:')
  for (const [table, count] of Object.entries(res.counts)) {
    if (count > 0) {
      console.log(`  - ${table.padEnd(24)}: ${count} bản ghi`)
    }
  }

  console.log('\n========================================================')
  console.log('       NẠP DỮ LIỆU THÀNH CÔNG — HỆ THỐNG ĐÃ SẴN SÀNG!   ')
  console.log('========================================================\n')
} catch (err) {
  console.error('\n[ERROR] Nạp dữ liệu thất bại:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
