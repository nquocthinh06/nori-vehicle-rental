import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from '@playwright/test'
import zlib from 'node:zlib'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

function getDbPath(): string {
  const envPath =
    process.env.NORI_SQLITE_PATH?.trim() || process.env.DATABASE_URI?.replace(/^file:/, '').trim()
  const resolved = envPath
    ? path.resolve(envPath)
    : fs.existsSync(path.resolve('.next/standalone/nori.db'))
      ? path.resolve('.next/standalone/nori.db')
      : path.resolve('nori.db')
  if (resolved === path.resolve('nori.db') && process.env.NORI_ALLOW_LIVE_DB_TEST !== '1') {
    throw new Error(
      '[SAFEGUARD] Refusing E2E access to live ./nori.db without NORI_ALLOW_LIVE_DB_TEST=1.',
    )
  }
  return resolved
}

function getAdminCredentials() {
  const envPath = path.resolve(process.cwd(), '.env')
  let email = process.env.NORI_ADMIN_EMAIL || 'admin@nori.vn'
  let password = process.env.NORI_ADMIN_PASSWORD || ''
  if (fs.existsSync(envPath)) {
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      let val = line.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      const k = line.slice(0, eq).trim()
      if (k === 'NORI_ADMIN_EMAIL') email = val
      if (k === 'NORI_ADMIN_PASSWORD') password = val
    }
  }
  return {
    email: process.env.NORI_ADMIN_EMAIL || email,
    password: process.env.NORI_ADMIN_PASSWORD || password,
  }
}

function buildTestBrochurePdf(lines: string[]): Buffer {
  const escaped = lines.map((line) =>
    line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'),
  )
  const bt = `BT\n/F1 12 Tf\n${escaped.map((l) => `(${l}) Tj`).join('\n')}\nET`
  const compressed = zlib.deflateSync(Buffer.from(bt, 'latin1'))
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`,
      'latin1',
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ])
}

function cleanupIsolatedImportArtifacts(params: { slugs?: string[]; customerEmails?: string[] }) {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const slug of params.slugs ?? []) {
      const m = db.prepare('SELECT id FROM vehicle_models WHERE slug = ?').get(slug) as
        | { id: string }
        | undefined
      if (m) {
        const jobs = db
          .prepare('SELECT id FROM vehicle_import_jobs WHERE target_model_id = ?')
          .all(m.id) as { id: string }[]
        for (const j of jobs) {
          db.prepare('DELETE FROM vehicle_import_jobs_rels WHERE parent_id = ?').run(j.id)
          db.prepare('DELETE FROM vehicle_import_jobs WHERE id = ?').run(j.id)
        }
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE vehicle_models_id = ?').run(
          m.id,
        )
        db.prepare('DELETE FROM vehicle_models WHERE id = ?').run(m.id)
      }
    }
    // Also clean any non-target AI/preview jobs created during E2E
    const orphanJobs = db
      .prepare('SELECT id FROM vehicle_import_jobs WHERE target_model_id IS NULL')
      .all() as { id: string }[]
    for (const oj of orphanJobs) {
      db.prepare('DELETE FROM vehicle_import_jobs_rels WHERE parent_id = ?').run(oj.id)
      db.prepare('DELETE FROM vehicle_import_jobs WHERE id = ?').run(oj.id)
    }
    for (const email of params.customerEmails ?? []) {
      db.prepare('DELETE FROM users WHERE email = ?').run(email)
    }
  } finally {
    db.close()
  }
}

test.describe('NORI Smart Vehicle Import & Catalogue Sync E2E (E2E-01 .. E2E-15)', () => {
  test('E2E-01..03: RBAC & Origin & SSRF protection on /nori-api/dashboard/catalogue-import/*', async ({
    request,
    browser,
  }) => {
    // 1. Unauthenticated access blocked with 403
    const unauthJobs = await request.get(`${ORIGIN}/nori-api/dashboard/catalogue-import/jobs`)
    expect(unauthJobs.status()).toBe(403)

    // 2. Cross-origin / cross-site mutation blocked by assertOrigin() with 403
    const crossOriginPreview = await request.post(
      `${ORIGIN}/nori-api/dashboard/catalogue-import/preview`,
      {
        headers: { origin: 'https://evil.example.com' },
        data: { method: 'URL', url: 'https://www.toyota.com.vn/fortuner' },
      },
    )
    expect(crossOriginPreview.status()).toBe(403)

    // 3. Authenticated Customer receives 403 Forbidden
    const custEmail = `e2e-import-cust-${randomBytes(4).toString('hex')}@example.test`
    const custContext = await browser.newContext()
    try {
      const regRes = await custContext.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Import RBAC Tester',
          email: custEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
      })
      expect(regRes.status()).toBe(201)

      const custJobs = await custContext.request.get(
        `${ORIGIN}/nori-api/dashboard/catalogue-import/jobs`,
      )
      expect(custJobs.status()).toBe(403)

      const custPreview = await custContext.request.post(
        `${ORIGIN}/nori-api/dashboard/catalogue-import/preview`,
        {
          headers: AUTH_HEADERS,
          data: { method: 'URL', url: 'https://www.toyota.com.vn/fortuner' },
        },
      )
      expect(custPreview.status()).toBe(403)
    } finally {
      await custContext.close()
      cleanupIsolatedImportArtifacts({ customerEmails: [custEmail] })
    }

    // 4. Admin SSRF probes fail cleanly with 400 (zero external fetch)
    const { email, password } = getAdminCredentials()
    const adminContext = await browser.newContext()
    try {
      const loginRes = await adminContext.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email, password },
      })
      expect(loginRes.status()).toBe(200)

      for (const badUrl of [
        'http://www.toyota.com.vn/fortuner',
        'https://127.0.0.1/admin',
        'https://localhost/internal',
        'https://evil-untrusted-domain.example/car',
      ]) {
        const res = await adminContext.request.post(
          `${ORIGIN}/nori-api/dashboard/catalogue-import/preview`,
          {
            headers: AUTH_HEADERS,
            data: { method: 'URL', url: badUrl },
          },
        )
        expect(res.status()).toBe(400)
      }
    } finally {
      await adminContext.close()
    }
  })

  test('E2E-04..12: Admin Smart Import UI (5 modes, PDF brochure, Bulk JSON, Diff, Field Locks, Publish, Catalogue Attribution, Rollback)', async ({
    page,
  }) => {
    const tag = randomBytes(3).toString('hex')
    const bulkSlug = `toyota-e2e-import-${tag}`
    const bulkName = `Toyota E2E Import ${tag}`
    const pdfSlug = `honda-e2e-brochure-${tag}`
    const pdfName = `Honda E2E Brochure ${tag}`

    const { email, password } = getAdminCredentials()

    try {
      // Login via API into browser page context
      const loginRes = await page.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email, password },
      })
      expect(loginRes.status()).toBe(200)

      // Open Admin Models workspace
      await page.goto('/dashboard/models', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: /Quản trị Catalogue Dòng xe/i })).toBeVisible()

      // Verify toolbar buttons & new list filters
      await expect(page.getByRole('button', { name: 'Thêm dòng xe thủ công' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Nhập từ website hãng' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tìm kiếm thông minh' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Nhập hàng loạt' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Nhập từ brochure' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Lịch sử nhập liệu' })).toBeVisible()
      await expect(page.locator('#model-brand-filter')).toBeVisible()
      await expect(page.locator('#model-ver-filter')).toBeVisible()
      await expect(page.locator('#model-visible-filter')).toBeVisible()

      // Open Smart Import Drawer in URL mode & check all 6 tabs + Manual fallback
      await page.getByRole('button', { name: 'Nhập từ website hãng' }).click()
      const dialog = page.getByRole('dialog', {
        name: /Nhập thông tin xe thông minh|Đồng bộ & Nhập thông minh/i,
      })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Nhập từ website hãng' })).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Tìm kiếm thông minh' })).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Nhập hàng loạt' })).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Nhập từ Brochure PDF' })).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Nhập thủ công' })).toBeVisible()
      await expect(dialog.getByRole('tab', { name: 'Lịch sử nhập liệu' })).toBeVisible()

      // Test Manual Fallback tab handoff
      await dialog.getByRole('tab', { name: 'Nhập thủ công' }).click()
      await expect(
        dialog.getByRole('button', { name: 'Mở trình chỉnh sửa dòng xe thủ công' }),
      ).toBeVisible()

      // Test AI Search tab under NORI_AI_TEST_MOCK=1 & Unsaved-Changes Guard
      await dialog.getByRole('tab', { name: 'Tìm kiếm thông minh' }).click()
      await dialog.locator('#ai-brand').fill('Toyota')
      await dialog.locator('#ai-model').fill(`Fortuner Mock ${tag}`)
      await dialog.getByRole('button', { name: 'Tìm kiếm & Xem trước' }).click()
      await expect(dialog.getByText('Xem trước trước khi lưu')).toBeVisible({ timeout: 15_000 })
      // Clicking Hủy with unsaved preview triggers inline unsaved-changes confirmation dialog
      await dialog.getByRole('button', { name: 'Hủy' }).click()
      const confirmCloseDialog = page.getByRole('dialog', { name: 'Đóng trình nhập thông minh?' })
      await expect(confirmCloseDialog).toBeVisible()
      await confirmCloseDialog.getByRole('button', { name: 'Bỏ thay đổi & Đóng' }).click()
      await expect(dialog).toBeHidden()

      // Test Bulk Import (NORI JSON) -> Preview Before Save -> Save Draft/Verified Hidden
      await page.getByRole('button', { name: 'Nhập hàng loạt' }).click()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'CSV / NORI JSON' }).click()
      await dialog.locator('#bulk-import-input').fill(
        JSON.stringify([
          {
            brand: 'Toyota',
            name: bulkName,
            officialName: bulkName,
            category: 'CAR',
            subCategory: 'SUV',
            modelYear: 2026,
            seats: 7,
            fuelType: 'Dầu (Diesel)',
            msrpReferenceVnd: 1180000000,
            shortDescription: 'Mô tả ban đầu đã xác minh cho bản E2E.',
            sourceUrl: 'https://www.toyota.com.vn/fortuner',
            specifications: [
              { group: 'ENGINE', label: 'Động cơ', value: '2.8L Diesel', confidence: 'HIGH' },
            ],
          },
        ]),
      )
      await dialog.getByRole('button', { name: 'Phân tích danh sách' }).click()
      await expect(dialog.getByText('Xem trước trước khi lưu')).toBeVisible({ timeout: 15_000 })
      await dialog.getByRole('button', { name: 'Xác nhận nhập dữ liệu' }).click()
      await expect(dialog).toBeHidden({ timeout: 15_000 })

      // Re-import same model with modified fields -> Side-by-side Diff -> Lock shortDescription -> Publish
      await page.getByRole('button', { name: 'Nhập hàng loạt' }).click()
      await dialog.getByRole('button', { name: 'CSV / NORI JSON' }).click()
      await dialog.locator('#bulk-import-input').fill(
        JSON.stringify([
          {
            brand: 'Toyota',
            name: bulkName,
            officialName: bulkName,
            category: 'CAR',
            subCategory: 'SUV',
            modelYear: 2026,
            seats: 7,
            fuelType: 'Dầu (Diesel)',
            msrpReferenceVnd: 1210000000,
            shortDescription: 'MÔ TẢ BỊ CHẶN GHI ĐÈ KHI KHÓA',
            description: 'Giới thiệu chi tiết phiên bản đồng bộ lần 2.',
            sourceUrl: 'https://www.toyota.com.vn/fortuner',
            specifications: [
              { group: 'ENGINE', label: 'Động cơ', value: '2.8L Diesel Turbo', confidence: 'HIGH' },
            ],
          },
        ]),
      )
      await dialog.getByRole('button', { name: 'Phân tích danh sách' }).click()
      await expect(dialog.getByText(/Bảng đối chiếu trường dữ liệu/)).toBeVisible({
        timeout: 15_000,
      })

      // Lock `shortDescription` row via UI Lock button (triggers PATCH .../models/[id]/locks)
      const shortDescRow = dialog.locator('tr', { hasText: 'Mô tả ngắn' })
      await shortDescRow.getByRole('button', { name: /Khóa|Đã khóa/ }).click()
      await expect(shortDescRow.getByRole('button', { name: 'Đã khóa' })).toBeVisible({
        timeout: 10_000,
      })

      // Publish updated model
      await dialog.getByRole('button', { name: 'Lưu & Xuất bản' }).click()
      await expect(dialog).toBeHidden({ timeout: 15_000 })

      // Verify Public Customer Detail shows Verified Catalogue Attribution (and locked shortDescription preserved in DB)
      await page.goto(`/vehicles/${bulkSlug}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Giới thiệu chi tiết phiên bản đồng bộ lần 2.')).toBeVisible()
      await expect(page.getByText('MÔ TẢ BỊ CHẶN GHI ĐÈ KHI KHÓA')).toHaveCount(0)
      const attrRegion = page.getByRole('region', { name: 'Nguồn thông tin catalogue' })
      await expect(attrRegion).toBeVisible()
      await expect(
        attrRegion.getByText('Thông số & phiên bản hãng (không phải DEMO)'),
      ).toBeVisible()

      const dbVerifyLock = new DatabaseSync(getDbPath(), { readOnly: true })
      const savedLockedRow = dbVerifyLock
        .prepare('SELECT short_description, revision_number FROM vehicle_models WHERE slug = ?')
        .get(bulkSlug) as { short_description?: string; revision_number?: number } | undefined
      dbVerifyLock.close()
      expect(savedLockedRow?.short_description).toBe('Mô tả ban đầu đã xác minh cho bản E2E.')
      expect(savedLockedRow?.revision_number).toBe(2)

      // Verify existing Toyota Fortuner keeps DEMO fleet separation intact
      await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Có xe thực tế (DEMO)')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Nguồn thông tin catalogue' })).toBeVisible()

      // Test PDF Brochure Upload & Extraction -> Preview -> Publish
      await page.goto('/dashboard/models', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Nhập từ brochure' }).click()
      const pdfBuf = buildTestBrochurePdf([
        pdfName,
        'Thuong hieu: Honda',
        'Gia niem yet: 995.000.000 VND',
        'Dong co: 1.5L Turbo',
        'Muc tieu thu: ~6.8 lit/100km',
      ])
      const pdfInput = dialog.locator('input[type="file"][accept*="pdf"]')
      await pdfInput.setInputFiles({
        name: `${pdfSlug}-2026.pdf`,
        mimeType: 'application/pdf',
        buffer: pdfBuf,
      })
      await dialog.getByRole('button', { name: 'Trích xuất thông số PDF' }).click()
      await expect(dialog.getByText('Xem trước trước khi lưu')).toBeVisible({ timeout: 15_000 })
      await expect(dialog.getByText(/Cần xác minh/i).first()).toBeVisible()
      await dialog.getByRole('button', { name: 'Lưu & Xuất bản' }).click()
      await expect(dialog).toBeHidden({ timeout: 15_000 })

      // Test History + Rollback on the bulk-updated model
      await page.getByRole('button', { name: 'Lịch sử nhập liệu' }).click()
      await expect(dialog).toBeVisible()
      const rollbackBtn = dialog.getByRole('button', { name: 'Khôi phục phiên bản trước' }).first()
      await expect(rollbackBtn).toBeVisible({ timeout: 10_000 })
      await rollbackBtn.click()
      const rollbackDialog = page.getByRole('dialog', {
        name: 'Khôi phục phiên bản trước khi nhập?',
      })
      await expect(rollbackDialog).toBeVisible()
      await rollbackDialog.getByRole('button', { name: 'Xác nhận khôi phục' }).click()
      await expect(page.getByText(/Đã khôi phục dòng xe/i)).toBeVisible({ timeout: 10_000 })
    } finally {
      cleanupIsolatedImportArtifacts({ slugs: [bulkSlug, pdfSlug] })
    }
  })

  test('E2E-13..15: Catalogue CLI validate, status, and dry-run import on isolated DB', async () => {
    const dbPath = getDbPath()
    const validateOut = execFileSync(process.execPath, ['scripts/catalogue-cli.mjs', 'validate'], {
      encoding: 'utf8',
    })
    expect(validateOut).toContain('ok=true')

    const statusOut = execFileSync(
      process.execPath,
      ['scripts/catalogue-cli.mjs', 'status', '--model', 'toyota-fortuner', '--db', dbPath],
      { encoding: 'utf8' },
    )
    expect(statusOut).toContain('toyota-fortuner')

    const dryImportOut = execFileSync(
      process.execPath,
      ['scripts/catalogue-cli.mjs', 'import', '--dry-run', '--db', dbPath],
      { encoding: 'utf8' },
    )
    expect(dryImportOut).toContain('DRY_RUN')
  })
})
