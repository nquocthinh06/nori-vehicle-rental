#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const rootDir = process.cwd()
console.log('\n========================================================')
console.log('       NORI VEHICLE RENTAL — REPOSITORY SETUP           ')
console.log('========================================================')

// 1. Check Node.js version
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10)
if (nodeMajor < 20) {
  console.error(`[ERROR] Node.js version ${process.version} is too old. NORI requires Node.js >= 20.x (Recommended: Node 24 LTS).`)
  process.exit(1)
}
console.log(`[OK] Node.js version: ${process.version}`)

// 2. Prepare .env file
const envPath = path.join(rootDir, '.env')
const envExamplePath = path.join(rootDir, '.env.example')

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  console.log('[SETUP] .env file not found. Generating fresh .env from .env.example...')
  let template = fs.readFileSync(envExamplePath, 'utf8')

  // Generate secure random secrets
  const generatedPayloadSecret = crypto.randomBytes(32).toString('hex')
  const generatedSessionSecret = crypto.randomBytes(32).toString('hex')

  template = template.replace(
    'PAYLOAD_SECRET=your-secure-random-payload-secret-at-least-32-chars-long',
    `PAYLOAD_SECRET=${generatedPayloadSecret}`,
  )
  template = template.replace(
    'NORI_SESSION_SECRET=your-distinct-random-session-secret-at-least-32-chars',
    `NORI_SESSION_SECRET=${generatedSessionSecret}`,
  )

  fs.writeFileSync(envPath, template, 'utf8')
  console.log('[OK] Created .env with cryptographically secure random secrets!')
} else if (fs.existsSync(envPath)) {
  console.log('[OK] Existing .env file detected.')
}

// 3. Ensure required directories exist
const requiredDirs = ['data', 'media', 'backups', 'logs']
for (const dir of requiredDirs) {
  const full = path.join(rootDir, dir)
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true })
    console.log(`[SETUP] Created directory: ${dir}/`)
  }
}

// 4. Run database migration
console.log('[SETUP] Checking and applying database schema migrations...')
try {
  execSync('node scripts/check-db-schema.mjs', { stdio: 'inherit', cwd: rootDir })
  console.log('[OK] Database schema verified!')
} catch {
  console.log('[SETUP] Running pnpm db:migrate...')
  try {
    execSync('pnpm db:migrate', { stdio: 'inherit', cwd: rootDir })
    console.log('[OK] Database migration completed successfully!')
  } catch (migErr) {
    console.warn(`[WARN] Migration check failed: ${migErr.message}`)
  }
}

console.log('\n========================================================')
console.log('       SETUP HOÀN TẤT — HỆ THỐNG ĐÃ SẴN SÀNG!           ')
console.log('========================================================')
console.log('Các lệnh tiếp theo:')
console.log('  pnpm dev           -> Khởi chạy chế độ Development')
console.log('  pnpm dev:lan       -> Khởi chạy chế độ LAN Development')
console.log('  pnpm build         -> Build Production standalone bundle')
console.log('  pnpm start:standalone -> Chạy Production server trên Home Server')
console.log('  pnpm test          -> Chạy bộ kiểm thử tự động')
console.log('========================================================\n')
