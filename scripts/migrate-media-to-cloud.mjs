import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  checkFileExistsInCloud,
  getCloudStorageConfig,
  isCloudStorageConfigured,
  uploadToCloudStorage,
} from '../src/lib/cloud-storage.ts'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const rootDir = path.resolve(dirname, '..')

const isDryRun = process.argv.includes('--dry-run')
const isForce = process.argv.includes('--force')

async function getAllMediaRecords() {
  const rawDbUrl = (process.env.DATABASE_URL || process.env.DATABASE_URI || '').trim()
  const isPostgres = rawDbUrl.startsWith('postgresql:') || rawDbUrl.startsWith('postgres:')

  if (isPostgres) {
    console.log('[MIGRATE-CLOUD] Connecting to PostgreSQL to retrieve media records...')
    const pgUrl =
      rawDbUrl.includes('sslmode=require') && !rawDbUrl.includes('uselibpqcompat=true')
        ? rawDbUrl.replace('sslmode=require', 'sslmode=verify-full')
        : rawDbUrl
    const isNeon = pgUrl.includes('neon.tech') || pgUrl.includes('sslmode=')
    const pool = new pg.Pool({
      connectionString: pgUrl,
      ...(isNeon ? {} : { ssl: { rejectUnauthorized: false } }),
    })
    try {
      const res = await pool.query('SELECT id, filename, mime_type, filesize FROM media ORDER BY filename ASC')
      return res.rows
    } finally {
      await pool.end()
    }
  }

  const sqlitePath = path.resolve(rootDir, 'dev-data', 'database', 'nori-dev.db')
  if (fs.existsSync(sqlitePath)) {
    console.log('[MIGRATE-CLOUD] Connecting to SQLite dev snapshot to retrieve media records...')
    const db = new DatabaseSync(sqlitePath, { readOnly: true })
    try {
      return db.prepare('SELECT id, filename, mime_type, filesize FROM media ORDER BY filename ASC').all()
    } finally {
      db.close()
    }
  }

  throw new Error('No PostgreSQL DATABASE_URL and no SQLite nori-dev.db found.')
}

function findLocalBinary(filename) {
  const candidates = [
    path.resolve(rootDir, 'public', 'media', filename),
    path.resolve(rootDir, 'dev-data', 'media', filename),
    path.resolve(rootDir, 'media', filename),
    path.resolve(rootDir, 'public', 'seed-media', filename),
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const stat = fs.statSync(c)
      if (stat.isFile() && stat.size > 0) {
        const buf = fs.readFileSync(c)
        const head = buf.subarray(0, 50).toString('utf8')
        if (!head.startsWith('version https://git-lfs')) {
          return { path: c, buffer: buf, sizeBytes: stat.size }
        }
      }
    }
  }
  return null
}

function getMimeType(filename, dbMime) {
  if (dbMime && typeof dbMime === 'string' && dbMime.includes('/')) return dbMime
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

async function main() {
  console.log('='.repeat(70))
  console.log(' NORI VEHICLE RENTAL — CLOUD STORAGE MEDIA MIGRATION TOOL')
  console.log('='.repeat(70))

  const records = await getAllMediaRecords()
  console.log(`[MIGRATE-CLOUD] Found ${records.length} media records in database.`)

  const cloudConfig = getCloudStorageConfig()
  if (!cloudConfig) {
    console.log('\n[MIGRATE-CLOUD] No Cloud Storage provider is configured.')
    console.log('To migrate media to durable Cloud Storage, configure ONE of:')
    console.log('  1. VERCEL BLOB (Recommended on Vercel):')
    console.log('     - BLOB_READ_WRITE_TOKEN')
    console.log('  2. S3 / CLOUDFLARE R2 / SUPABASE STORAGE:')
    console.log('     - S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION')
    console.log('\nAudit Mode: Verifying local file availability for all records...')

    let localFound = 0
    let localMissing = 0
    for (const rec of records) {
      const local = findLocalBinary(rec.filename)
      if (local) {
        localFound++
      } else {
        localMissing++
        console.warn(`  [MISSING LOCAL] ${rec.filename}`)
      }
    }

    console.log(`\nLocal Audit Summary:`)
    console.log(`  - Total records: ${records.length}`)
    console.log(`  - Local binary available: ${localFound}/${records.length}`)
    console.log(`  - Missing locally: ${localMissing}`)
    console.log('\nAll local files are safe and preserved. Exiting cleanly.')
    return
  }

  const providerLabel =
    cloudConfig.provider === 'VERCEL_BLOB'
      ? 'VERCEL BLOB STORAGE'
      : `S3 / R2 (Bucket: "${cloudConfig.bucket}")`

  console.log(`\n[MIGRATE-CLOUD] Active Cloud Storage Provider: ${providerLabel}`)
  if (isDryRun) {
    console.log('[MIGRATE-CLOUD] Running in DRY-RUN mode. No files will be uploaded.')
  }

  let uploaded = 0
  let alreadyExisted = 0
  let failed = 0
  let missingLocally = 0

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const filename = rec.filename
    const mimeType = getMimeType(filename, rec.mime_type)

    const local = findLocalBinary(filename)
    if (!local) {
      console.error(`[${i + 1}/${records.length}] MISSING LOCAL: ${filename}`)
      missingLocally++
      failed++
      continue
    }

    if (!isForce) {
      const exists = await checkFileExistsInCloud(filename)
      if (exists) {
        console.log(`[${i + 1}/${records.length}] EXISTS IN CLOUD: ${filename}`)
        alreadyExisted++
        continue
      }
    }

    if (isDryRun) {
      console.log(`[${i + 1}/${records.length}] WOULD UPLOAD: ${filename} (${(local.sizeBytes / 1024).toFixed(1)} KB)`)
      uploaded++
      continue
    }

    const res = await uploadToCloudStorage(filename, local.buffer, mimeType)
    if (res.success) {
      console.log(`[${i + 1}/${records.length}] UPLOADED: ${filename} (${(local.sizeBytes / 1024).toFixed(1)} KB) -> ${res.url || 'OK'}`)
      uploaded++
    } else {
      console.error(`[${i + 1}/${records.length}] FAILED: ${filename} - ${res.error}`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(' CLOUD MIGRATION SUMMARY')
  console.log('='.repeat(70))
  console.log(`  - Provider: ${providerLabel}`)
  console.log(`  - Total records checked: ${records.length}`)
  console.log(`  - Successfully uploaded: ${uploaded}`)
  console.log(`  - Already existed in cloud: ${alreadyExisted}`)
  console.log(`  - Failed / Missing: ${failed}`)
  console.log('='.repeat(70))
}

main().catch((err) => {
  console.error('[MIGRATE-CLOUD] Fatal error:', err)
  process.exit(1)
})
