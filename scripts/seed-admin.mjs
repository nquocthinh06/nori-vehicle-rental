import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { DatabaseSync } from 'node:sqlite'

const PASSWORD_HASH_PREFIX = 'pbkdf2-sha256-v1:'
const ITERATIONS = 600_000
const KEY_LENGTH = 32

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {}
  const parsed = {}
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    parsed[key] = val
  }
  return parsed
}

function upsertEnvKeys(envPath, updates) {
  const existingText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const lines = existingText ? existingText.split(/\r?\n/) : []
  const handled = new Set()
  const nextLines = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line
    const key = trimmed.slice(0, trimmed.indexOf('=')).trim()
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      handled.add(key)
      return `${key}=${updates[key]}`
    }
    return line
  })
  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      nextLines.push(`${key}=${value}`)
    }
  }
  const output =
    nextLines.filter((l, idx, arr) => idx < arr.length - 1 || l !== '').join('\n') + '\n'
  fs.writeFileSync(envPath, output, 'utf8')
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new Error('Mật khẩu Admin cần từ 8 đến 72 ký tự.')
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Mật khẩu Admin cần ít nhất một chữ cái và một chữ số.')
  }
}

function hashPayloadPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex')
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')
  return {
    salt,
    hash: `${PASSWORD_HASH_PREFIX}${derived.toString('hex')}`,
  }
}

function promptHiddenPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    const origWrite = rl._writeToOutput
    let hidden = false
    rl._writeToOutput = function writeMasked(str) {
      if (hidden && !str.includes('\n') && !str.includes('\r')) return
      origWrite.call(this, str)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    hidden = true
  })
}

function resolveDbPath(envMap) {
  if (process.env.NORI_SQLITE_PATH) return path.resolve(process.env.NORI_SQLITE_PATH)
  const uri = process.env.DATABASE_URI || envMap.DATABASE_URI || 'file:./nori.db'
  const filePart = uri.startsWith('file:') ? uri.slice('file:'.length) : uri
  return path.resolve(filePart)
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const initEnv = args.has('--init-env')
  const resetPassword = args.has('--reset-password')
  const envPath = path.resolve(process.cwd(), '.env')
  const envMap = parseEnvFile(envPath)

  const email = (process.env.NORI_ADMIN_EMAIL || envMap.NORI_ADMIN_EMAIL || 'admin@nori.vn')
    .trim()
    .toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Email Admin không hợp lệ: ${email}`)
  }

  let password = process.env.NORI_ADMIN_PASSWORD || envMap.NORI_ADMIN_PASSWORD || ''
  if (!password) {
    if (initEnv) {
      password = `${crypto.randomBytes(12).toString('base64url')}9A!`
      upsertEnvKeys(envPath, {
        NORI_ADMIN_EMAIL: email,
        NORI_ADMIN_PASSWORD: password,
      })
      console.log('Đã khởi tạo biến NORI_ADMIN_EMAIL và NORI_ADMIN_PASSWORD an toàn trong .env.')
    } else if (process.stdin.isTTY) {
      password = await promptHiddenPassword(`Nhập mật khẩu Admin cho ${email}: `)
    } else {
      throw new Error(
        'Thiếu NORI_ADMIN_PASSWORD. Truyền biến môi trường NORI_ADMIN_PASSWORD hoặc chạy với cờ --init-env.',
      )
    }
  } else if (initEnv && (!envMap.NORI_ADMIN_PASSWORD || !envMap.NORI_ADMIN_EMAIL)) {
    upsertEnvKeys(envPath, {
      NORI_ADMIN_EMAIL: email,
      NORI_ADMIN_PASSWORD: password,
    })
  }

  validatePassword(password)
  const dbPath = resolveDbPath(envMap)
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    const existing = db.prepare('SELECT id, email FROM admins WHERE email = ?').get(email)
    const now = new Date().toISOString()
    const hasRoleColumn = db
      .prepare('PRAGMA table_info(admins)')
      .all()
      .some((column) => column.name === 'admin_role')
    // The official account always keeps full NORI administration rights.
    const ensureSuperAdmin = (id) => {
      if (hasRoleColumn)
        db.prepare("UPDATE admins SET admin_role = 'SUPER_ADMIN' WHERE id = ?").run(id)
    }

    if (existing) {
      ensureSuperAdmin(existing.id)
      if (!resetPassword) {
        console.log(`Admin chính thức đã tồn tại (${email}); giữ nguyên không tạo trùng.`)
        return
      }
      const { salt, hash } = hashPayloadPassword(password)
      db.prepare(
        'UPDATE admins SET salt = ?, hash = ?, login_attempts = 0, lock_until = NULL, updated_at = ? WHERE id = ?',
      ).run(salt, hash, now, existing.id)
      console.log(`Đã cập nhật lại thông tin xác thực Admin cho ${email}.`)
      return
    }

    const { salt, hash } = hashPayloadPassword(password)
    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO admins (id, email, salt, hash, login_attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    ).run(id, email, salt, hash, now, now)
    ensureSuperAdmin(id)
    console.log(`Đã khởi tạo tài khoản Admin chính thức (${email}) trong ${path.basename(dbPath)}.`)
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error('Lỗi khởi tạo Admin:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
