import { test, expect, type APIRequestContext } from '@playwright/test'
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

async function createImageBuffer(
  width: number,
  height: number,
  rgb: [number, number, number],
  format: 'jpeg' | 'png' | 'webp',
): Promise<Buffer> {
  const img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
  if (format === 'jpeg') return img.jpeg({ quality: 86 }).toBuffer()
  if (format === 'webp') return img.webp({ quality: 86 }).toBuffer()
  return img.png().toBuffer()
}

function cleanupPostsAndMedia(postIds: string[], mediaIds: string[]) {
  if (!postIds.length && !mediaIds.length) return
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = OFF')
    for (const postId of postIds) {
      db.prepare(
        'DELETE FROM _posts_v_rels WHERE parent_id IN (SELECT id FROM _posts_v WHERE parent_id = ?)',
      ).run(postId)
      db.prepare('DELETE FROM _posts_v WHERE parent_id = ?').run(postId)
      db.prepare('DELETE FROM posts_rels WHERE parent_id = ?').run(postId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE posts_id = ?').run(postId)
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId)
    }
    for (const mediaId of mediaIds) {
      const row = db.prepare('SELECT filename FROM media WHERE id = ?').get(mediaId) as
        | { filename?: string }
        | undefined
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

async function expectImageLoaded(
  imgLocator: ReturnType<import('@playwright/test').Page['locator']>,
) {
  await expect
    .poll(
      async () => imgLocator.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { timeout: 10_000 },
    )
    .toBe(true)
}

async function loginAdminApi(request: APIRequestContext) {
  const { email, password } = getAdminCredentials()
  const res = await request.post(`${ORIGIN}/nori-api/auth/login`, {
    headers: AUTH_HEADERS,
    data: { email, password },
  })
  expect(res.status()).toBe(200)
}

test.describe('Posts Banner, Draft/Publish, Promotion Link, SEO & Responsive E2E', () => {
  test('Full E2E: Validation, JPG/PNG/WEBP Upload, Media Library Picker, Draft Isolation, Publish, Replace/Delete Banner, Promotion Sync, SEO OG & Responsive', async ({
    browser,
    page,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const createdPostIds: string[] = []
    const createdMediaIds: string[] = []

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const adminPage = await adminCtx.newPage()
    const custCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })

    try {
      // 1. Authorization: anonymous & normal customer cannot upload banner or mutate posts
      const jpgBuf = await createImageBuffer(1280, 720, [18, 117, 104], 'jpeg')
      const pngBuf = await createImageBuffer(1280, 720, [24, 68, 92], 'png')
      const webpBuf = await createImageBuffer(1280, 720, [145, 76, 38], 'webp')

      const anonMediaRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: `anon-${tag}.jpg`, mimeType: 'image/jpeg', buffer: jpgBuf },
          alt: 'Unauthorized test',
          purpose: 'post-banner',
        },
      })
      expect(anonMediaRes.status()).toBe(403)

      const anonPostRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/posts`, {
        headers: AUTH_HEADERS,
        data: { title: 'Unauthorized post', content: 'Blocked', _status: 'published' },
      })
      expect(anonPostRes.status()).toBe(403)

      const custEmail = `post-cust-${tag}@nori.test`
      const regRes = await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách Kiểm Thử',
          email: custEmail,
          phone: '0901234567',
          password: 'Password123',
          confirmPassword: 'Password123',
        },
      })
      expect(regRes.status()).toBe(201)

      const custMediaRes = await custCtx.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: `cust-${tag}.png`, mimeType: 'image/png', buffer: pngBuf },
          alt: 'Customer unauthorized',
          purpose: 'post-banner',
        },
      })
      expect(custMediaRes.status()).toBe(403)

      const custPostRes = await custCtx.request.post(`${ORIGIN}/nori-api/dashboard/posts`, {
        headers: AUTH_HEADERS,
        data: { title: 'Customer post', content: 'Blocked', _status: 'published' },
      })
      expect(custPostRes.status()).toBe(403)

      // 2. Admin login and navigate to /dashboard/posts
      await loginAdminApi(adminCtx.request)
      await adminPage.goto(`${ORIGIN}/dashboard/posts`, { waitUntil: 'networkidle' })
      await expect(adminPage.getByRole('button', { name: /Viết bài mới/ })).toBeVisible()

      // Open Create Modal
      await adminPage.getByRole('button', { name: /Viết bài mới/ }).click()
      const dialog = adminPage.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByTestId('post-banner-section')).toContainText(
        'Khuyến nghị ảnh ngang tỷ lệ 16:9, độ phân giải từ 1200px trở lên',
      )

      // 3. Invalid file format validation (.txt)
      const fileInput = dialog.locator('#post-banner-input')
      await fileInput.setInputFiles({
        name: `invalid-${tag}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image file'),
      })
      await expect(dialog.getByTestId('post-banner-section')).toContainText(
        'Định dạng tệp không hợp lệ',
      )

      // 4. Spoofed file magic bytes validation (text pretending to be .jpg)
      const spoofUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await fileInput.setInputFiles({
        name: `spoof-${tag}.jpg`,
        mimeType: 'image/jpeg',
        buffer: Buffer.from('this is plain text masquerading as jpeg'),
      })
      const spoofRes = await spoofUploadPromise
      expect(spoofRes.status()).toBe(400)
      await expect(dialog.getByTestId('post-banner-section')).toContainText(
        'không phải hình ảnh JPG, PNG hoặc WEBP hợp lệ',
      )

      // 5. Oversized file validation (> 8 MB)
      const oversizedBuf = Buffer.alloc(8 * 1024 * 1024 + 512, 0xff)
      await fileInput.setInputFiles({
        name: `oversize-${tag}.jpg`,
        mimeType: 'image/jpeg',
        buffer: oversizedBuf,
      })
      await expect(dialog.getByTestId('post-banner-section')).toContainText(
        'Dung lượng ảnh vượt quá giới hạn 8 MB',
      )

      // 6. Publish validation check (missing title & content)
      await dialog.getByRole('button', { name: 'Xuất bản' }).click()
      await expect(dialog).toContainText('Vui lòng nhập tiêu đề bài viết.')

      // 7. Fill post details (Ưu đãi & Sự kiện + liên kết Promotion NORIXINCAMON nếu có)
      const promoPostTitle = `Mùa đông không lạnh, vi vu cùng Nori ${tag}`
      const promoPostExcerpt = `Ưu đãi đặc biệt mùa đông cùng NORI (${tag}).`
      const promoPostContent = `Đoạn 1: Khởi hành mùa đông cùng NORI với ưu đãi dành riêng cho khách hàng đặt xe trực tuyến (${tag}).\n\nĐoạn 2: Vui lòng xem chi tiết mã ưu đãi chính thức đi kèm bài viết.`
      const promoSeoTitle = `SEO Title Mùa Đông ${tag} | NORI`
      const promoSeoDesc = `SEO Meta Description riêng cho bài viết ${tag} trên NORI.`

      await dialog.locator('#post-title').fill(promoPostTitle)
      await dialog.locator('#post-cat').selectOption('PROMOTION')

      // Check if NORIXINCAMON promotion exists in dropdown and link it
      const promoSelect = dialog.locator('#post-promotion')
      await expect(promoSelect).toBeVisible()
      const promoOptions = await promoSelect.locator('option').allTextContents()
      const noriPromoOptionIdx = promoOptions.findIndex((t) => t.includes('NORIXINCAMON'))
      let linkedPromoCode: string | null = null
      if (noriPromoOptionIdx >= 0) {
        const val = await promoSelect
          .locator('option')
          .nth(noriPromoOptionIdx)
          .getAttribute('value')
        if (val) {
          await promoSelect.selectOption(val)
          linkedPromoCode = 'NORIXINCAMON'
        }
      }

      await dialog.locator('#post-excerpt').fill(promoPostExcerpt)
      await dialog.locator('#post-content').fill(promoPostContent)
      await dialog.locator('#post-seo-title').fill(promoSeoTitle)
      await dialog.locator('#post-seo-desc').fill(promoSeoDesc)

      // 8. Upload JPG banner -> verify preview & metadata
      const jpgUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await fileInput.setInputFiles({
        name: `banner-jpg-${tag}.jpg`,
        mimeType: 'image/jpeg',
        buffer: jpgBuf,
      })
      const jpgUploadRes = await jpgUploadPromise
      expect(jpgUploadRes.status()).toBe(201)
      const jpgJson = await jpgUploadRes.json()
      const jpgMediaId = jpgJson.data.id as string
      createdMediaIds.push(jpgMediaId)

      const bannerPreview = dialog.getByTestId('post-banner-preview')
      await expect(bannerPreview).toBeVisible()
      await expect(bannerPreview).toContainText('1280 × 720 px')
      await expectImageLoaded(bannerPreview.locator('img'))

      // 9. Save as Draft -> verify DB persistence and Draft isolation on frontend
      const createDraftPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: 'Lưu bản nháp' }).click()
      const createDraftRes = await createDraftPromise
      expect(createDraftRes.status()).toBe(201)
      const createdDraft = (await createDraftRes.json()).data as {
        id: string
        slug: string
        _status: string
        coverId: string
      }
      createdPostIds.push(createdDraft.id)
      expect(createdDraft._status).toBe('draft')
      expect(createdDraft.coverId).toBe(jpgMediaId)

      // Verify in SQLite DB directly
      const db = new DatabaseSync(getDbPath(), { readOnly: true })
      const draftRow = db
        .prepare('SELECT id, slug, cover_id, _status FROM posts WHERE id = ?')
        .get(createdDraft.id) as
        | { id: string; slug: string; cover_id: string | null; _status: string }
        | undefined
      db.close()
      expect(draftRow?._status).toBe('draft')
      expect(draftRow?.cover_id).toBe(jpgMediaId)

      // Verify Draft does NOT appear on /posts and /posts/[slug] returns 404
      await page.goto(`${ORIGIN}/posts`, { waitUntil: 'networkidle' })
      await expect(page.locator('main')).not.toContainText(promoPostTitle)
      const draftDetailRes = await page.goto(`${ORIGIN}/posts/${createdDraft.slug}`)
      expect(draftDetailRes?.status()).toBe(404)

      // 10. Refresh Admin page, re-open Draft -> banner still exists!
      await adminPage.reload({ waitUntil: 'networkidle' })
      const postRow = adminPage.getByTestId(`admin-post-row-${createdDraft.id}`)
      await expect(postRow).toBeVisible()
      await expect(postRow).toContainText('Bản nháp')
      await postRow.getByRole('button', { name: 'Chỉnh sửa' }).click()
      const editDialog = adminPage.getByRole('dialog')
      await expect(editDialog.getByTestId('post-banner-preview')).toBeVisible()

      // 11. Replace banner with PNG -> verify preview updates
      const pngUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await editDialog.locator('#post-banner-input').setInputFiles({
        name: `banner-png-${tag}.png`,
        mimeType: 'image/png',
        buffer: pngBuf,
      })
      const pngJson = await (await pngUploadPromise).json()
      const pngMediaId = pngJson.data.id as string
      createdMediaIds.push(pngMediaId)
      await expect(editDialog.getByTestId('post-banner-preview')).toContainText('banner-png')

      // 12. Publish post with PNG banner -> verify DB + Frontend list + Frontend detail + SEO + Responsive
      const publishPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'PATCH',
      )
      await editDialog.getByRole('button', { name: 'Xuất bản' }).click()
      const publishRes = await publishPromise
      expect(publishRes.status()).toBe(200)
      const publishedData = (await publishRes.json()).data as {
        id: string
        slug: string
        _status: string
        coverId: string
      }
      expect(publishedData._status).toBe('published')
      expect(publishedData.coverId).toBe(pngMediaId)

      // Visit /posts on frontend
      await page.goto(`${ORIGIN}/posts`, { waitUntil: 'networkidle' })
      const card = page.getByTestId(`post-card-${publishedData.slug}`)
      await expect(card).toBeVisible()
      await expect(card).toContainText('Ưu đãi & Sự kiện')
      await expect(card).toContainText(promoPostTitle)
      await expect(card).toContainText(promoPostExcerpt)
      await expect(card).toContainText('Xem chi tiết')
      await expectImageLoaded(card.locator('img'))

      // Navigate to detail page & verify reload persistence
      await card.getByRole('link', { name: /Xem chi tiết/ }).click()
      await page.waitForURL(`**/posts/${publishedData.slug}`)
      await page.reload({ waitUntil: 'networkidle' })

      await expect(page.getByRole('heading', { level: 1 })).toContainText(promoPostTitle)
      const detailBanner = page.getByTestId('post-detail-banner')
      await expect(detailBanner).toBeVisible()
      await expectImageLoaded(detailBanner.locator('img'))

      // Check linked promotion block & live sync when Promotion is updated in Admin
      if (linkedPromoCode) {
        const promoBox = page.getByTestId('post-linked-promotion')
        await expect(promoBox).toBeVisible()
        await expect(promoBox).toContainText(linkedPromoCode)

        // Fetch current NORIXINCAMON promo, update its name temporarily, verify post detail updates live, then restore
        const promosListRes = await adminCtx.request.get(`${ORIGIN}/nori-api/dashboard/promotions`)
        expect(promosListRes.status()).toBe(200)
        const promosList = (await promosListRes.json()).data.items as Array<{
          id: string
          code: string
          name: string
          description: string
          discountType: 'PERCENT' | 'FIXED'
          discountValue: number
          maxDiscount: number | null
          minDays: number
          appliesTo: 'ALL' | 'RENT' | 'SALE'
          validFrom: string
          validTo: string
          usageLimit: number | null
          active: boolean
        }>
        const targetPromo = promosList.find((p) => p.code === linkedPromoCode)
        if (targetPromo) {
          const updatedPromoName = `${targetPromo.name} (Cập nhật ${tag})`
          const patchPromoRes = await adminCtx.request.patch(
            `${ORIGIN}/nori-api/dashboard/promotions`,
            {
              headers: AUTH_HEADERS,
              data: {
                id: targetPromo.id,
                name: updatedPromoName,
              },
            },
          )
          expect(patchPromoRes.status()).toBe(200)
          try {
            await page.reload({ waitUntil: 'networkidle' })
            await expect(page.getByTestId('post-linked-promotion')).toContainText(updatedPromoName)
          } finally {
            await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/promotions`, {
              headers: AUTH_HEADERS,
              data: {
                id: targetPromo.id,
                name: targetPromo.name,
              },
            })
          }
        }
      }

      // Check SEO & Open Graph metadata
      await expect(page).toHaveTitle(promoSeoTitle)
      const metaDesc = await page.locator('meta[name="description"]').getAttribute('content')
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
      const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content')
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
      expect(metaDesc).toBe(promoSeoDesc)
      expect(ogTitle).toBe(promoSeoTitle)
      expect(ogDesc).toBe(promoSeoDesc)
      expect(ogImage).toContain('/api/media/file/')

      // Responsive verification on Desktop (1440), Tablet (768), Mobile (375)
      for (const vp of [
        { width: 1440, height: 900 },
        { width: 768, height: 1024 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(vp)
        const layoutCheck = await page.evaluate(() => {
          const docOverflow =
            document.documentElement.scrollWidth > document.documentElement.clientWidth
          const banner = document.querySelector('[data-testid="post-detail-banner"]')
          const rect = banner?.getBoundingClientRect()
          return {
            docOverflow,
            bannerWidth: rect?.width ?? 0,
            bannerHeight: rect?.height ?? 0,
          }
        })
        expect(layoutCheck.docOverflow).toBe(false)
        expect(layoutCheck.bannerWidth).toBeGreaterThan(250)
        expect(layoutCheck.bannerHeight).toBeGreaterThan(140)
      }
      await page.setViewportSize({ width: 1440, height: 900 })

      // 13. Test Delete Banner & Fallback on Published Post
      await adminPage
        .getByTestId(`admin-post-row-${createdDraft.id}`)
        .getByRole('button', { name: 'Chỉnh sửa' })
        .click()
      const editDialog2 = adminPage.getByRole('dialog')
      await editDialog2.getByRole('button', { name: 'Xóa ảnh' }).click()
      await expect(editDialog2.getByTestId('post-banner-preview')).toHaveCount(0)
      const removeBannerPublish = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'PATCH',
      )
      await editDialog2.getByRole('button', { name: 'Xuất bản' }).click()
      expect((await removeBannerPublish).status()).toBe(200)

      await page.goto(`${ORIGIN}/posts/${publishedData.slug}`, { waitUntil: 'networkidle' })
      const fallbackSrc = await page
        .getByTestId('post-detail-banner')
        .locator('img')
        .getAttribute('src')
      expect(fallbackSrc).toContain('/nori-post-fallback.svg')
      await expectImageLoaded(page.getByTestId('post-detail-banner').locator('img'))

      // 14. Create a second post WITHOUT banner first -> verify NORI fallback on /posts & /posts/[slug]
      await adminPage.getByRole('button', { name: /Viết bài mới/ }).click()
      const dialog2 = adminPage.getByRole('dialog')
      const noBannerTitle = `Tin tức không banner ${tag}`
      await dialog2.locator('#post-title').fill(noBannerTitle)
      await dialog2.locator('#post-cat').selectOption('NEWS')
      await dialog2.locator('#post-content').fill(`Nội dung bài viết không có banner ${tag}.`)
      const noBannerCreatePromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'POST',
      )
      await dialog2.getByRole('button', { name: 'Xuất bản' }).click()
      const noBannerRes = await noBannerCreatePromise
      expect(noBannerRes.status()).toBe(201)
      const noBannerData = (await noBannerRes.json()).data as { id: string; slug: string }
      createdPostIds.push(noBannerData.id)

      await page.goto(`${ORIGIN}/posts/${noBannerData.slug}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveTitle(`${noBannerTitle} | NORI`)
      const noBannerFallbackSrc = await page
        .getByTestId('post-detail-banner')
        .locator('img')
        .getAttribute('src')
      expect(noBannerFallbackSrc).toContain('/nori-post-fallback.svg')
      await expectImageLoaded(page.getByTestId('post-detail-banner').locator('img'))

      // 15. Create a third post via WEBP upload + Media Library Picker
      await adminPage.getByRole('button', { name: /Viết bài mới/ }).click()
      const dialog3 = adminPage.getByRole('dialog')
      const guideTitle = `Cẩm nang kiểm tra xe trước chuyến đi ${tag}`
      await dialog3.locator('#post-title').fill(guideTitle)
      await dialog3.locator('#post-cat').selectOption('GUIDE')
      await dialog3.locator('#post-content').fill(`Nội dung cẩm nang kiểm tra xe ${tag}.`)

      const webpUploadPromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await dialog3.locator('#post-banner-input').setInputFiles({
        name: `banner-webp-${tag}.webp`,
        mimeType: 'image/webp',
        buffer: webpBuf,
      })
      const webpJson = await (await webpUploadPromise).json()
      createdMediaIds.push(webpJson.data.id as string)
      await expect(dialog3.getByTestId('post-banner-preview')).toBeVisible()

      // Test Media Library Picker selection
      await dialog3.getByRole('button', { name: 'Chọn từ thư viện Media' }).click()
      const libPanel = dialog3.getByTestId('post-media-library')
      await expect(libPanel).toBeVisible()
      await libPanel.locator('button').first().click()
      await expect(dialog3.getByTestId('post-banner-preview')).toBeVisible()

      const createGuidePromise = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'POST',
      )
      await dialog3.getByRole('button', { name: 'Xuất bản' }).click()
      const guideRes = await createGuidePromise
      expect(guideRes.status()).toBe(201)
      const guideData = (await guideRes.json()).data as { id: string; slug: string }
      createdPostIds.push(guideData.id)

      // Verify third post appears on /posts, /about, and /posts/[slug] with distinct metadata
      await page.goto(`${ORIGIN}/posts/${guideData.slug}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveTitle(`${guideTitle} | NORI`)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(guideTitle)

      await page.goto(`${ORIGIN}/about`, { waitUntil: 'networkidle' })
      await expect(page.locator('main')).toContainText(guideTitle)

      // Cleanup test customer row cleanly
    } finally {
      cleanupPostsAndMedia(createdPostIds, createdMediaIds)
      const cleanupDb = new DatabaseSync(getDbPath())
      try {
        cleanupDb.exec('PRAGMA foreign_keys = ON')
        const cust = cleanupDb
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(`post-cust-${tag}@nori.test`) as { id: string } | undefined
        if (cust) {
          cleanupDb.prepare('DELETE FROM audit_logs_rels WHERE users_id = ?').run(cust.id)
          cleanupDb
            .prepare(
              'DELETE FROM notifications_rels WHERE parent_id IN (SELECT id FROM notifications WHERE customer_id = ?)',
            )
            .run(cust.id)
          cleanupDb.prepare('DELETE FROM notifications WHERE customer_id = ?').run(cust.id)
          cleanupDb.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(cust.id)
          cleanupDb
            .prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?')
            .run(cust.id, cust.id)
          cleanupDb
            .prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?')
            .run(cust.id)
          cleanupDb.prepare('DELETE FROM users WHERE id = ?').run(cust.id)
        }
      } finally {
        cleanupDb.close()
      }
      await adminCtx.close()
      await custCtx.close()
    }
  })
})
