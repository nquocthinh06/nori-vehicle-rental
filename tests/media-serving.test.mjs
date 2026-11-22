import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertVercelBlobStorageReady,
  getCloudStorageConfig,
  getVercelBlobObjectKey,
  getVercelBlobPrefix,
  isCloudStorageConfigured,
  isValidVercelBlobToken,
  isVercelBlobConfigured,
} from '../src/lib/cloud-storage.ts'
import { createPostgresPoolConfig, normalizePostgresUrl } from '../src/lib/postgres-url.ts'
import { localMediaResizeHandler, resolveValidMediaSource } from '../src/lib/media-optimizer.ts'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const rootDir = path.resolve(dirname, '..')

const SAMPLE_IMAGES = {
  heroBanner: 'nori-hero-10.jpg',
  heroWebp: '4mynwj2nq3n3n18chvle-1795014708844-0-iny1.webp',
  vehicleCatalogue: 'toyota-fortuner-catalogue.png',
  vehicleDetailExt: 'toyota-fortuner-ext-10.jpg',
  vehicleDetailInt: 'toyota-fortuner-int-4.jpg',
  storyBanner: 'nori-story.png',
  adminAsset: 'ERD.png',
}

test('Media Resolution — Verifies all sample image categories exist and have valid binary headers', async () => {
  for (const [category, filename] of Object.entries(SAMPLE_IMAGES)) {
    const source = await resolveValidMediaSource(filename)
    assert.ok(source, `Failed to resolve source for ${category} (${filename})`)
    assert.ok(
      source.sizeBytes > 1000,
      `${filename} size should be > 1000 bytes, got ${source.sizeBytes}`,
    )
    assert.ok(source.buffer.byteLength > 0, `${filename} buffer must not be empty`)

    // Verify it is NOT a Git LFS pointer text file
    const header = source.buffer.subarray(0, 50).toString('utf8')
    assert.ok(
      !header.startsWith('version https://git-lfs'),
      `${filename} must not be a Git LFS pointer file!`,
    )
  }
})

test('localMediaResizeHandler — Serves unresized images with HTTP 200, Content-Type, and ETag', async () => {
  for (const [category, filename] of Object.entries(SAMPLE_IMAGES)) {
    const mockReq = {
      searchParams: new URLSearchParams(),
      headers: new Headers(),
    }

    const res = await localMediaResizeHandler(mockReq, {
      params: { collection: 'media', filename },
    })

    assert.ok(res instanceof Response, `Expected Response for unresized ${filename}`)
    assert.equal(res.status, 200, `Expected HTTP 200 for ${filename}`)
    assert.ok(res.headers.get('Content-Type'), `Missing Content-Type for ${filename}`)
    assert.ok(res.headers.get('ETag'), `Missing ETag for ${filename}`)
    assert.ok(
      Number(res.headers.get('Content-Length')) > 0,
      `Content-Length must be > 0 for ${filename}`,
    )

    // Test 304 Not Modified
    const etag = res.headers.get('ETag')
    const conditionalReq = {
      searchParams: new URLSearchParams(),
      headers: new Headers({ 'if-none-match': etag }),
    }
    const notModifiedRes = await localMediaResizeHandler(conditionalReq, {
      params: { collection: 'media', filename },
    })
    assert.ok(notModifiedRes instanceof Response)
    assert.equal(notModifiedRes.status, 304, `Expected HTTP 304 for matching ETag on ${filename}`)
  }
})

test('localMediaResizeHandler — Serves Sharp-optimized WebP variants with ?w=&q= and HTTP 200', async () => {
  const testCases = [
    { filename: SAMPLE_IMAGES.heroBanner, w: '1200', q: '80', expectedFormat: 'image/webp' },
    { filename: SAMPLE_IMAGES.vehicleCatalogue, w: '640', q: '75', expectedFormat: 'image/webp' },
    { filename: SAMPLE_IMAGES.vehicleDetailExt, w: '828', q: '84', expectedFormat: 'image/webp' },
    { filename: SAMPLE_IMAGES.storyBanner, w: '384', q: '75', expectedFormat: 'image/webp' },
  ]

  for (const tc of testCases) {
    const mockReq = {
      searchParams: new URLSearchParams({ w: tc.w, q: tc.q }),
      headers: new Headers({ accept: 'image/webp,image/avif,image/*,*/*' }),
    }

    const res = await localMediaResizeHandler(mockReq, {
      params: { collection: 'media', filename: tc.filename },
    })

    assert.ok(res instanceof Response, `Expected Response for optimized ${tc.filename}`)
    assert.equal(res.status, 200, `Expected HTTP 200 for ${tc.filename}`)
    assert.equal(res.headers.get('Content-Type'), tc.expectedFormat)
    assert.ok(
      res.headers.get('Cache-Control')?.includes('max-age=31536000'),
      `Expected long Cache-Control TTL for ${tc.filename}`,
    )
    assert.ok(res.headers.get('ETag'))

    const bodyBytes = await res.arrayBuffer()
    assert.ok(bodyBytes.byteLength > 0, `Optimized buffer must not be empty for ${tc.filename}`)

    // Verify WebP magic bytes: RIFF....WEBP
    const buf = Buffer.from(bodyBytes)
    const isRiff = buf.subarray(0, 4).toString('ascii') === 'RIFF'
    const isWebp = buf.subarray(8, 12).toString('ascii') === 'WEBP'
    assert.ok(isRiff && isWebp, `${tc.filename} optimized output must have valid WebP magic bytes`)
  }
})

test('localMediaResizeHandler — Handles non-existent media gracefully with undefined', async () => {
  const mockReq = {
    searchParams: new URLSearchParams({ w: '640' }),
    headers: new Headers(),
  }

  const res = await localMediaResizeHandler(mockReq, {
    params: { collection: 'media', filename: 'completely-nonexistent-image-12345.png' },
  })

  assert.equal(
    res,
    undefined,
    'Should return undefined for missing media so Payload can handle 404',
  )
})

test('localMediaResizeHandler — Gracefully handles directory traversal attempts', async () => {
  const mockReq = {
    searchParams: new URLSearchParams({ w: '640' }),
    headers: new Headers(),
  }

  const res = await localMediaResizeHandler(mockReq, {
    params: { collection: 'media', filename: '../../../etc/passwd' },
  })

  assert.equal(res, undefined, 'Traversal attempts must be rejected immediately')
})

test('Git LFS Pointer Protection — resolveValidMediaSource skips LFS pointers and finds real binary', async () => {
  const tempDir = path.join(os.tmpdir(), `nori-lfs-test-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  const fakeLfsFile = path.join(tempDir, 'test-lfs-image.png')
  const lfsPointerContent =
    'version https://git-lfs.github.com/spec/v1\noid sha256:1234567890abcdef\nsize 123456\n'
  fs.writeFileSync(fakeLfsFile, lfsPointerContent, 'utf8')

  const origDir = process.env.NORI_MEDIA_DIR
  try {
    process.env.NORI_MEDIA_DIR = tempDir

    const resolved = await resolveValidMediaSource('toyota-fortuner-catalogue.png')
    assert.ok(resolved, 'Should resolve the real image despite LFS pointer candidate')
    assert.ok(!resolved.buffer.toString('utf8').startsWith('version https://git-lfs'))
  } finally {
    if (origDir !== undefined) {
      process.env.NORI_MEDIA_DIR = origDir
    } else {
      delete process.env.NORI_MEDIA_DIR
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('Vercel Blob & Cloud Storage Integration — detects Vercel Blob and locks major Node version', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'))
  assert.ok(pkg.engines?.node, 'package.json must specify engines.node')
  assert.ok(
    pkg.engines.node.includes('<25.0.0') || pkg.engines.node.startsWith('^24'),
    `Node.js engine must lock major version 24, got: ${pkg.engines.node}`,
  )

  // Verify Vercel Blob storage adapter module loads
  const { vercelBlobStorage } = await import('@payloadcms/storage-vercel-blob')
  assert.equal(typeof vercelBlobStorage, 'function', 'vercelBlobStorage must be exported')

  // Verify cloud-storage detection helper
  const origToken = process.env.BLOB_READ_WRITE_TOKEN
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN
    assert.equal(isVercelBlobConfigured(), false)

    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_123456'
    assert.equal(isVercelBlobConfigured(), true)
    assert.equal(isCloudStorageConfigured(), true)
    const cfg = getCloudStorageConfig()
    assert.equal(cfg?.provider, 'VERCEL_BLOB')
  } finally {
    if (origToken !== undefined) {
      process.env.BLOB_READ_WRITE_TOKEN = origToken
    } else {
      delete process.env.BLOB_READ_WRITE_TOKEN
    }
  }
})

test('Postgres SSL Normalization — converts weak/alias sslmodes to verify-full without rejectUnauthorized=false', () => {
  assert.equal(
    normalizePostgresUrl(
      'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require&channel_binding=require',
    ),
    'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
  )
  assert.equal(
    normalizePostgresUrl('postgres://user:pass@ep-test.neon.tech/neondb?sslmode=prefer'),
    'postgres://user:pass@ep-test.neon.tech/neondb?sslmode=verify-full',
  )
  assert.equal(
    normalizePostgresUrl('postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=verify-ca'),
    'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=verify-full',
  )
  assert.equal(
    normalizePostgresUrl('postgresql://user:pass@ep-test.neon.tech/neondb'),
    'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=verify-full',
  )
  assert.equal(
    normalizePostgresUrl(
      'postgresql://user:pass@ep-test.neon.tech/neondb?uselibpqcompat=true&sslmode=require',
    ),
    'postgresql://user:pass@ep-test.neon.tech/neondb?uselibpqcompat=true&sslmode=require',
  )
  assert.equal(
    normalizePostgresUrl('postgresql://user:pass@localhost:5432/nori'),
    'postgresql://user:pass@localhost:5432/nori',
  )

  const poolCfg = createPostgresPoolConfig(
    'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require',
  )
  assert.ok(poolCfg.connectionString.includes('sslmode=verify-full'))
  assert.equal(
    'ssl' in poolCfg,
    false,
    'Must never inject insecure ssl: { rejectUnauthorized: false }',
  )
  assert.ok(poolCfg.connectionTimeoutMillis >= 5000)
})

test('Vercel Blob Storage Guard — blocks silent local fallback on Vercel and supports env prefixing', () => {
  const origVercel = process.env.VERCEL
  const origVercelEnv = process.env.VERCEL_ENV
  const origToken = process.env.BLOB_READ_WRITE_TOKEN
  const origPrefix = process.env.BLOB_STORAGE_PREFIX

  try {
    // Non-Vercel local dev allows missing token
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV
    delete process.env.BLOB_READ_WRITE_TOKEN
    assert.doesNotThrow(() => assertVercelBlobStorageReady())

    // Vercel runtime without token MUST throw explicit config error
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    assert.throws(() => assertVercelBlobStorageReady(), /BLOB_READ_WRITE_TOKEN is required/)

    // Invalid token format MUST throw
    process.env.BLOB_READ_WRITE_TOKEN = 'invalid_token_format'
    assert.equal(isValidVercelBlobToken('invalid_token_format'), false)
    assert.throws(() => assertVercelBlobStorageReady(), /invalid format/i)

    // Valid token succeeds
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_TestStore01_SecretKey999'
    assert.equal(isValidVercelBlobToken(process.env.BLOB_READ_WRITE_TOKEN), true)
    assert.doesNotThrow(() => assertVercelBlobStorageReady())

    // Environment-separated prefix support
    delete process.env.BLOB_STORAGE_PREFIX
    assert.equal(getVercelBlobPrefix(), '')
    assert.equal(getVercelBlobObjectKey('toyota-fortuner-ext-1.jpg'), 'toyota-fortuner-ext-1.jpg')

    process.env.BLOB_STORAGE_PREFIX = '/staging/'
    assert.equal(getVercelBlobPrefix(), 'staging')
    assert.equal(
      getVercelBlobObjectKey('toyota-fortuner-ext-1.jpg'),
      'staging/toyota-fortuner-ext-1.jpg',
    )
  } finally {
    if (origVercel !== undefined) process.env.VERCEL = origVercel
    else delete process.env.VERCEL
    if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv
    else delete process.env.VERCEL_ENV
    if (origToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = origToken
    else delete process.env.BLOB_READ_WRITE_TOKEN
    if (origPrefix !== undefined) process.env.BLOB_STORAGE_PREFIX = origPrefix
    else delete process.env.BLOB_STORAGE_PREFIX
  }
})

test('Payload Config Safety — Postgres push is disabled, no prodMigrations auto-prompt, and no rejectUnauthorized=false exists', () => {
  const payloadConfigSrc = fs.readFileSync(path.resolve(rootDir, 'src/payload.config.ts'), 'utf8')
  assert.equal(
    /push:\s*true\b/.test(payloadConfigSrc),
    false,
    'src/payload.config.ts must never hardcode push: true',
  )
  assert.equal(
    /push:\s*false\b/.test(payloadConfigSrc),
    true,
    'src/payload.config.ts must explicitly keep push: false on database adapters',
  )
  assert.equal(
    /\bprodMigrations\s*:/.test(payloadConfigSrc),
    false,
    'src/payload.config.ts must not auto-run prodMigrations inside next build / serverless connect()',
  )
  assert.equal(
    payloadConfigSrc.includes('rejectUnauthorized: false'),
    false,
    'src/payload.config.ts must not use rejectUnauthorized: false',
  )
})

test('Postgres Migration Safety Guard — blocks unconfirmed Production writes and extracts full schema contract', async () => {
  const {
    assertMigrationEnvironmentAllowed,
    extractExpectedPostgresSchema,
    getRegisteredPostgresMigrationNames,
  } = await import('../scripts/pg-migrate-safe.mjs')

  assert.doesNotThrow(() =>
    assertMigrationEnvironmentAllowed({
      isAuditOnly: true,
      isProductionTarget: true,
      confirmProduction: false,
    }),
  )
  assert.throws(
    () =>
      assertMigrationEnvironmentAllowed({
        isAuditOnly: false,
        isProductionTarget: true,
        confirmProduction: false,
      }),
    /PG-MIGRATE-GUARD/,
  )
  assert.doesNotThrow(() =>
    assertMigrationEnvironmentAllowed({
      isAuditOnly: false,
      isProductionTarget: true,
      confirmProduction: true,
    }),
  )

  const expectedSchema = extractExpectedPostgresSchema()
  assert.equal(expectedSchema.size, 109, 'Expected 109 PostgreSQL tables in generated schema')
  assert.ok(expectedSchema.get('media')?.has('prefix'), 'media schema must require prefix')
  assert.ok(expectedSchema.get('media')?.has('_objectkey'), 'media schema must require _objectkey')

  const registered = getRegisteredPostgresMigrationNames()
  assert.deepEqual(registered, [
    '20261121_105804_init_postgres',
    '20261121_120000_media_cloud_storage_columns',
    '20261122_010000_perf_composite_indexes',
    '20261122_020000_parity_unique_constraints',
  ])
})

test('localMediaResizeHandler — Queries Payload media prefix hints only on local disk miss and handles gracefully without Cloud Storage', async () => {
  const origBlob = process.env.BLOB_READ_WRITE_TOKEN
  const origS3 = process.env.S3_BUCKET
  const origNoriS3 = process.env.NORI_S3_BUCKET
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.S3_BUCKET
    delete process.env.NORI_S3_BUCKET

    let queriedFilename = null
    const mockReq = {
      searchParams: new URLSearchParams({ w: '640', q: '75' }),
      headers: new Headers({ accept: 'image/webp,*/*' }),
      payload: {
        find: async ({ where }) => {
          queriedFilename = where?.filename?.equals ?? null
          return {
            docs: [
              {
                prefix: '1d86a1dc-7d05-4143-bad5-b6b67d5136b1',
                _objectKey: '1d86a1dc-7d05-4143-bad5-b6b67d5136b1/cloud-only-image.jpg',
              },
            ],
          }
        },
      },
    }

    const res = await localMediaResizeHandler(mockReq, {
      params: { collection: 'media', filename: 'cloud-only-image-test.jpg' },
    })
    assert.equal(res, undefined)
    assert.equal(queriedFilename, 'cloud-only-image-test.jpg')

    // Local seed hit must NEVER trigger a DB query
    let seedQueryCalled = false
    const seedReq = {
      searchParams: new URLSearchParams({ w: '640', q: '75' }),
      headers: new Headers({ accept: 'image/webp,*/*' }),
      payload: {
        find: async () => {
          seedQueryCalled = true
          return { docs: [] }
        },
      },
    }
    const seedRes = await localMediaResizeHandler(seedReq, {
      params: { collection: 'media', filename: SAMPLE_IMAGES.vehicleDetailExt },
    })
    assert.ok(seedRes instanceof Response)
    assert.equal(seedRes.status, 200)
    assert.equal(seedQueryCalled, false, 'Local media hits must skip DB metadata lookup')
  } finally {
    if (origBlob !== undefined) process.env.BLOB_READ_WRITE_TOKEN = origBlob
    else delete process.env.BLOB_READ_WRITE_TOKEN
    if (origS3 !== undefined) process.env.S3_BUCKET = origS3
    else delete process.env.S3_BUCKET
    if (origNoriS3 !== undefined) process.env.NORI_S3_BUCKET = origNoriS3
    else delete process.env.NORI_S3_BUCKET
  }
})
