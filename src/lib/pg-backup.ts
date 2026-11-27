import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  assertNotProductionTarget,
  buildPoolForUrl,
  isPostgresUrl,
  redactPostgresUrl,
  syncAllSerialSequences,
} from './pg-replication.ts'

export type BackupTier = 'daily' | 'weekly' | 'monthly' | 'manual'

export interface PgBinaryPaths {
  binDir: string
  psql: string
  pgDump: string
  pgRestore: string
  pgBasebackup: string
  initdb: string
  pgCtl: string
  pgIsReady: string
}

export interface EncryptedBackupManifest {
  formatVersion: string
  backupId: string
  tier: BackupTier
  createdAt: string
  timezone: string
  sourceRedacted: string
  databaseName: string
  pgVersion: string
  encrypted: boolean
  cipher: 'aes-256-gcm' | 'none'
  compression: 'gzip'
  dumpFormat: 'custom'
  archiveFilename: string
  archiveSizeBytes: number
  archiveSha256: string
  plaintextDumpSizeBytes: number
  plaintextDumpSha256: string
  schemaObjectsListed: number
  publicTableCount: number
  gitCommit: string | null
}

export interface BackupVerificationResult {
  ok: boolean
  backupDir: string
  backupId: string
  tier: BackupTier
  archiveSha256Matched: boolean
  plaintextSha256Matched: boolean
  pgRestoreListOk: boolean
  schemaObjectsListed: number
  isolatedRestoreTested: boolean
  isolatedRestoreRowTotal?: number
  errors: string[]
}

export interface RestoreBackupResult {
  ok: boolean
  restoredFrom: string
  backupId: string
  targetRedacted: string
  sequencesReset: number
  restoredTableCount: number
  restoredRowTotal: number
  fkViolations: number
  durationMs: number
}

const ENC_MAGIC = Buffer.from('NORIENC1', 'ascii')
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16

export function resolvePgBinDir(): PgBinaryPaths {
  const candidates = [
    process.env.PG_BIN_DIR?.trim(),
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    '/usr/lib/postgresql/18/bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/bin',
  ].filter((x): x is string => Boolean(x))

  const ext = process.platform === 'win32' ? '.exe' : ''
  for (const dir of candidates) {
    const pgDumpPath = path.join(dir, `pg_dump${ext}`)
    if (fs.existsSync(pgDumpPath)) {
      return {
        binDir: dir,
        psql: path.join(dir, `psql${ext}`),
        pgDump: pgDumpPath,
        pgRestore: path.join(dir, `pg_restore${ext}`),
        pgBasebackup: path.join(dir, `pg_basebackup${ext}`),
        initdb: path.join(dir, `initdb${ext}`),
        pgCtl: path.join(dir, `pg_ctl${ext}`),
        pgIsReady: path.join(dir, `pg_isready${ext}`),
      }
    }
  }

  // Fallback to PATH names
  return {
    binDir: '',
    psql: `psql${ext}`,
    pgDump: `pg_dump${ext}`,
    pgRestore: `pg_restore${ext}`,
    pgBasebackup: `pg_basebackup${ext}`,
    initdb: `initdb${ext}`,
    pgCtl: `pg_ctl${ext}`,
    pgIsReady: `pg_isready${ext}`,
  }
}

export function resolvePgBackupRootDir(rootDir = process.cwd()): string {
  const explicit = (process.env.PG_BACKUP_DIR || process.env.NORI_PG_BACKUP_DIR || '').trim()
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.resolve(rootDir, explicit)
  }
  return path.resolve(rootDir, 'backups', 'postgres')
}

export function resolveBackupEncryptionKey(options?: {
  allowUnencryptedDev?: boolean
}): string | null {
  const key = (process.env.NORI_BACKUP_ENCRYPTION_KEY || '').trim()
  if (key) {
    if (key.length < 16) {
      throw new Error('[PG-BACKUP] NORI_BACKUP_ENCRYPTION_KEY must be at least 16 characters long.')
    }
    return key
  }
  if (options?.allowUnencryptedDev) {
    return null
  }
  throw new Error(
    '[PG-BACKUP] NORI_BACKUP_ENCRYPTION_KEY is required for encrypted PostgreSQL backups. Set it in local .env (never commit to Git).',
  )
}

export function sha256FileSync(filePath: string): string {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(65536)
  try {
    let bytesRead = 0
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

export function encryptGzipFile(
  inputPath: string,
  outputPath: string,
  passphrase: string | null,
): { encrypted: boolean } {
  const plainBuf = fs.readFileSync(inputPath)
  const gzipped = zlib.gzipSync(plainBuf, { level: 6 })

  if (!passphrase) {
    fs.writeFileSync(outputPath, gzipped)
    return { encrypted: false }
  }

  const salt = crypto.randomBytes(SALT_LEN)
  const iv = crypto.randomBytes(IV_LEN)
  const key = crypto.scryptSync(passphrase, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(gzipped), cipher.final()])
  const authTag = cipher.getAuthTag()

  const payload = Buffer.concat([ENC_MAGIC, salt, iv, encrypted, authTag])
  fs.writeFileSync(outputPath, payload)
  return { encrypted: true }
}

export function decryptGzipFile(
  inputPath: string,
  outputPath: string,
  passphrase: string | null,
): void {
  const raw = fs.readFileSync(inputPath)
  const hasEncMagic =
    raw.length >= ENC_MAGIC.length && raw.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)

  let gzipped: Buffer
  if (hasEncMagic) {
    if (!passphrase) {
      throw new Error(
        '[PG-BACKUP] Backup archive is encrypted (NORIENC1) but NORI_BACKUP_ENCRYPTION_KEY is not set.',
      )
    }
    const minLen = ENC_MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN
    if (raw.length < minLen) {
      throw new Error('[PG-BACKUP] Encrypted archive is truncated or malformed.')
    }
    let offset = ENC_MAGIC.length
    const salt = raw.subarray(offset, offset + SALT_LEN)
    offset += SALT_LEN
    const iv = raw.subarray(offset, offset + IV_LEN)
    offset += IV_LEN
    const ciphertext = raw.subarray(offset, raw.length - TAG_LEN)
    const authTag = raw.subarray(raw.length - TAG_LEN)

    const key = crypto.scryptSync(passphrase, salt, 32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    gzipped = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } else {
    gzipped = raw
  }

  const plainDump = zlib.gunzipSync(gzipped)
  fs.writeFileSync(outputPath, plainDump)
}

function getHoChiMinhDateParts(date = new Date()): {
  isoStamp: string
  dayOfWeek: number
  dayOfMonth: number
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const isoStamp = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}+0700`
  const hcmDate = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+07:00`)
  return {
    isoStamp,
    dayOfWeek: hcmDate.getUTCDay(), // 0 = Sunday in HCM when converted from midnight+07? Wait: use local parts
    dayOfMonth: Number(parts.day),
  }
}

export function determineBackupTier(explicitTier?: BackupTier, date = new Date()): BackupTier {
  if (explicitTier) return explicitTier
  const fmtDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
  })
  const parts = Object.fromEntries(fmtDay.formatToParts(date).map((p) => [p.type, p.value]))
  if (parts.day === '01') return 'monthly'
  if (parts.weekday === 'Sun') return 'weekly'
  return 'daily'
}

function runPgTool(
  binPath: string,
  args: string[],
  connectionUrl: string,
): { stdout: string; stderr: string } {
  const u = new URL(connectionUrl)
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (u.password) {
    env.PGPASSWORD = decodeURIComponent(u.password)
  }
  const res = spawnSync(binPath, args, {
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (res.error) {
    throw new Error(`Failed to invoke ${path.basename(binPath)}: ${res.error.message}`)
  }
  if (res.status !== 0) {
    throw new Error(
      `${path.basename(binPath)} exited with code ${res.status}: ${(res.stderr || res.stdout || '').trim()}`,
    )
  }
  return { stdout: res.stdout || '', stderr: res.stderr || '' }
}

function buildSanitizedConnArg(connectionUrl: string): string {
  const u = new URL(connectionUrl)
  const clone = new URL(u.toString())
  clone.password = ''
  return clone.toString()
}

function getGitShortCommit(rootDir = process.cwd()): string | null {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
  return res.status === 0 ? res.stdout.trim() : null
}

export async function createEncryptedPgBackup(options: {
  sourceUrl: string
  outDir?: string
  tier?: BackupTier
  allowUnencryptedDev?: boolean
  retention?: { daily?: number; weekly?: number; monthly?: number }
}): Promise<{
  ok: boolean
  backupId: string
  backupDir: string
  archivePath: string
  manifestPath: string
  manifest: EncryptedBackupManifest
  pruned: string[]
}> {
  if (!isPostgresUrl(options.sourceUrl)) {
    throw new Error('[PG-BACKUP] Source URL must be a valid postgresql:// URI.')
  }

  const bins = resolvePgBinDir()
  const outDir = options.outDir || resolvePgBackupRootDir()
  fs.mkdirSync(outDir, { recursive: true })

  const passphrase = resolveBackupEncryptionKey({
    allowUnencryptedDev: options.allowUnencryptedDev,
  })
  const tier = determineBackupTier(options.tier)
  const { isoStamp } = getHoChiMinhDateParts()
  const randSuffix = crypto.randomBytes(3).toString('hex')
  const backupId = `nori-pg-${tier}-${isoStamp}-${randSuffix}`

  const stagingDir = path.join(outDir, `.staging-${backupId}-${process.pid}`)
  const finalDir = path.join(outDir, backupId)
  fs.mkdirSync(stagingDir, { recursive: true })

  const pool = buildPoolForUrl(options.sourceUrl, 1)
  try {
    const metaRes = await pool.query(`
      SELECT
        version() AS ver,
        current_database() AS db,
        (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tbl_count
    `)
    const dbMeta = metaRes.rows[0]

    const plainDumpPath = path.join(stagingDir, `${backupId}.pgdump`)
    const connArg = buildSanitizedConnArg(options.sourceUrl)

    runPgTool(
      bins.pgDump,
      ['--format=custom', '--no-owner', '--no-acl', '--file', plainDumpPath, connArg],
      options.sourceUrl,
    )

    // Verify pg_restore --list works on the raw dump before compressing & encrypting
    const listRes = spawnSync(bins.pgRestore, ['--list', plainDumpPath], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    if (listRes.status !== 0) {
      throw new Error(`pg_restore --list verification failed: ${(listRes.stderr || '').trim()}`)
    }
    const schemaObjectsListed = listRes.stdout
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith(';')).length

    const plaintextStat = fs.statSync(plainDumpPath)
    const plaintextSha256 = sha256FileSync(plainDumpPath)

    const archiveFilename = passphrase ? `${backupId}.pgdump.gz.enc` : `${backupId}.pgdump.gz`
    const archivePath = path.join(stagingDir, archiveFilename)
    const { encrypted } = encryptGzipFile(plainDumpPath, archivePath, passphrase)

    // Remove plaintext dump after sealing into encrypted archive
    fs.unlinkSync(plainDumpPath)

    const archiveStat = fs.statSync(archivePath)
    const archiveSha256 = sha256FileSync(archivePath)

    const manifest: EncryptedBackupManifest = {
      formatVersion: '1.0.0',
      backupId,
      tier,
      createdAt: new Date().toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      sourceRedacted: redactPostgresUrl(options.sourceUrl),
      databaseName: String(dbMeta.db),
      pgVersion: String(dbMeta.ver).split(' on ')[0],
      encrypted,
      cipher: encrypted ? 'aes-256-gcm' : 'none',
      compression: 'gzip',
      dumpFormat: 'custom',
      archiveFilename,
      archiveSizeBytes: archiveStat.size,
      archiveSha256,
      plaintextDumpSizeBytes: plaintextStat.size,
      plaintextDumpSha256: plaintextSha256,
      schemaObjectsListed,
      publicTableCount: Number(dbMeta.tbl_count || 0),
      gitCommit: getGitShortCommit(),
    }

    fs.writeFileSync(
      path.join(stagingDir, 'backup-manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8',
    )

    // Atomic commit: rename stagingDir -> finalDir only after everything succeeded
    fs.renameSync(stagingDir, finalDir)

    fs.writeFileSync(
      path.join(outDir, 'latest-backup.json'),
      JSON.stringify(
        {
          backupId,
          tier,
          createdAt: manifest.createdAt,
          archiveFilename,
          archiveSha256,
          publicTableCount: manifest.publicTableCount,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    const pruned = applyBackupRetention(outDir, options.retention)

    return {
      ok: true,
      backupId,
      backupDir: finalDir,
      archivePath: path.join(finalDir, archiveFilename),
      manifestPath: path.join(finalDir, 'backup-manifest.json'),
      manifest,
      pruned,
    }
  } catch (err) {
    // Cleanup staging directory; never touch previously committed backups
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup error
    }
    throw err
  } finally {
    await pool.end()
  }
}

export function listPgBackups(outDir = resolvePgBackupRootDir()): Array<{
  backupDir: string
  manifest: EncryptedBackupManifest
}> {
  if (!fs.existsSync(outDir)) return []
  const entries = fs.readdirSync(outDir, { withFileTypes: true })
  const items: Array<{ backupDir: string; manifest: EncryptedBackupManifest }> = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.staging-')) continue
    const dirPath = path.join(outDir, entry.name)
    const manifestPath = path.join(dirPath, 'backup-manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as EncryptedBackupManifest
      items.push({ backupDir: dirPath, manifest })
    } catch {
      // skip corrupt staging/incomplete dir
    }
  }

  return items.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt))
}

export function applyBackupRetention(
  outDir = resolvePgBackupRootDir(),
  policy?: { daily?: number; weekly?: number; monthly?: number },
): string[] {
  const keepDaily = policy?.daily ?? Number(process.env.PG_BACKUP_KEEP_DAILY || '30')
  const keepWeekly = policy?.weekly ?? Number(process.env.PG_BACKUP_KEEP_WEEKLY || '12')
  const keepMonthly = policy?.monthly ?? Number(process.env.PG_BACKUP_KEEP_MONTHLY || '12')

  const all = listPgBackups(outDir)
  if (all.length <= 1) return []

  const limits: Record<BackupTier, number> = {
    daily: keepDaily,
    weekly: keepWeekly,
    monthly: keepMonthly,
    manual: keepDaily,
  }

  const byTier = new Map<BackupTier, typeof all>()
  for (const item of all) {
    const t = item.manifest.tier || 'daily'
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t)!.push(item)
  }

  const newestGlobalId = all[0].manifest.backupId
  const pruned: string[] = []

  for (const [tier, items] of byTier.entries()) {
    const limit = limits[tier]
    if (limit <= 0 || items.length <= limit) continue
    for (const stale of items.slice(limit)) {
      if (stale.manifest.backupId === newestGlobalId) continue
      fs.rmSync(stale.backupDir, { recursive: true, force: true })
      pruned.push(stale.manifest.backupId)
    }
  }

  return pruned
}

export async function verifyEncryptedPgBackup(options?: {
  backupDir?: string
  outDir?: string
  allowUnencryptedDev?: boolean
  isolatedTestTargetUrl?: string
}): Promise<BackupVerificationResult> {
  const outDir = options?.outDir || resolvePgBackupRootDir()
  let targetDir = options?.backupDir
  if (!targetDir) {
    const all = listPgBackups(outDir)
    if (all.length === 0) {
      throw new Error(`[PG-BACKUP-VERIFY] No PostgreSQL backup bundles found in ${outDir}.`)
    }
    targetDir = all[0].backupDir
  }

  const manifestPath = path.join(targetDir, 'backup-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[PG-BACKUP-VERIFY] Missing backup-manifest.json in ${targetDir}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as EncryptedBackupManifest
  const archivePath = path.join(targetDir, manifest.archiveFilename)
  const errors: string[] = []

  if (!fs.existsSync(archivePath)) {
    throw new Error(`[PG-BACKUP-VERIFY] Missing archive file ${archivePath}`)
  }

  const actualArchiveSha = sha256FileSync(archivePath)
  const archiveSha256Matched = actualArchiveSha === manifest.archiveSha256
  if (!archiveSha256Matched) {
    errors.push(
      `Archive SHA-256 mismatch: expected ${manifest.archiveSha256}, got ${actualArchiveSha}`,
    )
  }

  const passphrase = manifest.encrypted
    ? resolveBackupEncryptionKey({ allowUnencryptedDev: false })
    : resolveBackupEncryptionKey({ allowUnencryptedDev: options?.allowUnencryptedDev ?? true })

  const tempPlainPath = path.join(targetDir, `.verify-${process.pid}.pgdump`)
  let plaintextSha256Matched = false
  let pgRestoreListOk = false
  let schemaObjectsListed = 0
  let isolatedRestoreTested = false
  let isolatedRestoreRowTotal: number | undefined

  try {
    decryptGzipFile(archivePath, tempPlainPath, passphrase)
    const actualPlainSha = sha256FileSync(tempPlainPath)
    plaintextSha256Matched = actualPlainSha === manifest.plaintextDumpSha256
    if (!plaintextSha256Matched) {
      errors.push(
        `Plaintext dump SHA-256 mismatch: expected ${manifest.plaintextDumpSha256}, got ${actualPlainSha}`,
      )
    }

    const bins = resolvePgBinDir()
    const listRes = spawnSync(bins.pgRestore, ['--list', tempPlainPath], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    if (listRes.status === 0) {
      pgRestoreListOk = true
      schemaObjectsListed = listRes.stdout
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith(';')).length
    } else {
      errors.push(`pg_restore --list failed: ${(listRes.stderr || '').trim()}`)
    }

    if (options?.isolatedTestTargetUrl && pgRestoreListOk && errors.length === 0) {
      assertNotProductionTarget(options.isolatedTestTargetUrl, 'isolated backup restore test')
      const res = await restoreEncryptedPgBackup({
        backupDir: targetDir,
        targetUrl: options.isolatedTestTargetUrl,
        allowUnencryptedDev: options.allowUnencryptedDev,
      })
      isolatedRestoreTested = res.ok
      isolatedRestoreRowTotal = res.restoredRowTotal
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    if (fs.existsSync(tempPlainPath)) {
      fs.unlinkSync(tempPlainPath)
    }
  }

  return {
    ok: errors.length === 0 && archiveSha256Matched && plaintextSha256Matched && pgRestoreListOk,
    backupDir: targetDir,
    backupId: manifest.backupId,
    tier: manifest.tier,
    archiveSha256Matched,
    plaintextSha256Matched,
    pgRestoreListOk,
    schemaObjectsListed,
    isolatedRestoreTested,
    isolatedRestoreRowTotal,
    errors,
  }
}

export async function restoreEncryptedPgBackup(options: {
  backupDir?: string
  outDir?: string
  targetUrl: string
  allowUnencryptedDev?: boolean
  confirmProduction?: boolean
}): Promise<RestoreBackupResult> {
  const startedAt = Date.now()
  if (!isPostgresUrl(options.targetUrl)) {
    throw new Error('[PG-RESTORE] Target URL must be a valid postgresql:// URI.')
  }
  assertNotProductionTarget(options.targetUrl, 'pg_restore', {
    confirmProduction: options.confirmProduction,
  })

  const outDir = options.outDir || resolvePgBackupRootDir()
  let targetDir = options.backupDir
  if (!targetDir) {
    const all = listPgBackups(outDir)
    if (all.length === 0) {
      throw new Error(`[PG-RESTORE] No backup bundles found in ${outDir}.`)
    }
    targetDir = all[0].backupDir
  }

  const manifestPath = path.join(targetDir, 'backup-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[PG-RESTORE] Missing backup-manifest.json in ${targetDir}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as EncryptedBackupManifest
  const archivePath = path.join(targetDir, manifest.archiveFilename)

  const archiveSha = sha256FileSync(archivePath)
  if (archiveSha !== manifest.archiveSha256) {
    throw new Error('[PG-RESTORE] Refusing restore: archive SHA-256 verification failed.')
  }

  const passphrase = manifest.encrypted
    ? resolveBackupEncryptionKey({ allowUnencryptedDev: false })
    : resolveBackupEncryptionKey({ allowUnencryptedDev: options.allowUnencryptedDev ?? true })

  const tempPlainPath = path.join(targetDir, `.restore-${process.pid}.pgdump`)
  const bins = resolvePgBinDir()

  try {
    decryptGzipFile(archivePath, tempPlainPath, passphrase)
    const plainSha = sha256FileSync(tempPlainPath)
    if (plainSha !== manifest.plaintextDumpSha256) {
      throw new Error('[PG-RESTORE] Refusing restore: decrypted dump SHA-256 mismatch.')
    }

    const connArg = buildSanitizedConnArg(options.targetUrl)
    runPgTool(
      bins.pgRestore,
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--dbname',
        connArg,
        tempPlainPath,
      ],
      options.targetUrl,
    )

    const pool = buildPoolForUrl(options.targetUrl, 1)
    try {
      const seqUpdates = await syncAllSerialSequences(pool)
      const tblRes = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name ASC",
      )
      let rowTotal = 0
      for (const r of tblRes.rows) {
        const c = await pool.query(`SELECT count(*)::int AS c FROM "${String(r.table_name)}"`)
        rowTotal += Number(c.rows[0]?.c || 0)
      }

      const fkRes = await pool.query(`
        SELECT count(*)::int AS c
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.contype = 'f' AND NOT c.convalidated
      `)
      const fkViolations = Number(fkRes.rows[0]?.c || 0)
      return {
        ok: true,
        restoredFrom: targetDir,
        backupId: manifest.backupId,
        targetRedacted: redactPostgresUrl(options.targetUrl),
        sequencesReset: seqUpdates.length,
        restoredTableCount: tblRes.rows.length,
        restoredRowTotal: rowTotal,
        fkViolations,
        durationMs: Date.now() - startedAt,
      }
    } finally {
      await pool.end()
    }
  } finally {
    if (fs.existsSync(tempPlainPath)) {
      fs.unlinkSync(tempPlainPath)
    }
  }
}
