#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const dotEnvPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(dotEnvPath)) {
  for (const rawLine of fs.readFileSync(dotEnvPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const eqIdx = line.indexOf('=')
    const key = line.slice(0, eqIdx).trim()
    if (!key || process.env[key] !== undefined) continue
    let val = line.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

import { validateEnvironment } from '../src/lib/env.ts'

const result = validateEnvironment({ checkStorageWritable: true })

console.log('\n========================================================')
console.log('       NORI VEHICLE RENTAL — ENVIRONMENT CHECK          ')
console.log('========================================================')
console.log(`Node Environment:   ${result.config.nodeEnv} (tier=${result.config.deploymentTier})`)
console.log(`Server Bind:        http://${result.config.host}:${result.config.port}`)
console.log(`Public App URL:     ${result.config.appUrl}`)
console.log(`Database Engine:    ${result.config.databaseEngine} (${result.config.databaseUri})`)
console.log(`SQLite Path:        ${result.config.sqlitePath}`)
console.log(`Media Storage Dir:  ${result.config.mediaDir}`)
console.log(`Backup Dir:         ${result.config.backupDir}`)
console.log(`Log Dir:            ${result.config.logDir}`)
console.log(`Allowed Origins:    ${result.config.allowedOrigins.join(', ') || '(none configured)'}`)
console.log(`Payment Engine:     ${result.config.paymentProvider} (${result.config.paymentMode})`)
console.log(
  `AI Assistant:       ${result.config.aiEnabled ? 'ENABLED' : 'DISABLED'} (${result.config.aiProvider} / ${result.config.aiModel} / apiKey=${result.config.aiApiKeyConfigured ? 'CONFIGURED' : 'NOT_SET'})`,
)
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
