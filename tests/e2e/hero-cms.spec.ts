import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'

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

function cleanupMediaRecords(mediaIds: string[]) {
  if (!mediaIds.length) return
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = OFF')
    for (const mediaId of mediaIds) {
      const row = db.prepare('SELECT filename FROM media WHERE id = ?').get(mediaId) as
        | { filename?: string }
        | undefined
      db.prepare(
        'DELETE FROM _nori_site_v_version_hero_slides WHERE desktop_image_id = ? OR mobile_image_id = ?',
      ).run(mediaId, mediaId)
      db.prepare(
        'UPDATE _nori_site_v SET version_story_image_id = NULL WHERE version_story_image_id = ?',
      ).run(mediaId)
      db.prepare(
        'UPDATE nori_site_hero_slides SET desktop_image_id = NULL WHERE desktop_image_id = ?',
      ).run(mediaId)
      db.prepare(
        'UPDATE nori_site_hero_slides SET mobile_image_id = NULL WHERE mobile_image_id = ?',
      ).run(mediaId)
      db.prepare(
        'DELETE FROM _media_v_rels WHERE parent_id IN (SELECT id FROM _media_v WHERE parent_id = ?)',
      ).run(mediaId)
      db.prepare('DELETE FROM _media_v WHERE parent_id = ?').run(mediaId)
      db.prepare('DELETE FROM media_rels WHERE parent_id = ?').run(mediaId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE media_id = ?').run(mediaId)
      db.prepare('DELETE FROM media WHERE id = ?').run(mediaId)
      if (row?.filename) {
        const fp = path.resolve(process.cwd(), 'media', row.filename)
        if (fs.existsSync(fp)) fs.unlinkSync(fp)
      }
    }
    db.exec('PRAGMA foreign_keys = ON')
  } finally {
    db.close()
  }
}

async function createTestImageBuffer({
  width,
  height,
  r,
  g,
  b,
  format = 'png',
}: {
  width: number
  height: number
  r: number
  g: number
  b: number
  format?: 'png' | 'webp' | 'jpeg'
}) {
  const img = sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
  if (format === 'webp') return img.webp({ quality: 85 }).toBuffer()
  if (format === 'jpeg') return img.jpeg({ quality: 85 }).toBuffer()
  return img.png().toBuffer()
}

test.describe('Hero Carousel CMS Save, Draft/Publish, Revalidation & Responsive Image E2E', () => {
  test('Tests 1-10: Full Admin Upload -> Save -> Draft Isolation -> Publish -> Homepage Sync, Focal Point, Mobile Fallback & Responsive Matrix', async ({
    browser,
    page,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const createdMediaIds: string[] = []

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const adminPage = await adminCtx.newPage()

    // Login via API in adminCtx to capture baseline & restore cleanly in finally
    const loginRes = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email: adminEmail, password: adminPassword },
    })
    expect(loginRes.status()).toBe(200)

    const initialPublishedRes = await adminCtx.request.get(
      `${ORIGIN}/nori-api/dashboard/content?draft=false`,
    )
    expect(initialPublishedRes.status()).toBe(200)
    const initialPublished = (await initialPublishedRes.json()).data

    try {
      // Navigate to Admin CMS Hero Carousel tab
      await adminPage.goto(`${ORIGIN}/dashboard/content`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('tab', { name: /Hero Carousel/ }).click()

      const slide0 = adminPage.getByTestId('hero-slide-card-0')
      await expect(slide0).toBeVisible()
      await expect(slide0).toContainText('✓ Đã lưu')

      // Check low-resolution warning when uploading an 800x450 Desktop image (< 1280x720)
      const lowResBuf = await createTestImageBuffer({
        width: 800,
        height: 450,
        r: 180,
        g: 70,
        b: 50,
        format: 'png',
      })
      const desktopInput0 = slide0.locator('input[type="file"]').first()
      const lowResUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await desktopInput0.setInputFiles({
        name: `hero-lowres-${tag}.png`,
        mimeType: 'image/png',
        buffer: lowResBuf,
      })
      const lowResUploadJson = await (await lowResUploadPromise).json()
      if (lowResUploadJson?.data?.id) createdMediaIds.push(lowResUploadJson.data.id)
      await expect(slide0).toContainText(
        'Ảnh có độ phân giải thấp, có thể bị giảm chất lượng trên màn hình lớn.',
      )

      // Test 2: Unsaved state indicator + Cancel/Reload keeps old saved image
      await expect(slide0).toContainText('● Có thay đổi chưa lưu')

      // Tab switch guard warns before leaving unsaved changes
      await adminPage.getByRole('tab', { name: /Thương hiệu/ }).click()
      const unsavedDialog = adminPage.getByRole('dialog')
      await expect(unsavedDialog).toContainText(
        'Bạn có thay đổi chưa được lưu. Bạn có chắc muốn rời khỏi trang?',
      )
      await unsavedDialog.getByRole('button', { name: 'Ở lại chỉnh sửa' }).click()
      await expect(slide0).toBeVisible()

      // Reload without saving -> dismiss beforeunload & confirm old image is still present
      adminPage.once('dialog', (d) => d.accept())
      await adminPage.reload({ waitUntil: 'networkidle' })
      await adminPage.getByRole('tab', { name: /Hero Carousel/ }).click()
      await expect(adminPage.getByTestId('hero-slide-card-0')).toContainText('✓ Đã lưu')
      await expect(adminPage.getByTestId('hero-slide-card-0')).not.toContainText(
        lowResUploadJson.data.url,
      )

      // Test 9 + Test 1: Upload large 3840x2160 4K image -> server optimizes to <= 1920px WebP -> Save Slide
      const large4kBuf = await createTestImageBuffer({
        width: 3840,
        height: 2160,
        r: 18,
        g: 95,
        b: 82,
        format: 'png',
      })
      const slide0AfterReload = adminPage.getByTestId('hero-slide-card-0')
      const largeUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await slide0AfterReload
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: `hero-4k-${tag}.png`,
          mimeType: 'image/png',
          buffer: large4kBuf,
        })
      const largeUploadJson = await (await largeUploadPromise).json()
      expect(largeUploadJson.success).toBe(true)
      const desktopMediaId = largeUploadJson.data.id as string
      const desktopMediaUrl = largeUploadJson.data.url as string
      createdMediaIds.push(desktopMediaId)
      expect(largeUploadJson.data.width).toBeLessThanOrEqual(1920)

      // Update Slide #1 title & set focal point to Right (75% 50%) for Test 8
      const newTitleFirst = `Hero Test ${tag}`
      await slide0AfterReload.locator('#slide-first-0').fill(newTitleFirst)
      await slide0AfterReload.getByRole('button', { name: 'Phải', exact: true }).click()
      await expect(slide0AfterReload).toContainText('Điểm trọng tâm (Focal Point): 75% 50%')

      // Verify Responsive Preview modal [Desktop] [Tablet] [Mobile] works before saving
      await slide0AfterReload.getByRole('button', { name: 'Xem trước', exact: true }).click()
      const previewDialog = adminPage.getByRole('dialog', {
        name: 'Xem trước hiển thị Slide Hero',
      })
      await expect(previewDialog).toBeVisible()
      await expect(previewDialog).toContainText('Có thay đổi chưa lưu')
      await previewDialog.getByRole('button', { name: /Mobile/ }).click()
      await expect(previewDialog).toContainText('Crop từ Desktop (75% 50%)')
      await previewDialog.getByRole('button', { name: 'Đóng hộp thoại' }).click()

      // Test 1: Click per-slide "Lưu thay đổi" -> wait for DB save -> reload CMS -> persisted!
      const saveSlideBtn = slide0AfterReload.getByRole('button', { name: 'Lưu thay đổi' })
      await saveSlideBtn.click()
      await expect(slide0AfterReload).toContainText('✓ Đã lưu', { timeout: 10_000 })

      await adminPage.reload({ waitUntil: 'networkidle' })
      await adminPage.getByRole('tab', { name: /Hero Carousel/ }).click()
      const slide0Persisted = adminPage.getByTestId('hero-slide-card-0')
      await expect(slide0Persisted.locator('#slide-first-0')).toHaveValue(newTitleFirst)
      await expect(slide0Persisted).toContainText('75% 50%')

      // Test 3: Saved as draft, NOT published yet -> Homepage MUST still render old published title!
      await page.goto('/', { waitUntil: 'networkidle' })
      await expect(page.locator('main h1')).not.toContainText(newTitleFirst)

      // Test 4 & Test 10: Admin clicks "Xuất bản lên website" -> homepage updates WITHOUT server restart!
      await adminPage.getByRole('button', { name: 'Xuất bản lên website' }).click()
      await expect(
        adminPage.getByText('Đã xuất bản. Nội dung mới đang được sử dụng trên website.').first(),
      ).toBeVisible({ timeout: 10_000 })

      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.locator('main h1')).toContainText(newTitleFirst)
      const homeDesktopImg = page
        .getByRole('region', { name: 'Bộ sưu tập phương tiện & Hành trình NORI' })
        .locator('img')
        .first()
      await expect(homeDesktopImg).toHaveJSProperty('complete', true)
      const homeImgSrc = await homeDesktopImg.evaluate((el: HTMLImageElement) => el.currentSrc)
      expect(homeImgSrc).toContain(desktopMediaUrl)

      // Test 5 & Test 8 & Test 9: Without Mobile image, 375px Mobile uses desktop image, keeps focal 75% 50%, requests small w= via srcSet
      await page.setViewportSize({ width: 375, height: 812 })
      await page.reload({ waitUntil: 'networkidle' })
      const mobileImg = page
        .getByRole('region', { name: 'Bộ sưu tập phương tiện & Hành trình NORI' })
        .locator('img')
        .first()
      await expect(mobileImg).toHaveJSProperty('complete', true)
      const mobileMetrics = await mobileImg.evaluate((el: HTMLImageElement) => {
        const cs = getComputedStyle(el)
        return {
          currentSrc: el.currentSrc,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          objectFit: cs.objectFit,
          objectPosition: cs.objectPosition,
        }
      })
      expect(mobileMetrics.currentSrc).toContain(desktopMediaUrl)
      expect(mobileMetrics.currentSrc).toMatch(/[?&]w=(384|640|750|828)\b/)
      expect(mobileMetrics.objectFit).toBe('cover')
      expect(mobileMetrics.objectPosition).toBe('75% 50%')
      expect(mobileMetrics.naturalWidth).toBeGreaterThan(0)

      // Lazy loading check: only slide 0's image is mounted initially
      const mountedHeroImgs = await page
        .getByRole('region', { name: 'Bộ sưu tập phương tiện & Hành trình NORI' })
        .locator('img')
        .count()
      expect(mountedHeroImgs).toBe(1)

      // Test 6: Upload distinct Mobile image -> Save & Publish -> Mobile uses Mobile image, Desktop uses Desktop image
      const mobileOnlyBuf = await createTestImageBuffer({
        width: 900,
        height: 1125,
        r: 95,
        g: 42,
        b: 120,
        format: 'webp',
      })
      const mobileUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await adminPage
        .getByTestId('hero-slide-card-0')
        .locator('input[type="file"]')
        .nth(1)
        .setInputFiles({
          name: `hero-mobile-${tag}.webp`,
          mimeType: 'image/webp',
          buffer: mobileOnlyBuf,
        })
      const mobileUploadJson = await (await mobileUploadPromise).json()
      expect(mobileUploadJson.success).toBe(true)
      const mobileMediaId = mobileUploadJson.data.id as string
      const mobileMediaUrl = mobileUploadJson.data.url as string
      createdMediaIds.push(mobileMediaId)

      await adminPage
        .getByTestId('hero-slide-card-0')
        .getByRole('button', { name: 'Lưu thay đổi' })
        .click()
      await expect(adminPage.getByTestId('hero-slide-card-0')).toContainText('✓ Đã lưu')
      await adminPage.getByRole('button', { name: 'Xuất bản lên website' }).click()
      await expect(
        adminPage.getByText('Đã xuất bản. Nội dung mới đang được sử dụng trên website.').first(),
      ).toBeVisible()

      // Mobile viewport loads mobileMediaUrl
      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload({ waitUntil: 'networkidle' })
      const mobileCustomSrc = await page
        .getByRole('region', { name: 'Bộ sưu tập phương tiện & Hành trình NORI' })
        .locator('img')
        .first()
        .evaluate((el: HTMLImageElement) => el.currentSrc)
      expect(mobileCustomSrc).toContain(mobileMediaUrl)

      // Desktop viewport loads desktopMediaUrl
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.reload({ waitUntil: 'networkidle' })
      const desktopCustomSrc = await page
        .getByRole('region', { name: 'Bộ sưu tập phương tiện & Hành trình NORI' })
        .locator('img')
        .first()
        .evaluate((el: HTMLImageElement) => el.currentSrc)
      expect(desktopCustomSrc).toContain(desktopMediaUrl)

      // Test 7: All 8 required widths render without image distortion or horizontal overflow
      for (const width of [375, 390, 430, 768, 1024, 1366, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        const check = await page.evaluate(() => {
          const hero = document.querySelector('section[aria-roledescription="carousel"]')
          const img = hero?.querySelector('img') as HTMLImageElement | null
          const h1 = hero?.querySelector('h1')
          const heroRect = hero?.getBoundingClientRect()
          const h1Rect = h1?.getBoundingClientRect()
          return {
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
            objectFit: img ? getComputedStyle(img).objectFit : '',
            naturalWidth: img?.naturalWidth ?? 0,
            textInsideHero: Boolean(
              heroRect &&
              h1Rect &&
              h1Rect.left >= heroRect.left - 1 &&
              h1Rect.right <= heroRect.right + 1 &&
              h1Rect.bottom <= heroRect.bottom + 1,
            ),
          }
        })
        expect(check.noOverflow, `Zero overflow at ${width}px`).toBe(true)
        expect(check.objectFit, `object-fit: cover at ${width}px`).toBe('cover')
        expect(check.naturalWidth, `naturalWidth > 0 at ${width}px`).toBeGreaterThan(0)
        expect(check.textInsideHero, `Hero copy inside container at ${width}px`).toBe(true)
      }
    } finally {
      // Restore original published NoriSite heroSlides & status cleanly
      await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: {
          _status: 'published',
          heroAutoplaySeconds: initialPublished.heroAutoplaySeconds ?? 6,
          heroSlides: (initialPublished.heroSlides ?? []).map(
            (s: Record<string, unknown>, idx: number) => ({
              id: s.id,
              titleFirst: s.titleFirst,
              titleSecond: s.titleSecond,
              eyebrow: s.eyebrow,
              categoryBadge: s.categoryBadge,
              description: s.description,
              ctaText: s.ctaText,
              ctaHref: s.ctaHref,
              secondaryText: s.secondaryText,
              secondaryHref: s.secondaryHref,
              desktopImageId: s.desktopImageId,
              mobileImageId: s.mobileImageId,
              focalX: s.focalX ?? 50,
              focalY: s.focalY ?? 50,
              mobileFocalX: s.mobileFocalX ?? 50,
              mobileFocalY: s.mobileFocalY ?? 50,
              relatedCategory: s.relatedCategory,
              relatedModelId: s.relatedModelId,
              credit: s.credit,
              sourceUrl: s.sourceUrl,
              durationSeconds: s.durationSeconds,
              order: idx,
              active: s.active !== false,
            }),
          ),
        },
      })
      await adminCtx.close()
      cleanupMediaRecords(createdMediaIds)
    }
  })

  test('Undo (Hủy thay đổi), Missing Desktop Image validation/retry state, and Route navigation unsaved guard', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const createdMediaIds: string[] = []
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const adminPage = await adminCtx.newPage()

    try {
      const loginRes = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })
      expect(loginRes.status()).toBe(200)

      await adminPage.goto(`${ORIGIN}/dashboard/content`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('tab', { name: /Hero Carousel/ }).click()

      const slide0 = adminPage.getByTestId('hero-slide-card-0')
      const originalTitle = await slide0.locator('#slide-first-0').inputValue()

      // 1. Upload new Desktop image & edit title without saving -> Undo ("Hủy thay đổi")
      const tempBuf = await createTestImageBuffer({
        width: 1280,
        height: 720,
        r: 40,
        g: 120,
        b: 140,
        format: 'webp',
      })
      const uploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await slide0
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: `hero-undo-${tag}.webp`,
          mimeType: 'image/webp',
          buffer: tempBuf,
        })
      const uploadJson = await (await uploadPromise).json()
      const tempMediaId = uploadJson.data.id as string
      createdMediaIds.push(tempMediaId)

      await slide0.locator('#slide-first-0').fill(`Unsaved Edit ${tag}`)
      await expect(slide0).toContainText('● Có thay đổi chưa lưu')

      // Route navigation guard triggers on clicking "Xem trước website" link
      await adminPage.getByRole('link', { name: /Xem trước website/ }).click()
      const navWarnDialog = adminPage.getByRole('dialog')
      await expect(navWarnDialog).toContainText(
        'Bạn có thay đổi chưa được lưu. Bạn có chắc muốn rời khỏi trang?',
      )
      await navWarnDialog.getByRole('button', { name: 'Ở lại chỉnh sửa' }).click()
      await expect(adminPage).toHaveURL(`${ORIGIN}/dashboard/content`)

      // Click "Hủy thay đổi" -> restores original title & saved state, and media stays in Media Library
      await slide0.getByRole('button', { name: 'Hủy thay đổi' }).click()
      await expect(slide0.locator('#slide-first-0')).toHaveValue(originalTitle)
      await expect(slide0).toContainText('✓ Đã lưu')

      const mediaCheck = await adminCtx.request.get(`${ORIGIN}/nori-api/dashboard/media`)
      const mediaJson = await mediaCheck.json()
      expect(
        (mediaJson.data.items as { id: string }[]).some((m) => m.id === tempMediaId),
        'Uploaded media must NOT be deleted when admin cancels unsaved slide edit',
      ).toBe(true)

      // 2. Add new slide without Desktop image -> click Save -> shows error & "Không thể lưu – Thử lại"
      await adminPage.getByRole('button', { name: 'Thêm Slide mới' }).click()
      const newSlide = adminPage.getByTestId('hero-slide-card-5')
      await expect(newSlide).toBeVisible()
      await newSlide.getByRole('button', { name: 'Lưu thay đổi' }).click()
      await expect(newSlide.getByRole('button', { name: 'Không thể lưu – Thử lại' })).toBeVisible()
      await expect(newSlide).toContainText('Ảnh nền Desktop là bắt buộc')
    } finally {
      await adminCtx.close()
      cleanupMediaRecords(createdMediaIds)
    }
  })
})
