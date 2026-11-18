import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function parseEnv(envPath) {
  if (!fs.existsSync(envPath)) return {}
  const out = {}
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const idx = line.indexOf('=')
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[line.slice(0, idx).trim()] = val
  }
  return out
}

function removeIfExists(filePath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${filePath}${suffix}`
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

async function main() {
  const sourceDb = path.resolve(process.cwd(), process.env.NORI_SOURCE_DB || 'nori.db')
  const isolatedDb = path.resolve(process.cwd(), 'nori-test-isolated.db')
  const envMap = parseEnv(path.resolve(process.cwd(), '.env'))
  const adminEmail = (process.env.NORI_ADMIN_EMAIL || envMap.NORI_ADMIN_EMAIL || 'admin@nori.vn')
    .trim()
    .toLowerCase()
  const adminPassword = process.env.NORI_ADMIN_PASSWORD || envMap.NORI_ADMIN_PASSWORD || ''
  if (!adminPassword) {
    throw new Error('Thiếu NORI_ADMIN_PASSWORD trong môi trường hoặc .env để kiểm thử cô lập.')
  }

  removeIfExists(isolatedDb)
  fs.copyFileSync(sourceDb, isolatedDb)

  try {
    // 1. Verify official admin exists in isolated copy and check idempotency of seed-admin.mjs
    execFileSync(process.execPath, [path.resolve(process.cwd(), 'scripts', 'seed-admin.mjs')], {
      env: {
        ...process.env,
        NORI_SQLITE_PATH: isolatedDb,
        NORI_ADMIN_EMAIL: adminEmail,
        NORI_ADMIN_PASSWORD: adminPassword,
      },
      stdio: 'pipe',
    })
    execFileSync(process.execPath, [path.resolve(process.cwd(), 'scripts', 'seed-admin.mjs')], {
      env: {
        ...process.env,
        NORI_SQLITE_PATH: isolatedDb,
        NORI_ADMIN_EMAIL: adminEmail,
        NORI_ADMIN_PASSWORD: adminPassword,
      },
      stdio: 'pipe',
    })

    const db = new DatabaseSync(isolatedDb)
    try {
      const admins = db
        .prepare('SELECT id, email, hash, salt FROM admins WHERE email = ?')
        .all(adminEmail)
      if (admins.length !== 1) {
        throw new Error(`Expected exactly 1 admin for ${adminEmail}, found ${admins.length}`)
      }
      const adminRow = admins[0]
      if (!String(adminRow.hash).startsWith('pbkdf2-sha256-v1:')) {
        throw new Error('Admin password hash does not match Payload PBKDF2-SHA256 format')
      }
      const derived = crypto
        .pbkdf2Sync(adminPassword, String(adminRow.salt), 600_000, 32, 'sha256')
        .toString('hex')
      if (`pbkdf2-sha256-v1:${derived}` !== adminRow.hash) {
        throw new Error('Admin password verification failed in isolated DB')
      }

      // 2. Delete a temporary test user on isolated DB without affecting admins
      const tempUserId = crypto.randomUUID()
      const now = new Date().toISOString()
      db.prepare(
        "INSERT INTO users (id, full_name, email, role, status, salt, hash, created_at, updated_at) VALUES (?, 'Isolated QA', ?, 'CUSTOMER', 'ACTIVE', 's', 'h', ?, ?)",
      ).run(tempUserId, `isolated-${Date.now()}@example.test`, now, now)
      db.prepare('DELETE FROM users WHERE id = ?').run(tempUserId)

      const remainingAdmins = db
        .prepare('SELECT COUNT(*) AS c FROM admins WHERE email = ?')
        .get(adminEmail)
      if (Number(remainingAdmins.c) !== 1) {
        throw new Error('Official admin disappeared after isolated customer cleanup')
      }

      const integrity = db.prepare('PRAGMA integrity_check').all()
      const fkCheck = db.prepare('PRAGMA foreign_key_check').all()
      if (integrity[0]?.integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${JSON.stringify(integrity)}`)
      }
      if (fkCheck.length > 0) {
        throw new Error(
          `Foreign key check failed (${fkCheck.length}): ${JSON.stringify(fkCheck.slice(0, 10))}`,
        )
      }
      console.log('ISOLATED_ADMIN_TEST_PASS:', {
        adminEmail: adminRow.email,
        idempotentCount: admins.length,
        hashAlgorithm: 'pbkdf2-sha256-v1',
        integrity,
        fkCheck,
      })
    } finally {
      db.close()
    }
  } finally {
    removeIfExists(isolatedDb)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
