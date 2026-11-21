import { exportDevDatabase } from '../src/lib/dev-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const mediaDir = parseArg('--media')
const force = process.argv.includes('--force')

console.log('\n========================================================')
console.log('       NORI — XUẤT DỮ LIỆU PHÁT TRIỂN (DEV EXPORT)      ')
console.log('========================================================\n')

try {
  const res = exportDevDatabase({ dbPath, mediaDir, force })
  console.log(`[OK] Snapshot Version: ${res.snapshotVersion}`)
  console.log(`[OK] Exported At:      ${res.exportedAt}`)
  console.log(`[OK] Database SHA256:  ${res.dbSha256.slice(0, 16)}...`)
  console.log(`[OK] Copied Media:     ${res.copiedMediaFiles} file(s) vào dev-data/media/`)
  console.log('\n[OK] Thống kê dữ liệu đã xuất:')
  for (const [table, count] of Object.entries(res.counts)) {
    if (count > 0) {
      console.log(`  - ${table.padEnd(24)}: ${count} bản ghi`)
    }
  }

  if (res.warnings.length > 0) {
    console.log('\n[WARN] Các cảnh báo cần lưu ý:')
    for (const w of res.warnings) {
      console.log(`  ! ${w}`)
    }
  }

  console.log('\n========================================================')
  console.log('    XUẤT DỮ LIỆU THÀNH CÔNG — SẴN SÀNG COMMIT LÊN GIT    ')
  console.log('========================================================')
  console.log('Để chia sẻ trạng thái này với đồng đội, hãy chạy:')
  console.log('  git add dev-data/')
  console.log('  git commit -m "chore(sync): update dev database and media snapshot"')
  console.log('  git push origin main')
  console.log('========================================================\n')
} catch (err) {
  console.error(
    '\n[ERROR] Xuất dữ liệu thất bại:',
    err instanceof Error ? err.message : String(err),
  )
  process.exit(1)
}
