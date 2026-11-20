#!/usr/bin/env node
import { validateEnvironment } from '../src/lib/env.ts'

const result = validateEnvironment({ checkStorageWritable: true })

console.log('\n========================================================')
console.log('       NORI VEHICLE RENTAL — ENVIRONMENT CHECK          ')
console.log('========================================================')
console.log(`Node Environment:   ${result.config.nodeEnv}`)
console.log(`Server Bind:        http://${result.config.host}:${result.config.port}`)
console.log(`Public App URL:     ${result.config.appUrl}`)
console.log(`Database URI:       ${result.config.databaseUri}`)
console.log(`SQLite Path:        ${result.config.sqlitePath}`)
console.log(`Media Storage Dir:  ${result.config.mediaDir}`)
console.log(`Backup Dir:         ${result.config.backupDir}`)
console.log(`Log Dir:            ${result.config.logDir}`)
console.log(`Allowed Origins:    ${result.config.allowedOrigins.join(', ') || '(none configured)'}`)
console.log(`Payment Engine:     ${result.config.paymentProvider} (${result.config.paymentMode})`)
console.log('--------------------------------------------------------')

if (result.warnings.length > 0) {
  console.log('\n[WARNINGS]:')
  for (const w of result.warnings) {
    console.warn(`  ⚠  ${w}`)
  }
}

if (!result.ok) {
  console.error('\n[ERRORS - CONFIGURATION INVALID]:')
  for (const err of result.errors) {
    console.error(`  ✖  ${err}`)
  }
  console.error('\nVui lòng kiểm tra và hoàn thiện cấu hình file .env trước khi tiếp tục.')
  console.log('========================================================\n')
  process.exit(1)
}

console.log('\n[OK] Toàn bộ cấu hình môi trường và thư mục lưu trữ hợp lệ!')
console.log('========================================================\n')
process.exit(0)
